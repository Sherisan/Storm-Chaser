import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../game/useGame';
import { formatMoney } from '../game/money';
import type { PromoState } from '../promo/promoApi';
import { PromoButton } from '../promo/PromoCenter';
import { HistoryStrip } from './HistoryStrip';
import { Logo } from './Logo';

export type ModalKind = 'rules' | 'fair' | 'bets' | 'promos';

export function TopBar({
  state,
  promos,
  soundOn,
  onSound,
  onOpen,
  promoOpen,
}: {
  state: GameState;
  promos: PromoState | null;
  soundOn: boolean;
  onSound: () => void;
  onOpen: (m: ModalKind) => void;
  promoOpen: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const currency = state.me?.currency ?? 'ZAR';

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  const pick = (m: ModalKind) => {
    setMenu(false);
    onOpen(m);
  };

  return (
    <header className="top-bar">
      <div className="top-left">
        <Logo size={20} />
      </div>
      <HistoryStrip history={state.history} onOpen={() => onOpen('bets')} />
      <div className="top-right">
        <PromoButton promos={promos} open={promoOpen} onToggle={() => onOpen('promos')} />
        <div className="balance glass" title={state.me?.username ?? ''}>
          <span className="balance-label">BALANCE</span>
          <span className="balance-value">{formatMoney(state.balance, currency)}</span>
        </div>
        <button className={`icon-btn glass ${soundOn ? '' : 'off'}`} onClick={onSound} aria-label={soundOn ? 'Mute' : 'Unmute'} aria-pressed={soundOn}>
          {soundOn ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d="M4 9v6h4l5 4V5L8 9H4zm11.5 3a3.5 3.5 0 0 0-2-3.2v6.4a3.5 3.5 0 0 0 2-3.2zm-2-7.5v2.1a5.5 5.5 0 0 1 0 10.8v2.1a7.5 7.5 0 0 0 0-15z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d="M4 9v6h4l5 4V5L8 9H4zm12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4-2.7-2.7z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div className="menu-wrap" ref={menuRef}>
          <button className={`icon-btn glass ${menu ? 'open' : ''}`} onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}>
            <span className="burger" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </button>
          {menu && (
            <div className="menu glass" role="menu">
              <button role="menuitem" onClick={() => pick('rules')}>How to chase</button>
              <button role="menuitem" onClick={() => pick('bets')}>Time slips &amp; my bets</button>
              <button role="menuitem" onClick={() => pick('fair')}>Provably fair</button>
              {promos && (promos.promotions.length > 0 || promos.freeBets.length > 0) && (
                <button role="menuitem" onClick={() => pick('promos')}>Promotions</button>
              )}
              <div className="menu-user">
                <span className={`conn conn-${state.conn}`} />
                {state.me?.username ?? 'not signed in'}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
