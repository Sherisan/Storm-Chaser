/*
 * The storm's instruments as a function of time into the chase. This is theatre only: the multiplier comes from the
 * server (e^(rate·t)) and everything here is derived from ln(multiplier), so nothing feeds back into the odds.
 * As the multiplier climbs the tornado strengthens (wind, EF rating, falling pressure) and the truck closes in on
 * it. The crash point arrives from the server as the tornado turning on the road: a surge, then the truck is lifted.
 */

/** Wind (km/h) at which each EF rating starts: EF0 … EF5. */
export const EF_WIND = [105, 138, 178, 218, 267, 322];
export const MAX_WIND = 400;
export const BARO_MIN = 860;
export const BARO_MAX = 1020;
/** The tornado turns onto the road: the wind slams up and the funnel lurches in for this long. */
export const SURGE_S = 0.5;
/** The truck is carried up into the funnel over this long. */
export const LIFT_S = 3.2;
/** Distance from the truck to the funnel at touchdown, metres. */
export const RANGE_START = 1260;

export type StormPhase = 'idle' | 'chase' | 'surge' | 'lifted';

export interface Storm {
  phase: StormPhase;
  /** Seconds into the chase (0 while staging). */
  t: number;
  /** ln(multiplier): the storm's strength. */
  power: number;
  /** Wind speed, km/h. */
  wind: number;
  /** EF rating 0–5, or -1 below EF0. */
  ef: number;
  /** Barometric pressure, hPa. */
  pressure: number;
  /** Metres from the truck to the funnel. */
  range: number;
  /** The truck's speed, km/h. */
  speed: number;
  /** Metres driven since touchdown. */
  dist: number;
  /** Seconds since the crash, when crashed. */
  crashAge: number | null;
  /** True on the first frame of a higher EF rating. */
  efUp: boolean;
}

export const windAt = (power: number) => 105 + 70 * power;
export const pressureAt = (power: number) => Math.max(BARO_MIN + 8, 1012 - 20 * power);
export const rangeAt = (power: number) => 40 + (RANGE_START - 40) / (1 + 1.1 * power);

export function efOf(wind: number): number {
  let ef = -1;
  for (let i = 0; i < EF_WIND.length; i++) if (wind >= EF_WIND[i]) ef = i;
  return ef;
}

/** The truck's speed (km/h) `t` seconds after touchdown: a hard pull away, then a steady chase. */
export function speedAt(t: number): number {
  if (t <= 0) return 0;
  return 118 * (1 - Math.exp(-t / 2.4)) + 0.6 * t;
}

/** Metres driven after `t` seconds: ∫ speedAt / 3.6. */
export function distAt(t: number): number {
  if (t <= 0) return 0;
  return (118 * (t - 2.4 * (1 - Math.exp(-t / 2.4))) + 0.3 * t * t) / 3.6;
}

const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);

/** Remembers the last EF rating (for the "upgraded" flash) and the state at the crash. Call `step` once per frame. */
export class StormModel {
  private lastEf = -1;
  private crash: { power: number; speed: number } | null = null;

  /**
   * @param running whether a chase is on (FLYING) or finished (CRASHED); false while staging
   * @param t seconds since touchdown
   * @param rate the multiplier's growth rate (multiplier = e^(rate·t))
   * @param crashAge seconds since the crash, or null
   * @param nowMs a monotonic clock, for the gusts
   */
  step(running: boolean, t: number, rate: number, crashAge: number | null, nowMs: number): Storm {
    if (!running) {
      this.lastEf = -1;
      this.crash = null;
      // Waiting at the roadside: a gusty breeze ahead of the storm, pressure starting to fall.
      const gust = 46 + 14 * Math.sin(nowMs / 1300) + 9 * Math.sin(nowMs / 410) + Math.max(0, Math.sin(nowMs / 2300)) ** 8 * 30;
      return { phase: 'idle', t: 0, power: 0, wind: gust, ef: -1, pressure: 1014 + Math.sin(nowMs / 3000), range: RANGE_START, speed: 0, dist: 0, crashAge: null, efUp: false };
    }

    const power = rate * Math.max(0, t);
    const gust = 6 * Math.sin(nowMs / 230) + 4 * Math.sin(nowMs / 97);

    if (crashAge != null) {
      if (!this.crash) this.crash = { power, speed: speedAt(t) };
      const c = this.crash;
      const baseWind = windAt(c.power);
      const baseRange = rangeAt(c.power);
      const dist = distAt(t);
      if (crashAge < SURGE_S) {
        // The funnel turns and comes straight down the road; the anemometer pegs.
        const k = ease(crashAge / SURGE_S);
        const wind = baseWind + (MAX_WIND * 1.12 - baseWind) * k + gust * 3;
        return {
          phase: 'surge', t, power: c.power, wind, ef: Math.max(efOf(baseWind), efOf(wind)), pressure: pressureAt(c.power) - 60 * k,
          range: baseRange + (14 - baseRange) * k, speed: c.speed * (1 - 0.3 * k), dist: dist + (c.speed / 3.6) * crashAge * (1 - 0.15 * k),
          crashAge, efUp: false,
        };
      }
      // Lifted: the truck's instruments spin out and go dead.
      const k = Math.min(1, (crashAge - SURGE_S) / LIFT_S);
      const flicker = Math.sin(crashAge * 37) * Math.sin(crashAge * 13);
      return {
        phase: 'lifted', t, power: c.power, wind: MAX_WIND * (1.1 - 0.9 * k) + flicker * 60 * (1 - k), ef: efOf(windAt(c.power)),
        pressure: pressureAt(c.power) - 60 + 30 * k, range: 14, speed: 0,
        dist: dist + (c.speed / 3.6) * (SURGE_S * 0.9 + Math.min(1.2, crashAge - SURGE_S) * 0.3), crashAge, efUp: false,
      };
    }

    const wind = windAt(power) + gust * (0.6 + power * 0.3);
    const ef = efOf(windAt(power));
    const efUp = ef > this.lastEf && this.lastEf >= 0;
    this.lastEf = ef;
    return {
      phase: 'chase', t, power, wind, ef, pressure: pressureAt(power) + gust * 0.1, range: rangeAt(power),
      speed: speedAt(t), dist: distAt(t), crashAge: null, efUp,
    };
  }
}
