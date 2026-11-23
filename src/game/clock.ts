/**
 * The server's clock, as seen from here. Every round time the hub sends (startedAt, phaseEndsAt, crashedAt) is
 * server unix ms, and the multiplier is a pure function of server time, so the display needs server "now".
 *
 * Each sample is `serverTime − Date.now()` taken when a server-stamped message arrives. Network delay only ever
 * makes a sample read low (the stamp is older than it looks), so the largest recent sample is the best estimate;
 * a sliding window lets it follow clock drift and a resumed tab.
 */
export class ServerClock {
  private samples: number[] = [];
  private offset = 0;

  sample(serverTime: number): void {
    const c = serverTime - Date.now();
    this.samples.push(c);
    if (this.samples.length > 40) this.samples.shift();
    this.offset = Math.max(...this.samples);
  }

  /** A full re-sync (snapshot after a reconnect): forget the old samples. */
  reset(serverTime: number): void {
    this.samples = [];
    this.sample(serverTime);
  }

  now(): number {
    return Date.now() + this.offset;
  }
}

/** The multiplier the server shows at `elapsedMs` into a run: e^(rate·t), floored to the cent. */
export function multiplierAt(growthRate: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 1;
  const m = Math.exp(growthRate * (elapsedMs / 1000));
  return Math.floor(Math.min(m, 1_000_000) * 100) / 100;
}

/** Seconds into a run at which the multiplier first reads `m`. */
export function secondsTo(growthRate: number, m: number): number {
  return Math.log(Math.max(1, m)) / growthRate;
}
