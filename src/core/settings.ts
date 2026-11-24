/** Persistent user settings (localStorage). */
import { events } from './events';

export type QualityName = 'low' | 'medium' | 'high' | 'ultra';

export interface Bindings {
  /** action -> keyboard codes (KeyboardEvent.code, or Mouse0/Mouse2). */
  keys: Record<string, string[]>;
  /** action -> standard gamepad button indices. */
  pad: Record<string, number[]>;
}

export interface Settings {
  quality: QualityName;
  invertCameraY: boolean;
  invertFlightPitch: boolean;
  cameraSensitivity: number;
  mouseSensitivity: number;
  deadzone: number;
  responseCurve: number;
  rumble: boolean;
  masterVolume: number;
  musicVolume: number;
  subtitles: boolean;
  colorBlindHud: boolean;
  dayLengthMinutes: number;
  showFps: boolean;
  fov: number;
  bindings: Bindings | null;
}

const KEY = 'fluxcity.settings.v1';

export const defaultSettings: Settings = {
  quality: 'high',
  invertCameraY: false,
  invertFlightPitch: false,
  cameraSensitivity: 1,
  mouseSensitivity: 1,
  deadzone: 0.15,
  responseCurve: 1.5,
  rumble: true,
  masterVolume: 0.8,
  musicVolume: 0.5,
  subtitles: true,
  colorBlindHud: false,
  dayLengthMinutes: 24,
  showFps: false,
  fov: 65,
  bindings: null,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return { ...defaultSettings };
  }
}

export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable (private mode) - settings stay in memory */
  }
  events.emit('settingsChanged', {});
}

export function resetSettings(): void {
  Object.assign(settings, defaultSettings, { bindings: null });
  saveSettings();
}
