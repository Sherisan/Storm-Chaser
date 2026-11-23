import type {
  ConfigDto, HistoryBetDto, HistoryDto, LiveApi, LiveHandlers, MyBetDto, PublicBetDto, RoundDto, SnapshotDto,
} from '../api/types';
import { multiplierAt } from './clock';

/*
 * Offline stand-in for the API's LiveCrashEngine (`?demo`). Same phases, timings and messages, a demo wallet,
 * and a handful of other drivers so the lanes aren't empty. The crash point is drawn like a standard provably
 * fair crash game: r = first 52 bits of HMAC-SHA256(serverSeed, nonce) / 2^52, crash = ⌊100·(1−edge)/(1−r)⌋/100,
 * at least 1.00 and at most maxMultiplier — a 4% house edge, so any cash-out target returns 96% over time.
 * The real game's crash point comes from the API's RNG (EasyRNG); see README "Provably fair".
 */

const CONFIG: ConfigDto = {
  gameId: 'stormchaser',
  name: 'Storm Chaser',
  minBet: 1,
  maxBet: 1000,
  maxWin: 500000,
  growthRate: 0.12,
  bettingMs: 7000,
  crashedMs: 5000,
  tickMs: 100,
  slots: 2,
  minAutoCashOut: 1.01,
  maxMultiplier: 1000,
};
const HOUSE_EDGE = 0.04;
const START_BALANCE = 2000;
const OTHERS = ['Thabo', 'Lerato', 'Sipho', 'Anika', 'Kabelo', 'Zanele', 'Dirk', 'Naledi', 'Pieter', 'Ayanda'];

interface DemoBet {
  id: string;
  roundId: number;
  slot: number;
  amount: number;
  autoCashOut: number | null;
  status: MyBetDto['status'];
  cashedOutAt: number | null;
  win: number | null;
}

interface OtherBet extends PublicBetDto {
  target: number;
}

const mask = (name: string) => (name.length <= 2 ? `${name}***` : `${name.slice(0, 2)}***`);
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(text: string): Promise<string> {
  if (!crypto.subtle) return 'demo-' + Math.random().toString(16).slice(2);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

async function uniform(serverSeed: string, nonce: number): Promise<number> {
  if (!crypto.subtle) return Math.random();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(nonce))));
  // first 52 bits → [0, 1)
  let v = 0;
  for (let i = 0; i < 7; i++) v = v * 256 + sig[i];
  v = Math.floor(v / 16); // 56 → 52 bits
  return v / 2 ** 52;
}

function crashFrom(r: number): number {
  const m = Math.floor((100 * (1 - HOUSE_EDGE)) / (1 - r)) / 100;
  return Math.min(CONFIG.maxMultiplier, Math.max(1, m));
}

