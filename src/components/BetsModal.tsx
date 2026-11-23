import { useEffect, useState } from 'react';
import type { HistoryBetDto, HistoryDto } from '../api/types';
import { formatMoney } from '../game/money';
import { band } from './HistoryStrip';
import { Modal } from './Modal';

type Tab = 'runs' | 'mine' | 'top';

export function BetsModal({
  history,
  currency,
  initial = 'runs',
  getMyBets,
  getTopPayouts,
  onClose,
}: {
  history: HistoryDto[];
  currency: string;
  initial?: Tab;
  getMyBets: () => Promise<HistoryBetDto[]>;
  getTopPayouts: () => Promise<HistoryBetDto[]>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initial);
  const [mine, setMine] = useState<HistoryBetDto[] | null>(null);
  const [top, setTop] = useState<HistoryBetDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (tab === 'mine' && mine == null) getMyBets().then(setMine).catch(() => setError('Could not load your bets.'));
    if (tab === 'top' && top == null) getTopPayouts().then(setTop).catch(() => setError('Could not load the top payouts.'));
  }, [tab, mine, top, getMyBets, getTopPayouts]);

  const rows = (list: HistoryBetDto[] | null, showPlayer: boolean) => {
    if (error) return <p className="muted">{error}</p>;
    if (list == null) return <p className="muted">Loading…</p>;
    if (list.length === 0) return <p className="muted">Nothing here yet.</p>;
    return (
      <table className="bets-table">
        <thead>
          <tr>
            <th>Run</th>
            {showPlayer && <th>Driver</th>}
            <th>Stake</th>
            <th>Bailed</th>
            <th>Win</th>
          </tr>
        </thead>
        <tbody>
          {list.map((b) => (
            <tr key={b.id} className={b.win != null && b.win > 0 ? 'won' : b.win === 0 ? 'lost' : ''}>
              <td>#{b.roundId}</td>
              {showPlayer && <td>{b.player}</td>}
              <td>{formatMoney(b.amount, currency)}</td>
              <td>{b.cashedOutAt != null ? `${b.cashedOutAt.toFixed(2)}×` : b.win === 0 ? 'blown' : '…'}</td>
              <td>{b.win != null ? formatMoney(b.win, currency) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <Modal title="Time slips" onClose={onClose} wide>
      <div className="seg tabs" role="tablist">
        <button className={tab === 'runs' ? 'on' : ''} onClick={() => setTab('runs')}>Recent runs</button>
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My bets</button>
        <button className={tab === 'top' ? 'on' : ''} onClick={() => setTab('top')}>Top payouts</button>
      </div>
      {tab === 'runs' && (
        <div className="slips-grid">
          {history.length === 0 && <p className="muted">No runs yet.</p>}
          {history.map((h) => (
            <div key={h.roundId} className={`slip-card ${band(h.crashPoint)}`}>
              <span className="slip-m">{h.crashPoint.toFixed(2)}×</span>
              <span className="slip-id">#{h.roundId}</span>
            </div>
          ))}
        </div>
      )}
      {tab === 'mine' && rows(mine, false)}
      {tab === 'top' && rows(top, true)}
    </Modal>
  );
}
