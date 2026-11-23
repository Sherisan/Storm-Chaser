// Mirrors FeedingFranzeeAPI's LiveCrashHub / LiveCrashEngine DTOs (SignalR serializes camelCase; enums as strings).

export type Phase = 'BETTING' | 'FLYING' | 'CRASHED';
export type BetStatus = 'Pending' | 'Active' | 'CashedOut' | 'Lost' | 'Cancelled';

/** "Round" event and snapshot.round: the public round state on every phase change. Times are server unix ms. */
export interface RoundDto {
  gameId: string;
  id: number;
  status: Phase;
  startedAt: number;
  phaseEndsAt: number;
  crashedAt: number | null;
  /** Only once the round has crashed. */
  crashPoint: number | null;
  serverSeedHash: string;
  nonce: number;
}

/** "BetPlaced" / "CashedOut" events and snapshot.bets: everyone's bets this round, names masked ("Sa***"). */
export interface PublicBetDto {
  roundId: number;
  player: string;
  slot: number;
  amount: number;
  cashedOutAt: number | null;
  win: number | null;
}

/** "MyBet" event and snapshot.myBets: one of the player's own bets. */
export interface MyBetDto {
  gameId: string;
  id: string;
  roundId: number;
  slot: number;
  amount: number;
  autoCashOut: number | null;
  status: BetStatus;
  cashedOutAt: number | null;
  win: number | null;
  /** The win could not be credited yet (the API retries / support settles it). */
  winPending: boolean;
  freeBet: boolean;
}

export interface HistoryDto {
  roundId: number;
  crashPoint: number;
}

/** The last rotated-out server seed (RevealedSeed on the API): the seed behind the previous batch of rounds. */
export interface RevealedSeedDto {
  serverSeed: string;
  serverSeedHash: string;
  revealedAt: string;
}

export interface FairnessDto {
  currentServerSeedHash: string;
  previousServerSeed: RevealedSeedDto | null;
}

export interface ConfigDto {
  gameId: string;
  name: string;
  minBet: number;
  maxBet: number;
  maxWin: number;
  /** Per second: multiplier = e^(growthRate × seconds). */
  growthRate: number;
  bettingMs: number;
  crashedMs: number;
  tickMs: number;
  /** Bets per player per round. */
  slots: number;
  minAutoCashOut: number;
  maxMultiplier: number;
}

export interface StateDto {
  serverTime: number;
  round: RoundDto;
  multiplier: number | null;
  history: HistoryDto[];
  bets: PublicBetDto[];
  myBets: MyBetDto[];
  fairness: FairnessDto;
}

export interface SnapshotDto {
  player: { playerId: string; username: string; currency: string };
  balance: number | null;
  config: ConfigDto;
  state: StateDto;
}

/** GetMyBets / GetTopPayouts: settled bets from the wallet ledger. */
export interface HistoryBetDto {
  id: string;
  roundId: number;
  player: string;
  amount: number;
  cashedOutAt: number | null;
  win: number | null;
  placedAt: number;
}

export interface PlaceBetResult {
  ok: boolean;
  bet: MyBetDto | null;
  balance: number | null;
  error: string | null;
}

export interface CancelResult {
  ok: boolean;
  balance: number | null;
  error: string | null;
}

export interface CashOutResult {
  ok: boolean;
  multiplier: number | null;
  win: number | null;
  balance: number | null;
  error: string | null;
}

export type ConnStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface LiveHandlers {
  onConn(status: ConnStatus, message?: string): void;
  /** A fresh snapshot: on connect and after every reconnect. */
  onSnapshot(snapshot: SnapshotDto): void;
  onRound(round: RoundDto): void;
  onTick(t: number, m: number): void;
  onBetPlaced(bet: PublicBetDto): void;
  onCashedOut(bet: PublicBetDto): void;
  onMyBet(bet: MyBetDto, balance: number | null): void;
}

/** What the game needs from a live crash server: the SignalR hub in production, the demo engine offline. */
export interface LiveApi {
  start(handlers: LiveHandlers): void;
  stop(): Promise<void>;
  placeBet(slot: number, amount: number, autoCashOut: number | null): Promise<PlaceBetResult>;
  placeFreeBet(slot: number, autoCashOut: number | null): Promise<PlaceBetResult>;
  cancelBet(slot: number): Promise<CancelResult>;
  cashOut(slot: number): Promise<CashOutResult>;
  getBalance(): Promise<number>;
  getMyBets(): Promise<HistoryBetDto[]>;
  getTopPayouts(): Promise<HistoryBetDto[]>;
}
