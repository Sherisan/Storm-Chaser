import type { HistoryDto } from '../api/types';

/** Colour bands for past crash points: a blown engine before 2× reads cold, past 10× hot. */
export function band(m: number): 'low' | 'mid' | 'high' {
  return m < 2 ? 'low' : m < 10 ? 'mid' : 'high';
}

/** Recent crash points as time slips, newest first, along the top of the screen. */
export function HistoryStrip({ history, onOpen }: { history: HistoryDto[]; onOpen: () => void }) {
  if (history.length === 0) return <div className="history-strip" />;
  return (
    <button className="history-strip" aria-label="Recent runs" onClick={onOpen}>
      {history.slice(0, 24).map((h, i) => (
        <span key={h.roundId} className={`slip ${band(h.crashPoint)} ${i === 0 ? 'latest' : ''}`}>
          {h.crashPoint.toFixed(2)}×
        </span>
      ))}
    </button>
  );
}
