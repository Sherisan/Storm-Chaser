import type { FairnessDto, RoundDto } from '../api/types';
import { Modal } from './Modal';

function Hash({ value }: { value: string | null | undefined }) {
  if (!value) return <code className="hash">—</code>;
  return (
    <code className="hash" title={value}>
      {value}
    </code>
  );
}

export function FairnessModal({ fairness, round, onClose }: { fairness: FairnessDto | null; round: RoundDto | null; onClose: () => void }) {
  return (
    <Modal title="Provably fair" onClose={onClose}>
      <section className="rules">
        <p>
          Every crash point is drawn by the game server before the betting window opens, from a server seed that is kept
          secret and committed to by its SHA-256 hash. Rounds are numbered by a nonce under that seed. When the seed
          rotates (every 1 000 draws) the old seed is published, so anyone can recompute the crash points it produced
          and compare them with the results shown.
        </p>
        <dl className="fair-list">
          <dt>This chase</dt>
          <dd>#{round?.id ?? '—'} · nonce {round?.nonce ?? '—'}</dd>
          <dt>Server seed hash (current)</dt>
          <dd>
            <Hash value={round?.serverSeedHash ?? fairness?.currentServerSeedHash} />
          </dd>
          <dt>Previous server seed (revealed)</dt>
          <dd>
            <Hash value={fairness?.previousServerSeed?.serverSeed} />
          </dd>
          <dt>Its hash</dt>
          <dd>
            <Hash value={fairness?.previousServerSeed?.serverSeedHash} />
          </dd>
          <dt>Revealed at</dt>
          <dd>{fairness?.previousServerSeed?.revealedAt ? new Date(fairness.previousServerSeed.revealedAt).toLocaleString() : 'not yet — the first seed is still in use'}</dd>
        </dl>
        <p>
          Check a revealed seed: its SHA-256 must equal the hash that was shown while it was in use. Each crash point is
          derived from that seed and the chase's nonce by the game server's provably fair generator with a 4% house edge,
          never lower than 1.00× and capped at the game's maximum, so the same seed and nonce always give the same
          result.
        </p>
      </section>
    </Modal>
  );
}
