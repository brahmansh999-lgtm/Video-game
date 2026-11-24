/** Settings (saved to localStorage) and the control remapping screen. */
import { audio } from '../audio/audioEngine';
import { resetProgress } from '../core/save';
import { saveSettings, settings, type QualityName } from '../core/settings';
import { ACTION_LABELS, REMAPPABLE, type Action } from '../input/actions';
import { keyLabel, padLabel } from '../input/glyphs';
import type { InputManager } from '../input/InputManager';
import { Screen, button, choice, el, slider, toggle } from './menu';

const QUALITY_NAMES: Record<QualityName, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  ultra: 'Ultra',
};

export class SettingsMenu extends Screen {
  constructor(
    private readonly onQuality: (q: QualityName) => void,
    private readonly openRemap: () => void,
  ) {
    super('menu settings');
  }

  render(): void {
    const s = settings;
    const save = (): void => saveSettings();
    const wrap =
      <T>(set: (v: T) => void) =>
      (v: T): void => {
        set(v);
        save();
      };
    this.root.innerHTML = '';
    const panel = el('div', 'menu-panel wide scroll');
    panel.appendChild(el('h2', '', 'Settings'));
    panel.appendChild(el('h4', '', 'Camera & controls'));
    panel.append(
      slider(
        'Camera sensitivity (stick)',
        () => s.cameraSensitivity,
        wrap((v) => (s.cameraSensitivity = v)),
        0.2,
        3,
        0.1,
        (v) => v.toFixed(1),
      ),
      slider(
        'Mouse sensitivity',
        () => s.mouseSensitivity,
        wrap((v) => (s.mouseSensitivity = v)),
        0.2,
        3,
        0.1,
        (v) => v.toFixed(1),
      ),
      toggle(
        'Invert camera Y',
        () => s.invertCameraY,
        wrap((v) => (s.invertCameraY = v)),
      ),
      toggle(
        'Invert aircraft pitch',
        () => s.invertFlightPitch,
        wrap((v) => (s.invertFlightPitch = v)),
      ),
      slider(
        'Stick deadzone',
        () => s.deadzone,
        wrap((v) => (s.deadzone = v)),
        0.05,
        0.35,
        0.01,
        (v) => v.toFixed(2),
      ),
      slider(
        'Camera response curve',
        () => s.responseCurve,
        wrap((v) => (s.responseCurve = v)),
        1,
        3,
        0.1,
        (v) => v.toFixed(1),
      ),
      toggle(
        'Rumble',
        () => s.rumble,
        wrap((v) => (s.rumble = v)),
      ),
      slider(
        'Field of view',
        () => s.fov,
        wrap((v) => (s.fov = v)),
        50,
        95,
        1,
        (v) => `${v.toFixed(0)}°`,
      ),
      button('Remap controls…', this.openRemap),
    );
    panel.appendChild(el('h4', '', 'Graphics'));
    panel.append(
      choice(
        'Quality preset',
        ['low', 'medium', 'high', 'ultra'] as QualityName[],
        () => s.quality,
        (v) => this.onQuality(v),
        QUALITY_NAMES,
      ),
      slider(
        'Day length',
        () => s.dayLengthMinutes,
        wrap((v) => (s.dayLengthMinutes = v)),
        0,
        120,
        4,
        (v) => (v === 0 ? 'frozen' : `${v.toFixed(0)} min`),
      ),
      toggle(
        'Show performance overlay',
        () => s.showFps,
        wrap((v) => (s.showFps = v)),
      ),
    );
    panel.appendChild(el('h4', '', 'Audio'));
    panel.append(
      slider(
        'Master volume',
        () => s.masterVolume,
        wrap((v) => {
          s.masterVolume = v;
          audio.applyVolumes();
        }),
        0,
        1,
        0.05,
        (v) => `${Math.round(v * 100)}%`,
      ),
      slider(
        'Radio volume',
        () => s.musicVolume,
        wrap((v) => {
          s.musicVolume = v;
          audio.applyVolumes();
        }),
        0,
        1,
        0.05,
        (v) => `${Math.round(v * 100)}%`,
      ),
    );
    panel.appendChild(el('h4', '', 'Accessibility'));
    panel.append(
      toggle(
        'Subtitles for briefings',
        () => s.subtitles,
        wrap((v) => (s.subtitles = v)),
      ),
      toggle(
        'Colour-blind safe HUD',
        () => s.colorBlindHud,
        wrap((v) => {
          s.colorBlindHud = v;
          document.body.classList.toggle('cb', v);
        }),
      ),
    );
    panel.appendChild(el('h4', '', 'Data'));
    const reset = button('Reset mission progress and codex', () => {
      if (reset.dataset.armed) {
        resetProgress();
        reset.textContent = 'Progress reset';
        delete reset.dataset.armed;
      } else {
        reset.dataset.armed = '1';
        reset.textContent = 'Press again to confirm reset';
      }
    });
    panel.append(
      reset,
      button('Back', () => this.onBack?.()),
    );
    this.root.appendChild(panel);
  }
}

export class RemapMenu extends Screen {
  private waiting: HTMLElement | null = null;

  constructor(private readonly input: InputManager) {
    super('menu remap');
  }

  private cell(a: Action, kind: 'key' | 'pad'): HTMLButtonElement {
    const cur = kind === 'key' ? this.input.bindings.keys[a]?.[0] : this.input.bindings.pad[a]?.[0];
    const text =
      cur === undefined
        ? '—'
        : kind === 'key'
          ? keyLabel(String(cur))
          : padLabel(Number(cur), this.input.device === 'playstation' ? 'playstation' : 'xbox');
    const b = button(
      text,
      () => {
        if (this.waiting) return;
        this.waiting = b;
        b.textContent = kind === 'key' ? 'Press a key…' : 'Press a button…';
        this.input.captureNext((k, code) => {
          this.waiting = null;
          const cancel = k === 'key' && code === 'Escape';
          if (!cancel && k === kind) this.input.setBinding(a, kind, code);
          this.render();
          this.focus(this.focusIndex);
        });
      },
      'cellbtn',
    );
    return b;
  }

  render(): void {
    this.root.innerHTML = '';
    const panel = el('div', 'menu-panel wide scroll');
    panel.appendChild(el('h2', '', 'Remap controls'));
    panel.appendChild(
      el('p', 'dim', 'Select a cell, then press the new key or controller button. Esc cancels.'),
    );
    const grid = el('div', 'remap-grid');
    grid.append(
      el('div', 'hdr', 'Action'),
      el('div', 'hdr', 'Keyboard / mouse'),
      el('div', 'hdr', 'Controller'),
    );
    for (const a of REMAPPABLE) {
      grid.append(el('div', 'name', ACTION_LABELS[a] ?? a), this.cell(a, 'key'), this.cell(a, 'pad'));
    }
    panel.appendChild(grid);
    panel.append(
      button('Reset to defaults', () => {
        this.input.resetBindings();
        this.render();
      }),
      button('Back', () => this.onBack?.()),
    );
    this.root.appendChild(panel);
  }

  override update(input: InputManager): void {
    if (this.waiting) return; // capture owns the input
    super.update(input);
  }
}
