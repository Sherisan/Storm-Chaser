/*
 * The scene: a full-screen canvas behind the HUD. A chase camera rides behind the player's truck on a straight
 * highway across the plains, with a supercell ahead. The funnel touches down on the launch, and as the multiplier
 * climbs it strengthens and the truck closes in: the light goes green-grey, rain and dust come in on the wind,
 * debris starts to fly and power lines flash blue round the funnel. The other chasers run ahead; anyone who bails
 * swerves onto the shoulder braking hard and drops back past the camera.
 * At the crash the tornado turns onto the road:
 *   surge   (0.5 s)  the funnel lurches down the highway, the wind pegs, the truck's rear steps out and lifts
 *   lifted  (3.2 s+) glass bursts and the truck is carried up, tumbling, and round into the funnel. The camera
 *                    tilts up after it, then the tornado moves off across the fields with the truck circling in it
 * The vehicles are 3D models (vehicle3d.ts). The scene animates outcomes; it never decides them (useGame, storm.ts).
 */

import { GHOST_PAINTS, glow, type Ctx, type Lights, type PaintKey } from './truckArt';
import { VehicleRenderer, VEHICLE_L, PIVOT_Y, onRoad, type Pose, type Sprung, type VehicleView } from './vehicle3d';
import { Particles } from './particles';
import { CAR_Z, SIGNS, drawGround, drawSign, drawTurbines, makeCamera, project, renderBackdrop, roadside, type Camera, type Prop } from './plains';
import { BASE_H, Tornado, funnelShape, type FunnelShape } from './tornado';
import { LIFT_S, SURGE_S, distAt, type Storm } from '../game/storm';
import { secondsTo } from '../game/clock';

export interface TruckView {
  id: string;
  paint: 'red' | 'blue';
  /** Local performance.now() when this bet bailed out (cashed out), or null. */
  bailAt: number | null;
}

export interface GhostView {
  id: string;
  /** Cashed out: the chaser brakes onto the shoulder and drops back. */
  bailed: boolean;
}

export interface SceneView {
  /** null until the first snapshot. */
  phase: 'BETTING' | 'FLYING' | 'CRASHED' | null;
  storm: Storm;
  /** Seconds until touchdown, while betting. */
  countdownS: number | null;
  trucks: TruckView[];
  ghosts: GhostView[];
  growthRate: number;
  reducedMotion: boolean;
}

interface Ghost {
  id: string;
  lane: number;
  paint: PaintKey;
  z: number;
  z0: number;
  bailAt: number | null;
  phase: number;
}

interface Drop {
  x: number;
  y: number;
  len: number;
  v: number;
}

interface PowerFlash {
  x: number;
  z: number;
  born: number;
  life: number;
  seed: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** Where the shoulder is, for a vehicle pulling off the road. */
const SHOULDER = 4.8;

export class Scene {
  private ctx: Ctx;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private backdrop: HTMLCanvasElement | null = null;
  private backdropKey = '';
  private backdropH = 0;
  private vr = new VehicleRenderer();
  private particles = new Particles();
  private tornado = new Tornado();
  private ghosts = new Map<string, Ghost>();
  private truckX = new Map<string, number>();
  private last = 0;
  private time = 0;
  private prevPhase: SceneView['phase'] = null;
  private surgeAt = 0;
  private surging = false;
  private liftedFx = new Set<string>();
  private shake = 0;
  private flash = 0;
  private mastSpin = 0;
  private drops: Drop[] = [];
  private power: PowerFlash[] = [];
  private powerTint = 0;
  private acc = { spray: 0, leaf: 0, debris: 0, dust: 0, lift: 0 };
  /** The funnel's sideways position, eased so it never jumps. */
  private funnelX = -40;
  private resizeObs: ResizeObserver | null = null;
  /** Lightning: distance in metres, for the thunder. */
  onStrike: ((distance: number) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.tornado.onStrike = (d) => this.onStrike?.(d);
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
  }

