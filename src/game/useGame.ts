import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO } from '../api/base';
import { createHubEngine } from '../api/hubEngine';
import type {
  ConfigDto, ConnStatus, FairnessDto, HistoryBetDto, HistoryDto, LiveApi, MyBetDto, PublicBetDto, RoundDto,
} from '../api/types';
import { createDemoEngine } from './demoEngine';
import { ServerClock } from './clock';
import { GameEvents } from './events';
import { formatMoney, formatMultiplier } from './money';

export interface Toast {
  id: number;
  kind: 'info' | 'win' | 'error';
  text: string;
}

/** What a slot's last bet came to, kept on the slot until the next bet goes in. */
export interface SlotResult {
  kind: 'won' | 'lost';
  amount: number;
  multiplier: number | null;
  win: number | null;
  freeBet: boolean;
}

export interface GameState {
  conn: ConnStatus;
  /** Why we're offline, when we know. */
  connMessage: string | null;
  me: { playerId: string; username: string; currency: string } | null;
  balance: number;
  config: ConfigDto | null;
  round: RoundDto | null;
  history: HistoryDto[];
  /** Everyone's bets this round (mine included, masked), newest last. */
  bets: PublicBetDto[];
  /** My bets this round, by slot. */
  myBets: (MyBetDto | null)[];
  results: (SlotResult | null)[];
  /** Slots with a cash-out in flight (button lock). */
  busy: boolean[];
  fairness: FairnessDto | null;
  toasts: Toast[];
  /** Local performance.now() when each slot bailed out this round (for the scene). */
  chuteAt: (number | null)[];
}

export interface GameActions {
  placeBet(slot: number, amount: number, autoCashOut: number | null): Promise<boolean>;
  placeFreeBet(slot: number, autoCashOut: number | null): Promise<boolean>;
  cancelBet(slot: number): Promise<void>;
  cashOut(slot: number): Promise<void>;
  getMyBets(): Promise<HistoryBetDto[]>;
  getTopPayouts(): Promise<HistoryBetDto[]>;
  refreshBalance(): Promise<void>;
  setBalance(balance: number): void;
  notify(kind: Toast['kind'], text: string): void;
  dismissToast(id: number): void;
}

const SLOTS_DEFAULT = 2;
let toastSeq = 0;

const initial: GameState = {
  conn: 'connecting',
  connMessage: null,
  me: null,
  balance: 0,
  config: null,
  round: null,
  history: [],
  bets: [],
  myBets: [null, null],
  results: [null, null],
  busy: [false, false],
  fairness: null,
  toasts: [],
  chuteAt: [null, null],
};

function slots(n: number) {
  return Array.from({ length: n }, () => null);
}

/**
 * The live game: one connection to the game API's /livecrashhub (or the demo engine), the round and bets as
 * React state, and the actions the bet panel calls. Multiplier ticks don't go through React: the display reads
 * the server clock every frame (see clock.ts), ticks only keep that clock honest.
 */
