import type { GameActions, GameState } from '../game/useGame';
import type { FreeBet } from '../promo/promoApi';
import { BetSlot } from './BetSlot';

export function BetPanel({ state, actions, freeBets }: { state: GameState; actions: GameActions; freeBets?: FreeBet[] }) {
  const slots = Math.max(1, Math.min(2, state.config?.slots ?? 2));
  return (
    <footer className="bet-panel">
      {Array.from({ length: slots }, (_, slot) => (
        <BetSlot key={slot} slot={slot} state={state} actions={actions} freeBet={freeBets?.[0] ?? null} />
      ))}
    </footer>
  );
}
