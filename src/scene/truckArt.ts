/*
 * Paint for the chase vehicles. The vehicles are low-poly 3D models (vehicle3d.ts), and every face carries one of
 * these textures: the pickup's tailgate, sides, bed, cab, roof, hood, nose and underside, the SUV's hatch and glass,
 * the tyres. Each is drawn once per paint (and lights state, where the face has lights) into a cached canvas at a
 * fixed px per metre, then mapped onto its face in perspective every frame.
 *
 * Side textures come in a left and a right version so the lettering reads the right way round on both flanks.
 */

export type Ctx = CanvasRenderingContext2D;

export interface Paint {
  body: string;
  light: string;
  dark: string;
  accent: string;
}

export type PaintKey = 'red' | 'blue' | 'white' | 'black' | 'orange' | 'silver' | 'green' | 'tan';

export const PAINTS: Record<PaintKey, Paint> = {
  red: { body: '#c3232c', light: '#f0646a', dark: '#5c0d12', accent: '#ffd23a' },
  blue: { body: '#2459c4', light: '#6a9bff', dark: '#0d2358', accent: '#ffffff' },
  white: { body: '#d9dde3', light: '#ffffff', dark: '#7d848f', accent: '#d8262e' },
  black: { body: '#23262d', light: '#5b616d', dark: '#0b0c10', accent: '#ffb01f' },
  orange: { body: '#e06a17', light: '#ffa45a', dark: '#6b2a03', accent: '#1b1b1b' },
  silver: { body: '#9aa2ad', light: '#dfe4ea', dark: '#454b55', accent: '#2459c4' },
  green: { body: '#3c6b3a', light: '#79a56f', dark: '#16301a', accent: '#f2e3b0' },
  tan: { body: '#b39a6c', light: '#e3cda0', dark: '#54452c', accent: '#7a1a14' },
};
export const GHOST_PAINTS: PaintKey[] = ['white', 'black', 'silver', 'orange', 'green', 'tan'];

/** 0 off, 1 tail lights on, 2 braking. */
export type Lights = 0 | 1 | 2;

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const glowSprites = new Map<string, HTMLCanvasElement>();
/** A radial falloff in one colour, drawn once; glows are this sprite stamped at a size and opacity. */
function glowSprite(rgb: string): HTMLCanvasElement {
  let c = glowSprites.get(rgb);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},1)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowSprites.set(rgb, c);
  }
  return c;
}

/** Soft additive light. */
export function glow(ctx: Ctx, x: number, y: number, r: number, rgb: string, a: number) {
  if (r <= 0.5 || a <= 0.004) return;
  const op = ctx.globalCompositeOperation;
  const al = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, a) * al;
  ctx.drawImage(glowSprite(rgb), x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = op;
  ctx.globalAlpha = al;
}

/* ── Texture catalogue ───────────────────────────────────────────────── */

export type TexKey =
  | 'tyre' | 'spare' | 'bumper' | 'tailgate' | 'nose' | 'sideL' | 'sideR' | 'under' | 'bed' | 'hood' | 'cabRear'
  | 'cabSideL' | 'cabSideR' | 'roof' | 'windshield' | 'lightbar' | 'mirror'
  | 'suvTail' | 'suvHatch' | 'suvGlassL' | 'suvGlassR' | 'suvSideL' | 'suvSideR' | 'suvRoof';

/** Face sizes in metres (width × height of the texture as it sits on the face). */
export const TEX_SIZE: Record<TexKey, [number, number]> = {
  tyre: [0.92, 0.92],
  spare: [0.76, 0.76],
  bumper: [2.1, 0.24],
  tailgate: [2.0, 0.64],
  nose: [2.0, 0.64],
  sideL: [5.42, 0.64],
  sideR: [5.42, 0.64],
  under: [2.0, 5.42],
  bed: [2.0, 2.58],
  hood: [2.0, 0.94],
  cabRear: [1.88, 0.78],
  cabSideL: [1.94, 0.78],
  cabSideR: [1.94, 0.78],
  roof: [1.88, 1.34],
  windshield: [1.88, 0.98],
  lightbar: [1.6, 0.13],
  mirror: [0.23, 0.28],
  suvTail: [2.0, 0.63],
  suvHatch: [1.92, 0.83],
  suvGlassL: [3.78, 0.83],
  suvGlassR: [3.78, 0.83],
  suvSideL: [4.54, 0.63],
  suvSideR: [4.54, 0.63],
  suvRoof: [1.92, 3.21],
};

const UNPAINTED = new Set<TexKey>(['tyre', 'bumper', 'lightbar', 'mirror', 'windshield']);
const LIT = new Set<TexKey>(['tailgate', 'nose', 'cabRear', 'suvTail', 'suvHatch']);

/** Cache id of a texture: paint and lights only where they change it. */
export function texId(key: TexKey, paint: PaintKey, lights: Lights): string {
  return `${key}${UNPAINTED.has(key) ? '' : ':' + paint}${LIT.has(key) ? ':' + lights : ''}`;
}

