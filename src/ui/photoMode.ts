/**
 * Photo mode: free camera (sticks / WASD + mouse, triggers or R/F for height), a side panel
 * navigated with the D-pad / arrow keys (FOV, depth of field, time of day, filter), capture
 * (unlocks landmarks in view and in range) and PNG export.
 */
import * as THREE from 'three';
import { audio } from '../audio/audioEngine';
import { events } from '../core/events';
import { discover, persist, save } from '../core/save';
import type { InputManager } from '../input/InputManager';
import { FreeCam } from '../player/freeCam';
import type { PhotoFilter, Renderer } from '../render/renderer';
import type { Atmosphere } from '../render/sky';
import type { Landmark } from '../world/landmarks';
import { Screen, button, choice, el, slider, toggle } from './menu';

const FILTERS: PhotoFilter[] = ['none', 'mono', 'warm', 'cool', 'vivid'];

export class PhotoMode extends Screen {
  active = false;
  private readonly cam = new FreeCam();
  private fov = 55;
  private dof = false;
  private focusDist = 60;
  private blur = 3;
  private filter: PhotoFilter = 'none';
  private panelHidden = false;
  private readonly flash: HTMLDivElement;
  private readonly v = new THREE.Vector3();
  onExit: (() => void) | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly r: Renderer,
    private readonly atmos: Atmosphere,
    private readonly landmarks: Landmark[],
    private readonly groundAt: (x: number, z: number) => number,
  ) {
    super('photo-panel');
    this.strictNav = true;
    this.onBack = () => this.exit();
    this.flash = el('div', 'photo-flash hidden');
    parent.appendChild(this.flash);
  }

  render(): void {
    this.root.innerHTML = '';
    this.root.appendChild(el('h3', '', 'Photo mode'));
    this.root.append(
      slider(
        'Field of view',
        () => this.fov,
        (v) => (this.fov = v),
        20,
        100,
        1,
        (v) => `${v.toFixed(0)}°`,
      ),
      toggle(
        'Depth of field',
        () => this.dof,
        (v) => {
          this.dof = v;
          this.r.setDof(v);
        },
      ),
      slider(
        'Focus distance',
        () => this.focusDist,
        (v) => (this.focusDist = v),
        2,
        800,
        2,
        (v) => `${v.toFixed(0)} m`,
      ),
      slider(
        'Blur',
        () => this.blur,
        (v) => (this.blur = v),
        0.5,
        8,
        0.5,
        (v) => v.toFixed(1),
      ),
      slider(
        'Time of day',
        () => this.atmos.time,
        (v) => (this.atmos.time = v),
        0,
        23.75,
        0.25,
        (v) =>
          `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`,
      ),
      choice(
        'Filter',
        FILTERS,
        () => this.filter,
        (v) => {
          this.filter = v;
          this.r.setFilter(v);
        },
      ),
      button('Capture (discover landmarks)', () => this.capture()),
      button('Save PNG', () => this.savePng()),
      button('Exit photo mode', () => this.exit()),
    );
    this.root.appendChild(
      el('p', 'note', 'D-pad / arrows: panel · sticks / WASD + mouse: camera · X: hide panel'),
    );
  }

  enter(): void {
    this.active = true;
    this.cam.fromCamera(this.r.camera);
    this.fov = Math.round(this.r.camera.fov);
    this.panelHidden = false;
    this.show(this.parent);
    this.r.setDof(this.dof);
    this.r.setFilter(this.filter);
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.hide();
    this.r.setDof(false);
    this.r.setFilter('none');
    this.onExit?.();
  }

  override update(input: InputManager): void {
    super.update(input);
    if (input.pressed('uiAlt')) {
      this.panelHidden = !this.panelHidden;
      this.root.classList.toggle('hidden', this.panelHidden);
    }
    if (input.pressed('photo')) this.exit();
  }

  /** Per-frame camera; returns true while active. */
  frame(dt: number, input: InputManager): void {
    if (!this.active) return;
    this.cam.update(dt, input, this.r.camera, this.groundAt);
    this.r.camera.fov = this.fov;
    this.r.camera.updateProjectionMatrix();
    const coc = this.r.dof.cocMaterial;
    coc.focusDistance = this.focusDist;
    coc.focusRange = Math.max(4, this.focusDist * 0.35);
    this.r.dof.bokehScale = this.blur;
  }

  /** Landmarks in range and inside the frame. */
  private inView(): Landmark[] {
    const cam = this.r.camera;
    cam.updateMatrixWorld();
    const res: Landmark[] = [];
    for (const l of this.landmarks) {
      const d = Math.hypot(l.pos.x - cam.position.x, l.pos.z - cam.position.z);
      if (d > 250 + l.radius * 1.5) continue;
      this.v.copy(l.pos);
      this.v.y += Math.min(l.height * 0.5, 120);
      this.v.project(cam);
      if (this.v.z < 1 && Math.abs(this.v.x) < 0.95 && Math.abs(this.v.y) < 0.95) res.push(l);
    }
    return res;
  }

  capture(): void {
    audio.shutter();
    this.flash.classList.remove('hidden');
    setTimeout(() => this.flash.classList.add('hidden'), 120);
    save.photos++;
    persist();
    const seen = this.inView();
    const ids = seen.map((l) => l.id);
    events.emit('photoTaken', { landmarkIds: ids });
    if (!seen.length) {
      events.emit('toast', { text: 'Photo taken — no landmark in frame and in range' });
      return;
    }
    for (const l of seen) {
      if (discover(l.id)) {
        events.emit('landmarkDiscovered', { id: l.id });
        events.emit('toast', { text: `Landmark discovered: ${l.name} (${save.codex.length}/20)`, ms: 3200 });
      } else events.emit('toast', { text: `Photographed ${l.name}` });
    }
  }

  private savePng(): void {
    const hidden = this.root.classList.contains('hidden');
    this.root.classList.add('hidden');
    const url = this.r.capturePng();
    if (!hidden) this.root.classList.remove('hidden');
    const a = document.createElement('a');
    a.href = url;
    a.download = `flux-city-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    a.click();
    events.emit('toast', { text: 'Saved PNG' });
  }
}
