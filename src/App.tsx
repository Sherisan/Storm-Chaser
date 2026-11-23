import { useCallback, useEffect, useRef, useState } from 'react';
import type { Phase } from './api/types';
import { multiplierAt } from './game/clock';
import { StormModel } from './game/storm';
import { frameBus } from './game/frameBus';
import { formatMoney, formatMultiplier } from './game/money';
import { sound } from './game/sound';
import { useGame } from './game/useGame';
import { Scene, type GhostView, type TruckView } from './scene/scene';
import { BetPanel } from './components/BetPanel';
import { BetsModal } from './components/BetsModal';
import { EfScale, WarningLamp } from './components/Dash';
import { FairnessModal } from './components/FairnessModal';
import { Gauge } from './components/Gauge';
import { mineIndexes, LiveBets } from './components/LiveBets';
import { Readout } from './components/Readout';
import { RulesModal } from './components/RulesModal';
import { Splash } from './components/Splash';
import { Toasts } from './components/Toasts';
import { TopBar, type ModalKind } from './components/TopBar';
import { usePromos } from './promo/usePromos';
import { PromoBanner, PromoPanel } from './promo/PromoCenter';

interface WinFlash {
  id: number;
  slot: number;
  multiplier: number;
  win: number;
}

export default function App() {
  const { state, actions, clock, events } = useGame();
  const stateRef = useRef(state);
  stateRef.current = state;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [soundOn, setSoundOn] = useState(sound.enabled);
  const [winFlash, setWinFlash] = useState<WinFlash | null>(null);
  const currency = state.me?.currency ?? 'ZAR';

  const { promos, announcement, dismissAnnouncement } = usePromos({
    onAward: (a) => {
      actions.notify(
        'win',
        a.kind === 'FreeBet'
          ? `🎁 ${a.promotion}: you got a ${formatMoney(a.amount, currency)} free bet!`
          : `🎉 ${a.promotion}: +${formatMoney(a.amount, currency)}`,
      );
      if (a.balance != null) actions.setBalance(a.balance);
    },
  });

  // Audio only starts after a gesture.
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Discrete game moments → sound and the win flash.
  useEffect(() => {
    let lastPass = 0;
    const offs = [
      events.on('my:placed', () => sound.bet()),
      events.on('my:cashout', (e) => {
        sound.bail();
        window.setTimeout(() => sound.win(), 380);
        setWinFlash({ id: Date.now(), ...e });
      }),
      events.on('other:cashout', () => {
        const now = performance.now();
        if (now - lastPass > 500) {
          lastPass = now;
          sound.passBy();
        }
      }),
      events.on('error', () => sound.click()),
    ];
    return () => offs.forEach((off) => off());
  }, [events]);

  useEffect(() => {
    if (!winFlash) return;
    const t = window.setTimeout(() => setWinFlash(null), 2800);
    return () => window.clearTimeout(t);
  }, [winFlash]);

  // The frame loop: server clock → storm model → scene + dashboard.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new Scene(canvas);
    scene.onStrike = (d) => sound.thunder(d);
    const model = new StormModel();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let prevStormPhase = 'idle';
    let prevPhase: Phase | null = null;
    let lastTick = 0;
    let shakeTimer = 0;

    const loop = (now: number) => {
      const s = stateRef.current;
      const round = s.round;
      const rate = s.config?.growthRate ?? 0.12;
      const serverNow = clock.now();
      const phase = round?.status ?? null;
      let t = 0;
      let crashAge: number | null = null;
      let m = 1;
      let countdownS: number | null = null;
      if (round && phase === 'FLYING') {
        t = Math.max(0, (serverNow - round.startedAt) / 1000);
        m = multiplierAt(rate, serverNow - round.startedAt);
      } else if (round && phase === 'CRASHED') {
        const crashedAt = round.crashedAt ?? serverNow;
        t = Math.max(0, (crashedAt - round.startedAt) / 1000);
        crashAge = Math.max(0, (serverNow - crashedAt) / 1000);
        m = round.crashPoint ?? multiplierAt(rate, crashedAt - round.startedAt);
      } else if (round && phase === 'BETTING') {
        countdownS = Math.max(0, (round.phaseEndsAt - serverNow) / 1000);
      }
      const running = phase === 'FLYING' || phase === 'CRASHED';
      const storm = model.step(running, t, rate, crashAge, now);

      if (phase !== prevPhase) {
        if (phase === 'FLYING') sound.touchdown();
        prevPhase = phase;
        lastTick = 0;
      }
      // the radar pings through the last seconds before touchdown
      if (countdownS != null && countdownS <= 3.2) {
        const tick = Math.ceil(countdownS);
        if (tick !== lastTick) {
          if (lastTick !== 0) sound.ping();
          lastTick = tick;
        }
      }
      if (storm.phase !== prevStormPhase) {
        if (storm.phase === 'surge') {
          sound.surge();
          if (!reduced && rootRef.current) {
            rootRef.current.classList.add('shake');
            window.clearTimeout(shakeTimer);
            shakeTimer = window.setTimeout(() => rootRef.current?.classList.remove('shake'), 900);
          }
        }
        if (storm.phase === 'lifted') sound.lifted();
        prevStormPhase = storm.phase;
      }
      if (storm.efUp) sound.alert(storm.ef);
      sound.weather(storm.wind, storm.speed, storm.phase);

      const trucks: TruckView[] = [{ id: 'truck0', paint: 'red', bailAt: s.chuteAt[0] ?? null }];
      const b1 = s.myBets[1];
      if (b1 && (b1.status === 'Active' || b1.status === 'CashedOut' || b1.status === 'Lost')) {
        trucks.push({ id: 'truck1', paint: 'blue', bailAt: s.chuteAt[1] ?? null });
      }
      const mineIdx = mineIndexes(s.bets, s.myBets, s.me?.username ?? null);
      const ghosts: GhostView[] = s.bets
        .filter((_, i) => !mineIdx.has(i))
        .map((b, i) => ({ id: `${b.roundId}:${b.player}:${b.slot}:${b.amount}:${i}`, bailed: b.cashedOutAt != null }));

      scene.frame(now, { phase, storm, countdownS, trucks, ghosts, growthRate: rate, reducedMotion: reduced });
      frameBus.publish({ phase, storm, m, countdownS, crashPoint: round?.crashPoint ?? null });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(shakeTimer);
      scene.destroy();
    };
  }, [clock]);

  const closeModal = useCallback(() => setModal(null), []);
  const toggleSound = () => {
    sound.enabled = !sound.enabled;
    setSoundOn(sound.enabled);
  };

  const phase = state.round?.status ?? null;
  const offline = state.conn !== 'online' && state.round != null;

  return (
    <div ref={rootRef} className="app">
      <canvas ref={canvasRef} className="scene" aria-hidden />

      <TopBar state={state} promos={promos} soundOn={soundOn} onSound={toggleSound} onOpen={setModal} promoOpen={modal === 'promos'} />

      <main className="stage">
        <div className="dash-top">
          <EfScale />
          <WarningLamp />
        </div>
        <Readout phase={phase} />
        <div className="gauges">
          <Gauge kind="wind" />
          <Gauge kind="baro" />
        </div>
        {winFlash && (
          <div key={winFlash.id} className={`win-flash car-${winFlash.slot}`} role="status">
            <span className="win-flash-title">BAILED OUT · {formatMultiplier(winFlash.multiplier)}</span>
            <span className="win-flash-amount">+{formatMoney(winFlash.win, currency)}</span>
          </div>
        )}
        {offline && (
          <div className="conn-banner" role="status">
            <span className={`conn conn-${state.conn}`} />
            {state.connMessage ?? (state.conn === 'reconnecting' ? 'Reconnecting…' : 'Connecting…')}
          </div>
        )}
      </main>

      <LiveBets bets={state.bets} myBets={state.myBets} me={state.me?.username ?? null} currency={currency} />
      <BetPanel state={state} actions={actions} freeBets={promos?.freeBets} />
      <Toasts toasts={state.toasts} onDismiss={actions.dismissToast} />

      {modal === 'rules' && <RulesModal config={state.config} currency={currency} onClose={closeModal} />}
      {modal === 'fair' && <FairnessModal fairness={state.fairness} round={state.round} onClose={closeModal} />}
      {modal === 'bets' && (
        <BetsModal history={state.history} currency={currency} getMyBets={actions.getMyBets} getTopPayouts={actions.getTopPayouts} onClose={closeModal} />
      )}
      {modal === 'promos' && promos && <PromoPanel promos={promos} currency={currency} onClose={closeModal} />}
      <PromoBanner event={announcement} onDone={dismissAnnouncement} />

      <Splash conn={state.conn} hasRound={state.round != null} message={state.connMessage} />
    </div>
  );
}
