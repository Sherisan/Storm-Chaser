import { useEffect, useRef } from 'react';
import type { Phase } from '../api/types';
import { frameBus } from '../game/frameBus';
import { SURGE_S } from '../game/storm';
import { formatRange } from './Gauge';

/**
 * The big multiplier over the road, with the status line under it: the countdown to touchdown while betting, the
 * tornado's rating and range on the chase, "IT'S TURNING!" then "LIFTED" at the crash. Updated from the frame bus.
 */
export function Readout({ phase }: { phase: Phase | null }) {
  const root = useRef<HTMLDivElement>(null);
  const mult = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const sub = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastText = '';
    let lastStatus = '';
    let lastCls = '';
    return frameBus.subscribe((f) => {
      const text = `${f.m.toFixed(2)}×`;
      if (text !== lastText && mult.current) {
        mult.current.textContent = text;
        lastText = text;
      }
      let st = '';
      let subText = '';
      let cls = '';
      if (f.phase === 'BETTING') {
        const s = f.countdownS ?? 0;
        st = s <= 1.8 ? 'FUNNEL LOWERING…' : 'TRACKING THE CELL';
        subText = s <= 1.8 ? '' : `TOUCHDOWN IN ${s.toFixed(1)}s`;
        cls = 'staging';
      } else if (f.phase === 'FLYING') {
        const ef = f.storm.ef;
        st = f.storm.t < 1.2 ? 'TOUCHDOWN!' : ef >= 0 ? `EF${ef} TORNADO` : 'ON THE GROUND';
        subText = `RANGE ${formatRange(f.storm.range).toUpperCase()}`;
        cls = ef >= 4 ? 'run hot' : 'run';
      } else if (f.phase === 'CRASHED') {
        const surge = (f.storm.crashAge ?? 0) < SURGE_S;
        st = surge ? "IT'S TURNING!" : 'LIFTED';
        subText = surge ? '' : `TAKEN AT ${f.crashPoint?.toFixed(2) ?? f.m.toFixed(2)}×`;
        cls = surge ? 'surge' : 'lifted';
      }
      if (st !== lastStatus && status.current) {
        status.current.textContent = st;
        lastStatus = st;
      }
      if (sub.current && sub.current.textContent !== subText) sub.current.textContent = subText;
      if (cls !== lastCls && root.current) {
        root.current.className = `readout ${cls}`;
        lastCls = cls;
      }
    });
  }, []);

  return (
    <div ref={root} className="readout" aria-live="off" data-phase={phase ?? 'none'}>
      <div ref={status} className="readout-status">
        {phase ? '' : 'CONNECTING'}
      </div>
      <div ref={mult} className="readout-mult">
        1.00×
      </div>
      <div ref={sub} className="readout-sub" />
    </div>
  );
}
