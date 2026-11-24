/** Tiny strongly typed event bus. */

export interface GameEvents {
  toast: { text: string; ms?: number };
  deviceChanged: { kind: 'keyboard' | 'xbox' | 'playstation' };
  settingsChanged: Record<string, never>;
  visionToggled: { on: boolean };
  landmarkDiscovered: { id: string };
  photoTaken: { landmarkIds: string[] };
  touchdown: { verticalSpeed: number; centreline: number; score: number; onRunway: boolean };
  crash: { reason: string };
  vehicleEntered: { kind: string };
  vehicleExited: Record<string, never>;
  missionEnded: { id: string; success: boolean };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(name: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn as Handler<never>);
    return () => set?.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEvents>(name: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of set) (fn as Handler<GameEvents[K]>)(payload);
  }
}

export const events = new EventBus();