  destroy() {
    this.resizeObs?.disconnect();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  /** Texture resolution for the vehicles, px per metre: the player's trucks sharp, the others lighter. */
  private get detailHi() {
    return Math.round(Math.min(260, (this.h / 900) * 150 * this.dpr) / 10) * 10 || 60;
  }

  private get detailLo() {
    return Math.max(40, Math.round(this.detailHi * 0.45 / 10) * 10);
  }

  /** Draw one frame. `now` is performance.now(). */
  frame(now: number, view: SceneView) {
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.time += dt;
    const { storm } = view;
    const reduced = view.reducedMotion;
    const time = this.time;

    // ── Phase transitions ───────────────────────────────────────────────
    if (view.phase !== this.prevPhase) {
      if (view.phase === 'BETTING') {
        this.ghosts.clear();
        this.particles.clear();
        this.tornado.reset();
        this.surging = false;
        this.liftedFx.clear();
        this.power = [];
      }
      this.prevPhase = view.phase;
    }
    if ((storm.phase === 'surge' || storm.phase === 'lifted') && !this.surging) {
      this.surging = true;
      this.surgeAt = now - (storm.crashAge ?? 0) * 1000;
      this.shake = reduced ? 0 : 0.8;
      this.flash = reduced ? 0.2 : 0.55;
    }
    const crashAge = this.surging ? (now - this.surgeAt) / 1000 : -1;
    const surgeK = crashAge < 0 ? 0 : ease(crashAge / SURGE_S);
    const liftAge = crashAge - SURGE_S;
    if (storm.phase === 'surge' && !reduced) this.shake = Math.max(this.shake, 0.55);
    if (storm.phase === 'lifted' && !reduced) this.shake = Math.max(this.shake, 0.5 * Math.max(0, 1 - liftAge / LIFT_S));
    this.shake = Math.max(0, this.shake - dt / 1.2);
    this.flash = Math.max(0, this.flash - dt / 0.5);

    const power = storm.power;
    const wind = storm.wind;
    const wet = clamp01(power / 1.2) * 0.9 + (view.phase === 'BETTING' ? 0.15 : 0);
    const fury = Math.max(clamp01((power - 1.5) / 3), surgeK);
    const lightningRate = storm.phase === 'surge' ? 2 : 0.2 + 0.18 * Math.min(power, 4);
    this.tornado.step(dt, now, reduced ? lightningRate * 0.4 : lightningRate);
    this.mastSpin += dt * (wind / 14);

    // ── Where the funnel is ─────────────────────────────────────────────
    // On the chase it hangs ahead and a little left of the road; at the crash it swings onto the road; once the
    // truck is up it moves off across the fields to the left, away from the camera.
    const shape = funnelShape(power);
    const chaseX = -storm.range * 0.075 - 12 + Math.sin(time * 0.13) * storm.range * 0.025;
    const away = Math.max(0, liftAge);
    const targetX = chaseX + (0 - chaseX) * surgeK - away * 30;
    this.funnelX += (targetX - this.funnelX) * Math.min(1, dt * (surgeK > 0 ? 8 : 2));
    const fz = CAR_Z + Math.max(storm.range, shape.debris * 0.55 + 16) + Math.pow(away, 1.5) * 40;
    let touch = 0.3;
    if (view.phase === 'FLYING' || view.phase === 'CRASHED') touch = 1;
    else if (view.phase === 'BETTING') touch = 0.28 + 0.69 * clamp01((7 - (view.countdownS ?? 7)) / 6.8);
    const tv = { x: this.funnelX, z: fz, power, touch, time, reduced };

    // ── Camera ──────────────────────────────────────────────────────────
    const shakeAmp = this.shake * this.shake * 30;
    // after the lift the camera tilts up to follow the truck, then settles as the tornado moves off
    const tilt = crashAge >= 0 && !reduced ? this.h * 0.13 * ease(away / 1.3) * (1 - 0.75 * smooth((away - 1.9) / 2)) : 0;
    const cam = makeCamera(this.w, this.h, rnd(-1, 1) * shakeAmp, rnd(-1, 1) * shakeAmp * 0.6 + tilt);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#141b1f';
    ctx.fillRect(0, 0, this.w, this.h);
    if (crashAge >= 0 && !reduced) {
      // buffeted: the camera rolls in the gusts
      const roll = Math.sin(now / 140) * 0.035 * surgeK * Math.max(0.2, 1 - away / 4);
      ctx.translate(this.w / 2, this.h * 0.6);
      ctx.rotate(roll);
      ctx.scale(1.06, 1.06);
      ctx.translate(-this.w / 2, -this.h * 0.6);
    }

    // ── Sky ─────────────────────────────────────────────────────────────
    const key = `${this.w}x${this.h}`;
    if (this.backdropKey !== key) {
      const hz = makeCamera(this.w, this.h).horizon;
      this.backdrop = renderBackdrop(this.w, hz);
      this.backdropH = hz + 2;
      this.backdropKey = key;
    }
    ctx.drawImage(this.backdrop!, cam.cx - this.w / 2 - 40, cam.horizon - this.backdropH - 40 * (this.backdropH / this.w), this.w + 80, this.backdropH * (1 + 80 / this.w));
    drawTurbines(ctx, cam, time, wind);
    this.tornado.drawSky(ctx, cam, tv, now);
    const fl = this.tornado.flashLevel;
    if (fl > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(150,160,210,${(fl * 0.22).toFixed(3)})`;
      ctx.fillRect(0, 0, this.w, cam.horizon);
      ctx.restore();
    }

    // ── Ground, roadside, vehicles, the funnel: far → near ──────────────
    const dist = storm.dist;
    drawGround(ctx, cam, dist, time, wind, wet, fl + this.powerTint * 0.5);
    const lean = -clamp01(wind / 320) * 0.3;
    const props: Prop[] = roadside(ctx, cam, dist, time, wind, lean, fl);
    for (const m of SIGNS) {
      const z = CAR_Z + distAt(secondsTo(view.growthRate, m)) - dist;
      if (z <= cam.zNear || z >= 700) continue;
      props.push({ z, draw: () => drawSign(ctx, cam, z, m, storm.t > secondsTo(view.growthRate, m)) });
    }
    props.push({ z: fz, draw: () => this.tornado.drawFunnel(ctx, cam, tv) });
    this.powerFlashes(ctx, cam, props, view, dt, now, shape, fz);

    this.syncGhosts(view, now);
    for (const g of this.ghosts.values()) {
      const prop = this.ghostProp(ctx, cam, g, view, now, crashAge, fz, shape, fl);
      if (prop) props.push(prop);
    }
    const n = view.trucks.length;
    view.trucks.forEach((t, i) => {
      const target = n === 1 ? 0 : (i - (n - 1) / 2) * 3.6;
      const prev = this.truckX.get(t.id) ?? target;
      const x = prev + (target - prev) * Math.min(1, dt * 4);
      this.truckX.set(t.id, x);
      const prop = this.truckProp(ctx, cam, t, x, i === 0, view, now, dt, crashAge, fz, shape, wet, fl);
      if (prop) props.push(prop);
    });

    props.sort((a, b) => b.z - a.z).forEach((d) => d.draw());

    // ── Weather in front of the lens ────────────────────────────────────
    this.weather(cam, view, dt, wind, fury, crashAge);
    this.particles.step(dt, time);
    this.particles.draw(ctx);
    this.rain(ctx, dt, wind, wet + surgeK * 0.6, reduced);

    // ── Grade ───────────────────────────────────────────────────────────
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const storminess = Math.max(clamp01(power / 3.5), view.phase === 'BETTING' ? 0.08 : 0);
    if (storminess > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${Math.round(255 - 85 * storminess)},${Math.round(255 - 55 * storminess)},${Math.round(255 - 70 * storminess)})`;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
    if (crashAge >= 0) {
      // inside the debris: brown murk closing in, then thinning as it passes
      const murk = surgeK * (liftAge < 0 ? 1 : Math.max(0.12, 1 - liftAge / 2.6));
      ctx.fillStyle = `rgba(48,36,24,${(0.32 * murk).toFixed(3)})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (fl > 0 || this.flash > 0 || this.powerTint > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(190,200,240,${(fl * 0.12 + this.flash * 0.3).toFixed(3)})`;
      ctx.fillRect(0, 0, this.w, this.h);
      if (this.powerTint > 0) {
        ctx.fillStyle = `rgba(60,170,210,${(this.powerTint * 0.12).toFixed(3)})`;
        ctx.fillRect(0, 0, this.w, this.h);
      }
      ctx.restore();
    }
    const vig = ctx.createRadialGradient(this.w / 2, this.h * 0.55, this.h * 0.3, this.w / 2, this.h * 0.55, this.h * 0.95);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,0,0,${0.5 + 0.2 * fury})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /* ── Power flashes ─────────────────────────────────────────────────── */

  /** Transformers blowing round the funnel as it chews through power lines: blue-green flashes on the ground. */
  private powerFlashes(ctx: Ctx, cam: Camera, props: Prop[], view: SceneView, dt: number, now: number, shape: FunnelShape, fz: number) {
    const { storm } = view;
    const rate = storm.phase === 'surge' ? 4 : storm.phase === 'chase' ? Math.max(0, storm.power - 1.0) * 0.45 : 0;
    if (Math.random() < rate * dt * (view.reducedMotion ? 0.4 : 1)) {
      this.power.push({ x: this.funnelX + rnd(-1.4, 1.4) * shape.debris, z: fz + rnd(-0.3, 1.4) * shape.debris, born: now, life: rnd(0.35, 0.7), seed: Math.random() * 100 });
    }
    this.power = this.power.filter((p) => now - p.born < p.life * 1000);
    let tint = 0;
    for (const f of this.power) {
      const age = (now - f.born) / 1000 / f.life;
      const flick = Math.max(0, Math.sin(age * 40 + f.seed) * 0.5 + 0.6) * (1 - age);
      if (f.z <= cam.zNear + 1) continue;
      tint = Math.max(tint, flick * Math.min(1, 220 / f.z));
      props.push({
        z: f.z,
        draw: () => {
          const p = project(cam, f.x, 4, f.z);
          const r = Math.max(30, 26 * p.s);
          glow(ctx, p.sx, p.sy, r * 3, '60,190,230', 0.35 * flick);
          glow(ctx, p.sx, p.sy, r, '190,250,255', 0.8 * flick);
        },
      });
    }
    this.powerTint = tint;
  }

  /* ── Vehicles ──────────────────────────────────────────────────────── */

  /**
   * A vehicle in the tornado's grip, `age` seconds after it left the ground: thrown up and off the road towards the
   * funnel, tumbling, then carried round the funnel and up into it. `zc` is the depth of its centre on the road.
   */
  private liftPose(x0: number, zc: number, fz: number, age: number, seed: number, shape: FunnelShape) {
    const fx = this.funnelX;
    const toward = fx < x0 ? -1 : 1;
    const a = ease(age / 1.1);
    const xA = x0 + toward * 3.5 * a + Math.sin(age * 6 + seed) * 0.3 * a;
    const zA = zc + 9 * a;
    const yA = 6.5 * a + Math.sin(age * 5 + seed) * 0.5 * a;
    // then round the funnel (counter-clockwise from above, as they turn) and up into it: slow at first, out at the
    // edge of the debris, and faster as it is drawn in
    const b = clamp01((age - 0.7) / 3.6);
    const bb = smooth(b);
    const th0 = Math.atan2(zA - fz, xA - fx);
    const r0 = Math.hypot(xA - fx, zA - fz);
    const th = th0 + 4.4 * Math.pow(b, 2.1);
    const y = yA + 110 * Math.pow(b, 1.35);
    const u = Math.min(1, y / BASE_H);
    const rf = (shape.ground + (shape.top - shape.ground) * Math.pow(u, shape.q)) * 1.12;
    const R = r0 + (rf - r0) * bb;
    const pose: Pose = {
      x: fx + Math.cos(th) * R + y * 0.12 * bb,
      y: PIVOT_Y + y,
      z: fz + Math.sin(th) * R * 0.9,
      yaw: seed * 0.7 + age * 2.1 + age * age * 0.2,
      pitch: Math.sin(age * 1.6 + seed) * 1.1 + age * 1.3,
      roll: toward * (age * 3.3 + age * age * 0.45) + seed,
    };
    return { pose, alpha: y > 150 ? Math.max(0, 1 - (y - 150) / 40) : 1 };
  }

  private truckProp(
    ctx: Ctx, cam: Camera, tv: TruckView, laneX: number, primary: boolean, view: SceneView, now: number, dt: number,
    crashAge: number, fz: number, shape: FunnelShape, wet: number, flash: number,
  ): Prop | null {
    const { storm } = view;
    const reduced = view.reducedMotion;
    const L = VEHICLE_L.pickup;
    const speed = storm.speed;
    const speedMs = speed / 3.6;
    const bailAge = tv.bailAt != null ? (now - tv.bailAt) / 1000 : -1;
    const lifting = bailAge < 0 && crashAge >= 0;
    const airborne = lifting && crashAge >= SURGE_S;
    let lights: Lights = 1;
    let hazards = view.phase === 'BETTING' || view.phase == null;
    const sprung: Sprung = { pitch: 0, roll: 0, lift: 0 };
    let pose: Pose;
    let alpha = 1;
    let spin = storm.dist / 0.46;
    if (bailAge >= 0) {
      // bail out: hard on the brakes, swing onto the shoulder, drop back past the camera
      const k = Math.min(1, bailAge / 3.4);
      const back = CAR_Z + 10;
      const zRear = CAR_Z - back * k * k;
      const u = Math.min(1, bailAge / 1.6);
      const x = laneX + (SHOULDER - laneX) * ease(u);
      const dxdt = ((SHOULDER - laneX) * 3 * (1 - u) ** 2) / 1.6;
      const vAbs = Math.max(5, speedMs - (back * 2 * k) / 3.4);
      const yaw = Math.atan2(dxdt, vAbs) * 1.6;
      pose = onRoad('pickup', x, zRear, yaw);
      sprung.pitch = -0.05 * Math.sin(Math.min(1, bailAge / 0.7) * Math.PI) - (bailAge < 3 ? 0.015 : 0);
      sprung.roll = -yaw * 0.35;
      spin = (storm.dist + zRear - CAR_Z) / 0.46;
      lights = 2;
      hazards = true;
    } else if (lifting && !airborne) {
      // the rear steps out towards the funnel and lifts
      const k = crashAge / SURGE_S;
      const side = this.funnelX > laneX ? 1 : -1;
      pose = onRoad('pickup', laneX + Math.sin(crashAge * 30) * 0.08 + k * k * side * 1.2, CAR_Z, -side * k * k * 0.5 + Math.sin(crashAge * 22) * 0.03, k * k * 0.4);
      pose.pitch = -k * k * 0.12;
      pose.roll = side * k * 0.16 + Math.sin(crashAge * 26) * 0.03;
      sprung.roll = Math.sin(crashAge * 40) * 0.03;
      lights = 2;
    } else if (airborne) {
      const lp = this.liftPose(laneX, CAR_Z + L / 2, fz, crashAge - SURGE_S, primary ? 1 : 2.3, shape);
      pose = lp.pose;
      alpha = lp.alpha;
      lights = Math.sin(now / 35) > 0.4 && crashAge < SURGE_S + 1 ? 1 : 0;
      spin = storm.dist / 0.46 + (crashAge - SURGE_S) * 18;
    } else {
      // driving: the suspension working over the road, rolling in the gusts, squatting as it pulls away
      const sp = Math.min(1, speed / 100);
      pose = onRoad('pickup', laneX, CAR_Z, reduced ? 0 : Math.sin(now / 1300 + laneX) * 0.014 * sp);
      if (!reduced) {
        if (view.phase === 'BETTING' || view.phase == null) {
          sprung.lift = Math.sin(now / 28) * 0.003;
        } else {
          sprung.lift = (Math.sin(now / 47 + laneX) * 0.012 + Math.sin(now / 113 + laneX * 2) * 0.008) * sp;
          sprung.roll = (-storm.wind / 400) * 0.02 + (Math.sin(now / 530 + laneX) * 0.6 + Math.sin(now / 197) * 0.4) * (storm.wind / 400) * 0.035;
          sprung.pitch = storm.t > 0 ? 0.035 * Math.exp(-storm.t / 0.9) : 0;
        }
      }
    }
    if (pose.z + L / 2 < 0.6 || alpha <= 0) return null;

    const v: VehicleView = {
      kind: 'pickup', paint: tv.paint, lights, pose, sprung, wheelSpin: spin, flash,
      mast: airborne ? undefined : { spin: this.mastSpin, bend: Math.min(1, (speed + storm.wind * 0.4) / 220) },
    };
    const onGround = !airborne;
    return {
      z: pose.z - L / 2,
      draw: () => {
        this.vr.draw(ctx, cam, v, { reflect: onGround ? 0.15 * wet : 0, shadow: 1, detail: this.detailHi, alpha });
        if (!airborne) {
          const bar = view.phase === 'FLYING' && bailAge < 0;
          this.vehicleGlows(ctx, cam, v, lights, hazards, bar, now, 0);
        }

        // ── effects anchored to the truck ──
        const nn = reduced ? 0.35 : 1;
        const zW = pose.z - L / 2 + 0.7;
        if (zW < cam.zNear * 0.5) return;
        const wl = project(cam, pose.x - 0.9, 0.05, Math.max(0.5, zW));
        const wr = project(cam, pose.x + 0.9, 0.05, Math.max(0.5, zW));
        const scale = wl.s / 78;
        const wetK = clamp01(storm.power / 1.2);
        if (bailAge < 0 && !lifting && speed > 20 && wetK > 0.1) {
          this.acc.spray += dt * 30 * wetK * nn * Math.min(1, speed / 100);
          while (this.acc.spray >= 1) {
            this.acc.spray--;
            const p = Math.random() < 0.5 ? wl : wr;
            this.particles.mist(p.sx, p.sy, scale * 1.2, 1, -60 - storm.wind * 0.4, 0.13);
          }
        }
        if (bailAge >= 0 && bailAge < 1.4) {
          this.acc.spray += dt * 44 * nn;
          while (this.acc.spray >= 1) {
            this.acc.spray--;
            const p = Math.random() < 0.5 ? wl : wr;
            this.particles.mist(p.sx, p.sy, scale * 1.3, 1, 60, 0.2);
          }
        }
        if (lifting && primary) {
          const mid = project(cam, pose.x, pose.y + 0.6, Math.max(0.5, pose.z));
          if (!airborne) {
            this.acc.lift += dt * 40 * nn;
            while (this.acc.lift >= 1) {
              this.acc.lift--;
              this.particles.dust(rnd(wl.sx, wr.sx), wl.sy, scale * 1.6, 1, (this.funnelX < laneX ? -1 : 1) * 300, -120, 0.55);
            }
          } else if (!this.liftedFx.has(tv.id)) {
            this.liftedFx.add(tv.id);
            if (!reduced) {
              this.particles.glass(mid.sx, mid.sy - wl.s * 0.4, scale * 1.6, 80);
              this.particles.debris(mid.sx, mid.sy, scale * 1.4, 14, -260, -380, 0.8);
              // panels torn off the truck, in its own paint
              this.particles.debris(mid.sx, mid.sy, scale * 2.2, 8, -200, -320, 0.9, tv.paint === 'red' ? '#c3232c' : '#2459c4');
            }
            this.particles.dust(mid.sx, wl.sy, scale * 2.4, reduced ? 6 : 18, -200, -160, 0.6, true);
          }
        }
      },
    };
  }

  private ghostProp(
    ctx: Ctx, cam: Camera, g: Ghost, view: SceneView, now: number, crashAge: number, fz: number, shape: FunnelShape, flash: number,
  ): Prop | null {
    const { storm } = view;
    const L = VEHICLE_L.suv;
    let lights: Lights = 1;
    const parked = view.phase === 'BETTING' || view.phase == null;
    const sprung: Sprung = { pitch: 0, roll: 0, lift: 0 };
    let pose: Pose;
    let alpha = 1;
    let lifted = false;
    let spin = storm.dist / 0.44;
    if (g.bailAt != null) {
      const age = (now - g.bailAt) / 1000;
      const k = Math.min(1, age / 3.8);
      const back = g.z + 10;
      const zRear = g.z - back * k * k;
      const to = Math.sign(g.lane) * 5.2;
      const u = Math.min(1, age / 1.8);
      const x = g.lane + (to - g.lane) * ease(u);
      const dxdt = ((to - g.lane) * 3 * (1 - u) ** 2) / 1.8;
      const vAbs = Math.max(5, storm.speed / 3.6 - (back * 2 * k) / 3.8);
      const yaw = Math.atan2(dxdt, vAbs) * 1.6;
      pose = onRoad('suv', x, zRear, yaw);
      sprung.pitch = -0.05 * Math.sin(Math.min(1, age / 0.7) * Math.PI);
      sprung.roll = -yaw * 0.35;
      spin = (storm.dist + zRear - g.z) / 0.44;
      lights = 2;
    } else {
      const zRear = g.z0 + Math.sin(now / 1500 + g.phase) * 1.2;
      g.z = zRear;
      pose = onRoad('suv', g.lane, zRear, Math.sin(now / 1700 + g.phase) * 0.01);
      if (!parked && !view.reducedMotion) {
        sprung.lift = Math.sin(now / 51 + g.phase) * 0.012 * Math.min(1, storm.speed / 100);
        sprung.roll = (Math.sin(now / 470 + g.phase) * storm.wind) / 400 * 0.035;
      }
      // the chasers nearest the funnel go first
      const delay = Math.max(0, (fz - g.z0) / 200);
      const age = crashAge - SURGE_S * 0.6 - delay;
      if (crashAge >= 0 && age > 0) {
        const lp = this.liftPose(g.lane, g.z0 + L / 2, fz, age, g.phase, shape);
        pose = lp.pose;
        alpha = lp.alpha;
        lifted = true;
        lights = 0;
      } else if (crashAge >= 0) {
        // shoved about as the funnel bears down
        const k = clamp01(crashAge / (SURGE_S * 0.6 + delay));
        pose.yaw += Math.sin(crashAge * 20 + g.phase) * 0.05 * k;
        pose.roll = Math.sin(crashAge * 24 + g.phase) * 0.05 * k - 0.08 * k;
        lights = 2;
      }
    }
    if (pose.z + L / 2 < 0.6 || alpha <= 0) return null;
    const v: VehicleView = { kind: 'suv', paint: g.paint, lights, pose, sprung, wheelSpin: spin, flash };
    const zRear = pose.z - L / 2;
    return {
      z: zRear,
      draw: () => {
        this.vr.draw(ctx, cam, v, { shadow: 1, detail: this.detailLo, alpha, strips: zRear < 14 ? 10 : 3 });
        if (!lifted) this.vehicleGlows(ctx, cam, v, lights, parked || g.bailAt != null, false, now, g.phase);
      },
    };
  }

  /** Tail lights (and their smear on the wet road), hazards, the light bar strobing on the chase. */
  private vehicleGlows(ctx: Ctx, cam: Camera, v: VehicleView, lights: Lights, hazards: boolean, bar: boolean, now: number, ph: number) {
    const facing = this.vr.rearFacing(v);
    if (facing < 0.05) return;
    const at = this.vr.lights(cam, v);
    if (lights > 0) {
      const a = (lights === 2 ? 1 : 0.45) * facing;
      for (const p of at.tail) {
        if (!p) continue;
        glow(ctx, p.sx, p.sy, p.s * (lights === 2 ? 0.6 : 0.32), '255,40,50', 0.5 * a);
        // the smear down the wet road
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const y0 = p.sy + p.s * 0.95;
        const g = ctx.createLinearGradient(0, y0, 0, y0 + p.s * 1.4);
        g.addColorStop(0, `rgba(255,40,50,${0.22 * a})`);
        g.addColorStop(1, 'rgba(255,40,50,0)');
        ctx.fillStyle = g;
        ctx.fillRect(p.sx - p.s * 0.08, y0, p.s * 0.16, p.s * 1.4);
        ctx.restore();
      }
      if (lights === 2 && at.third) glow(ctx, at.third.sx, at.third.sy, at.third.s * 0.3, '255,50,60', 0.5 * facing);
    }
    if (hazards && Math.sin(now / 160 + ph) > 0) {
      for (const p of at.hazard) if (p) glow(ctx, p.sx, p.sy, p.s * 0.3, '255,160,30', 0.9 * facing);
    }
    if (bar) {
      const k = Math.floor(now / 110) % 4;
      const p = at.bar[k < 2 ? 0 : 1];
      if (p) glow(ctx, p.sx, p.sy, p.s * 0.5, '255,170,40', 0.6 * facing);
    }
  }

  /* ── Weather ───────────────────────────────────────────────────────── */

  /** Leaves, dust and wreckage carried across the frame on the inflow, towards the funnel (right → left). */
  private weather(cam: Camera, view: SceneView, dt: number, wind: number, fury: number, crashAge: number) {
    const n = view.reducedMotion ? 0.3 : 1;
    const scale = cam.h / 800;
    const gust = wind / 200;
    const inSurge = crashAge >= 0 && crashAge < SURGE_S + LIFT_S;
    const spawnX = () => cam.w + rnd(10, 60);
    const spawnY = (lo: number, hi: number) => cam.horizon + (cam.h - cam.horizon) * rnd(lo, hi);

    this.acc.leaf += dt * (1.5 + gust * 6 + (inSurge ? 40 : 0)) * n;
    while (this.acc.leaf >= 1) {
      this.acc.leaf--;
      this.particles.leaves(spawnX(), spawnY(-0.6, 0.9), scale * rnd(0.6, 1.5), 1, -(300 + wind * 2.4));
    }
    this.acc.dust += dt * (Math.max(0, gust - 0.7) * 5 + (inSurge ? 50 : 0)) * n;
    while (this.acc.dust >= 1) {
      this.acc.dust--;
      this.particles.dust(spawnX() + 60, spawnY(0, 0.6), scale * rnd(1.5, 3), 1, -(240 + wind * 1.8), rnd(-40, 10), inSurge ? 0.5 : 0.22, inSurge && Math.random() < 0.4);
    }
    this.acc.debris += dt * (fury * 3 + (inSurge ? 26 : 0)) * n;
    while (this.acc.debris >= 1) {
      this.acc.debris--;
      this.particles.debris(spawnX(), spawnY(-0.7, 0.8), scale * rnd(0.6, 2.2), 1, -(380 + wind * 2.2), rnd(-260, 60), 0.4);
    }
  }

  /** Rain streaks slanting in on the wind. */
  private rain(ctx: Ctx, dt: number, wind: number, wet: number, reduced: boolean) {
    const target = Math.floor(Math.min(1.3, wet) * (reduced ? 90 : 240));
    while (this.drops.length < target) this.drops.push({ x: Math.random() * (this.w + 300), y: Math.random() * this.h, len: rnd(10, 26), v: rnd(900, 1400) });
    if (this.drops.length > target) this.drops.length = target;
    if (!target) return;
    const vx = -(120 + wind * 2.2);
    ctx.save();
    ctx.strokeStyle = 'rgba(200,212,220,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x += vx * dt;
      if (d.y > this.h || d.x < -40) {
        d.y = -rnd(0, 60);
        d.x = Math.random() * (this.w + 300);
      }
      const k = d.len / d.v;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - vx * k, d.y - d.v * k);
    }
    ctx.stroke();
    ctx.restore();
  }

  private syncGhosts(view: SceneView, now: number) {
    const seen = new Set<string>();
    let idx = 0;
    for (const gv of view.ghosts) {
      seen.add(gv.id);
      let g = this.ghosts.get(gv.id);
      if (!g) {
        const lane = idx % 2 === 0 ? -1.9 : 1.9;
        const row = Math.floor(idx / 2);
        const z0 = CAR_Z + 13 + row * 11 + (idx % 2) * 5 + rnd(0, 2);
        g = { id: gv.id, lane, paint: GHOST_PAINTS[idx % GHOST_PAINTS.length], z: z0, z0, bailAt: null, phase: rnd(0, 6) };
        this.ghosts.set(gv.id, g);
      }
      if (gv.bailed && g.bailAt == null) g.bailAt = now;
      idx++;
      if (idx >= 8) break;
    }
    for (const id of this.ghosts.keys()) if (!seen.has(id)) this.ghosts.delete(id);
  }
}

export { makeCamera, project, type Camera };
