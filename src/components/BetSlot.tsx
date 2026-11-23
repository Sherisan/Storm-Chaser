import { useEffect, useRef, useState } from 'react';
import { frameBus } from '../game/frameBus';
import { currencySymbol, formatMoney, formatMultiplier, payout } from '../game/money';
import type { GameActions, GameState } from '../game/useGame';
import type { FreeBet } from '../promo/promoApi';

const AUTOPLAY_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: '10', value: 10 },
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '∞', value: null },
];

const QUICK_AMOUNTS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/**
 * One car's betting slot: stake and quick picks on the left, one big button on the right that always says what it
 * will do (CHASE R10.00 / BAIL OUT R23.40 / CANCEL / STOP AUTO). The bail button's amount follows the
 * multiplier every frame through the frame bus.
 */
export function BetSlot({
  slot,
  state,
  actions,
  freeBet,
}: {
  slot: number;
  state: GameState;
  actions: GameActions;
  freeBet?: FreeBet | null;
}) {
  const [amount, setAmount] = useState(slot === 0 ? 10 : 5);
  const [draft, setDraft] = useState<string | null>(null);
  const [mode, setMode] = useState<'bet' | 'auto'>('bet');
  const [autoChuteOn, setAutoChuteOn] = useState(false);
  const [autoChuteValue, setAutoChuteValue] = useState(2);
  const [autoPlayPreset, setAutoPlayPreset] = useState<number | null>(10);
  const [autoPlayOn, setAutoPlayOn] = useState(false);
  const [roundsLeft, setRoundsLeft] = useState<number | null>(null);
  const [queued, setQueued] = useState(false);
  const lastPlacedRound = useRef<number | null>(null);
  const chuteAmount = useRef<HTMLSpanElement>(null);
  const chuteMult = useRef<HTMLSpanElement>(null);

  const currency = state.me?.currency ?? 'ZAR';
  const minBet = state.config?.minBet ?? 1;
  const maxBet = state.config?.maxBet ?? 1000;
  const maxWin = state.config?.maxWin ?? Infinity;
  const minAuto = state.config?.minAutoCashOut ?? 1.01;
  const phase = state.round?.status ?? null;
  const bet = state.myBets[slot] ?? null;
  const result = state.results[slot] ?? null;
  const online = state.conn === 'online';
  const riding = bet?.status === 'Active';
  const busy = state.busy[slot] ?? false;

  const clamp = (v: number) => Math.min(maxBet, Math.max(minBet, Math.round(v * 100) / 100));
  const step = (dir: 1 | -1) => setAmount((a) => clamp(a + dir * (a >= 100 ? 25 : a >= 20 ? 5 : 1)));
  const betMax = () => setAmount(clamp(Math.min(maxBet, Math.floor(state.balance))));
  const chips = QUICK_AMOUNTS.filter((v) => v >= minBet && v <= maxBet).slice(0, 4);
  const controlsLocked = riding || autoPlayOn || queued;
  const autoCashOut = autoChuteOn ? Math.max(minAuto, Math.round(autoChuteValue * 100) / 100) : null;

  const commitDraft = () => {
    if (draft == null) return;
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) setAmount(clamp(parsed));
    setDraft(null);
  };

  // The bail button shows what bailing right now would pay.
  useEffect(() => {
    if (!riding || phase !== 'FLYING' || !bet) return;
    return frameBus.subscribe((f) => {
      if (chuteAmount.current) chuteAmount.current.textContent = formatMoney(payout(bet.amount, f.m, maxWin), currency);
      if (chuteMult.current) chuteMult.current.textContent = formatMultiplier(f.m);
    });
  }, [riding, phase, bet, maxWin, currency]);

  // Place a queued or auto-play bet as soon as a betting window opens.
  useEffect(() => {
    if (!queued && !autoPlayOn) return;
    if (phase !== 'BETTING' || bet != null || !state.round) return;
    if (lastPlacedRound.current === state.round.id) return;
    if (autoPlayOn && roundsLeft === 0) {
      setAutoPlayOn(false);
      return;
    }
    const stake = clamp(amount);
    if (stake > state.balance) {
      setAutoPlayOn(false);
      setQueued(false);
      actions.notify('error', 'Not enough balance to keep racing.');
      return;
    }
    lastPlacedRound.current = state.round.id;
    void actions.placeBet(slot, stake, autoCashOut);
    if (autoPlayOn) setRoundsLeft((r) => (r == null ? r : r - 1));
    setQueued(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, autoPlayOn, phase, state.round?.id, bet]);

  const toggleAutoPlay = () => {
    setAutoPlayOn((on) => {
      if (!on) setRoundsLeft(autoPlayPreset);
      return !on;
    });
  };

  const placeNow = () => {
    lastPlacedRound.current = state.round?.id ?? null;
    void actions.placeBet(slot, clamp(amount), autoCashOut);
  };

  const mainButton = () => {
    if (riding && phase === 'FLYING') {
      return (
        <button className="main-btn chute" disabled={!online || busy} onClick={() => void actions.cashOut(slot)}>
          <span className="main-btn-title">{busy ? 'BAILING…' : 'BAIL OUT'}</span>
          <span ref={chuteAmount} className="main-btn-amount">
            {formatMoney(bet!.amount, currency)}
          </span>
          <span className="main-btn-meta">
            <span ref={chuteMult}>1.00×</span>
            {bet!.freeBet ? ' · FREE BET' : ''}
            {bet!.autoCashOut ? ` · auto ${formatMultiplier(bet!.autoCashOut)}` : ''}
          </span>
        </button>
      );
    }
    if (riding && phase === 'BETTING') {
      return (
        <button className="main-btn staged" disabled={!online} onClick={() => void actions.cancelBet(slot)}>
          <span className="main-btn-title">IN THE TRUCK ✓</span>
          <span className="main-btn-amount">{formatMoney(bet!.amount, currency)}</span>
          <span className="main-btn-meta">tap to cancel</span>
        </button>
      );
    }
    if (riding) {
      return (
        <button className="main-btn staged" disabled>
          <span className="main-btn-title">ON THE LINE</span>
          <span className="main-btn-meta">waiting for green</span>
        </button>
      );
    }
    if (autoPlayOn) {
      return (
        <button className="main-btn stop" onClick={() => setAutoPlayOn(false)}>
          <span className="main-btn-title">STOP AUTO</span>
          <span className="main-btn-meta">{roundsLeft == null ? '∞' : roundsLeft} runs left</span>
        </button>
      );
    }
    if (queued) {
      return (
        <button className="main-btn stop" onClick={() => setQueued(false)}>
          <span className="main-btn-title">CANCEL</span>
          <span className="main-btn-meta">rolling next chase</span>
        </button>
      );
    }
    const affordable = clamp(amount) <= state.balance + 1e-9;
    if (phase === 'BETTING') {
      return (
        <button className="main-btn race" disabled={!online || !affordable} onClick={placeNow}>
          <span className="main-btn-title">CHASE</span>
          <span className="main-btn-amount">{formatMoney(clamp(amount), currency)}</span>
          {!affordable && <span className="main-btn-meta">not enough balance</span>}
        </button>
      );
    }
    return (
      <button className="main-btn race next" disabled={!online || !affordable} onClick={() => setQueued(true)}>
        <span className="main-btn-title">CHASE</span>
        <span className="main-btn-meta">next chase · {formatMoney(clamp(amount), currency)}</span>
      </button>
    );
  };

  const showResult = result && (!bet || bet.status === 'CashedOut' || bet.status === 'Lost');
  const resultText = !showResult
    ? null
    : result.kind === 'won'
      ? `BAILED @ ${formatMultiplier(result.multiplier ?? 1)} · +${formatMoney(result.win ?? 0, currency)}`
      : `BLOWN · −${formatMoney(result.amount, currency)}`;

  return (
    <div className={`bet-slot ${riding ? 'riding' : ''} slot-${slot}`}>
      <div className="bet-slot-controls">
        <div className="bet-slot-head">
          <span className={`bet-slot-label car-${slot}`}>
            <i /> TRUCK {slot + 1}
          </span>
          <div className="seg" role="tablist">
            <button className={mode === 'bet' ? 'on' : ''} onClick={() => setMode('bet')}>
              Bet
            </button>
            <button className={mode === 'auto' ? 'on' : ''} onClick={() => setMode('auto')}>
              Auto{autoPlayOn || autoChuteOn ? ' •' : ''}
            </button>
          </div>
        </div>

        <div className="bet-slot-row">
          <button className="step-btn" disabled={controlsLocked} onClick={() => step(-1)} aria-label="Decrease bet">
            −
          </button>
          <label className="bet-amount">
            <span className="bet-amount-cur">{currencySymbol(currency)}</span>
            <input
              inputMode="decimal"
              value={draft ?? clamp(amount).toFixed(2)}
              disabled={controlsLocked}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              aria-label="Bet amount"
            />
          </label>
          <button className="step-btn" disabled={controlsLocked} onClick={() => step(1)} aria-label="Increase bet">
            +
          </button>
        </div>

        {mode === 'bet' ? (
          <div className="chip-row quick">
            {chips.map((v) => (
              <button key={v} className={`amt-chip ${clamp(amount) === v ? 'on' : ''}`} disabled={controlsLocked} onClick={() => setAmount(clamp(v))}>
                {v}
              </button>
            ))}
            <button className="amt-chip" disabled={controlsLocked} onClick={() => setAmount((a) => clamp(a * 2))}>
              ×2
            </button>
            <button className="amt-chip max" disabled={controlsLocked} onClick={betMax}>
              MAX
            </button>
          </div>
        ) : (
          <div className="chip-row">
            <label className={`mini-chip ${autoChuteOn ? 'on' : ''}`}>
              <input type="checkbox" checked={autoChuteOn} disabled={riding} onChange={(e) => setAutoChuteOn(e.target.checked)} />
              <span>Auto bail at</span>
              <input
                type="number"
                min={minAuto}
                step={0.1}
                value={autoChuteValue}
                disabled={!autoChuteOn || riding}
                onChange={(e) => setAutoChuteValue(Number(e.target.value) || minAuto)}
                aria-label="Auto bail multiplier"
              />
              <span className="mini-chip-x">×</span>
            </label>
            <label className={`mini-chip ${autoPlayOn ? 'on' : ''}`}>
              <input type="checkbox" checked={autoPlayOn} disabled={riding && !autoPlayOn} onChange={toggleAutoPlay} />
              <span>Auto chase</span>
              <select
                value={autoPlayPreset ?? 'inf'}
                disabled={autoPlayOn}
                onChange={(e) => setAutoPlayPreset(e.target.value === 'inf' ? null : Number(e.target.value))}
                aria-label="Auto chase rounds"
              >
                {AUTOPLAY_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value ?? 'inf'}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="bet-slot-action">
        {mainButton()}
        {freeBet && phase === 'BETTING' && bet == null && !autoPlayOn && !queued && (
          <button
            className="free-bet-btn"
            disabled={!online}
            onClick={() => {
              lastPlacedRound.current = state.round?.id ?? null;
              void actions.placeFreeBet(slot, autoCashOut);
            }}
          >
            🎁 FREE BET {formatMoney(freeBet.amount, currency)}
          </button>
        )}
        {bet?.winPending && <span className="bet-slot-result pending">WIN PENDING · being credited</span>}
        {resultText && <span className={`bet-slot-result ${result!.kind}`}>{resultText}</span>}
      </div>
    </div>
  );
}
