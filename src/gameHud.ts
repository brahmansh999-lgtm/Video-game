/** On-screen HUD orchestration: ground HUD, flight HUD, minimap, waypoint beacon and markers. */
import * as THREE from 'three';
import { events } from './core/events';
import { save } from './core/save';
import type { InputManager } from './input/InputManager';
import type { PlayerController } from './player/playerController';
import type { Materials } from './render/materials';
import { FlightHud } from './ui/flightHud';
import { Hud } from './ui/hud';
import { Minimap, type MapMarker } from './ui/minimap';
import { Aircraft } from './vehicles/aircraft';
import type { Landmark } from './world/landmarks';
import { RUNWAYS } from './world/structures';
import type { WorldData } from './world/worldData';

export class GameHud {
  readonly hud: Hud;
  readonly flight: FlightHud;
  readonly minimap: Minimap;
  /** Player-placed waypoint (from the map). */
  waypoint: THREE.Vector3 | null = null;
  private readonly beacon: THREE.Mesh;
  private readonly markers: MapMarker[];
  private readonly wpMarker: MapMarker = { x: 0, z: 0, color: '#ff5fd2', shape: 'diamond' };
  private readonly fhTarget = new THREE.Vector3();
  private fhLabel = '';
  private visible = true;

  constructor(
    ui: HTMLElement,
    map: HTMLCanvasElement,
    private readonly world: WorldData,
    private readonly landmarks: Landmark[],
    mats: Materials,
    scene: THREE.Scene,
  ) {
    this.hud = new Hud(ui);
    this.flight = new FlightHud(ui);
    this.minimap = new Minimap(ui, map);
    this.markers = landmarks.map((l) => ({
      x: l.pos.x,
      z: l.pos.z,
      color: '#9aa6b2',
      shape: 'dot' as const,
    }));
    this.refreshLandmarks();
    events.on('landmarkDiscovered', () => this.refreshLandmarks());
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 600, 12, 1, true).translate(0, 300, 0),
      mats.marker,
    );
    this.beacon.visible = false;
    this.beacon.frustumCulled = false;
    scene.add(this.beacon);
  }

  private refreshLandmarks(): void {
    this.landmarks.forEach((l, i) => {
      const known = save.codex.includes(l.id);
      this.markers[i].color = known ? '#ffd76a' : '#9aa6b2';
      this.markers[i].shape = known ? 'star' : 'dot';
    });
  }

  setWaypoint(p: THREE.Vector3 | null): void {
    this.waypoint = p;
    if (p) {
      this.wpMarker.x = p.x;
      this.wpMarker.z = p.z;
      if (!this.markers.includes(this.wpMarker)) this.markers.push(this.wpMarker);
      events.emit('toast', { text: 'Waypoint set', ms: 1200 });
    } else {
      const i = this.markers.indexOf(this.wpMarker);
      if (i >= 0) this.markers.splice(i, 1);
    }
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.hud.setVisible(on);
    this.minimap.setVisible(on);
    if (!on) this.flight.hide();
  }

  update(
    dt: number,
    input: InputManager,
    player: PlayerController,
    cam: THREE.PerspectiveCamera,
    status: string,
  ): void {
    const v = player.vehicle;
    const p = player.pos;
    if (this.waypoint) {
      this.beacon.visible = true;
      this.beacon.position.copy(this.waypoint);
      if (Math.hypot(this.waypoint.x - p.x, this.waypoint.z - p.z) < 25 && player.mode !== 'air') {
        this.setWaypoint(null);
        events.emit('toast', { text: 'Waypoint reached', ms: 1400 });
      }
    } else this.beacon.visible = false;
    if (!this.visible) return;
    this.hud.update(input, player.mode, player.candidate, v, status);
    this.minimap.draw(p.x, p.z, player.heading(), this.markers);
    if (v instanceof Aircraft) {
      this.pickFlightTarget(v, p);
      this.flight.draw(dt, v.data, cam, this.fhTarget, this.fhLabel, v.kind);
    } else this.flight.hide();
  }

  /** Waypoint if set; otherwise nearest vertiport (VTOL) or runway threshold (fixed wing). */
  private pickFlightTarget(v: Aircraft, p: THREE.Vector3): void {
    if (this.waypoint) {
      this.fhTarget.copy(this.waypoint);
      this.fhLabel = 'WPT';
      return;
    }
    let best = Infinity;
    if (v.kind === 'vtol') {
      for (const vp of this.world.vertiports) {
        const d = Math.hypot(vp.x - p.x, vp.z - p.z);
        if (d < best && d > 40) {
          best = d;
          this.fhTarget.set(vp.x, vp.y, vp.z);
          this.fhLabel = vp.name;
        }
      }
      return;
    }
    for (const r of RUNWAYS) {
      const names = r.name.split(' / ');
      for (let k = 0; k < 2; k++) {
        const z = k === 0 ? r.z1 : r.z0;
        const d = Math.hypot(r.x - p.x, z - p.z);
        if (d < best && d > 300) {
          best = d;
          this.fhTarget.set(r.x, 2, z);
          this.fhLabel = `RWY ${names[k]}`;
        }
      }
    }
  }
}
