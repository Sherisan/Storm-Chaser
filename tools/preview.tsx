/* Art preview (see preview.html): renders the scene at fixed moments by stepping it with a fake clock. */
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/orbitron/900.css';
import { StormModel, SURGE_S } from '../src/game/storm';
import { Scene, type GhostView, type SceneView, type TruckView } from '../src/scene/scene';

const RATE = 0.12;
const W = 960;
const H = 540;

interface Shot {
  id: string;
  label: string;
  /** Seconds of chase before the crash (or the whole chase if no crash). */
  runS: number;
  /** Seconds after the crash to stop at, or null for no crash. */
  crashAge: number | null;
  /** Betting only: seconds left on the countdown at the shot. */
  staging?: number;
  /** Second at which the player bails out. */
  bailAt?: number;
  twoTrucks?: boolean;
}

const SHOTS: Shot[] = [
  { id: 'staging', label: 'Betting · funnel lowering', runS: 0, crashAge: null, staging: 1.4 },
  { id: 'touchdown', label: 'Touchdown · 1.3×', runS: 2.2, crashAge: null, twoTrucks: true },
  { id: 'chase', label: 'The chase · EF3 · 5×', runS: 13.4, crashAge: null },
  { id: 'bail', label: 'Bailing out', runS: 9.2, crashAge: null, bailAt: 8 },
  { id: 'bail2', label: 'Bailed · dropping back', runS: 10.4, crashAge: null, bailAt: 8 },
  { id: 'ef5', label: 'EF5 · 30×', runS: 28.3, crashAge: null },
  { id: 'surge', label: 'It turns · the surge', runS: 15, crashAge: 0.38 },
  { id: 'lift0', label: 'Lift-off', runS: 15, crashAge: SURGE_S + 0.35 },
  { id: 'lifted', label: 'Lifted', runS: 15, crashAge: SURGE_S + 0.9 },
  { id: 'lift2', label: 'Carried round', runS: 15, crashAge: SURGE_S + 1.6 },
  { id: 'gone', label: 'Gone into the funnel', runS: 15, crashAge: SURGE_S + 2.4 },
  { id: 'end', label: 'It moves off', runS: 15, crashAge: SURGE_S + 4.2 },
];

const ghosts: GhostView[] = ['g1', 'g2', 'g3', 'g4', 'g5'].map((id) => ({ id, bailed: false }));

function render(shot: Shot, canvas: HTMLCanvasElement) {
  const scene = new Scene(canvas);
  // a ResizeObserver callback would reset the canvas after the shot is drawn
  scene.destroy();
  const model = new StormModel();
  const fps = 24;
  let now = 1000;
  const step = (phase: SceneView['phase'], t: number, crashAge: number | null, countdownS: number | null, trucks: TruckView[], gh: GhostView[]) => {
    const storm = model.step(phase !== 'BETTING', t, RATE, crashAge, now);
    scene.frame(now, { phase, storm, countdownS, trucks, ghosts: gh, growthRate: RATE, reducedMotion: false });
    now += 1000 / fps;
  };
  const trucksAt = (bailAt: number | null): TruckView[] => {
    const trucks: TruckView[] = [{ id: 'truck0', paint: 'red', bailAt }];
    if (shot.twoTrucks) trucks.push({ id: 'truck1', paint: 'blue', bailAt: null });
    return trucks;
  };
  const stageEnd = shot.staging ?? 0;
  for (let s = 7; s > stageEnd; s -= 1 / fps) step('BETTING', 0, null, s, trucksAt(null), ghosts);
  if (shot.staging != null) return;
  let bailNow: number | null = null;
  // skip ahead on long chases: only the last 4 s need simulating for the particles
  const from = Math.max(0, shot.runS - 4);
  for (let t = from; t <= shot.runS; t += 1 / fps) {
    if (shot.bailAt != null && bailNow == null && t >= shot.bailAt) bailNow = now;
    const gh = ghosts.map((g, i) => ({ ...g, bailed: i === 1 && t > from + 1.5 }));
    step('FLYING', t, null, null, trucksAt(bailNow), gh);
  }
  if (shot.crashAge == null) return;
  for (let a = 0; a <= shot.crashAge; a += 1 / fps) step('CRASHED', shot.runS, a, null, trucksAt(bailNow), ghosts);
}

const root = document.getElementById('root')!;
document.head.append(Object.assign(document.createElement('style'), {
  textContent: `
    body { margin: 0; background: #000; font: 600 14px 'Chakra Petch', sans-serif; color: #ccd; }
    .grid { display: grid; grid-template-columns: repeat(2, ${W}px); gap: 8px; padding: 8px; }
    figure { margin: 0; position: relative; }
    figcaption { position: absolute; left: 10px; top: 8px; padding: 3px 8px; background: rgba(0,0,0,0.6); border-radius: 6px; }
    canvas { display: block; width: ${W}px; height: ${H}px; }
  `,
}));
const grid = document.createElement('div');
grid.className = 'grid';
root.append(grid);
for (const shot of SHOTS) {
  const fig = document.createElement('figure');
  fig.id = shot.id;
  const canvas = document.createElement('canvas');
  const cap = document.createElement('figcaption');
  cap.textContent = shot.label;
  fig.append(canvas, cap);
  grid.append(fig);
}
document.fonts.ready.then(() => {
  try {
    for (const shot of SHOTS) {
      const canvas = document.querySelector(`#${shot.id} canvas`) as HTMLCanvasElement;
      render(shot, canvas);
    }
    document.body.dataset.done = '1';
  } catch (e) {
    document.body.dataset.error = String((e as Error)?.stack ?? e);
  }
});