export function useGame() {
  const [state, setState] = useState<GameState>(initial);
  const clock = useMemo(() => new ServerClock(), []);
  const events = useMemo(() => new GameEvents(), []);
  const apiRef = useRef<LiveApi | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const notify = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++toastSeq;
    setState((s) => ({ ...s, toasts: [...s.toasts.slice(-4), { id, kind, text }] }));
    window.setTimeout(() => setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 5000 : 3800);
  }, []);

  useEffect(() => {
    const api = DEMO ? createDemoEngine() : createHubEngine();
    apiRef.current = api;

    api.start({
      onConn(status, message) {
        setState((s) => ({ ...s, conn: status, connMessage: status === 'online' ? null : (message ?? s.connMessage) }));
      },
      onSnapshot(snap) {
        clock.reset(snap.state.serverTime);
        const n = Math.max(1, snap.config.slots);
        setState((s) => {
          const myBets = slots(n) as (MyBetDto | null)[];
          for (const b of snap.state.myBets) if (b.slot < n && b.status !== 'Cancelled') myBets[b.slot] = b;
          return {
            ...s,
            me: snap.player,
            balance: snap.balance ?? s.balance,
            config: snap.config,
            round: snap.state.round,
            history: snap.state.history,
            bets: snap.state.bets,
            myBets,
            results: s.results.length === n ? s.results : slots(n),
            busy: slots(n).map(() => false),
            chuteAt: s.chuteAt.length === n ? s.chuteAt : slots(n),
            fairness: snap.state.fairness,
          };
        });
      },
      onRound(round) {
        // The round's own stamps are server time: startedAt when it launches, crashedAt when it crashes.
        if (round.status === 'FLYING') clock.sample(round.startedAt);
        else if (round.status === 'CRASHED' && round.crashedAt != null) clock.sample(round.crashedAt);

        setState((s) => {
          const newRound = round.status === 'BETTING' && s.round?.id !== round.id;
          if (!newRound) return { ...s, round };
          // A new round: this round's bets are over; keep each slot's outcome on the slot.
          const results = s.myBets.map((b, i) => (b ? resultOf(b) : s.results[i]));
          return {
            ...s,
            round,
            bets: [],
            myBets: s.myBets.map(() => null),
            results,
            busy: s.busy.map(() => false),
            chuteAt: s.chuteAt.map(() => null),
            history: s.history,
          };
        });

        if (round.status === 'BETTING') events.emit('betting', { roundId: round.id });
        else if (round.status === 'FLYING') events.emit('launch', { roundId: round.id });
        else if (round.status === 'CRASHED' && round.crashPoint != null) {
          events.emit('crash', { roundId: round.id, crashPoint: round.crashPoint });
          setState((s) => {
            if (s.history[0]?.roundId === round.id) return s;
            return { ...s, history: [{ roundId: round.id, crashPoint: round.crashPoint! }, ...s.history].slice(0, 100) };
          });
        }
      },
      onTick(t) {
        clock.sample(t);
      },
      onBetPlaced(bet) {
        setState((s) => (s.round && bet.roundId !== s.round.id ? s : { ...s, bets: [...s.bets, bet] }));
      },
      onCashedOut(bet) {
        setState((s) => ({
          ...s,
          bets: s.bets.map((b) => (b.roundId === bet.roundId && b.player === bet.player && b.slot === bet.slot ? bet : b)),
        }));
        if (bet.cashedOutAt != null) events.emit('other:cashout', { player: bet.player, multiplier: bet.cashedOutAt });
      },
      onMyBet(bet, balance) {
        const prev = stateRef.current.myBets[bet.slot];
        setState((s) => {
          if (s.round && bet.roundId !== s.round.id && bet.status !== 'CashedOut' && bet.status !== 'Lost') return s;
          const myBets = [...s.myBets];
          const results = [...s.results];
          const busy = [...s.busy];
          const chuteAt = [...s.chuteAt];
          busy[bet.slot] = false;
          if (bet.status === 'Cancelled') {
            myBets[bet.slot] = null;
          } else {
            myBets[bet.slot] = bet;
            if (bet.status === 'CashedOut' && chuteAt[bet.slot] == null) chuteAt[bet.slot] = performance.now();
            if (bet.status === 'CashedOut' || bet.status === 'Lost') results[bet.slot] = resultOf(bet);
          }
          return { ...s, myBets, results, busy, chuteAt, balance: balance ?? s.balance };
        });
        if (bet.status === 'CashedOut' && prev?.status !== 'CashedOut') {
          events.emit('my:cashout', { slot: bet.slot, multiplier: bet.cashedOutAt ?? 1, win: bet.win ?? 0 });
        } else if (bet.status === 'Lost' && prev?.status !== 'Lost') {
          events.emit('my:lost', { slot: bet.slot, amount: bet.amount });
        }
      },
    });

    return () => {
      apiRef.current = null;
      void api.stop();
    };
  }, [clock, events]);

  const fail = useCallback(
    (e: unknown, fallback: string) => {
      const msg = e instanceof Error && e.message && e.message !== 'Not connected.' ? e.message : fallback;
      notify('error', msg);
      events.emit('error', { message: msg });
    },
    [notify, events],
  );

  const actions = useMemo<GameActions>(
    () => ({
      async placeBet(slot, amount, autoCashOut) {
        const api = apiRef.current;
        const s = stateRef.current;
        if (!api || !s.config) return false;
        if (amount < s.config.minBet || amount > s.config.maxBet) {
          notify('error', `Bets are ${formatMoney(s.config.minBet, s.me?.currency)} to ${formatMoney(s.config.maxBet, s.me?.currency)}.`);
          return false;
        }
        if (amount > s.balance + 1e-9) {
          notify('error', 'Not enough balance for that bet.');
          return false;
        }
        try {
          const r = await api.placeBet(slot, amount, autoCashOut);
          if (!r.ok || !r.bet) {
            notify('error', r.error ?? 'The bet was not placed.');
            if (r.balance != null) setState((st) => ({ ...st, balance: r.balance! }));
            return false;
          }
          const bet = r.bet;
          setState((st) => {
            const myBets = [...st.myBets];
            const results = [...st.results];
            myBets[slot] = bet;
            results[slot] = null;
            return { ...st, myBets, results, balance: r.balance ?? st.balance };
          });
          events.emit('my:placed', { slot, amount });
          return true;
        } catch (e) {
          fail(e, 'The bet was not placed.');
          return false;
        }
      },
      async placeFreeBet(slot, autoCashOut) {
        const api = apiRef.current;
        if (!api) return false;
        try {
          const r = await api.placeFreeBet(slot, autoCashOut);
          if (!r.ok || !r.bet) {
            notify('error', r.error ?? 'The free bet was not placed.');
            return false;
          }
          const bet = r.bet;
          setState((st) => {
            const myBets = [...st.myBets];
            const results = [...st.results];
            myBets[slot] = bet;
            results[slot] = null;
            return { ...st, myBets, results };
          });
          events.emit('my:placed', { slot, amount: bet.amount });
          return true;
        } catch (e) {
          fail(e, 'The free bet was not placed.');
          return false;
        }
      },
      async cancelBet(slot) {
        const api = apiRef.current;
        if (!api) return;
        try {
          const r = await api.cancelBet(slot);
          if (!r.ok) {
            notify('error', r.error ?? 'Could not cancel the bet.');
            return;
          }
          setState((st) => {
            const myBets = [...st.myBets];
            myBets[slot] = null;
            return { ...st, myBets, balance: r.balance ?? st.balance };
          });
        } catch (e) {
          fail(e, 'Could not cancel the bet.');
        }
      },
      async cashOut(slot) {
        const api = apiRef.current;
        if (!api) return;
        if (stateRef.current.busy[slot]) return;
        setState((st) => {
          const busy = [...st.busy];
          busy[slot] = true;
          return { ...st, busy };
        });
        try {
          const r = await api.cashOut(slot);
          if (!r.ok) {
            notify('error', r.error ?? 'Could not cash out.');
          } else if (r.multiplier != null && r.win != null) {
            notify('win', `Bailed out at ${formatMultiplier(r.multiplier)} — +${formatMoney(r.win, stateRef.current.me?.currency)}`);
          }
          setState((st) => {
            const busy = [...st.busy];
            busy[slot] = false;
            return { ...st, busy, balance: r.balance ?? st.balance };
          });
        } catch (e) {
          setState((st) => {
            const busy = [...st.busy];
            busy[slot] = false;
            return { ...st, busy };
          });
          fail(e, 'Could not cash out.');
        }
      },
      getMyBets: () => apiRef.current?.getMyBets() ?? Promise.resolve([]),
      getTopPayouts: () => apiRef.current?.getTopPayouts() ?? Promise.resolve([]),
      async refreshBalance() {
        try {
          const b = await apiRef.current?.getBalance();
          if (b != null) setState((st) => ({ ...st, balance: b }));
        } catch {
          /* keep the last known balance */
        }
      },
      setBalance: (balance) => setState((st) => ({ ...st, balance })),
      notify,
      dismissToast: (id) => setState((st) => ({ ...st, toasts: st.toasts.filter((t) => t.id !== id) })),
    }),
    [notify, fail, events],
  );

  return { state, actions, clock, events };
}

function resultOf(b: MyBetDto): SlotResult | null {
  if (b.status === 'CashedOut') return { kind: 'won', amount: b.amount, multiplier: b.cashedOutAt, win: b.win, freeBet: b.freeBet };
  if (b.status === 'Lost') return { kind: 'lost', amount: b.amount, multiplier: null, win: null, freeBet: b.freeBet };
  return null;
}

export const DEFAULT_SLOTS = SLOTS_DEFAULT;
