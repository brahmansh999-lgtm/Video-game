/**
 * Full-screen map with a Landmark Codex tab. Map: pan with left stick / WASD / mouse drag,
 * zoom with triggers / wheel / +-, place a waypoint at the cursor with A / click, clear with X.
 * LB / RB (Q / E) switch tabs, B / Esc / Tab closes.
 */
import * as THREE from 'three';
import { save } from '../core/save';
import type { InputManager } from '../input/InputManager';
import { DISTRICT_COLORS, DISTRICT_NAMES, HALF, WORLD, type District } from '../world/layout';
import type { Landmark } from '../world/landmarks';
import type { WorldData } from '../world/worldData';
import { CodexScreen } from './codexScreen';
import { MAP_PX, toMap } from './mapRender';
import { el } from './menu';

export class MapScreen {
  readonly root: HTMLDivElement;
  open = false;
  tab: 'map' | 'codex' = 'map';
  waypoint: THREE.Vector3 | null = null;
  onClose: (() => void) | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly tabs: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly codex: CodexScreen;
  private cx = 0;
  private cz = 0;
  /** metres per screen pixel */
  private mpp = 4;
  private readonly labels: { name: string; x: number; z: number; color: string }[] = [];
  private drag: { x: number; y: number } | null = null;
  private player = { x: 0, z: 0, yaw: 0 };
  private lastHelp = '';

