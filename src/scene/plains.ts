/*
 * Tornado alley: a two-lane highway running straight across the plains towards the storm. The sky, the bright slot
 * under the storm base and the far tree lines and grain elevators are pre-rendered once per size. Every frame draws
 * the moving parts in perspective: wheat and pasture with gusts running through them, the wet road and its lines,
 * fence lines, telephone poles and their wires, farmsteads (barn, silo, house, windmill, trees), hay bales and the
 * green multiplier signs.
 */

import { glow, type Ctx } from './truckArt';

/** World units are metres. The chase camera rides 3.4 m up, behind the truck. */
export const CAM_H = 3.4;
/** Depth of the player's truck. */
export const CAR_Z = 10;
export const LANE_W = 3.6;
const EDGE_X = 3.55;
const SHOULDER_X = 5.4;
const GRAVEL_X = 6.4;
const FENCE_X = 10.5;
const POLE_X = -14;
export const SIGN_X = 9;
const Z_FAR = 1800;

export interface Camera {
  w: number;
  h: number;
  horizon: number;
  /** px per world unit at depth 1. */
  f: number;
  cx: number;
  zNear: number;
}

export function makeCamera(w: number, h: number, shakeX = 0, shakeY = 0): Camera {
  const horizon = Math.round(h * 0.44) + shakeY;
  const f = h * 0.95;
  return { w, h, horizon, f, cx: w / 2 + shakeX, zNear: (CAM_H * f) / (h - horizon + 60) };
}

export function project(cam: Camera, x: number, y: number, z: number) {
  const s = cam.f / Math.max(z, 0.05);
  return { sx: cam.cx + x * s, sy: cam.horizon + (CAM_H - y) * s, s };
}

type P = { sx: number; sy: number };
function poly(ctx: Ctx, pts: P[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)));
  ctx.closePath();
}

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const mod = (a: number, n: number) => ((a % n) + n) % n;

/* ── Backdrop ────────────────────────────────────────────────────────── */

