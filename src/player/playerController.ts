/** Player state machine: on foot / driving / flying, enter-exit, cameras and respawns. */
import * as THREE from 'three';
import { events } from '../core/events';
import type { Physics } from '../core/physics';
import type { InputManager } from '../input/InputManager';
import { rumble } from '../input/rumble';
import type { Materials } from '../render/materials';
import { Aircraft } from '../vehicles/aircraft';
import { Car } from '../vehicles/car';
import type { Vehicle } from '../vehicles/vehicle';
import type { VehicleManager } from '../vehicles/vehicleManager';
import type { CarClass } from '../vehicles/carDefs';
import type { FleeingDrivers } from '../world/life/fleeingDrivers';
import type { Traffic } from '../world/life/traffic';
import type { WorldData } from '../world/worldData';

const STEAL_REACH = 3.2;
const STOLEN_CLASSES: CarClass[] = ['ev', 'ev', 'coupe', 'offroad'];
import { CameraRig } from './cameraRig';
import { Character } from './character';

export type PlayerMode = 'foot' | 'car' | 'air';

export class PlayerController {
  readonly character: Character;
  readonly rig: CameraRig;
  vehicle: Vehicle | null = null;
  mode: PlayerMode = 'foot';
  /** Vehicle within reach (for the enter prompt). */
  candidate: Vehicle | null = null;
  /** Traffic car index that can be carjacked right now, or -1. */
  stealable = -1;
  /** City traffic and the pool of fleeing drivers (set by the game once city life exists). */
  carjack: { traffic: Traffic; drivers: FleeingDrivers } | null = null;
  private stealCount = 0;
  /** When set, the player cannot leave the current vehicle (mission rule). */
  lockVehicle = false;
  readonly pos = new THREE.Vector3();
  readonly head = new THREE.Vector3();
  respawnPoint = new THREE.Vector3(80, 0, 80);
  respawnYaw = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private crashTimer = 0;
  private readonly eul = new THREE.Euler();
  /** Latest impact strength (consumed by audio). */
  impact = 0;

  constructor(
    private readonly phys: Physics,
    mats: Materials,
    private readonly cam: THREE.PerspectiveCamera,
    private readonly vehicles: VehicleManager,
    private readonly world: WorldData,
    scene: THREE.Scene,
  ) {
    this.character = new Character(phys, mats, 80, world.terrain.heightAt(80, 80), 80);
    scene.add(this.character.root);
    this.rig = new CameraRig(phys, cam);
    events.on('crash', ({ reason }) => {
      events.emit('toast', { text: `CRASH — ${reason}`, ms: 2500 });
      this.crashTimer = 2.2;
    });
    for (const v of vehicles.vehicles) this.hookImpact(v);
  }

  hookImpact(v: Vehicle): void {
    v.onImpact = (s) => {
      if (v === this.vehicle) {
        rumble(s, s * 0.6, 120 + s * 200);
        this.impact = Math.max(this.impact, s);
      }
    };
  }

  /** Frame-rate input handling: enter/exit, camera modes, discrete vehicle actions. */
  frameInput(input: InputManager): void {
    if (this.mode === 'foot') {
      this.character.frameInput(input);
      this.candidate = this.vehicles.nearest(this.pos, 3);
      this.stealable =
        !this.candidate && this.carjack ? this.carjack.traffic.stealable(this.pos, STEAL_REACH) : -1;
      if (input.pressed('enterExit')) {
        if (this.candidate) this.enter(this.candidate);
        else if (this.stealable >= 0) this.steal(this.stealable);
      }
      return;
    }
    const v = this.vehicle;
    if (!v) return;
    v.frameInput(input);
    if (this.mode === 'air' && input.pressed('cameraMode')) {
      const c = this.rig.cycleAirCam();
      events.emit('toast', { text: `Camera: ${c}`, ms: 900 });
    }
    // exit: Y / F. For aircraft on keyboard F is also throttle-down, so exit only when landed & stopped.
    if (input.pressed('enterExit') && !this.lockVehicle) {
      if (v.canExit()) this.exit();
      else if (this.mode === 'air') events.emit('toast', { text: 'Land and stop to exit', ms: 1200 });
      else events.emit('toast', { text: 'Slow down to exit', ms: 1000 });
    }
  }

  enter(v: Vehicle): void {
    this.vehicle = v;
    v.driven = true;
    this.mode = v.kind === 'car' ? 'car' : 'air';
    this.character.setActive(false);
    const r = v.body.rotation();
    this.q.set(r.x, r.y, r.z, r.w);
    this.rig.resetSmooth(this.q);
    events.emit('vehicleEntered', { kind: v.kind });
  }

