/*
 * Synth sound, no samples: a weather bed (wind that rises with the storm, the tornado's freight-train roar, rain,
 * and the truck's engine), radar pings before touchdown, the weather-radio alert tone on each EF upgrade, a siren
 * wail when the tornado turns, the crunch and glass when the truck is taken, thunder, braking and a win chime.
 * Everything is built from oscillators and a noise buffer at first use, so a muted game costs nothing.
 */

import type { StormPhase } from './storm';

const STORAGE_KEY = 'stormchaser.sound';

interface Bed {
  windGain: GainNode;
  windFilter: BiquadFilterNode;
  roarGain: GainNode;
  roarFilter: BiquadFilterNode;
  rainGain: GainNode;
  engineGain: GainNode;
  engineOsc: OscillatorNode[];
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private bed: Bed | null = null;
  private unlocked = false;
  private _enabled: boolean;

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* private mode */
    }
    this._enabled = saved !== 'off';
  }

  get enabled() {
    return this._enabled;
  }

  set enabled(v: boolean) {
    this._enabled = v;
    try {
      localStorage.setItem(STORAGE_KEY, v ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
    if (v) this.unlock();
  }

  /** Call from a user gesture: browsers only start audio after one. */
  unlock() {
    if (!this._enabled) return;
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    this.unlocked = true;
  }

  private build() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this._enabled ? 0.9 : 0;
    this.master.connect(comp);

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    const loopNoise = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = Math.random();
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(this.master!);
      src.start();
      return { f, g };
    };
    const wind = loopNoise('bandpass', 400, 0.9);
    const roar = loopNoise('lowpass', 140, 0.7);
    const rain = loopNoise('highpass', 3500, 0.5);

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 300;
    engineFilter.connect(engineGain);
    engineGain.connect(this.master);
    const engineOsc = (['sawtooth', 'square'] as OscillatorType[]).map((type, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 40;
      o.detune.value = i ? -1200 : 0;
      const g = ctx.createGain();
      g.gain.value = i ? 0.4 : 0.6;
      o.connect(g);
      g.connect(engineFilter);
      o.start();
      return o;
    });
    this.bed = { windGain: wind.g, windFilter: wind.f, roarGain: roar.g, roarFilter: roar.f, rainGain: rain.g, engineGain, engineOsc };
  }

  private get ready() {
    return this._enabled && this.unlocked && this.ctx != null && this.ctx.state === 'running';
  }

  /** Per frame: the weather bed follows the wind, the engine follows the truck. */
  weather(wind: number, speed: number, phase: StormPhase) {
    if (!this.ready || !this.ctx || !this.bed) return;
    const t = this.ctx.currentTime;
    const b = this.bed;
    const w = Math.max(0, Math.min(1.2, wind / 400));
    b.windGain.gain.setTargetAtTime(0.04 + w * 0.22, t, 0.15);
    b.windFilter.frequency.setTargetAtTime(260 + w * 900 + Math.sin(t * 1.7) * 80 * w, t, 0.2);
    const roar = Math.max(0, (wind - 140) / 260);
    b.roarGain.gain.setTargetAtTime(phase === 'surge' ? 0.9 : phase === 'lifted' ? 0.5 * w : Math.min(0.55, roar * 0.6), t, phase === 'surge' ? 0.05 : 0.3);
    b.roarFilter.frequency.setTargetAtTime(110 + roar * 120, t, 0.3);
    b.rainGain.gain.setTargetAtTime(phase === 'idle' ? 0.02 : Math.min(0.09, 0.02 + w * 0.08), t, 0.3);
    const running = phase === 'chase' || phase === 'surge';
    for (const o of b.engineOsc) o.frequency.setTargetAtTime(34 + speed * 0.5, t, 0.1);
    b.engineGain.gain.setTargetAtTime(running ? 0.07 + Math.min(1, speed / 120) * 0.05 : phase === 'idle' ? 0.03 : 0, t, 0.1);
  }

  private burst(opts: { dur: number; gain: number; type?: BiquadFilterType; freq?: number; freqEnd?: number; q?: number; delay?: number; attack?: number }) {
    if (!this.ready || !this.ctx || !this.noise) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = opts.type ?? 'bandpass';
    filt.frequency.setValueAtTime(opts.freq ?? 1000, t0);
    if (opts.freqEnd) filt.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + opts.dur);
    filt.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.gain, t0 + (opts.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master!);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0, freqEnd?: number, attack = 0.008) {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master!);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /** The radar ping in the last seconds before touchdown. */
  ping() {
    this.tone(1480, 0.18, 0.12, 'sine');
    this.tone(1480, 0.3, 0.04, 'sine', 0.16);
  }

  /** Touchdown: a deep thump and the roar swelling in. */
  touchdown() {
    this.tone(55, 1.2, 0.5, 'sine', 0, 32);
    this.burst({ dur: 1.6, gain: 0.25, type: 'lowpass', freq: 600, freqEnd: 90, attack: 0.15 });
    this.tone(700, 0.12, 0.06, 'triangle', 0.02);
  }

  /** The weather-radio alert: the two-tone attention signal, louder the stronger the rating. */
  alert(ef: number) {
    const g = 0.04 + Math.min(5, ef) * 0.012;
    this.tone(853, 0.45, g, 'sine', 0, undefined, 0.02);
    this.tone(960, 0.45, g, 'sine', 0, undefined, 0.02);
  }

  /** The tornado turns: a siren wail over a wall of roar. */
  surge() {
    this.tone(420, 1.4, 0.18, 'sawtooth', 0, 880, 0.2);
    this.tone(424, 1.4, 0.1, 'square', 0, 870, 0.2);
    this.burst({ dur: 1.8, gain: 0.7, type: 'lowpass', freq: 900, freqEnd: 140, attack: 0.25 });
  }

  /** The truck is taken: metal folding, glass going, a whoosh up into the funnel. */
  lifted() {
    for (const d of [0, 0.09, 0.2, 0.34, 0.55]) this.burst({ dur: 0.14, gain: 0.5, type: 'bandpass', freq: 700 + Math.random() * 600, q: 3, delay: d });
    this.tone(90, 0.5, 0.5, 'square', 0, 40);
    this.burst({ dur: 0.6, gain: 0.35, type: 'highpass', freq: 5000, delay: 0.04 });
    for (const d of [0.1, 0.18, 0.27]) this.tone(3200 + Math.random() * 2000, 0.08, 0.06, 'triangle', d);
    this.burst({ dur: 2.6, gain: 0.4, type: 'bandpass', freq: 300, freqEnd: 1400, q: 0.8, delay: 0.3, attack: 0.4 });
  }

  /** Thunder, later and softer the further off it struck. */
  thunder(distance: number) {
    const delay = Math.min(2.4, distance / 900);
    const near = Math.max(0, 1 - distance / 1500);
    if (near > 0.4) this.burst({ dur: 0.25, gain: 0.35 * near, type: 'highpass', freq: 1800, delay: delay * 0.2 });
    this.burst({ dur: 2.8, gain: 0.18 + 0.3 * near, type: 'lowpass', freq: 380, freqEnd: 60, delay, attack: 0.08 });
    this.burst({ dur: 1.6, gain: 0.1 + 0.15 * near, type: 'lowpass', freq: 220, freqEnd: 50, delay: delay + 0.5, attack: 0.2 });
  }

  /** Bailing out: brakes biting on the wet road. */
  bail() {
    this.burst({ dur: 0.7, gain: 0.25, type: 'bandpass', freq: 2300, freqEnd: 1500, q: 6, attack: 0.03 });
    this.burst({ dur: 0.9, gain: 0.2, type: 'highpass', freq: 1200 });
  }

  win() {
    this.tone(880, 0.12, 0.16, 'triangle');
    this.tone(1320, 0.22, 0.16, 'triangle', 0.1);
  }

  bet() {
    this.tone(640, 0.05, 0.08, 'square');
  }

  click() {
    this.burst({ dur: 0.03, gain: 0.08, type: 'bandpass', freq: 2200, q: 1 });
  }

  /** Another chaser bails and drops back past us. */
  passBy() {
    this.burst({ dur: 0.45, gain: 0.1, type: 'bandpass', freq: 600, freqEnd: 180, q: 1.5 });
  }
}

export const sound = new SoundEngine();