/** Draws one texture at `D` px per metre. */
export function drawTex(key: TexKey, paintKey: PaintKey, lights: Lights, D: number): HTMLCanvasElement {
  const [wm, hm] = TEX_SIZE[key];
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(wm * D));
  c.height = Math.max(2, Math.round(hm * D));
  const ctx = c.getContext('2d')!;
  const p = PAINTS[paintKey];
  const W = c.width;
  const H = c.height;
  const k = W / wm; // px per metre, exactly
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  switch (key) {
    case 'tyre': tyre(ctx, W, false, p); break;
    case 'spare': tyre(ctx, W, true, p); break;
    case 'bumper': bumper(ctx, W, H, k); break;
    case 'tailgate': tailgate(ctx, W, H, k, p, lights); break;
    case 'nose': nose(ctx, W, H, k, p, lights); break;
    case 'sideL': case 'sideR': pickupSide(ctx, W, H, k, p, key === 'sideL'); break;
    case 'under': under(ctx, W, H, k, p); break;
    case 'bed': bed(ctx, W, H, k, p); break;
    case 'hood': hood(ctx, W, H, k, p); break;
    case 'cabRear': cabRear(ctx, W, H, k, p, lights); break;
    case 'cabSideL': case 'cabSideR': glassSide(ctx, W, H, k, p, key === 'cabSideL', 2.72, 4.66, 1.98, 1.2, 4.06, [[2.84, 3.6], [3.7, 4.5]]); break;
    case 'roof': roof(ctx, W, H, k, p, false); break;
    case 'windshield': windshield(ctx, W, H, k); break;
    case 'lightbar': lightbar(ctx, W, H); break;
    case 'mirror': mirrorFace(ctx, W, H); break;
    case 'suvTail': suvTail(ctx, W, H, k, p, lights); break;
    case 'suvHatch': suvHatch(ctx, W, H, k, p, lights); break;
    case 'suvGlassL': case 'suvGlassR': glassSide(ctx, W, H, k, p, key === 'suvGlassL', 0.14, 3.92, 1.98, 1.15, 3.35, [[0.36, 1.22], [1.32, 2.36], [2.46, 3.4]]); break;
    case 'suvSideL': case 'suvSideR': suvSide(ctx, W, H, k, p, key === 'suvSideL'); break;
    case 'suvRoof': roof(ctx, W, H, k, p, true); break;
  }
  return c;
}

/* ── Shared bits ─────────────────────────────────────────────────────── */

/** Clear-coat paint: lit from the sky above, darker low down, with a soft reflection band. */
function paintPanel(ctx: Ctx, W: number, H: number, p: Paint, band = 0.16) {
  ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, p.light], [band, p.body], [0.7, p.body], [1, p.dark]]);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, 'rgba(255,255,255,0)'], [band * 0.6, 'rgba(255,255,255,0.16)'], [band * 1.4, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fillRect(0, 0, W, H);
}

