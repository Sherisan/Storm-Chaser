/** Discrete moments the sound and the scene react to. Emitted by useGame; subscribed to by App. */
export type GameEventMap = {
  betting: { roundId: number };
  launch: { roundId: number };
  crash: { roundId: number; crashPoint: number };
  'my:placed': { slot: number; amount: number };
  'my:cashout': { slot: number; multiplier: number; win: number };
  'my:lost': { slot: number; amount: number };
  'other:cashout': { player: string; multiplier: number };
  error: { message: string };
};

type Listener<K extends keyof GameEventMap> = (e: GameEventMap[K]) => void;

export class GameEvents {
  private listeners = new Map<keyof GameEventMap, Set<Listener<keyof GameEventMap>>>();

  on<K extends keyof GameEventMap>(name: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(fn as Listener<keyof GameEventMap>);
    return () => set!.delete(fn as Listener<keyof GameEventMap>);
  }

  emit<K extends keyof GameEventMap>(name: K, e: GameEventMap[K]): void {
    this.listeners.get(name)?.forEach((fn) => {
      try {
        (fn as Listener<K>)(e);
      } catch (err) {
        console.error(err);
      }
    });
  }
}
