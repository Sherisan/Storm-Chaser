import { useEffect, useState } from 'react';
import type { ConnStatus } from '../api/types';
import { Logo } from './Logo';

const MIN_SHOW_MS = 1500;
const MAX_WAIT_MS = 10000;
const FADE_MS = 600;

/** Full-screen loading screen: stays until fonts are in and the server connection has settled, then fades. */
export function Splash({ conn, hasRound, message }: { conn: ConnStatus; hasRound: boolean; message: string | null }) {
  const [fontsReady, setFontsReady] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let alive = true;
    document.fonts.ready.then(() => alive && setFontsReady(true));
    const min = window.setTimeout(() => setMinElapsed(true), MIN_SHOW_MS);
    const max = window.setTimeout(() => setTimedOut(true), MAX_WAIT_MS);
    return () => {
      alive = false;
      window.clearTimeout(min);
      window.clearTimeout(max);
    };
  }, []);

  const connected = conn === 'online' && hasRound;
  const settled = connected || timedOut || (conn === 'offline' && message != null && message.includes('session token'));
  const ready = fontsReady && settled && minElapsed;

  useEffect(() => {
    if (!ready) return;
    setFading(true);
    const t = window.setTimeout(() => setGone(true), FADE_MS);
    return () => window.clearTimeout(t);
  }, [ready]);

  if (gone) return null;
  const progress = 20 + (fontsReady ? 30 : 0) + (settled ? 50 : 0);
  const status = !fontsReady ? 'Loading the radar…' : !settled ? 'Finding the cell…' : 'On the road.';

  return (
    <div className={`splash ${fading ? 'splash-out' : ''}`} role="status" aria-live="polite">
      <div className="splash-center">
        <Logo size={44} />
        <p className="splash-tag">TORNADO CRASH · BAIL OUT BEFORE IT LIFTS THE TRUCK</p>
        <div className="splash-bar">
          <div className="splash-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="splash-status">{status}</p>
      </div>
    </div>
  );
}
