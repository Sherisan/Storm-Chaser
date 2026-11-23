/*
 * Screen-space particles: road spray off the tyres, dust whipped off the fields, debris flying in the inflow (planks,
 * shingles, branches, sheet metal), glass from the truck when it goes, and leaves. Soft puffs are pre-rendered sprites
 * (also used by the tornado for its debris cloud and the storm base), so hundreds stay cheap.
 */

import type { Ctx } from './truckArt';

export type ParticleKind = 'puff' | 'debris' | 'glass' | 'leaf';
type Tone = 'mist' | 'dust' | 'dark';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  /** air drag per frame at 60 fps (0..1, 1 = none) */
  drag: number;
  size: number;
  grow: number;
  age: number;
  life: number;
  rot: number;
  vr: number;
  tone: Tone;
  alpha: number;
  color: string;
  /** debris shape: 0 plank, 1 shingle, 2 branch, 3 sheet metal */
  shape: number;
  seed: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/* ── Sprites ─────────────────────────────────────────────────────────── */

/** A cauliflower of soft blobs. `light` > 0 lights it from above, < 0 from below. */
function puffSprite(rgb: [number, number, number], seed: number, light = 1, lumps = 14): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < lumps; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 26;
    const x = 64 + Math.cos(a) * d;
    const y = 64 + Math.sin(a) * d * 0.8;
    const rad = 18 + r() * 24;
    const lit = 1 + (light * (64 - y)) / 140;
    const gr = g.createRadialGradient(x - rad * 0.2, y - rad * 0.3 * light, rad * 0.1, x, y, rad);
    const [cr, cg, cb] = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * lit))));
    gr.addColorStop(0, `rgba(${cr},${cg},${cb},0.36)`);
    gr.addColorStop(0.6, `rgba(${cr},${cg},${cb},0.17)`);
    gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'destination-in';
  const mask = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mask;
  g.fillRect(0, 0, 128, 128);
  return c;
}

export interface PuffSet {
  mist: HTMLCanvasElement[];
  dust: HTMLCanvasElement[];
  dark: HTMLCanvasElement[];
  /** Storm base: dark, lit faintly from below by the bright slot. */
  cloud: HTMLCanvasElement[];
  /** The funnel's condensation: grey. */
  funnel: HTMLCanvasElement[];
}

let sprites: PuffSet | null = null;
export function puffs(): PuffSet {
  sprites ??= {
    mist: [1, 2, 3].map((s) => puffSprite([214, 220, 222], s * 977)),
    dust: [1, 2, 3, 4].map((s) => puffSprite([128, 106, 80], s * 1931)),
    dark: [1, 2, 3].map((s) => puffSprite([46, 42, 38], s * 733)),
    cloud: [1, 2, 3, 4].map((s) => puffSprite([58, 66, 66], s * 3571, -1.2, 18)),
    funnel: [1, 2, 3].map((s) => puffSprite([62, 68, 68], s * 2711, 0.6)),
  };
  return sprites;
}

const WOOD = ['#6b5236', '#7d6343', '#5a4430', '#8a7150'];
const SHINGLE = ['#3a3836', '#4b4744', '#2a2928'];
const METAL = ['#9aa1a8', '#7d848b', '#b9bec3'];

/* ── System ──────────────────────────────────────────────────────────── */

export class Particles {
  readonly items: Particle[] = [];
  constructor(private readonly cap = 900) {}

  private push(p: Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y'>) {
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push({
      vx: 0, vy: 0, gravity: 0, drag: 1, size: 4, grow: 0, age: 0, life: 1, rot: rnd(0, 6.28), vr: 0,
      tone: 'mist', alpha: 1, color: '#888', shape: 0, seed: Math.floor(Math.random() * 1000), ...p,
    });
  }

  clear() {
    this.items.length = 0;
  }

  /** Spray thrown up off wet tyres, drifting with the wind. */
  mist(x: number, y: number, scale: number, n: number, drift: number, alpha = 0.18) {
    for (let i = 0; i < n; i++) {
      this.push({
        kind: 'puff', tone: 'mist', x: x + rnd(-8, 8) * scale, y: y + rnd(-3, 3) * scale,
        vx: drift * scale + rnd(-50, 50) * scale, vy: rnd(-60, 10) * scale, gravity: -10 * scale, drag: 0.95,
        size: rnd(8, 15) * scale, grow: rnd(40, 70) * scale, life: rnd(0.9, 1.6), vr: rnd(-0.5, 0.5), alpha: rnd(alpha * 0.6, alpha),
      });
    }
  }

  /** Dust whipped up off the ground. */
  dust(x: number, y: number, scale: number, n: number, vx: number, vy = -40, alpha = 0.35, dark = false) {
    for (let i = 0; i < n; i++) {
      this.push({
        kind: 'puff', tone: dark ? 'dark' : 'dust', x: x + rnd(-20, 20) * scale, y: y + rnd(-6, 6) * scale,
        vx: vx * scale * rnd(0.7, 1.3), vy: vy * scale * rnd(0.5, 1.5), gravity: -14 * scale, drag: 0.985,
        size: rnd(14, 28) * scale, grow: rnd(30, 70) * scale, life: rnd(1.2, 2.4), vr: rnd(-0.8, 0.8), alpha: rnd(alpha * 0.6, alpha),
      });
    }
  }

