/** Gamepad rumble helper. Fails silently where unsupported. */
import { settings } from '../core/settings';

let activePad: Gamepad | null = null;
let cooldownUntil = 0;

export function setRumblePad(pad: Gamepad | null): void {
  activePad = pad;
}

interface Actuator {
  playEffect?: (type: string, params: Record<string, number>) => Promise<unknown>;
}

export function rumble(strong: number, weak: number, ms: number): void {
  if (!settings.rumble || !activePad) return;
  const now = performance.now();
  if (now < cooldownUntil) return;
  cooldownUntil = now + Math.min(ms, 120);
  const act = (activePad as unknown as { vibrationActuator?: Actuator | null }).vibrationActuator;
  if (!act || typeof act.playEffect !== 'function') return;
  try {
    act
      .playEffect('dual-rumble', {
        startDelay: 0,
        duration: ms,
        strongMagnitude: Math.min(1, Math.max(0, strong)),
        weakMagnitude: Math.min(1, Math.max(0, weak)),
      })
      .catch(() => undefined);
  } catch {
    /* unsupported */
  }
}
