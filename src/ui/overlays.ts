/** Small always-available overlays: toasts, performance overlay, debug controls hint. */
import type * as THREE from 'three';
import { events } from '../core/events';
import type { InputManager } from '../input/InputManager';

function div(cls: string, parent: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  parent.appendChild(d);
  return d;
}

export class Toasts {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = div('toasts', parent);
    events.on('toast', ({ text, ms }) => this.show(text, ms ?? 2200));
  }

  show(text: string, ms: number): void {
    if (!text) return;
    const t = div('toast', this.root);
    t.textContent = text;
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  }
}

export class PerfOverlay {
  private readonly root: HTMLDivElement;
  visible = false;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.root = div('perf hidden', parent);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle('hidden', !this.visible);
  }

  update(dt: number, fps: number, frameMs: number, r: THREE.WebGLRenderer, extra: string): void {
    if (!this.visible) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const i = r.info;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    this.root.textContent =
      `FPS ${fps.toFixed(0)}  (${frameMs.toFixed(1)} ms)\n` +
      `Draw calls ${i.render.calls}\nTriangles ${(i.render.triangles / 1000).toFixed(0)}k\n` +
      `Geometries ${i.memory.geometries}  Textures ${i.memory.textures}\n` +
      (mem ? `JS heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB\n` : '') +
      extra;
  }
}

export class ControlsHint {
  private readonly root: HTMLDivElement;
  private lastDevice = '';

  constructor(parent: HTMLElement) {
    this.root = div('hint', parent);
  }

  update(input: InputManager, status: string): void {
    const key = input.device + status;
    if (key === this.lastDevice) return;
    this.lastDevice = key;
    const g = (a: Parameters<InputManager['glyph']>[0]): string => input.glyph(a);
    const pad = input.device !== 'keyboard';
    const move = pad ? '<span class="glyph g-pad">L</span>' : '<span class="glyph g-key">WASD</span>';
    const look = pad ? '<span class="glyph g-pad">R</span>' : '<span class="glyph g-key">Mouse</span>';
    this.root.innerHTML =
      `<b>Debug fly camera</b><br>${move} fly &nbsp; ${look} look &nbsp; ${g('sprint')} boost<br>` +
      `${g('throttleUp')} up &nbsp; ${g('throttleDown')} down<br>` +
      `${g('yawLeft')}/${g('yawRight')} time of day &nbsp; ${g('cameraMode')} quality<br>` +
      `${g('vision')} gamepad test &nbsp; ${pad ? '<span class="glyph g-pad">L3+R3</span>' : g('perf')} perf<br>` +
      `<span class="status">${status}</span>`;
  }
}