/** Mud flicked up the lower body. */
function mud(ctx: Ctx, x0: number, x1: number, y0: number, y1: number, k: number, seed: number, n = 90) {
  const r = seeded(seed);
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0);
    const t = Math.pow(r(), 1.8);
    const y = y0 - t * (y0 - y1);
    ctx.fillStyle = `rgba(${70 + r() * 30},${52 + r() * 20},${30 + r() * 14},${0.25 + 0.5 * (1 - t)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, k * (0.008 + r() * 0.03) * (1 - t * 0.6), k * (0.006 + r() * 0.018), r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = lin(ctx, 0, y0, 0, y0 - (y0 - y1) * 0.5, [[0, 'rgba(60,44,26,0.5)'], [1, 'rgba(60,44,26,0)']]);
  ctx.fillRect(x0, y0 - (y0 - y1) * 0.5, x1 - x0, (y0 - y1) * 0.5);
}

/** Raindrops beaded on the paint. */
function beads(ctx: Ctx, W: number, H: number, k: number, seed: number, n = 50) {
  const r = seeded(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * W;
    const y = r() * H;
    const s = k * (0.004 + r() * 0.007);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(x, y + s * 0.5, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(235,245,255,0.35)';
    ctx.beginPath();
    ctx.arc(x - s * 0.3, y - s * 0.3, s * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

function seam(ctx: Ctx, x: number, y0: number, y1: number, k: number) {
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(1, k * 0.008);
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(x + Math.max(1, k * 0.008), y0);
  ctx.lineTo(x + Math.max(1, k * 0.008), y1);
  ctx.stroke();
}

function tailLight(ctx: Ctx, x: number, y: number, w: number, h: number, lights: Lights, k: number) {
  ctx.fillStyle = '#0d0d10';
  rr(ctx, x - k * 0.012, y - k * 0.012, w + k * 0.024, h + k * 0.024, k * 0.03);
  ctx.fill();
  const on = lights > 0;
  const br = lights === 2;
  ctx.fillStyle = on
    ? lin(ctx, x, y, x + w, y, br ? [[0, '#ff6a6a'], [0.5, '#fff0f0'], [1, '#ff5050']] : [[0, '#d01c28'], [0.5, '#ff5a64'], [1, '#c01420']])
    : lin(ctx, x, y, x + w, y, [[0, '#4a0a10'], [0.5, '#7a1820'], [1, '#3e070c']]);
  rr(ctx, x, y + h * 0.22, w, h * 0.56, k * 0.02);
  ctx.fill();
  ctx.fillStyle = '#9a5a10';
  rr(ctx, x, y, w, h * 0.2, k * 0.02);
  ctx.fill();
  ctx.fillStyle = '#b9bec8';
  rr(ctx, x, y + h * 0.8, w, h * 0.2, k * 0.02);
  ctx.fill();
  ctx.strokeStyle = on ? 'rgba(255,220,220,0.5)' : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = Math.max(1, k * 0.008);
  for (let i = 1; i < 4; i++) {
    const yy = y + h * 0.22 + (h * 0.56 * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x + k * 0.012, yy);
    ctx.lineTo(x + w - k * 0.012, yy);
    ctx.stroke();
  }
}

/** Dark glass with whatever is behind it faintly visible and the stormy sky reflected in a diagonal streak. */
function glass(ctx: Ctx, path: () => void, x: number, y: number, w: number, h: number, headrests: number[] = []) {
  ctx.save();
  path();
  ctx.clip();
  ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [[0, '#4a5a62'], [0.3, '#18222a'], [1, '#07090c']]);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  for (const hx of headrests) {
    rr(ctx, hx - w * 0.06, y + h * 0.38, w * 0.12, h * 0.5, w * 0.04);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(220,235,240,0.15)';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.1, y + h);
  ctx.lineTo(x + w * 0.35, y);
  ctx.lineTo(x + w * 0.52, y);
  ctx.lineTo(x + w * 0.27, y + h);
  ctx.fill();
  ctx.fillStyle = 'rgba(220,235,240,0.07)';
  ctx.fillRect(x, y, w, h * 0.18);
  ctx.restore();
}

/* ── Tyres, bumper, light bar, mirror ────────────────────────────────── */

/** A chunky all-terrain tyre seen side on, filling the square; `spare` puts a cover over it. */
function tyre(ctx: Ctx, W: number, spare: boolean, p: Paint) {
  const c = W / 2;
  const R = W / 2;
  ctx.fillStyle = '#0c0c0e';
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.fill();
  // tread lugs round the rim
  ctx.fillStyle = '#1e1f23';
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    ctx.save();
    ctx.translate(c + Math.cos(a) * R * 0.9, c + Math.sin(a) * R * 0.9);
    ctx.rotate(a);
    ctx.fillRect(-R * 0.08, -R * 0.07, R * 0.16, R * 0.14);
    ctx.restore();
  }
  const side = ctx.createRadialGradient(c, c, R * 0.55, c, c, R * 0.84);
  side.addColorStop(0, '#26272b');
  side.addColorStop(1, '#101012');
  ctx.fillStyle = side;
  ctx.beginPath();
  ctx.arc(c, c, R * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = Math.max(1, R * 0.02);
  ctx.beginPath();
  ctx.arc(c, c, R * 0.7, -2.4, -0.7);
  ctx.stroke();
  if (spare) {
    ctx.fillStyle = lin(ctx, 0, c - R * 0.62, 0, c + R * 0.62, [[0, '#2c2f35'], [1, '#101114']]);
    ctx.beginPath();
    ctx.arc(c, c, R * 0.64, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = R * 0.05;
    ctx.beginPath();
    ctx.arc(c, c, R * 0.58, 0, Math.PI * 2);
    ctx.stroke();
    // a little tornado on the cover
    ctx.strokeStyle = '#e9ecf0';
    ctx.lineCap = 'round';
    ctx.lineWidth = R * 0.06;
    for (let i = 0; i < 4; i++) {
      const y = c - R * 0.3 + i * R * 0.17;
      const w = R * (0.34 - i * 0.07);
      ctx.beginPath();
      ctx.moveTo(c - w + i * R * 0.03, y);
      ctx.lineTo(c + w + i * R * 0.03, y);
      ctx.stroke();
    }
    return;
  }
  // beadlock rim with bolts, spokes and a hub
  const rim = ctx.createRadialGradient(c - R * 0.15, c - R * 0.2, R * 0.05, c, c, R * 0.58);
  rim.addColorStop(0, '#a8aeb6');
  rim.addColorStop(1, '#41464d');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(c, c, R * 0.56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e2024';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * R * 0.5, c + Math.sin(a) * R * 0.5, R * 0.025, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#16181b';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    ctx.save();
    ctx.translate(c + Math.cos(a) * R * 0.3, c + Math.sin(a) * R * 0.3);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.12, R * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#2b2e34';
  ctx.beginPath();
  ctx.arc(c, c, R * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8d939b';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * R * 0.09, c + Math.sin(a) * R * 0.09, R * 0.02, 0, Math.PI * 2);
    ctx.fill();
  }
  // caked mud on the lower half
  const r = seeded(91);
  for (let i = 0; i < 30; i++) {
    const a = Math.PI * (0.15 + r() * 0.7);
    const d = R * (0.6 + r() * 0.38);
    ctx.fillStyle = `rgba(${80 + r() * 30},${60 + r() * 20},${36 + r() * 14},${0.3 + r() * 0.4})`;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, R * (0.02 + r() * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }
}

function bumper(ctx: Ctx, W: number, H: number, k: number) {
  ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, '#6c7078'], [0.25, '#3a3d44'], [1, '#121317']]);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  for (const x of [0.32, 0.6]) {
    rr(ctx, W * x - k * 0.08, H * 0.12, k * 0.16, H * 0.3, k * 0.01);
    ctx.fill();
  }
  rr(ctx, W * 0.5 - k * 0.05, H * 0.35, k * 0.1, H * 0.5, k * 0.01);
  ctx.fillStyle = '#0b0b0d';
  ctx.fill();
  ctx.fillStyle = '#a2a8b0';
  ctx.beginPath();
  ctx.arc(W * 0.5, H * 0.55, k * 0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9b1218';
  for (const x of [0.03, 0.97]) ctx.fillRect(W * x - k * 0.03, H * 0.35, k * 0.06, H * 0.25);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(0, 0, W, Math.max(1, H * 0.06));
}

function lightbar(ctx: Ctx, W: number, H: number) {
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, W, H);
  const pods = 10;
  for (let i = 0; i < pods; i++) {
    const px = W * 0.02 + (i * W * 0.96) / pods;
    ctx.fillStyle = lin(ctx, 0, H * 0.15, 0, H * 0.85, [[0, '#ffd27a'], [0.5, '#e38c10'], [1, '#7a4100']]);
    rr(ctx, px + W * 0.006, H * 0.15, (W * 0.96) / pods - W * 0.012, H * 0.7, H * 0.15);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(W * 0.03, H * 0.18, W * 0.94, Math.max(1, H * 0.1));
}

function mirrorFace(ctx: Ctx, W: number, H: number) {
  ctx.fillStyle = lin(ctx, 0, 0, W, 0, [[0, '#2a2c33'], [0.5, '#16171b'], [1, '#2a2c33']]);
  rr(ctx, 0, 0, W, H, W * 0.18);
  ctx.fill();
  ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, 'rgba(180,200,215,0.55)'], [1, 'rgba(90,100,110,0.4)']]);
  rr(ctx, W * 0.12, H * 0.1, W * 0.76, H * 0.8, W * 0.12);
  ctx.fill();
}

/* ── Pickup ──────────────────────────────────────────────────────────── */

function tailgate(ctx: Ctx, W: number, H: number, k: number, p: Paint, lights: Lights) {
  paintPanel(ctx, W, H, p, 0.12);
  ctx.fillStyle = lin(ctx, 0, 0, W, 0, [[0, 'rgba(0,0,0,0.35)'], [0.1, 'rgba(0,0,0,0)'], [0.9, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.4)']]);
  ctx.fillRect(0, 0, W, H);
  // bed rail cap
  ctx.fillStyle = '#141519';
  ctx.fillRect(0, 0, W, k * 0.04);
  // crease
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, k * 0.014);
  ctx.beginPath();
  ctx.moveTo(W * 0.12, H * 0.62);
  ctx.lineTo(W * 0.88, H * 0.62);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(W * 0.12, H * 0.62 + k * 0.016);
  ctx.lineTo(W * 0.88, H * 0.62 + k * 0.016);
  ctx.stroke();
  // handle
  ctx.fillStyle = '#0c0c0f';
  rr(ctx, W / 2 - k * 0.14, k * 0.07, k * 0.28, k * 0.07, k * 0.03);
  ctx.fill();
  // storm stripes
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, k * 0.04, W, H);
  ctx.clip();
  ctx.fillStyle = p.accent;
  ctx.globalAlpha = 0.9;
  for (const [x0, w] of [[0.06, 0.08], [0.2, 0.04]] as const) {
    ctx.beginPath();
    ctx.moveTo(k * x0, H);
    ctx.lineTo(k * (x0 + 0.26), 0);
    ctx.lineTo(k * (x0 + 0.26 + w), 0);
    ctx.lineTo(k * (x0 + w), H);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = p.accent === '#ffffff' || p.accent === '#ffd23a' ? '#ffffff' : p.accent;
  ctx.font = `900 ${k * 0.115}px Orbitron, 'Chakra Petch', sans-serif`;
  ctx.fillText('STORM  CHASER', W / 2 + k * 0.05, H * 0.36);
  ctx.font = `700 ${k * 0.058}px 'Chakra Petch', sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText('SEVERE WEATHER RESEARCH', W / 2 + k * 0.05, H * 0.53);
  // plate
  ctx.fillStyle = '#e9e4cf';
  rr(ctx, W / 2 - k * 0.2, H * 0.68, k * 0.4, k * 0.17, k * 0.02);
  ctx.fill();
  ctx.fillStyle = '#1e3b78';
  ctx.font = `700 ${k * 0.1}px 'JetBrains Mono', monospace`;
  ctx.fillText('EF5·07', W / 2, H * 0.68 + k * 0.088);
  mud(ctx, 0, W, H, H * 0.35, k, 7);
  tailLight(ctx, k * 0.025, H * 0.07, k * 0.13, H * 0.82, lights, k);
  tailLight(ctx, W - k * 0.155, H * 0.07, k * 0.13, H * 0.82, lights, k);
  beads(ctx, W, H, k, 3);
}