  constructor(
    parent: HTMLElement,
    private readonly map: HTMLCanvasElement,
    private readonly world: WorldData,
    private readonly landmarks: Landmark[],
  ) {
    this.root = el('div', 'mapscreen hidden');
    this.tabs = el('div', 'map-tabs');
    this.canvas = el('canvas', 'map-canvas');
    this.help = el('div', 'map-help');
    this.root.append(this.tabs, this.canvas, this.help);
    parent.appendChild(this.root);
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    this.g = g;
    this.codex = new CodexScreen(landmarks);
    this.codex.onBack = () => this.close();
    // district label anchors (hand-placed: the hills wrap around the city, so centroids mislead)
    const anchors: [District, number, number][] = [
      ['core', 0, 30],
      ['waterfront', -300, 1010],
      ['gardens', -1120, 60],
      ['maglev', 560, -600],
      ['aeroport', 1490, -420],
      ['hills', -500, -1720],
    ];
    for (const [d, x, z] of anchors)
      this.labels.push({ name: DISTRICT_NAMES[d], x, z, color: DISTRICT_COLORS[d] });
    this.canvas.addEventListener('mousedown', (e) => (this.drag = { x: e.clientX, y: e.clientY }));
    window.addEventListener('mouseup', (e) => {
      if (
        this.drag &&
        Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) < 4 &&
        this.open &&
        this.tab === 'map'
      ) {
        this.setWaypointAt(e.clientX, e.clientY);
      }
      this.drag = null;
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.drag || !(e.buttons & 1)) return;
      this.cx -= e.movementX * this.mpp;
      this.cz -= e.movementY * this.mpp;
    });
    this.canvas.addEventListener('wheel', (e) => this.zoom(e.deltaY > 0 ? 1.15 : 0.87), { passive: true });
  }

  show(px: number, pz: number, yaw: number): void {
    this.open = true;
    this.player = { x: px, z: pz, yaw };
    this.cx = px;
    this.cz = pz;
    this.root.classList.remove('hidden');
    this.setTab('map');
  }

  close(): void {
    this.open = false;
    this.codex.hide();
    this.root.classList.add('hidden');
    this.onClose?.();
  }

  private setTab(t: 'map' | 'codex'): void {
    this.tab = t;
    this.tabs.innerHTML = `<span class="${t === 'map' ? 'on' : ''}">Map</span><span class="${t === 'codex' ? 'on' : ''}">Landmark Codex</span>`;
    this.canvas.classList.toggle('hidden', t !== 'map');
    this.help.classList.toggle('hidden', t !== 'map');
    if (t === 'codex') this.codex.show(this.root);
    else this.codex.hide();
  }

  private zoom(k: number): void {
    this.mpp = Math.min(12, Math.max(0.6, this.mpp * k));
  }

  private screenToWorld(sx: number, sy: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [
      this.cx + (sx - r.left - r.width / 2) * this.mpp,
      this.cz + (sy - r.top - r.height / 2) * this.mpp,
    ];
  }

  private setWaypointAt(sx: number, sy: number): void {
    const [x, z] = this.screenToWorld(sx, sy);
    this.waypoint = new THREE.Vector3(x, this.world.terrain.heightAt(x, z), z);
  }

  update(dt: number, input: InputManager): void {
    if (!this.open) return;
    if (input.pressed('uiTabLeft') || input.pressed('uiTabRight'))
      this.setTab(this.tab === 'map' ? 'codex' : 'map');
    if (input.pressed('map') || (this.tab === 'map' && input.pressed('uiBack'))) {
      this.close();
      return;
    }
    if (this.tab === 'codex') {
      this.codex.update(input);
      return;
    }
    const pan = this.mpp * 600 * dt;
    this.cx += (input.move.x + input.look.x) * pan;
    this.cz -= (input.move.y - input.look.y) * pan;
    const z =
      input.value('throttleUp') -
      input.value('throttleDown') +
      (input.isDown('mapZoomIn') ? 1 : 0) -
      (input.isDown('mapZoomOut') ? 1 : 0);
    if (z !== 0) this.zoom(1 - z * dt * 1.5);
    if (input.wheelDelta) this.zoom(input.wheelDelta > 0 ? 1.15 : 0.87);
    if (input.pressed('uiConfirm') || input.pressed('jump')) {
      const r = this.canvas.getBoundingClientRect();
      this.setWaypointAt(r.left + r.width / 2, r.top + r.height / 2);
    }
    if (input.pressed('uiAlt')) this.waypoint = null;
    this.cx = Math.max(-HALF, Math.min(HALF, this.cx));
    this.cz = Math.max(-HALF, Math.min(HALF, this.cz));
    this.draw(input);
  }

  private draw(input: InputManager): void {
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    const g = this.g;
    const s = WORLD / MAP_PX / this.mpp;
    g.fillStyle = '#0d2a3a';
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(W / 2, H / 2);
    g.scale(s, s);
    g.translate(-toMap(this.cx), -toMap(this.cz));
    g.imageSmoothingEnabled = true;
    g.drawImage(this.map, 0, 0);
    g.restore();
    const P = (x: number, z: number): [number, number] => [
      W / 2 + (x - this.cx) / this.mpp,
      H / 2 + (z - this.cz) / this.mpp,
    ];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 15px system-ui';
    for (const l of this.labels) {
      const [x, y] = P(l.x, l.z);
      g.fillStyle = l.color;
      g.fillText(l.name.toUpperCase(), x, y);
    }
    g.font = '600 12px system-ui';
    for (const l of this.landmarks) {
      const known = save.codex.includes(l.id);
      const [x, y] = P(l.pos.x, l.pos.z);
      g.fillStyle = known ? '#ffd76a' : 'rgba(232,243,255,0.55)';
      g.fillText(known ? '★' : '?', x, y);
      if (known && this.mpp < 3) g.fillText(l.name, x, y + 14);
    }
    if (this.waypoint) {
      const [x, y] = P(this.waypoint.x, this.waypoint.z);
      g.fillStyle = '#ff5fd2';
      g.beginPath();
      g.moveTo(x, y - 10);
      g.lineTo(x + 7, y);
      g.lineTo(x, y + 10);
      g.lineTo(x - 7, y);
      g.fill();
    }
    const [px, py] = P(this.player.x, this.player.z);
    g.save();
    g.translate(px, py);
    g.rotate(-this.player.yaw);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(7, 8);
    g.lineTo(0, 4);
    g.lineTo(-7, 8);
    g.fill();
    g.restore();
    // cursor
    g.strokeStyle = '#fff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(W / 2 - 12, H / 2);
    g.lineTo(W / 2 + 12, H / 2);
    g.moveTo(W / 2, H / 2 - 12);
    g.lineTo(W / 2, H / 2 + 12);
    g.stroke();
    const glyph = (a: Parameters<InputManager['glyph']>[0]): string => input.glyph(a);
    const help = `${glyph('uiConfirm')} set waypoint · ${glyph('uiAlt')} clear · ${glyph('uiTabRight')} codex · ${glyph('uiBack')} close · scale ${Math.round(this.mpp * 100)} m / 100 px`;
    if (this.lastHelp !== help) {
      this.lastHelp = help;
      this.help.innerHTML = help;
    }
  }
}
