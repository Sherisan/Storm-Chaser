/*
 * The chase vehicles as low-poly 3D models: boxes and slanted quads with painted faces (truckArt.ts), drawn in true
 * perspective by the chase camera. A vehicle off to one side shows its flank, one braking onto the shoulder swings
 * its nose out, and one lifted by the tornado tumbles end over end, showing its roof, its underside and its nose.
 *
 * Each face is backface-culled, shaded by how it faces the sky and depth-sorted within the vehicle. Textured faces
 * are cut into strips along the axis that recedes from the camera, each strip mapped with its own affine transform,
 * so a flank running past the lens stays in perspective. Shading is baked into a few cached darker copies of each
 * texture, so strips never seam.
 *
 * The body rides on its springs (`Sprung`): it rolls in the gusts, squats and dives, while the wheels stay planted.
 * The pickup also carries a roll bar, a weather mast with a spinning anemometer and whip antennas, drawn as lines.
 */

import { CAM_H, project, type Camera } from './plains';
import { drawTex, texId, type Ctx, type Lights, type PaintKey, type TexKey } from './truckArt';

type V3 = [number, number, number];

export type Kind = 'pickup' | 'suv';

/** Where the vehicle is: its centre of mass (see PIVOT) in world metres, and its heading, pitch and roll (radians). */
export interface Pose {
  x: number;
  y: number;
  z: number;
  /** + turns the nose right. */
  yaw: number;
  /** + lifts the nose. */
  pitch: number;
  /** + rolls to the right. */
  roll: number;
}

/** The body moving on its springs, relative to the wheels. */
export interface Sprung {
  pitch: number;
  roll: number;
  lift: number;
}

export interface VehicleView {
  kind: Kind;
  paint: PaintKey;
  lights: Lights;
  pose: Pose;
  sprung?: Sprung;
  /** Wheel rotation, radians. */
  wheelSpin: number;
  /** Pickup only: the anemometer's angle and how far the antennas bend back in the wind (0..1). */
  mast?: { spin: number; bend: number };
  /** Lightning lighting the paint (0..1). */
  flash?: number;
}

interface Face {
  p: [V3, V3, V3, V3];
  n: V3;
  tex?: TexKey;
  fill?: string;
  /** Rides on the springs (body) or not (wheels). */
  sprung: boolean;
  /** Spins about the face centre with the wheels. */
  spin?: boolean;
  emissive?: boolean;
  bias?: number;
}

interface Model {
  L: number;
  faces: Face[];
  /** Centre of mass, local; the pose's position. */
  pivot: V3;
  wheelR: number;
  /** Local anchor points for the lights. */
  tail: V3[];
  hazard: V3[];
  bar: V3[];
  third: V3;
  /** The body's footprint on the ground, for the shadow. */
  foot: [number, number, number, number];
}

type BoxTex = Partial<Record<'rear' | 'front' | 'left' | 'right' | 'top' | 'bottom', TexKey | string>>;

