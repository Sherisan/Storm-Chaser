/* The lobby thumbnail (see thumbnail.html): one frozen frame of the scene with the title over it. */
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/orbitron/900.css';
import '@fontsource/jetbrains-mono/700.css';
import '../src/styles/global.css';
import { Gauge } from '../src/components/Gauge';
import { EfScale } from '../src/components/Dash';
import { StormModel } from '../src/game/storm';
import { frameBus } from '../src/game/frameBus';
import { multiplierAt } from '../src/game/clock';
import { Scene } from '../src/scene/scene';

/** Seconds into the chase the shot is taken: an EF4 wedge filling the road ahead. */
const T = 20.5;
const RATE = 0.12;

function Shot() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const scene = new Scene(canvas);
    scene.destroy(); // its ResizeObserver would wipe the still after it is drawn
    const model = new StormModel();
    const ghosts = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, bailed: i === 1 }));
    let storm = model.step(false, 0, RATE, null, 0);
    for (let i = 0; i <= 60; i++) {
      scene.frame(i * 40, { phase: 'BETTING', storm, countdownS: 7 - i * 0.1, trucks: [{ id: 'truck0', paint: 'red', bailAt: null }], ghosts, growthRate: RATE, reducedMotion: false });
    }
    // Run the scene up to the shot so rain, spray and debris have had time to form.
    const frames = 100;
    const from = T - 4;
    for (let i = 1; i <= frames; i++) {
      const now = 4000 + i * 40;
      const t = from + (i / frames) * (T - from);
      storm = model.step(true, t, RATE, null, now);
      scene.frame(now, {
        phase: 'FLYING', storm, countdownS: null,
        trucks: [{ id: 'truck0', paint: 'red', bailAt: null }, { id: 'truck1', paint: 'blue', bailAt: null }],
        ghosts, growthRate: RATE, reducedMotion: false,
      });
    }
    // the dials subscribe after this effect runs: publish once they are mounted
    const f = { phase: 'FLYING' as const, storm, m: multiplierAt(RATE, T * 1000), countdownS: null, crashPoint: null };
    for (const ms of [50, 200, 400, 700]) window.setTimeout(() => frameBus.publish(f), ms);
    return undefined;
  }, []);
  return <canvas ref={ref} className="thumb-scene" />;
}

function Thumbnail() {
  return (
    <div className="thumb">
      <Shot />
      <div className="thumb-hud">
        <div className="thumb-lights">
          <EfScale />
        </div>
        <div className="thumb-mult">{multiplierAt(RATE, T * 1000).toFixed(2)}×</div>
      </div>
      <div className="thumb-gauge left">
        <Gauge kind="wind" />
      </div>
      <div className="thumb-gauge right">
        <Gauge kind="baro" />
      </div>
      <div className="thumb-title">
        <div className="thumb-word">
          STORM <em>CHASER</em>
        </div>
        <div className="thumb-tag">BAIL OUT BEFORE IT LIFTS THE TRUCK</div>
        <div className="thumb-sub">UP TO ×1000 · PROVABLY FAIR</div>
      </div>
    </div>
  );
}

const css = `
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: #0b1012; }
  .thumb { position: relative; width: 1280px; height: 720px; overflow: hidden; }
  .thumb-scene { position: absolute; inset: 0; width: 1280px; height: 720px; display: block; }
  .thumb-hud { position: absolute; top: 26px; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .thumb-lights .ef-scale { transform: scale(1.2); }
  .thumb-mult { margin-top: 6px; font: 900 88px/1 Orbitron, sans-serif; color: #fff; letter-spacing: 0.02em; text-shadow: 0 0 40px rgba(255,197,58,0.35), 0 4px 0 rgba(0,0,0,0.5); }
  .thumb-gauge { position: absolute; bottom: 18px; width: 200px; filter: drop-shadow(0 14px 30px rgba(0,0,0,0.7)); }
  .thumb-gauge.left { left: 22px; }
  .thumb-gauge.right { right: 22px; }
  .thumb-title { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); text-align: center; white-space: nowrap; }
  .thumb-word { font: 900 78px/0.95 Orbitron, sans-serif; letter-spacing: 0.06em; color: #fff;
    text-shadow: 0 6px 0 rgba(10,14,12,0.85), 0 0 40px rgba(0,0,0,0.6); }
  .thumb-word em { font-style: normal; color: #ffc53a; text-shadow: 0 6px 0 rgba(60,36,0,0.85), 0 0 50px rgba(255,197,58,0.6); }
  .thumb-tag { margin-top: 12px; font: 700 20px 'Chakra Petch', sans-serif; letter-spacing: 0.26em; color: #ffc53a; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
  .thumb-sub { margin-top: 8px; font: 700 17px 'JetBrains Mono', monospace; letter-spacing: 0.16em; color: #e9ecf5; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
`;
document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
createRoot(document.getElementById('root')!).render(<Thumbnail />);