  /** Carjack traffic car i: swap it for a drivable car, throw the driver out and get in. */
  steal(i: number): void {
    const cj = this.carjack;
    if (!cj) return;
    const c = cj.traffic.take(i);
    const type = STOLEN_CLASSES[this.stealCount++ % STOLEN_CLASSES.length];
    const v = this.vehicles.spawn({ type, x: c.x, y: c.y, z: c.z, yaw: c.yaw, paint: c.color, stolen: true });
    this.hookImpact(v);
    // driver leaves through the left door and runs away from the player
    const s = Math.sin(c.yaw);
    const co = Math.cos(c.yaw);
    const lx = c.x - co * 1.5;
    const lz = c.z + s * 1.5;
    let fx = lx - this.pos.x;
    let fz = lz - this.pos.z;
    if (Math.hypot(fx, fz) < 0.5) {
      fx = -co;
      fz = s;
    }
    // bias away from the road (out of the left door) so they do not run into traffic
    cj.drivers.spawn(lx, c.y, lz, fx - co * 1.5, fz + s * 1.5);
    this.enter(v);
    rumble(0.35, 0.2, 120);
    events.emit('toast', { text: `Carjacked — ${v.name}`, ms: 1800 });
  }

  exit(): void {
    const v = this.vehicle;
    if (!v) return;
    v.exitPosition(this.tmp);
    const g = this.world.terrain.heightAt(this.tmp.x, this.tmp.z);
    const y = Math.max(g, this.tmp.y - 0.5);
    v.driven = false;
    this.vehicle = null;
    this.mode = 'foot';
    this.character.setActive(true);
    this.character.teleport(this.tmp.x, y, this.tmp.z);
    events.emit('vehicleExited', {});
  }

  /** Forcefully place the player (mission start / respawn). */
  placeOnFoot(x: number, z: number, yaw: number, y?: number): void {
    if (this.vehicle) {
      this.vehicle.driven = false;
      this.vehicle = null;
    }
    this.mode = 'foot';
    this.character.setActive(true);
    this.character.teleport(x, y ?? this.world.terrain.heightAt(x, z), z);
    this.rig.syncTo(yaw);
  }

  placeInVehicle(v: Vehicle): void {
    if (this.vehicle && this.vehicle !== v) this.vehicle.driven = false;
    this.enter(v);
  }

  fixed(dt: number, input: InputManager | null): void {
    if (this.mode === 'foot') this.character.fixed(dt, input, this.rig.yaw);
  }

  /** Per-frame camera + interpolation. */
  frame(dt: number, alpha: number, input: InputManager): void {
    if (this.mode === 'foot') {
      this.character.render(alpha, dt);
      this.character.position(this.pos);
      this.character.headPosition(this.head);
      this.rig.foot(dt, input, this.head, input.isDown('aim'));
    } else if (this.vehicle) {
      const v = this.vehicle;
      this.pos.copy(v.root.position);
      this.head.copy(this.pos);
      if (v instanceof Car) {
        this.rig.car(dt, input, v.root.position, v.root.quaternion, v.speed(), v.lookBack, v.body);
        if (v.sunk) this.respawnVehicle(v);
      } else if (v instanceof Aircraft) {
        this.rig.air(
          dt,
          input,
          v.root.position,
          v.root.quaternion,
          v.def.b,
          v.def.hull[2] * 2,
          v.lookBack,
          v.body,
        );
      }
    }
    this.cam.updateProjectionMatrix();
    if (this.crashTimer > 0) {
      this.crashTimer -= dt;
      if (this.crashTimer <= 0) this.respawnAfterCrash();
    }
  }

  private respawnVehicle(v: Vehicle): void {
    const n = this.world.roads.nodes[this.world.roads.nearestNode(this.pos.x, this.pos.z, true)];
    v.reset(n.x, n.y + 0.5, n.z, 0);
    events.emit('toast', { text: 'Vehicle recovered', ms: 1200 });
  }

  /** After a crash, respawn at the nearest vertiport (aircraft) or a road (car). */
  respawnAfterCrash(): void {
    const v = this.vehicle;
    if (v instanceof Aircraft) {
      const vp = this.nearestVertiport(this.pos);
      if (v.kind === 'vtol') {
        v.reset(vp.x, vp.y, vp.z, 0);
      } else {
        v.reset(1300, 0, 380, 0);
      }
      events.emit('toast', {
        text: v.kind === 'vtol' ? `Respawned at ${vp.name}` : 'Respawned on runway 36L',
        ms: 2000,
      });
      return;
    }
    if (v) this.respawnVehicle(v);
  }

  nearestVertiport(p: THREE.Vector3): WorldData['vertiports'][number] {
    let best = this.world.vertiports[0];
    let bd = 1e18;
    for (const vp of this.world.vertiports) {
      const d = (vp.x - p.x) ** 2 + (vp.z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = vp;
      }
    }
    return best;
  }

  heading(): number {
    if (this.mode === 'foot') return this.rig.yaw;
    if (this.vehicle) {
      return this.eul.setFromQuaternion(this.vehicle.root.quaternion, 'YXZ').y;
    }
    return 0;
  }

  speed(): number {
    return this.vehicle ? this.vehicle.speed() : this.character.speed;
  }

  get physics(): Physics {
    return this.phys;
  }
}