export function createDemoEngine(): LiveApi {
  let h: LiveHandlers | null = null;
  let timer: number | null = null;
  let balance = START_BALANCE;
  let roundSeq = 1000;
  let nonce = 0;
  let serverSeed = hex(crypto.getRandomValues(new Uint8Array(32)));
  let serverSeedHash = '';
  let previousSeed: { serverSeed: string; serverSeedHash: string; revealedAt: string } | null = null;
  let round: RoundDto = {
    gameId: CONFIG.gameId, id: roundSeq, status: 'CRASHED', startedAt: 0, phaseEndsAt: 0, crashedAt: null,
    crashPoint: null, serverSeedHash: '', nonce: 0,
  };
  let crashPoint = 1;
  const history: HistoryDto[] = [];
  const mine: DemoBet[] = [];
  const others: OtherBet[] = [];
  const settled: HistoryBetDto[] = [];
  const player = { playerId: 'demo', username: 'you', currency: 'ZAR' };
  let pendingOthers: { at: number; bet: OtherBet }[] = [];

  const now = () => Date.now();
  const liveMultiplier = () => (round.status === 'FLYING' ? multiplierAt(CONFIG.growthRate, now() - round.startedAt) : null);
  const myDto = (b: DemoBet): MyBetDto => ({
    gameId: CONFIG.gameId, id: b.id, roundId: b.roundId, slot: b.slot, amount: b.amount, autoCashOut: b.autoCashOut,
    status: b.status, cashedOutAt: b.cashedOutAt, win: b.win, winPending: false, freeBet: false,
  });
  const publicBet = (b: DemoBet): PublicBetDto => ({
    roundId: b.roundId, player: mask(player.username), slot: b.slot, amount: b.amount, cashedOutAt: b.cashedOutAt,
    win: b.status === 'CashedOut' ? b.win : null,
  });

  async function startBetting() {
    nonce++;
    if (nonce % 1000 === 0) {
      previousSeed = { serverSeed, serverSeedHash, revealedAt: new Date().toISOString() };
      serverSeed = hex(crypto.getRandomValues(new Uint8Array(32)));
      serverSeedHash = await sha256Hex(serverSeed);
    }
    crashPoint = crashFrom(await uniform(serverSeed, nonce));
    for (let i = mine.length - 1; i >= 0; i--) if (mine[i].roundId !== round.id || mine[i].status !== 'Active') mine.splice(i, 1);
    mine.length = 0;
    others.length = 0;
    round = {
      gameId: CONFIG.gameId, id: ++roundSeq, status: 'BETTING', startedAt: 0, phaseEndsAt: now() + CONFIG.bettingMs,
      crashedAt: null, crashPoint: null, serverSeedHash, nonce,
    };
    // Other drivers wander in during the betting window.
    const count = 3 + Math.floor(Math.random() * 5);
    pendingOthers = Array.from({ length: count }, (_, i) => {
      const name = OTHERS[(roundSeq * 7 + i * 3) % OTHERS.length];
      const amount = [5, 10, 20, 25, 50, 100, 200][Math.floor(Math.random() * 7)];
      const target = Math.max(1.05, Math.round(Math.exp(0.3 + Math.random() * 1.6) * 100) / 100);
      return { at: now() + 300 + Math.random() * (CONFIG.bettingMs - 1500), bet: { roundId: round.id, player: mask(name), slot: 0, amount, cashedOutAt: null, win: null, target } };
    });
    h?.onRound(round);
  }

  function tick() {
    const t = now();
    switch (round.status) {
      case 'BETTING': {
        for (const p of pendingOthers.filter((p) => p.at <= t)) {
          others.push(p.bet);
          h?.onBetPlaced(p.bet);
        }
        pendingOthers = pendingOthers.filter((p) => p.at > t);
        if (t >= round.phaseEndsAt) {
          round = { ...round, status: 'FLYING', startedAt: t };
          h?.onRound(round);
        }
        break;
      }
      case 'FLYING': {
        const m = multiplierAt(CONFIG.growthRate, t - round.startedAt);
        const reached = Math.min(m, crashPoint);
        for (const b of mine) {
          if (b.status === 'Active' && b.autoCashOut != null && b.autoCashOut <= reached) pay(b, b.autoCashOut);
        }
        for (const o of others) {
          if (o.cashedOutAt == null && o.target <= reached) {
            o.cashedOutAt = o.target;
            o.win = Math.floor(o.amount * o.target * 100) / 100;
            h?.onCashedOut({ ...o });
          }
        }
        if (m >= crashPoint) {
          round = { ...round, status: 'CRASHED', crashedAt: t, phaseEndsAt: t + CONFIG.crashedMs, crashPoint };
          history.unshift({ roundId: round.id, crashPoint });
          if (history.length > 50) history.pop();
          h?.onRound(round);
          for (const b of mine) {
            if (b.status === 'Active') {
              b.status = 'Lost';
              settled.unshift({ id: b.id, roundId: b.roundId, player: player.username, amount: b.amount, cashedOutAt: null, win: 0, placedAt: t });
              h?.onMyBet(myDto(b), null);
            }
          }
        } else {
          h?.onTick(t, m);
        }
        break;
      }
      case 'CRASHED':
        if (t >= round.phaseEndsAt) void startBetting();
        break;
    }
  }

  function pay(b: DemoBet, at: number) {
    b.status = 'CashedOut';
    b.cashedOutAt = at;
    b.win = Math.min(CONFIG.maxWin, Math.floor(b.amount * at * 100) / 100);
    balance = Math.round((balance + b.win) * 100) / 100;
    settled.unshift({ id: b.id, roundId: b.roundId, player: player.username, amount: b.amount, cashedOutAt: at, win: b.win, placedAt: now() });
    h?.onCashedOut(publicBet(b));
    h?.onMyBet(myDto(b), balance);
  }

  const snapshot = (): SnapshotDto => ({
    player,
    balance,
    config: CONFIG,
    state: {
      serverTime: now(),
      round,
      multiplier: liveMultiplier(),
      history: [...history],
      bets: [...others.map((o) => ({ roundId: o.roundId, player: o.player, slot: o.slot, amount: o.amount, cashedOutAt: o.cashedOutAt, win: o.win })), ...mine.map(publicBet)],
      myBets: mine.map(myDto),
      fairness: { currentServerSeedHash: serverSeedHash, previousServerSeed: previousSeed },
    },
  });

  return {
    start(handlers) {
      h = handlers;
      h.onConn('connecting');
      void (async () => {
        serverSeedHash = await sha256Hex(serverSeed);
        // A little history so the strip isn't empty.
        for (let i = 0; i < 14; i++) history.push({ roundId: roundSeq - 14 + i, crashPoint: crashFrom(Math.random()) });
        await startBetting();
        h?.onSnapshot(snapshot());
        h?.onConn('online');
        timer = window.setInterval(tick, CONFIG.tickMs);
      })();
    },
    async stop() {
      if (timer != null) window.clearInterval(timer);
      timer = null;
      h = null;
    },
    async placeBet(slot, amount, autoCashOut) {
      await delay(120);
      if (round.status !== 'BETTING') return { ok: false, bet: null, balance: null, error: 'Betting is closed for this round.' };
      if (slot < 0 || slot >= CONFIG.slots) return { ok: false, bet: null, balance: null, error: `Slot must be 0-${CONFIG.slots - 1}.` };
      if (mine.some((b) => b.slot === slot && b.roundId === round.id && b.status !== 'Cancelled'))
        return { ok: false, bet: null, balance: null, error: 'You already have a bet in that slot.' };
      if (amount > balance) return { ok: false, bet: null, balance, error: 'Insufficient funds.' };
      balance = Math.round((balance - amount) * 100) / 100;
      const bet: DemoBet = { id: Math.random().toString(16).slice(2), roundId: round.id, slot, amount, autoCashOut, status: 'Active', cashedOutAt: null, win: null };
      mine.push(bet);
      h?.onBetPlaced(publicBet(bet));
      return { ok: true, bet: myDto(bet), balance, error: null };
    },
    async placeFreeBet() {
      return { ok: false, bet: null, balance: null, error: 'You have no free bet for this game.' };
    },
    async cancelBet(slot) {
      await delay(100);
      if (round.status !== 'BETTING') return { ok: false, balance: null, error: 'Bets can only be cancelled before the round starts.' };
      const bet = mine.find((b) => b.slot === slot && b.roundId === round.id && b.status === 'Active');
      if (!bet) return { ok: false, balance: null, error: 'No bet to cancel in that slot.' };
      bet.status = 'Cancelled';
      balance = Math.round((balance + bet.amount) * 100) / 100;
      h?.onMyBet(myDto(bet), balance);
      return { ok: true, balance, error: null };
    },
    async cashOut(slot) {
      await delay(90);
      if (round.status !== 'FLYING') return { ok: false, multiplier: null, win: null, balance: null, error: 'The round is not in flight.' };
      const bet = mine.find((b) => b.slot === slot && b.roundId === round.id && b.status === 'Active');
      if (!bet) return { ok: false, multiplier: null, win: null, balance: null, error: 'No active bet in that slot.' };
      const at = multiplierAt(CONFIG.growthRate, now() - round.startedAt);
      if (at >= crashPoint) return { ok: false, multiplier: null, win: null, balance: null, error: 'Too late — the engine let go.' };
      pay(bet, at);
      return { ok: true, multiplier: at, win: bet.win, balance, error: null };
    },
    async getBalance() {
      return balance;
    },
    async getMyBets() {
      return settled.slice(0, 50);
    },
    async getTopPayouts() {
      return [...settled].filter((b) => (b.win ?? 0) > 0).sort((a, b) => (b.win ?? 0) - (a.win ?? 0)).slice(0, 20);
    },
  };
}

const delay = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