function nose(ctx: Ctx, W: number, H: number, k: number, p: Paint, lights: Lights) {
  paintPanel(ctx, W, H, p, 0.12);
  // grille
  ctx.fillStyle = '#0d0e11';
  rr(ctx, W * 0.24, H * 0.12, W * 0.52, H * 0.56, k * 0.04);
  ctx.fill();
  ctx.fillStyle = '#2a2d33';
  for (let i = 1; i < 6; i++) ctx.fillRect(W * 0.25, H * 0.12 + (H * 0.56 * i) / 6, W * 0.5, Math.max(1, k * 0.014));
  ctx.fillStyle = '#c9ccd2';
  ctx.font = `900 ${k * 0.07}px Orbitron, sans-serif`;
  ctx.fillText('SC', W / 2, H * 0.4);
  // headlights
  for (const x of [0.04, 0.78]) {
    ctx.fillStyle = '#121317';
    rr(ctx, W * x, H * 0.16, W * 0.18, H * 0.3, k * 0.03);
    ctx.fill();
    ctx.fillStyle = lights > 0 ? lin(ctx, 0, H * 0.18, 0, H * 0.44, [[0, '#ffffff'], [1, '#fff2c0']]) : lin(ctx, 0, H * 0.18, 0, H * 0.44, [[0, '#c9d2da'], [1, '#6e7880']]);
    rr(ctx, W * x + k * 0.02, H * 0.19, W * 0.18 - k * 0.04, H * 0.24, k * 0.025);
    ctx.fill();
    ctx.fillStyle = '#ff9a1a';
    ctx.fillRect(W * x + k * 0.02, H * 0.5, W * 0.18 - k * 0.04, H * 0.06);
  }
  mud(ctx, 0, W, H, H * 0.55, k, 17, 50);
}

