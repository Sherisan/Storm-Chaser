import { useEffect, useRef } from 'react';
import { frameBus } from '../game/frameBus';

const EF = ['EF0', 'EF1', 'EF2', 'EF3', 'EF4', 'EF5'];

/** The EF scale across the top of the dash: segments light as the tornado strengthens, all flash in the surge. */
export function EfScale() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let last = '';
    return frameBus.subscribe((f) => {
      const el = root.current;
      if (!el) return;
      const surge = f.storm.phase === 'surge';
      const dead = f.storm.phase === 'lifted';
      const lit = EF.map((_, i) => (surge ? Math.sin(performance.now() / 45) > 0 : !dead && f.storm.ef >= i));
      const key = lit.map((b) => (b ? 1 : 0)).join('') + (surge ? 's' : '') + (f.storm.efUp ? 'u' : '');
      if (key === last) return;
      last = key;
      lit.forEach((on, i) => {
        const seg = el.children[i] as HTMLElement | undefined;
        if (!seg) return;
        seg.classList.toggle('on', on);
        seg.classList.toggle('surge', surge);
        if (f.storm.efUp && i === f.storm.ef) {
          seg.classList.remove('up');
          void seg.offsetWidth;
          seg.classList.add('up');
        }
      });
    });
  }, []);
  return (
    <div ref={root} className="ef-scale" aria-hidden>
      {EF.map((t, i) => (
        <span key={t} className={`ef ef-${i}`}>
          {t}
        </span>
      ))}
    </div>
  );
}

/** The tornado warning lamp: blinks through the surge and stays lit once the truck has been taken. */
export function WarningLamp() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let last = '';
    return frameBus.subscribe((f) => {
      const el = ref.current;
      if (!el) return;
      const cls = f.storm.phase === 'surge' ? 'blink' : f.storm.phase === 'lifted' ? 'on' : f.storm.ef >= 4 ? 'warm' : '';
      if (cls === last) return;
      last = cls;
      el.className = `warn-lamp ${cls}`;
    });
  }, []);
  return (
    <div ref={ref} className="warn-lamp" role="img" aria-label="Tornado warning">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <path d="M3 4h18l-1.5 2.5H4.5zM5.5 8h13l-1.6 2.4H7.1zM8 12h8.4l-1.5 2.3H9.3zM10 16h4.6l-1.2 2.2h-2.2zM11.4 19.6h1.8L12.3 22z" fill="currentColor" />
      </svg>
      <span>TORNADO WARNING</span>
    </div>
  );
}
