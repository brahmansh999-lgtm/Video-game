/** Owns all player-usable vehicles: spawning, nearest lookup, enter/exit. */
import * as THREE from 'three';
import type { Physics } from '../core/physics';
import type { Materials } from '../render/materials';
import type { WorldData } from '../world/worldData';
import { Aircraft } from './aircraft';
import type { AircraftKind } from './aircraftDefs';
import { AIRCRAFT } from './aircraftDefs';
import { Car } from './car';
import { CARS, type CarClass } from './carDefs';
import type { Vehicle } from './vehicle';

export interface SpawnSpec {
  type: CarClass | AircraftKind;
  x: number;
  z: number;
  yaw: number;
  y?: number;
  tag?: string;
}

/** Parked vehicles across the city. */
export function defaultSpawns(world: WorldData): SpawnSpec[] {
  const list: SpawnSpec[] = [
    { type: 'ev', x: 96, z: 60, yaw: 0, tag: 'start' },
    { type: 'coupe', x: 64, z: 60, yaw: 0 },
    { type: 'coupe', x: -620, z: 1128, yaw: Math.PI / 2, tag: 'race' },
    { type: 'offroad', x: -1440, z: -770, yaw: 0 },
    { type: 'ev', x: -870, z: -150, yaw: 0, tag: 'gardens' },
    { type: 'offroad', x: 960, z: 920, yaw: Math.PI / 2 },
    { type: 'ev', x: 520, z: -12, yaw: Math.PI / 2 },
    { type: 'plane', x: 1240, z: -40, yaw: Math.PI / 2, tag: 'apron-plane' },
    { type: 'jet', x: 1245, z: 60, yaw: Math.PI / 2, tag: 'apron-jet' },
    { type: 'vtol', x: 1240, z: -150, yaw: Math.PI / 2, tag: 'apron-vtol' },
  ];
  world.vertiports.forEach((v, i) =>
    list.push({ type: 'vtol', x: v.x, z: v.z, y: v.y, yaw: i * 0.7, tag: `vp-${i}` }),
  );
  return list;
}

export class VehicleManager {
  readonly vehicles: Vehicle[] = [];
  readonly tags = new Map<string, Vehicle>();
  readonly group = new THREE.Group();
  private readonly tmp = new THREE.Vector3();
  wind = new THREE.Vector3();

  constructor(
    private readonly phys: Physics,
    private readonly mats: Materials,
    private readonly world: WorldData,
  ) {}

  spawn(s: SpawnSpec): Vehicle {
    const y = s.y ?? this.world.terrain.heightAt(s.x, s.z);
    let v: Vehicle;
    if (s.type === 'plane' || s.type === 'jet' || s.type === 'vtol') {
      const paint =
        this.mats.paints.find((p) => p.color.getHex() === AIRCRAFT[s.type as AircraftKind].paint) ??
        this.mats.paints[0];
      const a = new Aircraft(this.phys, s.type, this.mats, paint, s.x, y, s.z, s.yaw, (x, z) =>
        this.world.terrain.heightAt(x, z),
      );
      a.wind = this.wind;
      v = a;
    } else {
      const def = CARS[s.type];
      const paint = this.mats.paints[(this.vehicles.length * 3) % this.mats.paints.length];
      v = new Car(this.phys, def, this.mats, paint, s.x, y, s.z, s.yaw);
    }
    this.vehicles.push(v);
    if (s.tag) this.tags.set(s.tag, v);
    this.group.add(v.root);
    return v;
  }

  remove(v: Vehicle): void {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
    for (const [k, t] of this.tags) if (t === v) this.tags.delete(k);
    v.dispose();
  }

  nearest(p: THREE.Vector3, maxDist: number): Vehicle | null {
    let best: Vehicle | null = null;
    let bd = maxDist;
    for (const v of this.vehicles) {
      const t = v.body.translation();
      this.tmp.set(t.x, t.y, t.z);
      // measure to the hull surface roughly: subtract a size allowance
      const allowance = v.kind === 'car' ? 2.2 : v.kind === 'plane' ? 3.5 : v.kind === 'jet' ? 6 : 3;
      const d = this.tmp.distanceTo(p) - allowance;
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  fixed(dt: number, driven: Vehicle | null, input: Parameters<Vehicle['fixed']>[1]): void {
    for (const v of this.vehicles) v.fixed(dt, v === driven ? input : null);
  }

  render(alpha: number, dt: number): void {
    for (const v of this.vehicles) v.render(alpha, dt);
  }
}