/** A pickup flank: bed side, crew-cab doors, front fender, arches cut out for the wheels. */
function pickupSide(ctx: Ctx, W: number, H: number, k: number, p: Paint, frontRight: boolean) {
  const z0 = 0.14;
  const z1 = 5.56;
  const X = (z: number) => (frontRight ? (z - z0) * k : (z1 - z) * k);
  const Y = (y: number) => (1.2 - y) * k;
  paintPanel(ctx, W, H, p, 0.2);
  // shoulder line
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, H * 0.2, W, Math.max(1, k * 0.012));
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, H * 0.2 + k * 0.012, W, Math.max(1, k * 0.01));
  // accent stripe with a lightning break
  ctx.fillStyle = p.accent;
  ctx.globalAlpha = 0.9;
  const ys = H * 0.08;
  const yh = k * 0.035;
  const zb = 2.0;
  ctx.fillRect(Math.min(X(z0), X(zb - 0.12)), ys, Math.abs(X(zb - 0.12) - X(z0)), yh);
  ctx.fillRect(Math.min(X(zb + 0.12), X(z1)), ys, Math.abs(X(z1) - X(zb + 0.12)), yh);
  ctx.beginPath();
  ctx.moveTo(X(zb - 0.12), ys);
  ctx.lineTo(X(zb + 0.05), ys);
  ctx.lineTo(X(zb - 0.04), ys + yh * 1.8);
  ctx.lineTo(X(zb + 0.12), ys + yh);
  ctx.lineTo(X(zb - 0.05), ys + yh);
  ctx.lineTo(X(zb + 0.04), ys - yh * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  // seams
  for (const z of [2.72, 3.66, 4.62]) seam(ctx, X(z), H * 0.02, H * 0.9, k);
  // handles, fuel door, markers
  ctx.fillStyle = '#16171b';
  for (const z of [3.5, 4.45]) {
    rr(ctx, X(z) - k * 0.09, Y(1.08), k * 0.18, k * 0.04, k * 0.015);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = Math.max(1, k * 0.008);
  rr(ctx, X(2.3) - k * 0.08, Y(1.08), k * 0.16, k * 0.13, k * 0.03);
  ctx.stroke();
  ctx.fillStyle = '#a3141c';
  ctx.fillRect(X(0.3) - k * 0.05, Y(1.06), k * 0.1, k * 0.04);
  ctx.fillStyle = '#e88a12';
  ctx.fillRect(X(5.42) - k * 0.05, Y(1.06), k * 0.1, k * 0.04);
  // lettering on the doors
  ctx.fillStyle = p.accent === '#ffffff' || p.accent === '#ffd23a' ? '#ffffff' : p.accent;
  ctx.font = `900 ${k * 0.1}px Orbitron, 'Chakra Petch', sans-serif`;
  ctx.fillText('STORM CHASER', X(3.66), Y(0.86));
  ctx.font = `700 ${k * 0.045}px 'Chakra Petch', sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('TORNADO INTERCEPT UNIT 07', X(3.66), Y(0.76));
  // side step
  ctx.fillStyle = lin(ctx, 0, Y(0.66), 0, Y(0.57), [[0, '#3c3f46'], [1, '#121317']]);
  rr(ctx, Math.min(X(1.7), X(3.9)), Y(0.66), Math.abs(X(3.9) - X(1.7)), k * 0.09, k * 0.04);
  ctx.fill();
  mud(ctx, 0, W, H, H * 0.25, k, frontRight ? 23 : 29, 160);
  // arches: black flares, then cut out for the wheels
  for (const az of [1.05, 4.5]) {
    const cx = X(az);
    const cy = Y(0.46);
    ctx.strokeStyle = '#141519';
    ctx.lineWidth = k * 0.1;
    ctx.beginPath();
    ctx.arc(cx, cy, k * 0.58, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, k * 0.01);
    ctx.beginPath();
    ctx.arc(cx, cy, k * 0.63, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, k * 0.535, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  beads(ctx, W, H, k, frontRight ? 5 : 9, 120);
}

function under(ctx: Ctx, W: number, H: number, k: number, p: Paint) {
  const Y = (z: number) => (5.56 - z) * k;
  ctx.fillStyle = p.dark;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#17181c';
  rr(ctx, k * 0.08, k * 0.06, W - k * 0.16, H - k * 0.12, k * 0.1);
  ctx.fill();
  ctx.fillStyle = '#2c2e34';
  for (const x of [0.28, 0.66]) ctx.fillRect(W * x, k * 0.1, k * 0.12, H - k * 0.2);
  for (const z of [0.6, 2.0, 3.2]) ctx.fillRect(W * 0.28, Y(z), W * 0.44, k * 0.08);
  ctx.fillStyle = '#3a3d44';
  for (const z of [1.05, 4.5]) {
    ctx.fillRect(k * 0.15, Y(z) - k * 0.05, W - k * 0.3, k * 0.1);
    ctx.beginPath();
    ctx.arc(W / 2, Y(z), k * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#4a4d55';
  ctx.fillRect(W / 2 - k * 0.03, Y(4.4), k * 0.06, Y(1.1) - Y(4.4));
  ctx.fillStyle = '#6b6258';
  ctx.fillRect(W * 0.62, Y(4.0), k * 0.06, Y(0.3) - Y(4.0));
  rr(ctx, W * 0.58, Y(3.0), k * 0.24, k * 0.44, k * 0.04);
  ctx.fill();
  ctx.fillStyle = '#26272b';
  rr(ctx, W * 0.2, Y(2.6), k * 0.32, k * 0.5, k * 0.06);
  ctx.fill();
  mud(ctx, 0, W, H, 0, k, 31, 140);
}

/** The open bed seen from above: ribbed liner, wheel wells, two tornado probes and a gear case strapped down. */
function bed(ctx: Ctx, W: number, H: number, k: number, p: Paint) {
  const Y = (z: number) => (2.72 - z) * k;
  ctx.fillStyle = lin(ctx, 0, 0, W, 0, [[0, p.dark], [0.5, p.body], [1, p.dark]]);
  ctx.fillRect(0, 0, W, H);
  const rim = k * 0.06;
  ctx.fillStyle = '#1c1d21';
  ctx.fillRect(rim, rim, W - rim * 2, H - rim * 2);
  ctx.fillStyle = '#2a2c31';
  for (let x = rim + k * 0.08; x < W - rim; x += k * 0.12) ctx.fillRect(x, rim, Math.max(1, k * 0.03), H - rim * 2);
  // inner walls: the bulkhead lit, the sides in shade
  ctx.fillStyle = lin(ctx, 0, rim, 0, rim + k * 0.16, [[0, '#4a4e57'], [1, 'rgba(28,29,33,0)']]);
  ctx.fillRect(rim, rim, W - rim * 2, k * 0.16);
  for (const [x, dir] of [[rim, 1], [W - rim, -1]] as const) {
    ctx.fillStyle = lin(ctx, x, 0, x + dir * k * 0.1, 0, [[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
    ctx.fillRect(Math.min(x, x + dir * k * 0.1), rim, k * 0.1, H - rim * 2);
  }
  // wheel wells
  ctx.fillStyle = '#26282d';
  for (const x of [rim, W - rim - k * 0.24]) {
    rr(ctx, x, Y(1.55), k * 0.24, Y(0.55) - Y(1.55), k * 0.08);
    ctx.fill();
  }
  // probes: orange barrels lying along the bed
  for (const x of [0.34, 0.58]) {
    const px = W * x;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    rr(ctx, px - k * 0.16, Y(2.5) + k * 0.04, k * 0.36, k * 0.86, k * 0.16);
    ctx.fill();
    ctx.fillStyle = lin(ctx, px - k * 0.17, 0, px + k * 0.17, 0, [[0, '#8a3a06'], [0.35, '#ffb04a'], [0.6, '#f07a12'], [1, '#6a2a02']]);
    rr(ctx, px - k * 0.17, Y(2.5), k * 0.34, k * 0.84, k * 0.16);
    ctx.fill();
    ctx.fillStyle = '#16171a';
    for (const t of [0.22, 0.74]) ctx.fillRect(px - k * 0.17, Y(2.5) + k * 0.84 * t, k * 0.34, k * 0.05);
    ctx.fillStyle = '#ffe680';
    ctx.fillRect(px - k * 0.2, Y(2.5) + k * 0.46, k * 0.4, k * 0.03);
  }
  // gear case and a coil of cable
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  rr(ctx, W * 0.66 + k * 0.03, Y(1.3) + k * 0.03, k * 0.5, k * 0.36, k * 0.03);
  ctx.fill();
  ctx.fillStyle = lin(ctx, 0, Y(1.3), 0, Y(0.94), [[0, '#e0cc80'], [1, '#9c8846']]);
  rr(ctx, W * 0.66, Y(1.3), k * 0.5, k * 0.36, k * 0.03);
  ctx.fill();
  ctx.fillStyle = '#2b2a26';
  for (const t of [0.2, 0.8]) ctx.fillRect(W * 0.66 + k * 0.5 * t - k * 0.02, Y(1.3) - k * 0.01, k * 0.04, k * 0.06);
  ctx.strokeStyle = '#111215';
  ctx.lineWidth = k * 0.025;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(W * 0.3, Y(0.6), k * (0.16 - i * 0.03), k * (0.12 - i * 0.02), 0.3, 0, Math.PI * 2);
    ctx.stroke();
  }
  // rail caps
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, 0, W, Math.max(1, k * 0.012));
  ctx.fillRect(0, 0, Math.max(1, k * 0.012), H);
  ctx.fillRect(W - Math.max(1, k * 0.012), 0, Math.max(1, k * 0.012), H);
  beads(ctx, W, H, k, 41, 60);
}

function hood(ctx: Ctx, W: number, H: number, k: number, p: Paint) {
  ctx.fillStyle = lin(ctx, 0, 0, W, 0, [[0, p.dark], [0.2, p.body], [0.5, p.light], [0.8, p.body], [1, p.dark]]);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = p.accent;
  ctx.globalAlpha = 0.85;
  for (const x of [-0.13, 0.07]) ctx.fillRect(W / 2 + k * x, 0, k * 0.06, H);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, W, k * 0.04);
  ctx.strokeStyle = '#0d0e10';
  ctx.lineWidth = k * 0.02;
  for (const x of [0.25, 0.62]) {
    ctx.beginPath();
    ctx.moveTo(W * x, H - k * 0.04);
    ctx.lineTo(W * x + k * 0.5, H - k * 0.1);
    ctx.stroke();
  }
  beads(ctx, W, H, k, 51, 40);
}

function cabRear(ctx: Ctx, W: number, H: number, k: number, p: Paint, lights: Lights) {
  paintPanel(ctx, W, H, p, 0.1);
  ctx.fillStyle = lin(ctx, 0, 0, W, 0, [[0, 'rgba(0,0,0,0.35)'], [0.12, 'rgba(0,0,0,0)'], [0.88, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.4)']]);
  ctx.fillRect(0, 0, W, H);
  const x = k * 0.12;
  const y = k * 0.1;
  const w = W - k * 0.24;
  const h = k * 0.52;
  glass(ctx, () => rr(ctx, x, y, w, h, k * 0.06), x, y, w, h, [x + w * 0.27, x + w * 0.73]);
  ctx.strokeStyle = '#0a0b0d';
  ctx.lineWidth = Math.max(1, k * 0.016);
  for (const t of [0.34, 0.66]) {
    ctx.beginPath();
    ctx.moveTo(x + w * t, y);
    ctx.lineTo(x + w * t, y + h);
    ctx.stroke();
  }
  ctx.fillStyle = lights === 2 ? '#ff5a5a' : lights === 1 ? '#a3141c' : '#3a0a0e';
  rr(ctx, W / 2 - k * 0.18, k * 0.02, k * 0.36, k * 0.05, k * 0.02);
  ctx.fill();
  beads(ctx, W, H, k, 61, 50);
}

/**
 * A flank with windows: the cab of the pickup or the SUV's cabin. The texture covers the face up to the bottom of
 * the windshield; everything ahead of the windshield's slope is cut away so the face takes the cab's real shape.
 */
function glassSide(
  ctx: Ctx, W: number, H: number, k: number, p: Paint, frontRight: boolean,
  z0: number, z1: number, yTop: number, yBot: number, zRoof: number, panes: [number, number][],
) {
  const X = (z: number) => (frontRight ? (z - z0) * k : (z1 - z) * k);
  const Y = (y: number) => (yTop - y) * k;
  paintPanel(ctx, W, H, p, 0.1);
  // the windshield slope, from the front of the roof down to the bottom front corner
  const slope = (y: number) => zRoof + ((yTop - y) / (yTop - yBot)) * (z1 - zRoof);
  const gTop = yTop - 0.07;
  const gBot = yBot + 0.07;
  // blacked-out pillars behind the glass
  ctx.fillStyle = '#0c0d10';
  ctx.beginPath();
  ctx.moveTo(X(panes[0][0] - 0.04), Y(gTop + 0.02));
  ctx.lineTo(X(slope(gTop) - 0.05), Y(gTop + 0.02));
  ctx.lineTo(X(slope(gBot) - 0.05), Y(gBot - 0.02));
  ctx.lineTo(X(panes[0][0] - 0.04), Y(gBot - 0.02));
  ctx.closePath();
  ctx.fill();
  panes.forEach(([a, b], i) => {
    const last = i === panes.length - 1;
    const pts: [number, number][] = [[a, gTop], [last ? slope(gTop) - 0.1 : b, gTop], [last ? slope(gBot) - 0.1 : b, gBot], [a, gBot]];
    const xs = pts.map(([z]) => X(z));
    glass(ctx, () => {
      ctx.beginPath();
      pts.forEach(([z, y], j) => (j ? ctx.lineTo(X(z), Y(y)) : ctx.moveTo(X(z), Y(y))));
      ctx.closePath();
    }, Math.min(...xs), Y(gTop), Math.max(...xs) - Math.min(...xs), Y(gBot) - Y(gTop), [(Math.min(...xs) + Math.max(...xs)) / 2]);
  });
  // drip rail
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, Math.max(1, k * 0.02));
  beads(ctx, W, H, k, frontRight ? 71 : 73, 50);
  // cut away ahead of the windshield
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(X(zRoof), 0);
  ctx.lineTo(X(z1 + 1), 0);
  ctx.lineTo(X(z1 + 1), H + 2);
  ctx.lineTo(X(z1), H + 2);
  ctx.lineTo(X(z1), H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roof(ctx: Ctx, W: number, H: number, k: number, p: Paint, basket: boolean) {
  ctx.fillStyle = lin(ctx, 0, 0, W, 0, [[0, p.dark], [0.18, p.body], [0.5, p.light], [0.82, p.body], [1, p.dark]]);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (const x of [k * 0.1, W - k * 0.15]) ctx.fillRect(x, k * 0.05, k * 0.05, H - k * 0.1);
  ctx.fillStyle = '#141519';
  for (const x of [k * 0.09, W - k * 0.16]) ctx.fillRect(x, k * 0.04, k * 0.05, H - k * 0.1);
  for (let y = k * 0.25; y < H - k * 0.1; y += k * 0.38) ctx.fillRect(k * 0.09, y, W - k * 0.2, k * 0.035);
  if (basket) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, W * 0.22 + k * 0.04, H * 0.4 + k * 0.04, W * 0.56, H * 0.32, k * 0.05);
    ctx.fill();
    ctx.fillStyle = lin(ctx, 0, H * 0.4, 0, H * 0.72, [[0, '#3e4148'], [1, '#1d1f24']]);
    rr(ctx, W * 0.22, H * 0.4, W * 0.56, H * 0.32, k * 0.05);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, k * 0.01);
    ctx.stroke();
  }
  beads(ctx, W, H, k, basket ? 81 : 83, 70);
}

function windshield(ctx: Ctx, W: number, H: number, k: number) {
  ctx.fillStyle = '#0c0d10';
  ctx.fillRect(0, 0, W, H);
  glass(ctx, () => rr(ctx, k * 0.06, k * 0.05, W - k * 0.12, H - k * 0.12, k * 0.05), k * 0.06, k * 0.05, W - k * 0.12, H - k * 0.12, [W * 0.3, W * 0.7]);
  ctx.strokeStyle = '#08090b';
  ctx.lineWidth = k * 0.018;
  for (const x of [0.2, 0.56]) {
    ctx.beginPath();
    ctx.moveTo(W * x, H - k * 0.08);
    ctx.lineTo(W * x + k * 0.5, H - k * 0.2);
    ctx.stroke();
  }
}

/* ── SUV ─────────────────────────────────────────────────────────────── */

function suvTail(ctx: Ctx, W: number, H: number, k: number, p: Paint, lights: Lights) {
  paintPanel(ctx, W, H, p, 0.12);
  ctx.fillStyle = lin(ctx, 0, 0, W, 0, [[0, 'rgba(0,0,0,0.4)'], [0.12, 'rgba(0,0,0,0)'], [0.88, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.45)']]);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(210,214,220,0.6)';
  ctx.fillRect(W * 0.2, H * 0.18, W * 0.6, Math.max(1, k * 0.015));
  ctx.fillStyle = '#e9e4cf';
  rr(ctx, W / 2 - k * 0.2, H * 0.6, k * 0.4, k * 0.16, k * 0.02);
  ctx.fill();
  ctx.fillStyle = '#5a2020';
  ctx.font = `700 ${k * 0.09}px 'JetBrains Mono', monospace`;
  ctx.fillText('WX·' + (p.body.charCodeAt(2) % 90 + 10), W / 2, H * 0.6 + k * 0.083);
  // dark lower cladding
  ctx.fillStyle = lin(ctx, 0, H * 0.82, 0, H, [[0, '#26282d'], [1, '#101114']]);
  ctx.fillRect(0, H * 0.82, W, H * 0.18);
  mud(ctx, 0, W, H, H * 0.3, k, 13);
  tailLight(ctx, k * 0.02, H * 0.06, k * 0.12, H * 0.5, lights, k);
  tailLight(ctx, W - k * 0.14, H * 0.06, k * 0.12, H * 0.5, lights, k);
  beads(ctx, W, H, k, 91, 50);
}

function suvHatch(ctx: Ctx, W: number, H: number, k: number, p: Paint, lights: Lights) {
  paintPanel(ctx, W, H, p, 0.08);
  const x = k * 0.16;
  const y = k * 0.12;
  const w = W - k * 0.32;
  const h = k * 0.56;
  glass(ctx, () => rr(ctx, x, y, w, h, k * 0.06), x, y, w, h, [x + w * 0.25, x + w * 0.75]);
  // roof spoiler with the third brake light
  ctx.fillStyle = '#121317';
  rr(ctx, k * 0.08, 0, W - k * 0.16, k * 0.08, k * 0.03);
  ctx.fill();
  ctx.fillStyle = lights === 2 ? '#ff5a5a' : lights === 1 ? '#a3141c' : '#3a0a0e';
  ctx.fillRect(W / 2 - k * 0.2, k * 0.025, k * 0.4, k * 0.035);
  // pillar lights
  for (const lx of [k * 0.02, W - k * 0.1]) {
    ctx.fillStyle = lights === 2 ? '#ff6a6a' : lights === 1 ? '#c01c26' : '#4a0a10';
    rr(ctx, lx, H * 0.3, k * 0.08, H * 0.62, k * 0.02);
    ctx.fill();
  }
  beads(ctx, W, H, k, 93, 40);
}

function suvSide(ctx: Ctx, W: number, H: number, k: number, p: Paint, frontRight: boolean) {
  const z0 = 0.12;
  const z1 = 4.66;
  const X = (z: number) => (frontRight ? (z - z0) * k : (z1 - z) * k);
  const Y = (y: number) => (1.15 - y) * k;
  paintPanel(ctx, W, H, p, 0.2);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(0, H * 0.22, W, Math.max(1, k * 0.012));
  for (const z of [1.3, 2.45, 3.5]) seam(ctx, X(z), H * 0.02, H * 0.85, k);
  ctx.fillStyle = '#16171b';
  for (const z of [2.25, 3.3]) {
    rr(ctx, X(z) - k * 0.08, Y(1.03), k * 0.16, k * 0.04, k * 0.015);
    ctx.fill();
  }
  ctx.fillStyle = p.accent;
  ctx.globalAlpha = 0.75;
  ctx.fillRect(0, Y(0.92), W, k * 0.03);
  ctx.globalAlpha = 1;
  ctx.fillStyle = lin(ctx, 0, Y(0.72), 0, Y(0.52), [[0, '#2a2c31'], [1, '#111215']]);
  ctx.fillRect(0, Y(0.72), W, Y(0.52) - Y(0.72));
  mud(ctx, 0, W, H, H * 0.3, k, frontRight ? 33 : 37, 130);
  for (const az of [0.95, 3.85]) {
    const cx = X(az);
    const cy = Y(0.44);
    ctx.strokeStyle = '#141519';
    ctx.lineWidth = k * 0.08;
    ctx.beginPath();
    ctx.arc(cx, cy, k * 0.56, Math.PI, 0);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, k * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  beads(ctx, W, H, k, frontRight ? 95 : 97, 90);
}
