import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { API_BASE } from './base';
import {
  assertOnline, connectionLost, hubRetryPolicy, onRecovered, recover, startConnectionGuard, tuneHub,
} from '../net/connectionGuard';
import { getToken } from './auth';
import type {
  CancelResult, CashOutResult, HistoryBetDto, LiveApi, LiveHandlers, MyBetDto, PlaceBetResult, PublicBetDto,
  RoundDto, SnapshotDto,
} from './types';

/*
 * Client for the game API's /livecrashhub (FeedingFranzeeAPI, Presentation/Hubs/LiveCrashHub.cs). The session
 * token picks the game, so the hub only ever sends this game's rounds:
 *   invoke GetSnapshot()                         → { player, balance, config, state }
 *   invoke PlaceBet(slot, amount, autoCashOut)   → { ok, bet, balance, error }
 *   invoke PlaceFreeBet(slot, autoCashOut)       → { ok, bet, balance, error }   (promo free bet)
 *   invoke CancelBet(slot)                       → { ok, balance, error }
 *   invoke CashOut(slot)                         → { ok, multiplier, win, balance, error }
 *   invoke GetBalance() / GetMyBets() / GetTopPayouts()
 * Events: "Round" (phase change), "Tick" { t, m } while flying, "BetPlaced" / "CashedOut" (everyone's bets),
 * "MyBet" { bet, balance } (own bets only).
 */
export function createHubEngine(): LiveApi {
  let conn: HubConnection | null = null;
  let handlers: LiveHandlers | null = null;
  let stopped = false;
  let retry: number | null = null;
  // Connection-loss safety (net/connectionGuard): the start-up recovery, and whether the connection was lost, so the
  // next successful connect asks the server to refund what the drop left open before re-syncing.
  let guardReady: Promise<unknown> = Promise.resolve();
  let dropped = false;
  let unsubscribe: (() => void) | null = null;

  const build = () => {
    const c = new HubConnectionBuilder()
      .withUrl(`${API_BASE}/livecrashhub`, { accessTokenFactory: getToken })
      .withAutomaticReconnect(hubRetryPolicy) // never gives up: the "Connecting to server…" panel waits for it
      .configureLogging(LogLevel.Warning)
      .build();
    tuneHub(c);
    return c;
  };

  async function sync() {
    if (!conn || conn.state !== HubConnectionState.Connected) return;
    const snapshot = await conn.invoke<SnapshotDto>('GetSnapshot');
    handlers?.onSnapshot(snapshot);
    handlers?.onConn('online');
  }

  async function connect() {
    if (stopped || !handlers) return;
    handlers.onConn('connecting');
    // A bet a previous session left open is refunded before the first snapshot shows it.
    await guardReady;
    if (stopped) return;
    const c = build();
    conn = c;
    c.on('Round', (round: RoundDto) => handlers?.onRound(round));
    c.on('Tick', (tick: { t: number; m: number }) => handlers?.onTick(tick.t, tick.m));
    c.on('BetPlaced', (bet: PublicBetDto) => handlers?.onBetPlaced(bet));
    c.on('CashedOut', (bet: PublicBetDto) => handlers?.onCashedOut(bet));
    c.on('MyBet', (msg: { bet: MyBetDto; balance: number | null }) => handlers?.onMyBet(msg.bet, msg.balance));
    c.onreconnecting(() => {
      if (stopped || conn !== c) return;
      connectionLost(); // "Connecting to server…" panel up, play blocked
      handlers?.onConn('reconnecting');
    });
    // Back on the same connection: the server refunds what the drop left open, then onRecovered re-syncs.
    c.onreconnected(() => {
      if (stopped || conn !== c) return;
      void recover();
    });
    c.onclose(() => {
      if (stopped || conn !== c) return;
      dropped = true;
      connectionLost();
      handlers?.onConn('offline', 'Connection lost. Reconnecting…');
      retry = window.setTimeout(connect, 2000);
    });
    try {
      await c.start();
      if (dropped) {
        dropped = false;
        await recover(); // refunds, then sync() through onRecovered
      } else await sync();
    } catch (e) {
      if (stopped) return;
      const msg = e instanceof Error ? e.message : 'Could not reach the game server.';
      const noSession = msg.includes('session token');
      if (!noSession) {
        dropped = true;
        connectionLost();
      }
      handlers?.onConn('offline', noSession ? msg : 'Could not reach the game server. Retrying…');
      retry = window.setTimeout(connect, noSession ? 4000 : 2000);
    }
  }

  function invoke<T>(method: string, ...args: unknown[]): Promise<T> {
    try {
      assertOnline(); // nothing is bet or cashed out behind the "Connecting to server…" panel
    } catch (e) {
      return Promise.reject(e);
    }
    if (!conn || conn.state !== HubConnectionState.Connected) return Promise.reject(new Error('Not connected.'));
    return conn.invoke<T>(method, ...args);
  }

  return {
    start(h) {
      handlers = h;
      stopped = false;
      // Connection-loss safety: blocks play while the hub is down and has the server refund what a drop left open.
      guardReady = startConnectionGuard({
        apiBase: API_BASE,
        getToken,
        isHubConnected: () => conn?.state === HubConnectionState.Connected,
      });
      unsubscribe?.();
      unsubscribe = onRecovered(() => sync());
      void connect();
    },
    async stop() {
      stopped = true;
      unsubscribe?.();
      unsubscribe = null;
      if (retry != null) window.clearTimeout(retry);
      const c = conn;
      conn = null;
      await c?.stop().catch(() => undefined);
    },
    placeBet: (slot, amount, autoCashOut) => invoke<PlaceBetResult>('PlaceBet', slot, amount, autoCashOut),
    placeFreeBet: (slot, autoCashOut) => invoke<PlaceBetResult>('PlaceFreeBet', slot, autoCashOut),
    cancelBet: (slot) => invoke<CancelResult>('CancelBet', slot),
    cashOut: (slot) => invoke<CashOutResult>('CashOut', slot),
    getBalance: () => invoke<number>('GetBalance'),
    getMyBets: () => invoke<HistoryBetDto[]>('GetMyBets'),
    getTopPayouts: () => invoke<HistoryBetDto[]>('GetTopPayouts'),
  };
}
