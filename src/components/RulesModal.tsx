import type { ConfigDto } from '../api/types';
import { formatMoney } from '../game/money';
import { Modal } from './Modal';

export function RulesModal({ config, currency, onClose }: { config: ConfigDto | null; currency: string; onClose: () => void }) {
  const min = config ? formatMoney(config.minBet, currency) : '—';
  const max = config ? formatMoney(config.maxBet, currency) : '—';
  const maxWin = config ? formatMoney(config.maxWin, currency) : '—';
  return (
    <Modal title="How to chase" onClose={onClose}>
      <section className="rules">
        <ol>
          <li>
            <strong>Get in the truck.</strong> Place your bet while the funnel is lowering. You can run two trucks at once (two
            bets), and each one bails out on its own.
          </li>
          <li>
            <strong>Touchdown.</strong> When the tornado touches down the chase is on, and the multiplier starts climbing. The
            longer you chase, the stronger the tornado gets and the closer you drive to it.
          </li>
          <li>
            <strong>Bail out.</strong> Cash out at any time during the chase. You win your stake × the multiplier at that moment.
            Set <em>Auto bail</em> to bail out for you at a target.
          </li>
          <li>
            <strong>It turns.</strong> At some point the tornado swings onto the road and lifts every truck that's still
            chasing. If you haven't bailed out by then, you lose that bet.
          </li>
        </ol>
        <h3>Limits</h3>
        <p>
          Bets {min} to {max}. Max win per bet {maxWin}; a bigger multiplier still pays the max win.
          You can cancel a bet before touchdown.
        </p>
        <h3>The maths</h3>
        <p>
          The multiplier is e<sup>0.12·t</sup>: 2× at about 5.8 s, 10× at 19 s and 100× at 38 s. The game server's provably fair
          generator draws the crash point before betting opens, with a 4% house edge. Over time, every bail-out target
          returns 96% of what is staked, early or late alike. Nothing on screen changes the odds: the wind, the EF
          rating, the pressure, the range and the signs all follow the clock.
        </p>
        <h3>Provably fair</h3>
        <p>
          Before every chase you see the SHA-256 hash of the server seed and the chase's nonce. The seed itself is revealed
          when it rotates, so you can check past results against it. See <em>Fairness</em> in the menu.
        </p>
        <h3>Connection</h3>
        <p>
          When you bail out, the server's clock times it, never yours. If you lose connection during a chase, an auto bail
          still fires on the server. A bet without one keeps chasing until the tornado turns.
        </p>
      </section>
    </Modal>
  );
}
