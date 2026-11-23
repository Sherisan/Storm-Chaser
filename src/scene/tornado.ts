/*
 * The supercell and its tornado, in world space (metres) so they grow as the truck closes in:
 *   storm base  a ceiling of dark cloud over everything, with a bright slot of clear sky under its far edge
 *   rain        grey curtains hanging out of the base behind the funnel
 *   wall cloud  a lowered, slowly turning ring of cloud the funnel hangs from
 *   funnel      shaded condensation, helical bands sliding round it, ragged edges; a rope at touchdown that
 *               widens into a cone and then a wedge as the storm strengthens
 *   debris      a cloud of dust and wreckage orbiting the base, rising and thrown out
 *   lightning   bolts out of the base and the flash they light the sky with
 */

import { project, type Camera } from './plains';
import { puffs } from './particles';
import type { Ctx } from './truckArt';

/** Height of the storm base, metres. */
export const BASE_H = 480;

export interface TornadoView {
  /** Ground position of the funnel, camera-relative. */
  x: number;
  z: number;
  /** ln(multiplier): the storm's strength. */
  power: number;
  /** 0 → 1 as the funnel lowers to the ground (1 = on the ground). */
  touch: number;
  time: number;
  reduced: boolean;
}

export interface FunnelShape {
  /** Debris cloud radius at the ground. */
  debris: number;
  ground: number;
  top: number;
  /** Profile exponent: high = a thin rope that flares at the top, low = a wedge. */
  q: number;
}

export function funnelShape(power: number): FunnelShape {
  const p = Math.min(power, 4.5);
  const debris = 55 * (1 + 0.5 * p);
  return { debris, ground: debris * (0.27 + 0.05 * p), top: debris * (1.2 + 0.35 * p), q: Math.max(1.2, 2.3 - 0.27 * p) };
}

interface Orbiter {
  a: number;
  r: number;
  phase: number;
  speed: number;
  size: number;
  sprite: number;
  dark: boolean;
}

interface Bolt {
  /** world x offset from the funnel, depth offset, and where it lands */
  x0: number;
  dz: number;
  x1: number;
  born: number;
  seed: number;
  life: number;
}

const hash = (n: number) => {
  const x = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
};

export class Tornado {
  private debris: Orbiter[] = [];
  private wreck: Orbiter[] = [];
  private wall: Orbiter[] = [];
  private ceiling: { x: number; dz: number; y: number; size: number; sprite: number }[] = [];
  private scud: { x0: number; dz: number; y: number; size: number; sprite: number; speed: number }[] = [];
  private bolts: Bolt[] = [];
  private flash = 0;
  /** Called when lightning strikes, with its distance in metres (for the thunder's delay). */
  onStrike: ((distance: number) => void) | null = null;

  constructor() {
    for (let i = 0; i < 64; i++) {
      this.debris.push({ a: hash(i) * 6.283, r: 0.25 + hash(i + 50) * 0.8, phase: hash(i + 99), speed: 0.12 + hash(i + 7) * 0.12, size: 0.28 + hash(i + 3) * 0.3, sprite: i % 4, dark: hash(i + 11) < 0.35 });
    }
    for (let i = 0; i < 70; i++) {
      this.wreck.push({ a: hash(i + 300) * 6.283, r: 0.3 + hash(i + 340) * 0.9, phase: hash(i + 380), speed: 0.05 + hash(i + 420) * 0.08, size: 0.6 + hash(i + 460) * 1.6, sprite: i % 4, dark: true });
    }
    for (let i = 0; i < 34; i++) {
      this.wall.push({ a: (i / 34) * 6.283 + hash(i + 600) * 0.3, r: 0.75 + hash(i + 640) * 1.7, phase: hash(i + 680), speed: 0, size: 0.55 + hash(i + 720) * 0.5, sprite: i % 4, dark: false });
    }
    for (let i = 0; i < 70; i++) {
      this.ceiling.push({ x: (hash(i + 900) - 0.5) * 6400, dz: -300 + hash(i + 950) * 2900, y: BASE_H + 20 + hash(i + 990) * 90, size: 260 + hash(i + 1030) * 260, sprite: i % 4 });
    }
    this.ceiling.sort((a, b) => b.dz - a.dz);
    for (let i = 0; i < 22; i++) {
      this.scud.push({ x0: hash(i + 1200) * 2400, dz: -100 + hash(i + 1250) * 900, y: 170 + hash(i + 1300) * 150, size: 90 + hash(i + 1350) * 120, sprite: i % 4, speed: 0.7 + hash(i + 1400) * 0.6 });
    }
    this.scud.sort((a, b) => b.dz - a.dz);
  }