/** Sky down to the horizon: the overcast, the bright slot under the storm, and the far tree lines and elevators. */
export function renderBackdrop(w: number, horizon: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round((horizon + 2) * dpr));
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#161d21');
  sky.addColorStop(0.35, '#26302f');
  sky.addColorStop(0.62, '#3f4a44');
  sky.addColorStop(0.8, '#727a62');
  sky.addColorStop(0.92, '#b9b083');
  sky.addColorStop(1, '#ddcf98');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon + 2);

  // Overcast: lumpy cloud masses, darker on top, catching a little light underneath.
  for (let i = 0; i < 70; i++) {
    const cx = rnd() * w;
    const cy = horizon * (0.02 + rnd() * 0.62);
    const r = w * (0.05 + rnd() * 0.1);
    const lit = cy / horizon;
    const g = ctx.createRadialGradient(cx, cy + r * 0.25, r * 0.1, cx, cy, r);
    g.addColorStop(0, `rgba(${30 + lit * 60},${38 + lit * 62},${38 + lit * 50},${0.25 + rnd() * 0.2})`);
    g.addColorStop(1, 'rgba(20,26,28,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.42);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
  // mammatus pouches hanging off the anvil
  for (let i = 0; i < 46; i++) {
    const cx = rnd() * w;
    const cy = horizon * (0.08 + rnd() * 0.3);
    const r = horizon * (0.025 + rnd() * 0.03);
    const g = ctx.createRadialGradient(cx, cy + r * 0.5, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(120,128,110,0.16)');
    g.addColorStop(0.7, 'rgba(60,68,62,0.08)');
    g.addColorStop(1, 'rgba(30,36,36,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // striations: the rotating updraft's banded flanks, sweeping round the storm in arcs
  const scx = w * 0.46;
  const scy = horizon * 0.95;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.filter = `blur(${Math.max(2, horizon * 0.02).toFixed(1)}px)`;
  for (let i = 0; i < 9; i++) {
    const rx = w * (0.22 + i * 0.075);
    const ry = horizon * (0.26 + i * 0.07);
    const a0 = Math.PI * (1.12 + rnd() * 0.1);
    const a1 = Math.PI * (1.88 - rnd() * 0.1);
    ctx.lineWidth = horizon * (0.03 + rnd() * 0.035);
    ctx.strokeStyle = i % 2 ? 'rgba(120,132,120,0.06)' : 'rgba(8,12,14,0.11)';
    ctx.beginPath();
    ctx.ellipse(scx, scy, rx, ry, 0, a0, a1);
    ctx.stroke();
    // the lit underside of each band
    ctx.lineWidth = horizon * 0.008;
    ctx.strokeStyle = 'rgba(190,190,150,0.05)';
    ctx.beginPath();
    ctx.ellipse(scx, scy + horizon * 0.016, rx, ry, 0, a0, a1);
    ctx.stroke();
  }
  ctx.filter = 'none';
  ctx.restore();

  // the glow in the bright slot, warmest where the low sun is behind the clouds
  const slot = ctx.createLinearGradient(0, horizon * 0.8, 0, horizon);
  slot.addColorStop(0, 'rgba(255,236,170,0)');
  slot.addColorStop(1, 'rgba(255,236,170,0.38)');
  ctx.fillStyle = slot;
  ctx.fillRect(0, horizon * 0.8, w, horizon * 0.2 + 2);
  const sun = ctx.createRadialGradient(w * 0.8, horizon * 0.97, 0, w * 0.8, horizon * 0.97, w * 0.28);
  sun.addColorStop(0, 'rgba(255,224,160,0.5)');
  sun.addColorStop(0.3, 'rgba(255,210,140,0.18)');
  sun.addColorStop(1, 'rgba(255,210,140,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, horizon * 0.6, w, horizon * 0.4 + 2);
  // light shafts falling through gaps under the base
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const x = w * (0.66 + rnd() * 0.28);
    const wd = w * (0.01 + rnd() * 0.025);
    const g = ctx.createLinearGradient(0, horizon * 0.72, 0, horizon);
    g.addColorStop(0, 'rgba(255,230,170,0)');
    g.addColorStop(0.5, 'rgba(255,230,170,0.05)');
    g.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, horizon * 0.72);
    ctx.lineTo(x + wd, horizon * 0.72);
    ctx.lineTo(x + wd * 2.4 - w * 0.03, horizon);
    ctx.lineTo(x - w * 0.03, horizon);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Far horizon: low hills, tree lines, a farm and a grain elevator, in haze.
  const base = horizon + 1;
  ctx.fillStyle = 'rgba(88,96,76,0.75)';
  ctx.beginPath();
  ctx.moveTo(0, base);
  for (let x = 0; x <= w; x += w / 40) ctx.lineTo(x, base - horizon * (0.012 + 0.012 * Math.sin(x / w * 7 + 1) + 0.008 * Math.sin(x / w * 23)));
  ctx.lineTo(w, base);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(56,64,52,0.85)';
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w;
    const tw = w * (0.01 + rnd() * 0.05);
    const th = horizon * (0.012 + rnd() * 0.018);
    ctx.beginPath();
    ctx.ellipse(x, base, tw, th, 0, Math.PI, 0);
    ctx.fill();
  }
  const elevator = (x: number, s: number) => {
    ctx.fillStyle = 'rgba(70,76,66,0.9)';
    const hgt = horizon * 0.07 * s;
    for (let k = 0; k < 4; k++) ctx.fillRect(x + k * hgt * 0.16, base - hgt, hgt * 0.14, hgt);
    ctx.fillRect(x + hgt * 0.62, base - hgt * 1.35, hgt * 0.16, hgt * 1.35);
    ctx.fillRect(x - hgt * 0.1, base - hgt * 0.4, hgt * 0.95, hgt * 0.4);
  };
  elevator(w * 0.12, 1);
  elevator(w * 0.83, 0.7);
  // haze sitting on the horizon
  const haze = ctx.createLinearGradient(0, base - horizon * 0.06, 0, base);
  haze.addColorStop(0, 'rgba(200,196,160,0)');
  haze.addColorStop(1, 'rgba(200,196,160,0.35)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, base - horizon * 0.06, w, horizon * 0.06 + 1);
  return c;
}

/** Wind turbines far off on the horizon, turning with the wind. */
export function drawTurbines(ctx: Ctx, cam: Camera, time: number, wind: number) {
  const spin = time * (0.8 + wind / 120);
  ctx.save();
  ctx.strokeStyle = 'rgba(150,156,140,0.55)';
  ctx.fillStyle = 'rgba(150,156,140,0.55)';
  for (const [fx, s] of [[0.64, 1], [0.7, 0.8], [0.75, 0.9], [0.92, 0.7], [0.3, 0.6]] as const) {
    const x = cam.cx - cam.w / 2 + fx * cam.w;
    const hgt = cam.h * 0.05 * s;
    const top = cam.horizon - hgt;
    ctx.lineWidth = Math.max(1, hgt * 0.04);
    ctx.beginPath();
    ctx.moveTo(x, cam.horizon + 1);
    ctx.lineTo(x, top);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.8, hgt * 0.025);
    for (let i = 0; i < 3; i++) {
      const a = spin * s + fx * 9 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + Math.cos(a) * hgt * 0.5, top + Math.sin(a) * hgt * 0.5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ── Ground and road ─────────────────────────────────────────────────── */

const WHEAT = ['#8a7a3f', '#7c6f37', '#94843f', '#6f6432'];
const PASTURE = ['#4e6034', '#58683a', '#455830', '#5d5233'];

/**
 * Fields, verges and the road. `dist` is metres driven, `wind` km/h (gusts sweep the wheat), `wet` 0..1 (rain on
 * the tarmac).
 */
export function drawGround(ctx: Ctx, cam: Camera, dist: number, time: number, wind: number, wet: number, flash = 0) {
  const { w, h, horizon } = cam;
  const near = cam.zNear;
  const g = ctx.createLinearGradient(0, horizon, 0, h);
  g.addColorStop(0, '#7b7a5c');
  g.addColorStop(0.08, '#6a6a46');
  g.addColorStop(1, '#4b4b2c');
  ctx.fillStyle = g;
  ctx.fillRect(0, horizon, w, h - horizon);

  // fields, in bands across the road
  for (const [side, len, cols, edge] of [[-1, 260, WHEAT, -FENCE_X], [1, 190, PASTURE, FENCE_X]] as const) {
    const k0 = Math.floor((dist + near) / len);
    for (let k = k0; k < k0 + 12; k++) {
      const z0 = Math.max(near, k * len - dist);
      const z1 = Math.min(Z_FAR, (k + 1) * len - dist);
      if (z1 <= z0) continue;
      ctx.fillStyle = cols[Math.floor(hash(k * 3 + side) * cols.length)];
      poly(ctx, [project(cam, edge, 0, z0), project(cam, side * 5000, 0, z0), project(cam, side * 5000, 0, z1), project(cam, edge, 0, z1)]);
      ctx.fill();
      // a farm track along the field boundary
      const zt = k * len - dist;
      if (zt > near && zt < 900) {
        const a = project(cam, edge, 0, zt);
        const b = project(cam, side * 5000, 0, zt + 2);
        ctx.strokeStyle = 'rgba(70,58,40,0.5)';
        ctx.lineWidth = Math.max(1, 2.5 * a.s * 0.4);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }
    }
  }
  // crop rows in the wheat converge on the horizon
  ctx.strokeStyle = 'rgba(40,32,12,0.13)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 46; i++) {
    const x = -FENCE_X - 1.2 - i * 2.2;
    const a = project(cam, x, 0, near);
    const b = project(cam, x, 0, Z_FAR);
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
  }
  ctx.stroke();
  // gusts racing through the crops towards the funnel (right → left)
  const gustSpeed = 4 + wind / 9;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const off = mod(time * gustSpeed + i * 47 + side * 13, 330);
      const x0 = side < 0 ? -FENCE_X - off : FENCE_X + 330 - off;
      const wid = 4 + hash(i + side * 9) * 6;
      ctx.fillStyle = side < 0 ? 'rgba(255,236,170,0.07)' : 'rgba(200,230,170,0.05)';
      poly(ctx, [project(cam, x0, 0, near), project(cam, x0 - wid, 0, near), project(cam, x0 - wid, 0, 700), project(cam, x0, 0, 700)]);
      ctx.fill();
    }
  }

  // verges, gravel, shoulders, lanes
  const strip = (x0: number, x1: number, fill: string | CanvasGradient) => {
    ctx.fillStyle = fill;
    poly(ctx, [project(cam, x0, 0, near), project(cam, x1, 0, near), project(cam, x1, 0, Z_FAR), project(cam, x0, 0, Z_FAR)]);
    ctx.fill();
  };
  strip(-FENCE_X, -GRAVEL_X, '#4a5131');
  strip(GRAVEL_X, FENCE_X, '#465232');
  // the ditches
  strip(-FENCE_X + 0.8, -GRAVEL_X - 1, 'rgba(25,30,18,0.35)');
  strip(GRAVEL_X + 1, FENCE_X - 0.8, 'rgba(25,30,18,0.35)');
  strip(-GRAVEL_X, -SHOULDER_X, '#6b665a');
  strip(SHOULDER_X, GRAVEL_X, '#6b665a');
  const tarmac = ctx.createLinearGradient(0, horizon, 0, h);
  tarmac.addColorStop(0, '#5d625e');
  tarmac.addColorStop(0.1, '#3a3e3e');
  tarmac.addColorStop(1, '#27292b');
  strip(-SHOULDER_X, SHOULDER_X, tarmac);
  strip(-SHOULDER_X, -EDGE_X - 0.1, 'rgba(255,255,255,0.03)');
  strip(EDGE_X + 0.1, SHOULDER_X, 'rgba(255,255,255,0.03)');
  // patched cracks and tar seams, moving with the road
  ctx.strokeStyle = 'rgba(12,12,14,0.35)';
  ctx.lineWidth = 1;
  for (let k = Math.floor(dist / 9); k < Math.floor(dist / 9) + 26; k++) {
    const z = k * 9 - dist;
    if (z < near || z > 240) continue;
    const xa = (hash(k) - 0.5) * 6;
    const a = project(cam, xa, 0, z);
    const b = project(cam, xa + (hash(k + 1) - 0.5) * 2.5, 0, z + 2.5);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
  // repaved patches, darker than the worn road round them
  for (let k = Math.floor(dist / 37); k < Math.floor(dist / 37) + 14; k++) {
    if (hash(k * 1.9) < 0.45) continue;
    const z0 = k * 37 - dist + hash(k * 2.7) * 12;
    const z1 = z0 + 3 + hash(k * 3.3) * 9;
    if (z1 < near || z0 > 400) continue;
    const x0 = (hash(k * 4.1) - 0.5) * 6;
    const wd = 1.2 + hash(k * 5.9) * 2.4;
    ctx.fillStyle = 'rgba(14,15,17,0.22)';
    poly(ctx, [project(cam, x0, 0, Math.max(near, z0)), project(cam, x0 + wd, 0, Math.max(near, z0)), project(cam, x0 + wd, 0, z1), project(cam, x0, 0, z1)]);
    ctx.fill();
  }

  // white edge lines, solid yellow centre line, dashed passing line
  strip(-EDGE_X - 0.08, -EDGE_X + 0.08, 'rgba(232,232,222,0.8)');
  strip(EDGE_X - 0.08, EDGE_X + 0.08, 'rgba(232,232,222,0.8)');
  strip(-0.2, -0.06, 'rgba(236,190,48,0.92)');
  ctx.fillStyle = 'rgba(236,190,48,0.92)';
  for (let k = Math.floor(dist / 12); k < Math.floor(dist / 12) + 70; k++) {
    const z0 = k * 12 - dist;
    const z1 = z0 + 3.6;
    if (z1 < near || z0 > 800) continue;
    poly(ctx, [project(cam, 0.06, 0, Math.max(near, z0)), project(cam, 0.2, 0, Math.max(near, z0)), project(cam, 0.2, 0, z1), project(cam, 0.06, 0, z1)]);
    ctx.fill();
  }

  // rain on the tarmac: the bright slot reflected, and puddles on the shoulders
  if (wet > 0.02) {
    const top = project(cam, 0, 0, Z_FAR).sy;
    const sheen = ctx.createLinearGradient(0, top, 0, top + (h - top) * 0.6);
    sheen.addColorStop(0, `rgba(230,220,170,${Math.min(0.7, 0.32 * wet + flash * 0.3)})`);
    sheen.addColorStop(1, 'rgba(230,220,170,0)');
    strip(-SHOULDER_X, SHOULDER_X, sheen);
    if (flash > 0.02) {
      // lightning mirrored in the wet road
      const fg = ctx.createLinearGradient(0, top, 0, h);
      fg.addColorStop(0, `rgba(170,180,230,${(0.35 * flash).toFixed(3)})`);
      fg.addColorStop(1, `rgba(170,180,230,${(0.08 * flash).toFixed(3)})`);
      strip(-SHOULDER_X, SHOULDER_X, fg);
    }
    // the wheel tracks: tyres squeeze the water out, so they run darker than the sheen
    for (const xc of [-2.65, -0.95, 0.95, 2.65]) strip(xc - 0.32, xc + 0.32, `rgba(16,18,20,${(0.22 * wet).toFixed(3)})`);
    for (let k = Math.floor(dist / 23); k < Math.floor(dist / 23) + 12; k++) {
      const z = k * 23 - dist + hash(k * 7) * 10;
      if (z < near || z > 200 || hash(k) < 0.4) continue;
      const side = hash(k * 5) < 0.5 ? -1 : 1;
      const p = project(cam, side * (EDGE_X + 0.4 + hash(k * 11) * 1.2), 0, z);
      const r = p.s * (0.8 + hash(k * 13) * 1.4);
      ctx.fillStyle = `rgba(190,196,180,${0.12 * wet})`;
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, r, r * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // raindrops splashing on the tarmac: rings that open and fade
    // (batched by age into three strokes: fresh, opening, fading)
    ctx.lineWidth = 1;
    const rings = [new Path2D(), new Path2D(), new Path2D()];
    const count = Math.round(70 * Math.min(1, wet));
    for (let i = 0; i < count; i++) {
      const cyc = time * 2.6 + hash(i * 3.3) * 9;
      const ph = cyc - Math.floor(cyc);
      const id = Math.floor(cyc);
      const x = (hash(i * 7.1 + id * 13.7) - 0.5) * SHOULDER_X * 2;
      const z = near + Math.pow(hash(i * 11.3 + id * 17.9), 1.6) * 36;
      const p = project(cam, x, 0, z);
      const r = (0.05 + ph * 0.22) * p.s;
      if (r < 0.6) continue;
      const path = rings[Math.min(2, Math.floor(ph * 3))];
      path.moveTo(p.sx + r, p.sy);
      path.ellipse(p.sx, p.sy, r, r * 0.28, 0, 0, Math.PI * 2);
    }
    rings.forEach((path, i) => {
      ctx.strokeStyle = `rgba(215,225,232,${((1 - (i + 0.5) / 3) * 0.26 * wet).toFixed(3)})`;
      ctx.stroke(path);
    });
  }

  // fence wire, three strands each side
  ctx.strokeStyle = 'rgba(30,28,24,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    for (const y of [0.55, 0.85, 1.15]) {
      const a = project(cam, side * FENCE_X, y, near);
      const b = project(cam, side * FENCE_X, y, 400);
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
    }
  }
  ctx.stroke();

  // haze lying over the far fields, so the land fades into the sky instead of stopping at a line
  const hz = ctx.createLinearGradient(0, horizon, 0, horizon + (h - horizon) * 0.2);
  hz.addColorStop(0, 'rgba(176,170,132,0.62)');
  hz.addColorStop(0.35, 'rgba(150,148,118,0.26)');
  hz.addColorStop(1, 'rgba(150,148,118,0)');
  ctx.fillStyle = hz;
  ctx.fillRect(0, horizon - 1, w, (h - horizon) * 0.2 + 1);

  drawVerge(ctx, cam, dist, time, wind);
}

/**
 * Grass along the verges and the edge of the wheat beyond the left-hand fence, close to the camera, combed over by
 * the wind (towards the funnel) and fluttering in the gusts.
 */
function drawVerge(ctx: Ctx, cam: Camera, dist: number, time: number, wind: number) {
  const near = cam.zNear;
  const bend = 0.25 + Math.min(1, wind / 260) * 0.6;
  const flutter = 0.05 + Math.min(1, wind / 300) * 0.18;
  const STEP = 1.3;
  for (let k = Math.floor((dist + near) / STEP); k < Math.floor(dist / STEP) + 75; k++) {
    const zb = k * STEP - dist;
    for (const side of [-1, 1]) {
      const n = 2 + Math.floor(hash(k * 3.1 + side) * 2);
      for (let j = 0; j < n; j++) {
        const z = zb + hash(k * 5.3 + j * 1.7 + side) * STEP;
        if (z <= near || z > 95) continue;
        const x = side * (GRAVEL_X + 0.4 + hash(k * 7.9 + j * 2.3 + side * 3) * (FENCE_X - GRAVEL_X - 0.6));
        const b = project(cam, x, 0, z);
        if (b.sx < -40 || b.sx > cam.w + 40) continue;
        const hgt = (0.32 + hash(k * 9.7 + j) * 0.38) * b.s;
        if (hgt < 1.5) continue;
        const lean = bend - Math.sin(time * 5 + k * 0.7 + j) * flutter;
        stamp(ctx, tuftSprite(Math.floor(hash(k * 2.2 + j * 4.4 + side) * 3), lean), b.sx, b.sy, hgt);
      }
    }
    // wheat standing beyond the left fence
    for (let j = 0; j < 3; j++) {
      const z = zb + hash(k * 13.1 + j * 3.7) * STEP;
      if (z <= near || z > 60) continue;
      const x = -FENCE_X - 0.6 - hash(k * 15.7 + j * 5.1) * 3.5;
      const b = project(cam, x, 0, z);
      if (b.sx < -40) continue;
      const hgt = (0.85 + hash(k * 17.3 + j) * 0.25) * b.s;
      if (hgt < 2) continue;
      const lean = bend * 0.7 - Math.sin(time * 4 + k * 0.45 + j * 0.8) * flutter * 1.3;
      stamp(ctx, tuftSprite(3, lean), b.sx, b.sy, hgt);
    }
  }
}

/* Verge sprites: a clump of grass (three greens) or of wheat, pre-drawn at a few angles of lean. The clump's base
 * sits at (BASE_X, H) in the sprite and it leans left, towards the funnel. */
const TUFT_W = 96;
const TUFT_H = 64;
const TUFT_BASE = 66;
const LEANS = 10;
const LEAN_MIN = -0.2;
const LEAN_MAX = 1.3;
const tufts = new Map<number, HTMLCanvasElement>();

function tuftSprite(kind: number, lean: number): HTMLCanvasElement {
  const li = Math.max(0, Math.min(LEANS - 1, Math.round(((lean - LEAN_MIN) / (LEAN_MAX - LEAN_MIN)) * (LEANS - 1))));
  const id = kind * 100 + li;
  let c = tufts.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = TUFT_W;
  c.height = TUFT_H;
  const g = c.getContext('2d')!;
  const ln = LEAN_MIN + (li / (LEANS - 1)) * (LEAN_MAX - LEAN_MIN);
  g.lineCap = 'round';
  const wheat = kind === 3;
  const colors = wheat ? ['#9a8448', '#b39a55', '#8a7a3f'] : [['#56633a', '#4a5732'], ['#6f7444', '#5d6a3a'], ['#8f8550', '#7a7a46']][kind];
  const blades = wheat ? 4 : 7;
  for (let i = 0; i < blades; i++) {
    const t = i / (blades - 1) - 0.5;
    const h = TUFT_H * (wheat ? 0.92 - Math.abs(t) * 0.15 : 0.95 - Math.abs(t) * 0.5);
    const bx = TUFT_BASE + t * (wheat ? 10 : 14);
    const l = (ln - t * 0.35) * h;
    const tx = bx - l;
    const ty = TUFT_H - h * (1 - Math.min(0.5, Math.abs(l / h) * 0.3));
    g.strokeStyle = colors[i % colors.length];
    g.lineWidth = wheat ? 2.4 : 3;
    g.beginPath();
    g.moveTo(bx, TUFT_H);
    g.quadraticCurveTo(bx - l * 0.25, TUFT_H - h * 0.6, tx, ty);
    g.stroke();
    if (wheat) {
      g.fillStyle = '#c4aa60';
      g.beginPath();
      g.ellipse(tx, ty, 3, 8, -Math.atan2(l, h), 0, Math.PI * 2);
      g.fill();
    }
  }
  tufts.set(id, c);
  return c;
}

/** Draws a verge sprite `hgt` px tall with its base at (x, y). */
function stamp(ctx: Ctx, sprite: HTMLCanvasElement, x: number, y: number, hgt: number) {
  const k = hgt / TUFT_H;
  ctx.drawImage(sprite, x - TUFT_BASE * k, y - hgt, TUFT_W * k, hgt);
}

/* ── Roadside props ──────────────────────────────────────────────────── */

export interface Prop {
  z: number;
  draw: () => void;
}

/** Fades far props into the haze. */
const fade = (z: number) => Math.max(0, Math.min(1, 1 - (z - 260) / 520));

function drawPost(ctx: Ctx, cam: Camera, x: number, z: number) {
  const b = project(cam, x, 0, z);
  const t = project(cam, x, 1.3, z);
  ctx.fillStyle = '#3b3125';
  ctx.fillRect(b.sx - Math.max(0.6, 0.07 * b.s), t.sy, Math.max(1.2, 0.14 * b.s), b.sy - t.sy);
}

function drawDelineator(ctx: Ctx, cam: Camera, x: number, z: number, flash: number) {
  const b = project(cam, x, 0, z);
  const t = project(cam, x, 1.15, z);
  const s = b.s;
  if (s < 1.2) return;
  ctx.globalAlpha = fade(z);
  const w = Math.max(1, 0.1 * s);
  ctx.fillStyle = '#d9dcd6';
  ctx.fillRect(b.sx - w / 2, t.sy, w, b.sy - t.sy);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(b.sx + w * 0.1, t.sy, w * 0.4, b.sy - t.sy);
  ctx.fillStyle = '#1b1c1e';
  ctx.fillRect(b.sx - w / 2, t.sy + 0.12 * s, w, 0.1 * s);
  // the reflector
  const ry = t.sy + 0.3 * s;
  ctx.fillStyle = x < 0 ? '#ffc23a' : '#f2f6ff';
  ctx.fillRect(b.sx - w * 0.35, ry, w * 0.7, Math.max(1, 0.14 * s));
  ctx.globalAlpha = 1;
  if (z < 160) glow(ctx, b.sx, ry, Math.max(2, 0.35 * s), x < 0 ? '255,190,60' : '230,240,255', (0.25 + flash * 0.6) * (1 - z / 160));
}

function drawPole(ctx: Ctx, cam: Camera, z: number, nextZ: number, sway: number) {
  const b = project(cam, POLE_X, 0, z);
  const top = project(cam, POLE_X + sway, 10, z);
  ctx.strokeStyle = '#3a2f24';
  ctx.lineWidth = Math.max(1.2, 0.28 * b.s);
  ctx.beginPath();
  ctx.moveTo(b.sx, b.sy);
  ctx.lineTo(top.sx, top.sy);
  ctx.stroke();
  // crossarm with insulators
  const arm = project(cam, POLE_X + sway * 0.92, 9.2, z);
  ctx.lineWidth = Math.max(1, 0.18 * b.s);
  ctx.beginPath();
  ctx.moveTo(arm.sx - 1.3 * b.s, arm.sy);
  ctx.lineTo(arm.sx + 1.3 * b.s, arm.sy);
  ctx.stroke();
  ctx.fillStyle = '#9aa7a0';
  for (const dx of [-1.1, 0, 1.1]) ctx.fillRect(arm.sx + dx * b.s - 0.05 * b.s, arm.sy - 0.3 * b.s, Math.max(1, 0.1 * b.s), 0.3 * b.s);
  // sagging wires to the next pole out
  const n = project(cam, POLE_X + sway, 9.5, nextZ);
  const m = project(cam, POLE_X + sway, 8.4, (z + nextZ) / 2);
  ctx.strokeStyle = 'rgba(20,20,22,0.7)';
  ctx.lineWidth = 1;
  for (const dx of [-1.1, 0, 1.1]) {
    const x0 = arm.sx + dx * b.s;
    const y0 = arm.sy - 0.3 * b.s;
    const x1 = n.sx + dx * n.s;
    const y1 = n.sy - 0.3 * n.s;
    // control point so the curve passes through the sagging midpoint
    const mx = m.sx + dx * m.s;
    const my = m.sy - 0.3 * m.s;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(2 * mx - (x0 + x1) / 2, 2 * my - (y0 + y1) / 2, x1, y1);
    ctx.stroke();
  }
}

/** A tree bent over by the wind: trunk and a lumpy crown, leaning towards the funnel. */
export function drawTree(ctx: Ctx, cam: Camera, x: number, z: number, size: number, lean: number, seed: number) {
  const b = project(cam, x, 0, z);
  const s = b.s * size;
  if (s < 0.4) return;
  const topX = b.sx + lean * s * 3.2;
  const topY = b.sy - s * 6;
  ctx.strokeStyle = '#2b2219';
  ctx.lineWidth = Math.max(1, s * 0.45);
  ctx.beginPath();
  ctx.moveTo(b.sx, b.sy);
  ctx.quadraticCurveTo(b.sx, b.sy - s * 3, topX, topY + s);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const a = hash(seed + i) * Math.PI * 2;
    const r = s * (1.5 + hash(seed + i * 3) * 1.2);
    const cx = topX + Math.cos(a) * s * 1.6 + lean * s * (i % 3) * 0.5;
    const cy = topY + Math.sin(a) * s * 1.1;
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#4f6236');
    g.addColorStop(1, '#25321c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A box building facing the road: front face, the side towards the road and a pitched roof. */
function drawBuilding(
  ctx: Ctx, cam: Camera, x: number, z: number, width: number, depth: number, wall: number, ridge: number,
  colors: { wall: string; side: string; roof: string; trim: string }, front: (p: { l: number; r: number; top: number; bot: number; s: number }) => void,
) {
  const side = x < 0 ? 1 : -1; // the face towards the road
  const xIn = x + (side * width) / 2;
  const xOut = x - (side * width) / 2;
  const z1 = z + depth;
  // side wall towards the road
  ctx.fillStyle = colors.side;
  poly(ctx, [project(cam, xIn, 0, z), project(cam, xIn, 0, z1), project(cam, xIn, wall, z1), project(cam, xIn, wall, z)]);
  ctx.fill();
  // roof slope towards the road
  ctx.fillStyle = colors.roof;
  poly(ctx, [project(cam, xIn + side * 0.4, wall - 0.2, z - 0.3), project(cam, xIn + side * 0.4, wall - 0.2, z1 + 0.3), project(cam, x, ridge, z1 + 0.3), project(cam, x, ridge, z - 0.3)]);
  ctx.fill();
  // gable front
  const bl = project(cam, xOut, 0, z);
  const br = project(cam, xIn, 0, z);
  const tl = project(cam, xOut, wall, z);
  const tr = project(cam, xIn, wall, z);
  const pk = project(cam, x, ridge, z);
  ctx.fillStyle = colors.wall;
  poly(ctx, [bl, br, tr, pk, tl]);
  ctx.fill();
  ctx.strokeStyle = colors.trim;
  ctx.lineWidth = Math.max(1, bl.s * 0.15);
  ctx.beginPath();
  ctx.moveTo(tl.sx, tl.sy);
  ctx.lineTo(pk.sx, pk.sy);
  ctx.lineTo(tr.sx, tr.sy);
  ctx.stroke();
  front({ l: Math.min(bl.sx, br.sx), r: Math.max(bl.sx, br.sx), top: tl.sy, bot: bl.sy, s: bl.s });
}

function drawBarn(ctx: Ctx, cam: Camera, x: number, z: number) {
  drawBuilding(ctx, cam, x, z, 12, 18, 6, 10, { wall: '#7e271d', side: '#5f1d16', roof: '#34332f', trim: '#e9e4d8' }, (f) => {
    const cx = (f.l + f.r) / 2;
    const dw = (f.r - f.l) * 0.36;
    const dh = (f.bot - f.top) * 0.75;
    ctx.fillStyle = '#5a1a13';
    ctx.fillRect(cx - dw / 2, f.bot - dh, dw, dh);
    ctx.strokeStyle = '#e9e4d8';
    ctx.lineWidth = Math.max(1, f.s * 0.18);
    ctx.strokeRect(cx - dw / 2, f.bot - dh, dw, dh);
    ctx.beginPath();
    ctx.moveTo(cx - dw / 2, f.bot - dh);
    ctx.lineTo(cx + dw / 2, f.bot);
    ctx.moveTo(cx + dw / 2, f.bot - dh);
    ctx.lineTo(cx - dw / 2, f.bot);
    ctx.stroke();
    ctx.fillStyle = '#e9e4d8';
    ctx.fillRect(cx - dw * 0.18, f.top - (f.bot - f.top) * 0.35, dw * 0.36, dw * 0.3);
  });
}

function drawHouse(ctx: Ctx, cam: Camera, x: number, z: number) {
  drawBuilding(ctx, cam, x, z, 9, 11, 3.2, 5.6, { wall: '#d6d2c4', side: '#a8a597', roof: '#3d3b38', trim: '#ffffff' }, (f) => {
    const wv = (f.r - f.l) * 0.18;
    const wh = (f.bot - f.top) * 0.35;
    for (const k of [0.22, 0.6]) {
      const wx = f.l + (f.r - f.l) * k;
      const wy = f.top + (f.bot - f.top) * 0.25;
      // lamps on inside in the gloom
      ctx.fillStyle = '#ffcf7a';
      ctx.fillRect(wx, wy, wv, wh);
      ctx.fillStyle = 'rgba(255,190,90,0.25)';
      ctx.fillRect(wx - wv * 0.4, wy - wh * 0.4, wv * 1.8, wh * 1.8);
    }
    ctx.fillStyle = '#4a3a2c';
    ctx.fillRect(f.l + (f.r - f.l) * 0.82 - wv * 0.5, f.bot - (f.bot - f.top) * 0.6, wv * 0.8, (f.bot - f.top) * 0.6);
  });
}

function drawSilo(ctx: Ctx, cam: Camera, x: number, z: number, hgt: number) {
  const b = project(cam, x, 0, z);
  const t = project(cam, x, hgt, z);
  const r = 2.6 * b.s;
  const g = ctx.createLinearGradient(b.sx - r, 0, b.sx + r, 0);
  g.addColorStop(0, '#5c6466');
  g.addColorStop(0.35, '#b6bec0');
  g.addColorStop(0.6, '#8e9799');
  g.addColorStop(1, '#3f4547');
  ctx.fillStyle = g;
  ctx.fillRect(b.sx - r, t.sy, r * 2, b.sy - t.sy);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  for (let k = 1; k < 8; k++) {
    const y = t.sy + ((b.sy - t.sy) * k) / 8;
    ctx.beginPath();
    ctx.moveTo(b.sx - r, y);
    ctx.lineTo(b.sx + r, y);
    ctx.stroke();
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(b.sx, t.sy, r, r * 0.8, 0, Math.PI, 0);
  ctx.fill();
}

/** A farm windmill: lattice tower, a fan of blades spinning in the wind and its tail vane. */
function drawWindmill(ctx: Ctx, cam: Camera, x: number, z: number, spin: number) {
  const b = project(cam, x, 0, z);
  const t = project(cam, x, 11, z);
  const s = b.s;
  ctx.strokeStyle = '#3c3a36';
  ctx.lineWidth = Math.max(0.8, s * 0.12);
  ctx.beginPath();
  ctx.moveTo(b.sx - 1.6 * s, b.sy);
  ctx.lineTo(t.sx - 0.2 * s, t.sy);
  ctx.moveTo(b.sx + 1.6 * s, b.sy);
  ctx.lineTo(t.sx + 0.2 * s, t.sy);
  for (let k = 1; k < 5; k++) {
    const y = b.sy + ((t.sy - b.sy) * k) / 5;
    const half = (1.6 - (1.4 * k) / 5) * s;
    ctx.moveTo(b.sx - half, y);
    ctx.lineTo(b.sx + half, y);
  }
  ctx.stroke();
  // tail vane
  ctx.fillStyle = '#5b5e60';
  ctx.beginPath();
  ctx.moveTo(t.sx, t.sy);
  ctx.lineTo(t.sx + 2.6 * s, t.sy - 0.6 * s);
  ctx.lineTo(t.sx + 2.6 * s, t.sy + 0.6 * s);
  ctx.closePath();
  ctx.fill();
  // the wheel
  const r = 1.9 * s;
  ctx.strokeStyle = '#8c8f90';
  ctx.lineWidth = Math.max(0.8, s * 0.22);
  for (let i = 0; i < 14; i++) {
    const a = spin + (i * Math.PI * 2) / 14;
    ctx.beginPath();
    ctx.moveTo(t.sx + Math.cos(a) * r * 0.25, t.sy + Math.sin(a) * r * 0.25);
    ctx.lineTo(t.sx + Math.cos(a) * r, t.sy + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.lineWidth = Math.max(0.6, s * 0.08);
  ctx.beginPath();
  ctx.arc(t.sx, t.sy, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBale(ctx: Ctx, cam: Camera, x: number, z: number) {
  const b = project(cam, x, 0, z);
  const r = 0.75 * b.s;
  if (r < 0.6) return;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(b.sx, b.sy, r * 1.3, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(b.sx - r * 0.3, b.sy - r * 1.3, r * 0.1, b.sx, b.sy - r, r);
  g.addColorStop(0, '#d2b56a');
  g.addColorStop(1, '#8a6f35');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(b.sx, b.sy - r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,66,28,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 6; a += 0.4) {
    const rr = (a / (Math.PI * 6)) * r * 0.9;
    const px = b.sx + Math.cos(a) * rr;
    const py = b.sy - r + Math.sin(a) * rr;
    if (a === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

interface FarmItem {
  kind: 'barn' | 'house' | 'silo' | 'mill' | 'tree';
  x: number;
  /** world distance */
  d: number;
  size: number;
  seed: number;
}

const FARM_EVERY = 430;
const farmCache = new Map<number, FarmItem[]>();
function farm(k: number): FarmItem[] {
  let f = farmCache.get(k);
  if (f) return f;
  f = [];
  const side = hash(k * 1.7) < 0.5 ? -1 : 1;
  const x = side * (46 + hash(k * 2.3) * 40);
  const d = k * FARM_EVERY + hash(k * 3.1) * 140;
  if (hash(k * 4.7) < 0.85) {
    f.push({ kind: 'barn', x, d, size: 1, seed: k });
    if (hash(k * 5.3) < 0.8) f.push({ kind: 'silo', x: x + side * 11, d: d + 4, size: 13 + hash(k) * 6, seed: k });
    f.push({ kind: 'house', x: x - side * 14, d: d - 22, size: 1, seed: k });
    if (hash(k * 6.1) < 0.7) f.push({ kind: 'mill', x: x - side * 4, d: d - 40, size: 1, seed: k });
    for (let i = 0; i < 4; i++) f.push({ kind: 'tree', x: x + side * (12 + hash(k + i) * 14), d: d - 30 + i * 9, size: 0.9 + hash(k * 9 + i) * 0.6, seed: k * 10 + i });
  }
  farmCache.set(k, f);
  if (farmCache.size > 40) farmCache.delete(farmCache.keys().next().value!);
  return f;
}

/**
 * Everything standing beside the road, depth-sorted by the caller with the vehicles and the tornado.
 * `lean` is how far the wind bends trees and poles (towards the funnel, negative = left).
 */
export function roadside(ctx: Ctx, cam: Camera, dist: number, time: number, wind: number, lean: number, flash = 0): Prop[] {
  const out: Prop[] = [];
  const near = cam.zNear;
  // white delineator posts along both shoulders, their reflectors catching the light
  for (let k = Math.floor((dist + near) / 32); k < Math.floor(dist / 32) + 14; k++) {
    const z = k * 32 - dist;
    if (z <= near) continue;
    for (const side of [-1, 1]) out.push({ z, draw: () => drawDelineator(ctx, cam, side * (SHOULDER_X + 0.45), z, flash) });
  }
  // fence posts
  for (let k = Math.floor((dist + near) / 4.5); k < Math.floor(dist / 4.5) + 70; k++) {
    const z = k * 4.5 - dist;
    if (z <= near) continue;
    for (const side of [-1, 1]) out.push({ z, draw: () => drawPost(ctx, cam, side * FENCE_X, z) });
  }
  // telephone poles
  const sway = lean * 0.25 + Math.sin(time * 1.7) * Math.max(0, wind - 150) / 900;
  for (let k = Math.floor((dist + near) / 55); k < Math.floor(dist / 55) + 14; k++) {
    const z = k * 55 - dist;
    if (z <= near) continue;
    const a = fade(z);
    out.push({ z, draw: () => {
      ctx.globalAlpha = a;
      drawPole(ctx, cam, z, z + 55, sway);
      ctx.globalAlpha = 1;
    } });
  }
  // shelterbelt trees along the fence lines
  for (let k = Math.floor((dist + near) / 70); k < Math.floor(dist / 70) + 10; k++) {
    if (hash(k * 2.9) > 0.45) continue;
    const z = k * 70 - dist + hash(k) * 30;
    if (z <= near) continue;
    const side = hash(k * 8.3) < 0.5 ? -1 : 1;
    const x = side * (FENCE_X + 2 + hash(k * 4.1) * 6);
    const sw = lean + Math.sin(time * 2.3 + k) * 0.08 * (wind / 200);
    out.push({ z, draw: () => {
      ctx.globalAlpha = fade(z);
      drawTree(ctx, cam, x, z, 0.8 + hash(k * 5) * 0.5, sw, k * 31);
      ctx.globalAlpha = 1;
    } });
  }
  // hay bales out in the fields
  for (let k = Math.floor((dist + near) / 40); k < Math.floor(dist / 40) + 12; k++) {
    if (hash(k * 1.3) > 0.5) continue;
    const z = k * 40 - dist + hash(k * 2) * 20;
    if (z <= near) continue;
    const side = hash(k * 3.7) < 0.6 ? -1 : 1;
    const x = side * (FENCE_X + 6 + hash(k * 6.6) * 40);
    out.push({ z, draw: () => drawBale(ctx, cam, x, z) });
  }
  // farmsteads
  for (let k = Math.floor(dist / FARM_EVERY) - 1; k < Math.floor(dist / FARM_EVERY) + 3; k++) {
    for (const it of farm(k)) {
      const z = it.d - dist;
      if (z <= near + 2 || z > 900) continue;
      const a = Math.max(0.15, fade(z));
      out.push({ z, draw: () => {
        ctx.globalAlpha = a;
        if (it.kind === 'barn') drawBarn(ctx, cam, it.x, z);
        else if (it.kind === 'house') drawHouse(ctx, cam, it.x, z);
        else if (it.kind === 'silo') drawSilo(ctx, cam, it.x, z, it.size);
        else if (it.kind === 'mill') drawWindmill(ctx, cam, it.x, z, time * (1 + wind / 60) + it.seed);
        else drawTree(ctx, cam, it.x, z, it.size * 1.4, lean + Math.sin(time * 2 + it.seed) * 0.06 * (wind / 200), it.seed);
        ctx.globalAlpha = 1;
      } });
    }
  }
  return out;
}

/* ── Multiplier signs ────────────────────────────────────────────────── */

export const SIGNS = [1.5, 2, 3, 5, 10, 25, 50, 100, 250, 500];

/** A green guide sign on two posts beside the road, showing a multiplier. */
export function drawSign(ctx: Ctx, cam: Camera, z: number, m: number, passed: boolean) {
  const x = SIGN_X;
  const bl = project(cam, x - 1.6, 0, z);
  const br = project(cam, x + 1.6, 0, z);
  const tl = project(cam, x - 1.7, 4.0, z);
  const mid = project(cam, x - 1.7, 2.2, z);
  const s = bl.s;
  if (s < 0.5) return;
  ctx.save();
  ctx.globalAlpha = fade(z);
  ctx.fillStyle = '#8a8f93';
  for (const p of [bl, br]) ctx.fillRect(p.sx - 0.07 * s, tl.sy, Math.max(1, 0.14 * s), p.sy - tl.sy);
  const w = 3.4 * s;
  const hgt = mid.sy - tl.sy;
  ctx.fillStyle = passed ? '#1f4f33' : '#1b6b3f';
  ctx.beginPath();
  ctx.roundRect(tl.sx, tl.sy, w, hgt, 0.18 * s);
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,244,240,0.9)';
  ctx.lineWidth = Math.max(1, 0.08 * s);
  ctx.beginPath();
  ctx.roundRect(tl.sx + 0.12 * s, tl.sy + 0.12 * s, w - 0.24 * s, hgt - 0.24 * s, 0.12 * s);
  ctx.stroke();
  if (s > 3) {
    ctx.fillStyle = '#f4f6f2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${0.95 * s}px 'Chakra Petch', sans-serif`;
    ctx.fillText(`×${m}`, tl.sx + w / 2, tl.sy + hgt * 0.42);
    ctx.font = `700 ${0.3 * s}px 'Chakra Petch', sans-serif`;
    ctx.fillText('TORNADO ALLEY', tl.sx + w / 2, tl.sy + hgt * 0.8);
  }
  ctx.restore();
}
