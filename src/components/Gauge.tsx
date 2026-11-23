import { useEffect, useMemo, useRef } from 'react';
import { frameBus, type Frame } from '../game/frameBus';
import { BARO_MAX, BARO_MIN, EF_WIND, MAX_WIND } from '../game/storm';

const SWEEP = 270;
const START = -135;
const CX = 100;
const CY = 108;
const R = 84;

const polar = (a: number, r: number) => {
  const rad = ((a - 90) * Math.PI) / 180;
  return [CX + Math.cos(rad) * r, CY + Math.sin(rad) * r] as const;
};

function arcPath(r: number, a0: number, a1: number) {
  const [x0, y0] = polar(a0, r);
  const [x1, y1] = polar(a1, r);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export type GaugeKind = 'wind' | 'baro';

interface Spec {
  min: number;
  max: number;
  major: number;
  minor: number;
  label: (v: number) => string;
  unit: string;
  sub: string;
  /** Coloured bands round the rim. */
  bands: [number, number, string][];
  value: (f: Frame) => number;
  readout: (f: Frame) => string;
  hot: (f: Frame) => boolean;
}

const EF_COLORS = ['#7fd17a', '#d8e35a', '#ffc53a', '#ff8a2a', '#ff3b3b', '#d93cff'];

export function formatRange(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.max(0, Math.round(m / 5) * 5)} m`;
}

const SPECS: Record<GaugeKind, Spec> = {
  wind: {
    min: 0, max: MAX_WIND, major: 50, minor: 25, label: (v) => String(v), unit: 'WIND KM/H', sub: '',
    bands: EF_WIND.map((w, i) => [w, EF_WIND[i + 1] ?? MAX_WIND, EF_COLORS[i]]),
    value: (f) => f.storm.wind,
    readout: (f) => String(Math.round(Math.min(f.storm.wind, 999))),
    hot: (f) => f.storm.ef >= 4,
  },
  baro: {
    min: BARO_MIN, max: BARO_MAX, major: 20, minor: 10, label: (v) => String(v / 10), unit: 'hPa ×10', sub: 'RANGE TO FUNNEL',
    bands: [[BARO_MIN, 920, '#ff3b3b'], [920, 960, '#ffc53a']],
    value: (f) => f.storm.pressure,
    readout: (f) => formatRange(f.storm.range),
    hot: (f) => f.storm.pressure < 930,
  },
};

/**
 * One instrument: the anemometer (with the EF scale round the rim) or the barometer (with the range to the funnel
 * under it). The needle and the readouts update straight from the frame bus, not through React.
 */
export function Gauge({ kind }: { kind: GaugeKind }) {
  const spec = SPECS[kind];
  const angleOf = (v: number) => START + SWEEP * Math.max(-0.02, Math.min(1.06, (v - spec.min) / (spec.max - spec.min)));
  const needle = useRef<SVGGElement>(null);
  const readout = useRef<SVGTextElement>(null);
  const ef = useRef<SVGTextElement>(null);
  const face = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let lastClass = '';
    let lastEf = '';
    let shown = spec.value({ storm: { wind: 0, pressure: BARO_MAX } } as Frame);
    return frameBus.subscribe((f) => {
      // a little needle lag, like a real dial
      shown += (spec.value(f) - shown) * 0.25;
      if (needle.current) needle.current.setAttribute('transform', `rotate(${angleOf(shown).toFixed(2)} ${CX} ${CY})`);
      if (readout.current) {
        const t = spec.readout(f);
        if (readout.current.textContent !== t) readout.current.textContent = t;
      }
      if (ef.current && kind === 'wind') {
        const t = f.storm.ef >= 0 ? `EF${f.storm.ef}` : f.phase === 'FLYING' ? 'GUSTS' : 'CALM';
        if (t !== lastEf) {
          ef.current.textContent = t;
          ef.current.style.fill = f.storm.ef >= 0 ? EF_COLORS[f.storm.ef] : '';
          lastEf = t;
        }
      }
      const p = f.storm.phase;
      const cls = p === 'surge' ? 'surge' : p === 'lifted' ? 'dead' : spec.hot(f) ? 'hot' : '';
      if (cls !== lastClass && face.current) {
        face.current.classList.remove('surge', 'dead', 'hot');
        if (cls) face.current.classList.add(cls);
        lastClass = cls;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const ticks = useMemo(() => {
    const out: { a: number; major: boolean; label?: string }[] = [];
    for (let v = spec.min; v <= spec.max; v += spec.minor) {
      const major = (v - spec.min) % spec.major === 0;
      out.push({ a: angleOf(v), major, label: major ? spec.label(v) : undefined });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  return (
    <svg ref={face} className={`gauge gauge-${kind}`} viewBox="0 0 200 200" aria-hidden>
      <defs>
        <radialGradient id={`face-${kind}`} cx="50%" cy="52%" r="60%">
          <stop offset="0%" stopColor="#1a2224" />
          <stop offset="75%" stopColor="#0d1214" />
          <stop offset="100%" stopColor="#060809" />
        </radialGradient>
        <linearGradient id={`bezel-${kind}`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#e4e8e2" />
          <stop offset="22%" stopColor="#7c847f" />
          <stop offset="50%" stopColor="#2a302e" />
          <stop offset="78%" stopColor="#8a918b" />
          <stop offset="100%" stopColor="#1b201f" />
        </linearGradient>
        <radialGradient id={`glass-${kind}`} cx="35%" cy="20%" r="70%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0.03)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <circle cx={CX} cy={CY} r={R + 13} fill={`url(#bezel-${kind})`} />
      <circle cx={CX} cy={CY} r={R + 9} fill="#050707" />
      <circle cx={CX} cy={CY} r={R + 8} fill={`url(#face-${kind})`} stroke="rgba(255,255,255,0.08)" />
      {/* faint radar sweep rings on the face */}
      {[0.35, 0.6].map((k) => (
        <circle key={k} cx={CX} cy={CY} r={R * k} fill="none" stroke="rgba(120,220,170,0.06)" />
      ))}
      <path d={arcPath(R, START, START + SWEEP)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
      {spec.bands.map(([a, b, c], i) => (
        <path key={i} className="gauge-band" d={arcPath(R, angleOf(a), angleOf(b))} fill="none" stroke={c} strokeWidth="9" opacity="0.85" />
      ))}
      {kind === 'wind' &&
        EF_WIND.map((w, i) => {
          const [x, y] = polar((angleOf(w) + angleOf(EF_WIND[i + 1] ?? MAX_WIND)) / 2, R + 0.5);
          return (
            <text key={i} x={x} y={y} className="gauge-ef" textAnchor="middle" dominantBaseline="central">
              {i}
            </text>
          );
        })}
      {ticks.map((t, i) => {
        const [x0, y0] = polar(t.a, R - 8);
        const [x1, y1] = polar(t.a, R - (t.major ? 19 : 13));
        const [lx, ly] = polar(t.a, R - 31);
        return (
          <g key={i}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={t.major ? '#e6ebe4' : 'rgba(230,235,228,0.45)'} strokeWidth={t.major ? 2.2 : 1.1} strokeLinecap="round" />
            {t.label != null && (
              <text x={lx} y={ly} className="gauge-num" textAnchor="middle" dominantBaseline="central">
                {t.label}
              </text>
            )}
          </g>
        );
      })}
      <text x={CX} y={CY + 30} className="gauge-unit" textAnchor="middle">
        {spec.unit}
      </text>
      <text ref={readout} x={CX} y={CY + 64} className={`gauge-readout ${kind}`} textAnchor="middle">
        {kind === 'wind' ? '0' : '—'}
      </text>
      {kind === 'wind' ? (
        <text ref={ef} x={CX} y={CY + 82} className="gauge-efr" textAnchor="middle">
          CALM
        </text>
      ) : (
        <text x={CX} y={CY + 82} className="gauge-unit" textAnchor="middle">
          {spec.sub}
        </text>
      )}
      <g ref={needle} transform={`rotate(${START} ${CX} ${CY})`}>
        <polygon points={`${CX - 3.2},${CY + 12} ${CX + 3.2},${CY + 12} ${CX + 0.9},${CY - R + 6} ${CX - 0.9},${CY - R + 6}`} className="gauge-needle" />
      </g>
      <circle cx={CX} cy={CY} r="9" fill="#1d2422" stroke="#6b746f" strokeWidth="2" />
      <circle cx={CX} cy={CY} r="3.5" fill="#ffc53a" />
      <circle cx={CX} cy={CY} r={R + 8} fill={`url(#glass-${kind})`} pointerEvents="none" />
      {/* the glass cracks when the truck is thrown */}
      <g className="gauge-crack" stroke="rgba(230,238,255,0.75)" strokeWidth="0.9" fill="none" strokeLinecap="round">
        <path d="M72 64 L84 80 L80 94 L95 106 M84 80 L98 76 L112 84 M80 94 L64 104 L54 124 M95 106 L104 128 L100 148 M64 104 L44 96" />
        <path d="M72 64 L60 52 M72 64 L74 46 L68 34 M72 64 L50 66 L36 80" />
        <circle cx="72" cy="64" r="3" fill="rgba(230,238,255,0.5)" stroke="none" />
      </g>
    </svg>
  );
}