  reset() {
    this.bolts = [];
    this.flash = 0;
  }

  /** How bright the last lightning flash still is (0..1); the scene lights the sky with it. */
  get flashLevel() {
    return this.flash;
  }

  /** Advance the lightning. `rate` strikes per second. */
  step(dt: number, now: number, rate: number) {
    this.flash = Math.max(0, this.flash - dt / 0.35);
    this.bolts = this.bolts.filter((b) => now - b.born < b.life * 1000);
    if (Math.random() < rate * dt) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const b: Bolt = {
        x0: side * (150 + Math.random() * 900), dz: 150 + Math.random() * 1200, x1: 0,
        born: now, seed: Math.floor(Math.random() * 1e6), life: 0.28 + Math.random() * 0.2,
      };
      b.x1 = b.x0 + (Math.random() - 0.5) * 260;
      this.bolts.push(b);
      this.flash = Math.min(1, this.flash + 0.7 + Math.random() * 0.3);
      this.onStrike?.(Math.hypot(b.x1, b.dz));
    }
  }

  /** The storm base, rain curtains and lightning: everything high up and far off. Drawn before the roadside. */
  drawSky(ctx: Ctx, cam: Camera, v: TornadoView, now: number) {
    const S = puffs();
    const shape = funnelShape(v.power);
    // darken the sky under the base, down to its far edge
    const edge = project(cam, 0, BASE_H, v.z + 2600).sy;
    const g = ctx.createLinearGradient(0, 0, 0, edge);
    g.addColorStop(0, 'rgba(10,14,16,0.75)');
    g.addColorStop(0.8, 'rgba(18,24,26,0.45)');
    g.addColorStop(1, 'rgba(18,24,26,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cam.w, edge);

    // rain curtains out of the back of the storm
    for (const [dx, dz, wid, a] of [[shape.top * 1.6 + 260, 420, 760, 0.42], [-shape.top * 2 - 700, 900, 1100, 0.3]] as const) {
      const z = v.z + dz;
      const l = project(cam, v.x + dx - wid / 2, BASE_H, z);
      const r = project(cam, v.x + dx + wid / 2, 0, z);
      if (r.sx < 0 || l.sx > cam.w) continue;
      const rg = ctx.createLinearGradient(0, l.sy, 0, r.sy);
      rg.addColorStop(0, `rgba(52,60,62,0)`);
      rg.addColorStop(0.35, `rgba(62,70,72,${a})`);
      rg.addColorStop(1, `rgba(90,96,92,${a * 0.8})`);
      ctx.fillStyle = rg;
      ctx.fillRect(l.sx, l.sy, r.sx - l.sx, r.sy - l.sy);
      ctx.strokeStyle = `rgba(150,160,160,${a * 0.25})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 26; i++) {
        const x = l.sx + ((i * 37 + now * 0.01) % (r.sx - l.sx));
        ctx.moveTo(x, l.sy + (r.sy - l.sy) * 0.3);
        ctx.lineTo(x - (r.sy - l.sy) * 0.08, r.sy);
      }
      ctx.stroke();
    }

    // the base itself
    for (const c of this.ceiling) {
      const z = v.z + c.dz;
      if (z < 40) continue;
      const p = project(cam, v.x + c.x, c.y, z);
      const r = c.size * p.s;
      if (p.sx + r < 0 || p.sx - r > cam.w || p.sy + r * 0.5 < 0) continue;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(S.cloud[c.sprite], p.sx - r, p.sy - r * 0.45, r * 2, r * 0.9);
    }
    ctx.globalAlpha = 1;

    // scud: ragged low cloud racing in under the base towards the wall cloud
    const scudV = 30 + 12 * Math.min(v.power, 4);
    for (const s of this.scud) {
      const span = 2400;
      const off = (((s.x0 - v.time * scudV * s.speed) % span) + span) % span;
      const x = v.x + off - span * 0.35;
      const z = v.z + s.dz;
      if (z < 60) continue;
      const p = project(cam, x, s.y, z);
      const r = s.size * p.s;
      if (p.sx + r < 0 || p.sx - r > cam.w || p.sy - r > cam.horizon) continue;
      // drawn down towards the funnel as it nears it
      const pull = Math.max(0, 1 - Math.abs(x - v.x) / 700);
      ctx.globalAlpha = 0.55 * Math.min(1, off / 300);
      ctx.drawImage(S.cloud[s.sprite], p.sx - r, p.sy - r * 0.22 + pull * r * 0.2, r * 2, r * 0.44);
    }
    ctx.globalAlpha = 1;

    // lightning
    for (const b of this.bolts) {
      const age = (now - b.born) / 1000;
      const flick = Math.sin(age * 70) > -0.3 ? 1 : 0.25;
      const a = (1 - age / b.life) * flick;
      const top = project(cam, v.x + b.x0, BASE_H, v.z + b.dz);
      const bot = project(cam, v.x + b.x1, 0, v.z + b.dz);
      const pts = boltPath(top.sx, top.sy, bot.sx, bot.sy, b.seed);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      for (const [lw, col] of [[7, `rgba(150,170,255,${0.16 * a})`], [3, `rgba(200,210,255,${0.55 * a})`], [1.2, `rgba(255,255,255,${a})`]] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.beginPath();
        pts.main.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        if (lw < 5) {
          ctx.lineWidth = lw * 0.6;
          for (const br of pts.branches) {
            ctx.beginPath();
            br.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.stroke();
          }
        }
      }
      // the cloud lit up where it leaves the base
      const cg = ctx.createRadialGradient(top.sx, top.sy, 0, top.sx, top.sy, cam.h * 0.25);
      cg.addColorStop(0, `rgba(190,200,255,${0.35 * a})`);
      cg.addColorStop(1, 'rgba(190,200,255,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(top.sx - cam.h * 0.25, top.sy - cam.h * 0.25, cam.h * 0.5, cam.h * 0.5);
      ctx.restore();
    }
  }

  /** The funnel, its debris cloud and the wall cloud above it. Drawn as one prop at the funnel's depth. */
  drawFunnel(ctx: Ctx, cam: Camera, v: TornadoView) {
    const S = puffs();
    const shape = funnelShape(v.power);
    const t = v.time;
    const spin = t * (1.4 + 0.35 * Math.min(v.power, 4));
    const touched = v.touch >= 1;
    const uMin = touched ? 0 : (1 - v.touch) * 0.92;

    // ── slices up the funnel ──
    const N = 46;
    const slices: { sx: number; sy: number; r: number; u: number }[] = [];
    const ropeAmp = 26 / (1 + v.power * 1.4);
    for (let i = 0; i <= N; i++) {
      const u = uMin + (1 - uMin) * Math.pow(i / N, 1.35);
      const y = u * BASE_H;
      const cx = v.x + ropeAmp * Math.sin(u * 3.3 + t * 0.6) * Math.sin(u * Math.PI) + u * BASE_H * 0.12 + Math.sin(t * 0.9 + u * 2) * shape.ground * 0.08;
      let r = shape.ground + (shape.top - shape.ground) * Math.pow(u, shape.q);
      r *= 1 + 0.05 * Math.sin(t * 2.2 + u * 9) + 0.03 * Math.sin(t * 5.1 + u * 23);
      if (!touched) r *= Math.min(1, (u - uMin) / 0.12 + 0.05);
      const p = project(cam, cx, y, v.z);
      slices.push({ sx: p.sx, sy: p.sy, r: r * p.s, u });
    }
    // only the part on screen (plus one slice above the top edge)
    let top = slices.length - 1;
    for (let i = 0; i < slices.length; i++) {
      if (slices[i].sy < -slices[i].r * 0.3) {
        top = i;
        break;
      }
    }
    const vis = slices.slice(0, top + 1);
    const ground = project(cam, v.x, 0, v.z);
    const gs = ground.s;

    // ── debris cloud, back half ──
    const debris = (front: boolean) => {
      if (!touched) return;
      for (const d of this.debris) {
        const a = d.a + t * (0.9 + 0.6 / d.r);
        if (Math.sin(a) < 0 === front) continue;
        const k = (t * d.speed + d.phase) % 1;
        const y = Math.pow(k, 1.3) * shape.debris * 1.1;
        const R = shape.debris * d.r * (0.6 + 0.6 * k);
        const p = project(cam, v.x + Math.cos(a) * R, y, v.z + Math.sin(a) * R * 0.8);
        if (v.z + Math.sin(a) * R * 0.8 < cam.zNear) continue;
        const size = shape.debris * d.size * p.s * (0.8 + k);
        // puffs right in front of the lens go thin, so the funnel still shows through
        const near = Math.max(0, Math.min(1, 1.25 - size / (cam.h * 0.4)));
        ctx.globalAlpha = Math.min(1, 0.85 * (1 - k) * (k < 0.1 ? k / 0.1 : 1)) * near;
        const img = d.dark ? S.dark[d.sprite % 3] : S.dust[d.sprite];
        ctx.drawImage(img, p.sx - size, p.sy - size, size * 2, size * 2);
      }
      ctx.globalAlpha = 1;
    };
    debris(false);

    // ── the funnel body ──
    if (vis.length > 1) {
      ctx.save();
      ctx.beginPath();
      vis.forEach((s, i) => (i ? ctx.lineTo(s.sx - s.r, s.sy) : ctx.moveTo(s.sx - s.r, s.sy)));
      for (let i = vis.length - 1; i >= 0; i--) ctx.lineTo(vis[i].sx + vis[i].r, vis[i].sy);
      ctx.closePath();
      ctx.clip();
      for (let i = 0; i < vis.length - 1; i++) {
        const a = vis[i];
        const b = vis[i + 1];
        const r = Math.max(a.r, b.r);
        const brown = Math.max(0, 1 - a.u / 0.3) * (touched ? 1 : 0);
        const lit = `rgb(${Math.round(104 - 8 * brown)},${Math.round(110 - 26 * brown)},${Math.round(108 - 44 * brown)})`;
        const mid = `rgb(${Math.round(58 + 4 * brown)},${Math.round(62 - 6 * brown)},${Math.round(63 - 18 * brown)})`;
        const dark = `rgb(${Math.round(22 + 8 * brown)},${Math.round(25 + 3 * brown)},${Math.round(27 - 6 * brown)})`;
        const g = ctx.createLinearGradient(a.sx - r, 0, a.sx + r, 0);
        g.addColorStop(0, dark);
        g.addColorStop(0.22, lit);
        g.addColorStop(0.5, mid);
        g.addColorStop(0.85, dark);
        g.addColorStop(1, '#121516');
        ctx.fillStyle = g;
        ctx.fillRect(Math.min(a.sx, b.sx) - r - 2, b.sy - 1, r * 2 + Math.abs(a.sx - b.sx) + 4, a.sy - b.sy + 2);
      }
      // helical bands sliding round: the rotation
      // (each band segment is a thin quad, batched by tone and by how squarely it faces the camera)
      const M = 18;
      const BUCKETS = 4;
      const bands = Array.from({ length: BUCKETS * 2 }, () => new Path2D());
      for (let j = 0; j < M; j++) {
        const light = j % 3 !== 0;
        for (let i = 0; i < vis.length - 1; i++) {
          const s0 = vis[i];
          const s1 = vis[i + 1];
          const th0 = (j / M) * Math.PI * 2 + spin - s0.u * 6;
          const th1 = (j / M) * Math.PI * 2 + spin - s1.u * 6;
          const c = Math.cos(th0);
          if (c <= 0.05) continue;
          const x0 = s0.sx + s0.r * Math.sin(th0);
          const x1 = s1.sx + s1.r * Math.sin(th1);
          const k = light ? 0.025 : 0.04;
          const hw0 = Math.max(0.5, s0.r * k);
          const hw1 = Math.max(0.5, s1.r * k);
          const p = bands[(light ? 0 : BUCKETS) + Math.min(BUCKETS - 1, Math.floor(c * BUCKETS))];
          p.moveTo(x0 - hw0, s0.sy + 0.5);
          p.lineTo(x0 + hw0, s0.sy + 0.5);
          p.lineTo(x1 + hw1, s1.sy - 0.5);
          p.lineTo(x1 - hw1, s1.sy - 0.5);
          p.closePath();
        }
      }
      bands.forEach((p, b) => {
        const c = ((b % BUCKETS) + 0.5) / BUCKETS;
        ctx.fillStyle = b < BUCKETS ? `rgba(196,202,194,${(0.22 * c).toFixed(3)})` : `rgba(6,8,8,${(0.4 * c).toFixed(3)})`;
        ctx.fill(p);
      });
      // a darker core where the debris is thickest, low down
      if (touched) {
        const lowY = vis[0].sy;
        const lg = ctx.createLinearGradient(0, lowY, 0, lowY - shape.debris * gs * 1.4);
        lg.addColorStop(0, 'rgba(60,46,32,0.55)');
        lg.addColorStop(1, 'rgba(60,46,32,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(0, lowY - shape.debris * gs * 1.4, cam.w, shape.debris * gs * 1.4);
      }
      ctx.restore();

      // ragged condensation along both edges
      for (let i = 0; i < vis.length; i += 2) {
        const s = vis[i];
        if (s.r < 1.5) continue;
        for (const side of [-1, 1]) {
          const wob = Math.sin(t * 3 + i * 1.7 + side) * s.r * 0.08;
          const size = Math.max(3, s.r * 0.45);
          ctx.globalAlpha = 0.65;
          ctx.drawImage(S.funnel[(i + (side > 0 ? 1 : 0)) % 3], s.sx + side * s.r * 0.92 + wob - size, s.sy - size, size * 2, size * 2);
        }
      }
      ctx.globalAlpha = 1;
    }

    // ── wreckage flung round the funnel ──
    if (touched) {
      ctx.fillStyle = '#1b1712';
      for (const w of this.wreck) {
        const k = (t * w.speed + w.phase) % 1;
        const y = k * BASE_H * 0.6;
        const u = y / BASE_H;
        const R = (shape.ground + (shape.top - shape.ground) * Math.pow(u, shape.q)) * (1.05 + w.r * 0.5);
        const a = w.a + t * (1.6 - u);
        const p = project(cam, v.x + Math.cos(a) * R + u * BASE_H * 0.12, y, v.z + Math.sin(a) * R * 0.8);
        const s = Math.max(1, w.size * p.s * (1 + v.power * 0.3));
        ctx.save();
        ctx.translate(p.sx, p.sy);
        ctx.rotate(a * 3 + w.phase * 9);
        ctx.globalAlpha = Math.min(1, (1 - k) * 3) * 0.9;
        ctx.fillRect(-s, -s * 0.3, s * 2, s * 0.6);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    debris(true);

    // ── the wall cloud the funnel hangs from ──
    for (const c of this.wall) {
      const a = c.a + t * 0.12;
      const R = shape.top * c.r;
      const p = project(cam, v.x + BASE_H * 0.12 + Math.cos(a) * R, BASE_H - 30 - c.phase * 60, v.z + Math.sin(a) * R * 0.6);
      if (v.z + Math.sin(a) * R * 0.6 < 40) continue;
      const size = shape.top * c.size * p.s;
      if (p.sy + size * 0.5 < 0) continue;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(S.cloud[c.sprite], p.sx - size, p.sy - size * 0.55, size * 2, size * 1.1);
    }
    ctx.globalAlpha = 1;

    // dust skirt where the funnel touches down
    if (touched) {
      const skirt = ctx.createRadialGradient(ground.sx, ground.sy, 0, ground.sx, ground.sy, shape.debris * gs * 1.3);
      skirt.addColorStop(0, 'rgba(110,90,66,0.6)');
      skirt.addColorStop(1, 'rgba(110,90,66,0)');
      ctx.fillStyle = skirt;
      ctx.save();
      ctx.translate(ground.sx, ground.sy);
      ctx.scale(1, 0.35);
      ctx.translate(-ground.sx, -ground.sy);
      ctx.fillRect(ground.sx - shape.debris * gs * 1.3, ground.sy - shape.debris * gs * 1.3, shape.debris * gs * 2.6, shape.debris * gs * 2.6);
      ctx.restore();
    }
  }
}

/** A jagged bolt from (x0, y0) down to (x1, y1), with a couple of forks. Seeded so it holds still while it flickers. */
function boltPath(x0: number, y0: number, x1: number, y1: number, seed: number) {
  let s = seed % 2147483647 || 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const main: [number, number][] = [[x0, y0]];
  const steps = 18;
  const len = Math.hypot(x1 - x0, y1 - y0);
  for (let i = 1; i < steps; i++) {
    const k = i / steps;
    main.push([x0 + (x1 - x0) * k + (r() - 0.5) * len * 0.12, y0 + (y1 - y0) * k + (r() - 0.5) * len * 0.02]);
  }
  main.push([x1, y1]);
  const branches: [number, number][][] = [];
  for (let b = 0; b < 3; b++) {
    const from = main[2 + Math.floor(r() * (steps - 6))];
    const br: [number, number][] = [from];
    let [x, y] = from;
    const dir = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < 5; i++) {
      x += dir * len * (0.02 + r() * 0.04);
      y += len * (0.02 + r() * 0.04);
      br.push([x, y]);
    }
    branches.push(br);
  }
  return { main, branches };
}