function box(out: Face[], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, t: BoxTex, o: Partial<Face> = {}) {
  const add = (side: keyof BoxTex, p: [V3, V3, V3, V3], n: V3) => {
    const v = t[side];
    if (!v) return;
    const isFill = v.startsWith('#') || v.startsWith('rgb');
    out.push({ p, n, sprung: true, ...o, ...(isFill ? { fill: v } : { tex: v as TexKey }) });
  };
  add('rear', [[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]], [0, 0, -1]);
  add('front', [[x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [x1, y0, z1]], [0, 0, 1]);
  add('right', [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]], [1, 0, 0]);
  add('left', [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]], [-1, 0, 0]);
  add('top', [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
  add('bottom', [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], [0, -1, 0]);
}

function top(out: Face[], x0: number, x1: number, y: number, z0: number, z1: number, tex: TexKey) {
  out.push({ p: [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], n: [0, 1, 0], tex, sprung: true });
}

/** A windshield sloping from the roof's front edge (yT, zT) down to the bonnet (yB, zB). */
function screen(out: Face[], hw: number, yT: number, zT: number, yB: number, zB: number) {
  const dy = yT - yB;
  const dz = zB - zT;
  const len = Math.hypot(dy, dz);
  out.push({ p: [[hw, yT, zT], [-hw, yT, zT], [-hw, yB, zB], [hw, yB, zB]], n: [0, dz / len, dy / len], tex: 'windshield', sprung: true });
}

function wheels(out: Face[], axles: number[], r: number, inner: number, outer: number) {
  for (const az of axles) {
    for (const s of [-1, 1]) {
      const [x0, x1] = s > 0 ? [inner, outer] : [-outer, -inner];
      box(out, x0, x1, 0, r * 2, az - r, az + r, { left: 'tyre', right: 'tyre', rear: '#141416', front: '#141416', top: '#1b1b1e', bottom: '#0e0e10' }, { sprung: false });
      // the tyre faces spin; the tread faces don't need to
      for (let i = out.length - 6; i < out.length; i++) if (out[i].tex === 'tyre') out[i].spin = true;
    }
  }
}

function mirrors(out: Face[], hw: number, y0: number, z: number) {
  for (const s of [-1, 1]) {
    const [x0, x1] = s > 0 ? [hw, hw + 0.24] : [-hw - 0.24, -hw];
    box(out, x0, x1, y0, y0 + 0.27, z, z + 0.1, { rear: 'mirror', front: '#16171b', left: '#1d1e22', right: '#1d1e22', top: '#24262b', bottom: '#0e0f11' }, { bias: -0.6 });
  }
}

function buildPickup(): Model {
  const f: Face[] = [];
  wheels(f, [1.05, 4.5], 0.46, 0.7, 1.06);
  // undercarriage: dark mass between the wheels, so you can't see the road through the truck
  box(f, -0.72, 0.72, 0.2, 0.56, 0.3, 5.3, { rear: '#0b0c0e', front: '#0b0c0e', left: '#0d0e10', right: '#0d0e10', bottom: '#0b0c0e' });
  box(f, -1.05, 1.05, 0.36, 0.6, 0, 0.16, { rear: 'bumper', top: '#2b2e33', left: '#1b1d21', right: '#1b1d21', bottom: '#0d0e10' }, { bias: -0.2 });
  box(f, -1.05, 1.05, 0.36, 0.64, 5.54, 5.7, { front: '#2a2c31', top: '#33363c', left: '#1b1d21', right: '#1b1d21', bottom: '#0d0e10' });
  box(f, -1.0, 1.0, 0.56, 1.2, 0.14, 5.56, { rear: 'tailgate', front: 'nose', left: 'sideL', right: 'sideR', bottom: 'under' });
  top(f, -1.0, 1.0, 1.2, 0.14, 2.72, 'bed');
  top(f, -1.0, 1.0, 1.2, 4.62, 5.56, 'hood');
  box(f, -0.94, 0.94, 1.2, 1.98, 2.72, 4.66, { rear: 'cabRear', left: 'cabSideL', right: 'cabSideR' });
  top(f, -0.94, 0.94, 1.98, 2.72, 4.06, 'roof');
  screen(f, 0.94, 1.98, 4.06, 1.2, 4.66);
  box(f, -0.8, 0.8, 1.98, 2.11, 3.78, 3.98, { rear: 'lightbar', front: 'lightbar', top: '#121316', left: '#121316', right: '#121316' }, { emissive: true, bias: -0.3 });
  mirrors(f, 0.94, 1.31, 4.02);
  return {
    L: 5.7, faces: f, pivot: [0, 0.9, 2.85], wheelR: 0.46,
    tail: [[-0.91, 0.94, 0.14], [0.91, 0.94, 0.14]],
    hazard: [[-0.91, 1.13, 0.14], [0.91, 1.13, 0.14]],
    bar: [[-0.4, 2.045, 3.78], [0.4, 2.045, 3.78]],
    third: [0, 1.95, 2.72],
    foot: [-1.1, 1.1, -0.1, 5.8],
  };
}

function buildSuv(): Model {
  const f: Face[] = [];
  wheels(f, [0.95, 3.85], 0.44, 0.7, 1.04);
  box(f, -0.72, 0.72, 0.2, 0.52, 0.3, 4.4, { rear: '#0b0c0e', front: '#0b0c0e', left: '#0d0e10', right: '#0d0e10', bottom: '#0b0c0e' });
  box(f, -1.04, 1.04, 0.34, 0.56, 0, 0.14, { rear: '#2a2c31', top: '#33363c', left: '#1b1d21', right: '#1b1d21', bottom: '#0d0e10' }, { bias: -0.2 });
  box(f, -1.04, 1.04, 0.34, 0.6, 4.64, 4.8, { front: '#2a2c31', top: '#33363c', left: '#1b1d21', right: '#1b1d21', bottom: '#0d0e10' });
  box(f, -1.0, 1.0, 0.52, 1.15, 0.12, 4.66, { rear: 'suvTail', front: 'nose', left: 'suvSideL', right: 'suvSideR', bottom: 'under' });
  top(f, -1.0, 1.0, 1.15, 3.9, 4.66, 'hood');
  box(f, -0.96, 0.96, 1.15, 1.98, 0.14, 3.92, { rear: 'suvHatch', left: 'suvGlassL', right: 'suvGlassR' });
  top(f, -0.96, 0.96, 1.98, 0.14, 3.35, 'suvRoof');
  screen(f, 0.96, 1.98, 3.35, 1.15, 3.92);
  box(f, -0.78, 0.78, 1.98, 2.1, 2.62, 2.8, { rear: 'lightbar', front: 'lightbar', top: '#121316', left: '#121316', right: '#121316' }, { emissive: true, bias: -0.3 });
  mirrors(f, 0.96, 1.24, 3.32);
  // spare wheel on the tailgate
  box(f, -0.38, 0.38, 0.58, 1.34, -0.2, 0.12, { rear: 'spare', left: '#111214', right: '#111214', top: '#141518', bottom: '#0d0e10' }, { bias: -0.4 });
  return {
    L: 4.8, faces: f, pivot: [0, 0.9, 2.4], wheelR: 0.44,
    tail: [[-0.92, 0.96, 0.12], [0.92, 0.96, 0.12]],
    hazard: [[-0.92, 1.1, 0.12], [0.92, 1.1, 0.12]],
    bar: [[-0.38, 2.04, 2.62], [0.38, 2.04, 2.62]],
    third: [0, 1.95, 0.14],
    foot: [-1.1, 1.1, -0.2, 4.9],
  };
}

const MODELS: Record<Kind, Model> = { pickup: buildPickup(), suv: buildSuv() };

/** Vehicle length, metres. */
export const VEHICLE_L: Record<Kind, number> = { pickup: MODELS.pickup.L, suv: MODELS.suv.L };
/** Height of the pose's centre above the ground when the vehicle stands on its wheels. */
export const PIVOT_Y = 0.9;

/** World position of a vehicle standing on the road with its rear bumper at depth `zRear`. */
export function onRoad(kind: Kind, x: number, zRear: number, yaw = 0, lift = 0): Pose {
  const m = MODELS[kind];
  return { x, y: PIVOT_Y + lift, z: zRear + m.pivot[2], yaw, pitch: 0, roll: 0 };
}

const CAM: V3 = [0, CAM_H, 0];
const SUN: V3 = (() => {
  const v: V3 = [0.3, 0.85, -0.45];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();
const LEVELS = 9;
const LEVEL_STEP = 0.065;
const NEAR = 0.45;

interface Xf {
  /** Body (sprung) and wheel transforms: local → world. */
  body: (v: V3) => V3;
  wheel: (v: V3) => V3;
  bodyN: (v: V3) => V3;
  wheelN: (v: V3) => V3;
}

function rotator(yaw: number, pitch: number, roll: number) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  return (v: V3): V3 => {
    // roll about z
    let x = v[0] * cr + v[1] * sr;
    let y = -v[0] * sr + v[1] * cr;
    let z = v[2];
    // pitch about x (nose up)
    const y2 = y * cp + z * sp;
    const z2 = -y * sp + z * cp;
    y = y2;
    z = z2;
    // yaw about y (nose right)
    const x3 = x * cy + z * sy;
    const z3 = -x * sy + z * cy;
    x = x3;
    z = z3;
    return [x, y, z];
  };
}

function makeXf(m: Model, pose: Pose, sp: Sprung | undefined): Xf {
  const R = rotator(pose.yaw, pose.pitch, pose.roll);
  const S = sp ? rotator(0, sp.pitch, sp.roll) : null;
  const lift = sp?.lift ?? 0;
  const [px, py, pz] = m.pivot;
  const wheel = (v: V3): V3 => {
    const r = R([v[0] - px, v[1] - py, v[2] - pz]);
    return [pose.x + r[0], pose.y + r[1], pose.z + r[2]];
  };
  const body = S
    ? (v: V3): V3 => {
        const s = S([v[0] - px, v[1] - py, v[2] - pz]);
        return wheel([s[0] + px, s[1] + py + lift, s[2] + pz]);
      }
    : wheel;
  return { body, wheel, wheelN: R, bodyN: S ? (v: V3) => R(S(v)) : R };
}

type Pt = { x: number; y: number; z: number };

/** Renders vehicles; caches their textures (per detail level and shade). */
export class VehicleRenderer {
  private cache = new Map<string, HTMLCanvasElement>();

  /** Texture at `D` px/m, darkened by `level` shade steps. */
  private tex(key: TexKey, paint: PaintKey, lights: Lights, D: number, level: number): HTMLCanvasElement {
    const id = `${texId(key, paint, lights)}@${D}#${level}`;
    let c = this.cache.get(id);
    if (c) return c;
    if (level === 0) {
      c = drawTex(key, paint, lights, D);
    } else {
      const base = this.tex(key, paint, lights, D, 0);
      c = document.createElement('canvas');
      c.width = base.width;
      c.height = base.height;
      const g = c.getContext('2d')!;
      g.drawImage(base, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(4,6,8,${(level * LEVEL_STEP).toFixed(3)})`;
      g.fillRect(0, 0, c.width, c.height);
    }
    this.cache.set(id, c);
    return c;
  }

  /** Screen position of a local point on the body, and the scale there (px per metre). */
  anchor(cam: Camera, v: VehicleView, local: V3) {
    const m = MODELS[v.kind];
    const w = makeXf(m, v.pose, v.sprung).body(local);
    if (w[2] < NEAR) return null;
    const p = project(cam, w[0], w[1], w[2]);
    return { sx: p.sx, sy: p.sy, s: p.s, z: w[2] };
  }

  /** How squarely the vehicle's rear faces the camera (0..1): lights at the back only show from behind. */
  rearFacing(v: VehicleView): number {
    const m = MODELS[v.kind];
    const xf = makeXf(m, v.pose, v.sprung);
    const n = xf.bodyN([0, 0, -1]);
    const c = xf.body([0, 1, 0]);
    const to: V3 = [CAM[0] - c[0], CAM[1] - c[1], CAM[2] - c[2]];
    const l = Math.hypot(...to) || 1;
    return Math.max(0, (n[0] * to[0] + n[1] * to[1] + n[2] * to[2]) / l);
  }

  /**
   * Draws the vehicle. `reflect` > 0 also draws its reflection in the wet road (at that opacity), `shadow` its shadow.
   * `detail` sets the texture resolution (px per metre).
   */
  draw(ctx: Ctx, cam: Camera, v: VehicleView, o: { reflect?: number; shadow?: number; detail?: number; alpha?: number; strips?: number } = {}) {
    const m = MODELS[v.kind];
    const xf = makeXf(m, v.pose, v.sprung);
    const D = o.detail ?? 120;
    const alpha = o.alpha ?? 1;
    if (o.shadow && o.shadow > 0) this.shadow(ctx, cam, m, v.pose, o.shadow * alpha);
    if (o.reflect && o.reflect > 0.01) {
      ctx.save();
      ctx.globalAlpha = o.reflect * alpha;
      this.faces(ctx, cam, m, xf, v, D, true, o.strips ?? 12);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    this.faces(ctx, cam, m, xf, v, D, false, o.strips ?? 12);
    if (v.mast) this.extras(ctx, cam, xf, v);
    ctx.restore();
  }

  private faces(ctx: Ctx, cam: Camera, m: Model, xf: Xf, v: VehicleView, D: number, mirror: boolean, maxStrips: number) {
    const list: { f: Face; w: V3[]; d: number; light: number }[] = [];
    const flash = v.flash ?? 0;
    for (const f of m.faces) {
      const T = f.sprung ? xf.body : xf.wheel;
      const N = f.sprung ? xf.bodyN : xf.wheelN;
      const w = f.p.map(T) as V3[];
      let n = N(f.n);
      if (mirror) {
        for (const p of w) p[1] = -p[1];
        n = [n[0], -n[1], n[2]];
      }
      const cx = (w[0][0] + w[1][0] + w[2][0] + w[3][0]) / 4;
      const cy = (w[0][1] + w[1][1] + w[2][1] + w[3][1]) / 4;
      const cz = (w[0][2] + w[1][2] + w[2][2] + w[3][2]) / 4;
      const tx = CAM[0] - cx, ty = CAM[1] - cy, tz = CAM[2] - cz;
      if (n[0] * tx + n[1] * ty + n[2] * tz <= 0) continue;
      if (w[0][2] < NEAR && w[1][2] < NEAR && w[2][2] < NEAR && w[3][2] < NEAR) continue;
      // lit from the sky; the reflection's normals are flipped, so light it as the real face
      const ny = mirror ? -n[1] : n[1];
      const dot = n[0] * SUN[0] + ny * SUN[1] + n[2] * SUN[2];
      const light = Math.min(1, 0.5 + 0.5 * Math.max(0, dot) + 0.12 * Math.min(0, dot) + flash * 0.35);
      list.push({ f, w, d: Math.hypot(tx, ty, tz) + (f.bias ?? 0), light });
    }
    list.sort((a, b) => b.d - a.d);
    for (const it of list) this.face(ctx, cam, it.f, it.w, it.light, v, D, maxStrips);
  }

  private face(ctx: Ctx, cam: Camera, f: Face, w: V3[], light: number, v: VehicleView, D: number, maxStrips: number) {
    if (f.fill) {
      if (w.some((p) => p[2] < NEAR)) return;
      const q = w.map((p) => project(cam, p[0], p[1], p[2]));
      ctx.fillStyle = shadeHex(f.fill, f.emissive ? 1 : light);
      ctx.beginPath();
      q.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)));
      ctx.closePath();
      ctx.fill();
      return;
    }
    const key = f.tex!;
    const level = f.emissive ? 0 : Math.max(0, Math.min(LEVELS - 1, Math.round((1 - light) / LEVEL_STEP)));
    const img = this.tex(key, v.paint, v.lights, D, level);
    const iw = img.width;
    const ih = img.height;
    // Cut into strips along whichever texture axis runs away from the camera.
    const zs = w.map((p) => p[2]);
    const zMin = Math.max(NEAR, Math.min(...zs));
    const ratio = Math.max(...zs) / zMin;
    const n = f.spin || ratio < 1.1 ? 1 : Math.min(maxStrips, Math.ceil((ratio - 1) * 7));
    const alongU = Math.abs(zs[1] - zs[0]) + Math.abs(zs[2] - zs[3]) >= Math.abs(zs[3] - zs[0]) + Math.abs(zs[2] - zs[1]);
    const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    // the whole face off screen?
    if (n > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of w) {
        if (p[2] < NEAR) continue;
        const s = project(cam, p[0], p[1], p[2]);
        minX = Math.min(minX, s.sx); maxX = Math.max(maxX, s.sx); minY = Math.min(minY, s.sy); maxY = Math.max(maxY, s.sy);
      }
      if (maxX < -50 || minX > cam.w + 50 || maxY < -50 || minY > cam.h + 50) return;
    }
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      let c: V3[];
      let sx: number, sy: number, sw: number, sh: number;
      if (alongU) {
        c = [lerp(w[0], w[1], t0), lerp(w[0], w[1], t1), lerp(w[3], w[2], t1), lerp(w[3], w[2], t0)];
        sx = iw * t0; sy = 0; sw = iw * (t1 - t0); sh = ih;
      } else {
        c = [lerp(w[0], w[3], t0), lerp(w[1], w[2], t0), lerp(w[1], w[2], t1), lerp(w[0], w[3], t1)];
        sx = 0; sy = ih * t0; sw = iw; sh = ih * (t1 - t0);
      }
      if (c.some((p) => p[2] < NEAR)) continue;
      const q = c.map((p) => {
        const s = project(cam, p[0], p[1], p[2]);
        return { x: s.sx, y: s.sy, z: p[2] };
      });
      // neighbouring strips overlap by a texel so their edges meet without a hairline
      texQuad(ctx, img, sx, sy, sw, sh, q, f.spin ? v.wheelSpin : 0, alongU, i > 0 ? 1.5 : 0, i < n - 1 ? 1.5 : 0);
    }
  }

  /** Roll bar, weather mast with its anemometer, whip antennas. */
  private extras(ctx: Ctx, cam: Camera, xf: Xf, v: VehicleView) {
    const P = (l: V3) => {
      const w = xf.body(l);
      return w[2] < NEAR ? null : project(cam, w[0], w[1], w[2]);
    };
    const line = (pts: V3[], width: number, color: string) => {
      const q = pts.map(P);
      if (q.some((p) => !p)) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.8, width * q[0]!.s);
      ctx.beginPath();
      q.forEach((p, i) => (i ? ctx.lineTo(p!.sx, p!.sy) : ctx.moveTo(p!.sx, p!.sy)));
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // roll bar over the bed, with two work lights
    line([[-0.9, 1.2, 2.5], [-0.84, 1.72, 2.56], [0.84, 1.72, 2.56], [0.9, 1.2, 2.5]], 0.07, '#1a1b20');
    line([[-0.84, 1.72, 2.56], [-0.5, 1.2, 2.66]], 0.05, '#1a1b20');
    for (const x of [-0.5, 0.5]) {
      const p = P([x, 1.78, 2.56]);
      if (p) {
        ctx.fillStyle = '#16171b';
        ctx.fillRect(p.sx - 0.09 * p.s, p.sy - 0.06 * p.s, 0.18 * p.s, 0.12 * p.s);
        ctx.fillStyle = 'rgba(220,226,230,0.55)';
        ctx.fillRect(p.sx - 0.07 * p.s, p.sy - 0.045 * p.s, 0.14 * p.s, 0.09 * p.s);
      }
    }
    const mast = v.mast!;
    // mast and anemometer on the roof
    line([[0.55, 1.98, 3.0], [0.55, 2.5, 3.0]], 0.035, '#15161a');
    const hub = P([0.55, 2.52, 3.0]);
    if (hub) {
      const u = hub.s;
      for (let i = 0; i < 3; i++) {
        const a = mast.spin + (i * Math.PI * 2) / 3;
        const cx = hub.sx + Math.cos(a) * u * 0.17;
        const cy = hub.sy + Math.sin(a) * u * 0.035;
        ctx.strokeStyle = '#15161a';
        ctx.lineWidth = Math.max(0.7, u * 0.015);
        ctx.beginPath();
        ctx.moveTo(hub.sx, hub.sy);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        ctx.fillStyle = Math.sin(a) > 0 ? '#e9ecf0' : '#9aa0aa';
        ctx.beginPath();
        ctx.ellipse(cx, cy, u * (0.025 + 0.028 * Math.abs(Math.cos(a))), u * 0.045, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // wind vane
      ctx.fillStyle = '#d33';
      ctx.fillRect(hub.sx - u * 0.02, hub.sy - u * 0.1, u * 0.04, u * 0.06);
    }
    // whip antennas, bent back and over by the wind
    for (const [x, len] of [[-0.6, 0.95], [-0.42, 0.75]] as const) {
      const b = mast.bend;
      line([[x, 1.98, 2.86], [x - b * len * 0.12, 1.98 + len * 0.55, 2.86 - b * len * 0.15], [x - b * len * 0.45, 1.98 + len * (1 - b * 0.3), 2.86 - b * len * 0.45]], 0.012, 'rgba(18,18,22,0.9)');
    }
  }

  private shadow(ctx: Ctx, cam: Camera, m: Model, pose: Pose, a: number) {
    const [x0, x1, z0, z1] = m.foot;
    const R = rotator(pose.yaw, 0, 0);
    const [, , pz] = m.pivot;
    const h = Math.max(0, pose.y - PIVOT_Y);
    const fade = Math.max(0, 1 - h / 7) * a;
    if (fade <= 0.01) return;
    const grow = 1 + h * 0.12;
    const ring = (k: number) =>
      [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => {
        const r = R([x * k * grow, 0, (z - pz) * (1 + (k - 1) * 0.4) * grow]);
        return project(cam, pose.x + r[0], 0, Math.max(NEAR, pose.z + r[2]));
      });
    for (const [k, al] of [[1.25, 0.16], [1.0, 0.3], [0.8, 0.3]] as const) {
      const q = ring(k);
      ctx.fillStyle = `rgba(0,0,0,${(al * fade).toFixed(3)})`;
      ctx.beginPath();
      q.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)));
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Light positions for the scene's glows. */
  lights(cam: Camera, v: VehicleView) {
    const m = MODELS[v.kind];
    return {
      tail: m.tail.map((p) => this.anchor(cam, v, p)),
      hazard: m.hazard.map((p) => this.anchor(cam, v, p)),
      bar: m.bar.map((p) => this.anchor(cam, v, p)),
      third: this.anchor(cam, v, m.third),
    };
  }
}

/**
 * Maps the source rect of `img` onto the screen quad q (TL, TR, BR, BL) with one affine transform: the average
 * parallelogram of the quad, so the error is shared out evenly. No clipping (clips are slow on the GPU canvas): the
 * strips are narrow enough that the parallelogram matches the quad, and each is padded by `lo`/`hi` texels along
 * the strip axis to overlap its neighbours.
 */
function texQuad(ctx: Ctx, img: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, q: Pt[], rot: number, alongU: boolean, lo: number, hi: number) {
  if (sw < 0.5 || sh < 0.5) return;
  const ax = ((q[1].x - q[0].x) + (q[2].x - q[3].x)) / 2 / sw;
  const ay = ((q[1].y - q[0].y) + (q[2].y - q[3].y)) / 2 / sw;
  const cx = ((q[3].x - q[0].x) + (q[2].x - q[1].x)) / 2 / sh;
  const cy = ((q[3].y - q[0].y) + (q[2].y - q[1].y)) / 2 / sh;
  const mx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
  const my = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  // skip faces seen edge-on or smaller than a pixel
  const area = Math.abs(ax * cy - ay * cx) * sw * sh;
  if (area < 1) return;
  ctx.save();
  ctx.transform(ax, ay, cx, cy, mx - (ax * sw) / 2 - (cx * sh) / 2, my - (ay * sw) / 2 - (cy * sh) / 2);
  if (rot) {
    ctx.translate(sw / 2, sh / 2);
    ctx.rotate(rot);
    ctx.translate(-sw / 2, -sh / 2);
  }
  if (alongU) ctx.drawImage(img, sx - lo, sy, sw + lo + hi, sh, -lo, 0, sw + lo + hi, sh);
  else ctx.drawImage(img, sx, sy - lo, sw, sh + lo + hi, 0, -lo, sw, sh + lo + hi);
  ctx.restore();
}

const hexCache = new Map<string, string>();
/** A flat colour darkened to `light` (0..1). */
function shadeHex(c: string, light: number): string {
  const k = Math.round(light * 20) / 20;
  const id = c + k;
  let out = hexCache.get(id);
  if (!out) {
    let r = 0, g = 0, b = 0;
    if (c[0] === '#') {
      r = parseInt(c.slice(1, 3), 16);
      g = parseInt(c.slice(3, 5), 16);
      b = parseInt(c.slice(5, 7), 16);
    }
    out = `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
    hexCache.set(id, out);
  }
  return out;
}

