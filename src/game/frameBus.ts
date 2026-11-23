import type { Phase } from '../api/types';
import type { Storm } from './storm';

/** What the dashboard shows this frame. Published by App's animation loop; read by components that update DOM directly. */
export interface Frame {
  phase: Phase | null;
  storm: Storm;
  /** The live multiplier (1 while betting, the crash point once crashed). */
  m: number;
  countdownS: number | null;
  crashPoint: number | null;
}

type Fn = (f: Frame) => void;
const subs = new Set<Fn>();

/** Per-frame values go here instead of React state: 60 updates a second would re-render the whole HUD. */
export const frameBus = {
  subscribe(fn: Fn): () => void {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
  publish(f: Frame) {
    subs.forEach((fn) => fn(f));
  },
};
