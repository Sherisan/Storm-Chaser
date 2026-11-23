import type { MyBetDto, PublicBetDto } from '../api/types';
import { formatMoney } from '../game/money';

export function maskName(name: string): string {
  return name.length <= 2 ? `${name}***` : `${name.slice(0, 2)}***`;
}

/**
 * Which of the public feed's bets are mine. The hub masks names to their first two letters, so other players can
 * share my mask (every dev player is "de***"). A public bet is mine only if it also matches one of my own bets (same
 * slot, and the same stake unless it's a free bet), and each of my bets claims one public bet.
 */
export function mineIndexes(bets: PublicBetDto[], myBets: (MyBetDto | null)[], me: string | null): Set<number> {
  const out = new Set<number>();
  if (!me) return out;
  const mask = maskName(me);
  const claimed = new Set<number>();
  bets.forEach((b, i) => {
    if (b.player !== mask || claimed.has(b.slot)) return;
    const m = myBets[b.slot];
    if (!m || (!m.freeBet && Math.abs(m.amount - b.amount) > 0.001)) return;
    claimed.add(b.slot);
    out.add(i);
  });
  return out;
}

/** Everyone in this run, biggest stake first, with who has bailed out. */
export function LiveBets({ bets, myBets, me, currency, compact = false }: { bets: PublicBetDto[]; myBets: (MyBetDto | null)[]; me: string | null; currency: string; compact?: boolean }) {
  const mineIdx = mineIndexes(bets, myBets, me);
  const sorted = bets.map((b, i) => ({ ...b, isMe: mineIdx.has(i) })).sort((a, b) => b.amount - a.amount);
  const total = bets.reduce((s, b) => s + b.amount, 0);
  const out = bets.filter((b) => b.cashedOutAt != null).length;
  return (
    <aside className={`live-bets glass ${compact ? 'compact' : ''}`} aria-label="Chasers on the road">
      <div className="live-bets-head">
        <span>Chasers</span>
        <span className="live-bets-count">{bets.length}</span>
      </div>
      <div className="live-bets-total">
        <span>Total {formatMoney(total, currency)}</span>
        <span>{out} bailed</span>
      </div>
      <div className="live-bets-list">
        {sorted.length === 0 && <div className="live-bets-empty">Nobody on the road yet</div>}
        {sorted.slice(0, 60).map((b, i) => {
          const isMe = b.isMe;
          const won = b.cashedOutAt != null;
          return (
            <div key={`${b.player}:${b.slot}:${i}`} className={`live-bet ${won ? 'won' : ''} ${isMe ? 'mine' : ''}`}>
              <span className="live-bet-name">{isMe ? 'You' : b.player}</span>
              <span className="live-bet-amt">{formatMoney(b.amount, currency)}</span>
              <span className="live-bet-x">{won ? `${b.cashedOutAt!.toFixed(2)}×` : ''}</span>
              <span className="live-bet-win">{won && b.win != null ? formatMoney(b.win, currency) : ''}</span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