  /** Bits of farm flying in the wind: planks, shingles, branches, sheet metal. */
  debris(x: number, y: number, scale: number, n: number, vx: number, vy: number, spread = 0.5, panel?: string) {
    for (let i = 0; i < n; i++) {
      // `panel`: body panels in that paint (sheet metal only)
      const shape = panel ? 3 : Math.floor(Math.random() * 4);
      const pal = panel ? [panel] : shape === 0 || shape === 2 ? WOOD : shape === 1 ? SHINGLE : METAL;
      this.push({
        kind: 'debris', shape, x, y, vx: vx * scale * rnd(1 - spread, 1 + spread), vy: vy * scale * rnd(1 - spread, 1 + spread),
        gravity: rnd(-40, 120) * scale, drag: 0.992, size: rnd(5, 14) * scale * (shape === 0 ? 1.4 : 1), life: rnd(1.4, 3),
        vr: rnd(-14, 14), color: pal[Math.floor(Math.random() * pal.length)],
      });
    }
  }

  /** Window glass bursting out: glinting chips. */
  glass(x: number, y: number, scale: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(80, 420) * scale;
      this.push({
        kind: 'glass', x, y, vx: Math.cos(a) * sp - 120 * scale, vy: Math.sin(a) * sp - 100 * scale, gravity: 300 * scale, drag: 0.97,
        size: rnd(1.5, 4) * scale, life: rnd(0.8, 1.6), vr: rnd(-20, 20),
      });
    }
  }

  /** Leaves and straw fluttering across. */
  leaves(x: number, y: number, scale: number, n: number, vx: number) {
    for (let i = 0; i < n; i++) {
      this.push({
        kind: 'leaf', x, y, vx: vx * scale * rnd(0.6, 1.3), vy: rnd(-90, 40) * scale, gravity: 20 * scale, drag: 0.99,
        size: rnd(2.5, 6) * scale, life: rnd(1.6, 3.2), vr: rnd(-9, 9),
        color: ['#7a8a3c', '#a58a3a', '#c9b06a', '#5d6e30'][Math.floor(Math.random() * 4)],
      });
    }
  }

  step(dt: number, time: number) {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const p = items[i];
      p.age += dt;
      if (p.age >= p.life) {
        items[i] = items[items.length - 1];
        items.pop();
        continue;
      }
      const drag = Math.pow(p.drag, dt * 60);
      p.vx *= drag;
      p.vy *= drag;
      p.vy += p.gravity * dt;
      if (p.kind === 'leaf') p.vy += Math.sin(time * 6 + p.seed) * 140 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size = Math.max(0.5, p.size + p.grow * dt);
      p.rot += p.vr * dt;
    }
  }

  draw(ctx: Ctx) {
    const S = puffs();
    ctx.save();
    for (const p of this.items) {
      if (p.kind !== 'puff') continue;
      const k = p.age / p.life;
      const a = p.alpha * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      const set = p.tone === 'dust' ? S.dust : p.tone === 'dark' ? S.dark : S.mist;
      ctx.globalAlpha = Math.max(0, a);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.tone === 'mist') ctx.scale(1.7, 0.55);
      else ctx.rotate(p.rot);
      ctx.drawImage(set[p.seed % set.length], -p.size, -p.size, p.size * 2, p.size * 2);
      ctx.restore();
    }
    for (const p of this.items) {
      if (p.kind === 'puff') continue;
      const k = p.age / p.life;
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const s = p.size;
      if (p.kind === 'debris') {
        // tumbling: foreshorten as it turns
        ctx.scale(1, 0.25 + 0.75 * Math.abs(Math.cos(p.rot * 0.7 + p.seed)));
        ctx.fillStyle = p.color;
        if (p.shape === 0) ctx.fillRect(-s, -s * 0.16, s * 2, s * 0.32);
        else if (p.shape === 1) ctx.fillRect(-s * 0.5, -s * 0.35, s, s * 0.7);
        else if (p.shape === 2) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, s * 0.15);
          ctx.beginPath();
          ctx.moveTo(-s, 0);
          ctx.lineTo(s, 0);
          ctx.moveTo(-s * 0.2, 0);
          ctx.lineTo(s * 0.3, -s * 0.5);
          ctx.moveTo(s * 0.3, 0);
          ctx.lineTo(s * 0.7, s * 0.4);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(-s, -s * 0.4);
          ctx.lineTo(s * 0.8, -s * 0.6);
          ctx.lineTo(s, s * 0.5);
          ctx.lineTo(-s * 0.7, s * 0.4);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(-s * 0.6, -s * 0.3, s * 1.2, s * 0.12);
        }
      } else if (p.kind === 'glass') {
        const glint = 0.5 + 0.5 * Math.sin(p.rot * 3);
        ctx.fillStyle = `rgba(${200 + glint * 55},${225 + glint * 30},255,${0.5 + glint * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.7, 0);
        ctx.lineTo(0, s * 0.6);
        ctx.lineTo(-s * 0.5, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.scale(1, 0.3 + 0.7 * Math.abs(Math.sin(p.rot)));
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
