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
  /** Paint colour (hex); matched against the shared paints when possible. */
  paint?: number;
  /** Carjacked from traffic: only a few are kept alive at once. */
  stolen?: boolean;
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

/** Stolen cars kept in the world at once; the oldest abandoned one is removed beyond this. */
const MAX_STOLEN = 4;

export class VehicleManager {
  readonly vehicles: Vehicle[] = [];
  readonly tags = new Map<string, Vehicle>();
  readonly group = new THREE.Group();
  private readonly stolen: Vehicle[] = [];
  private readonly paintCache = new Map<number, THREE.Material>();
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
      const paint =
        s.paint !== undefined
          ? this.paintFor(s.paint)
          : this.mats.paints[(this.vehicles.length * 3) % this.mats.paints.length];
      v = new Car(this.phys, def, this.mats, paint, s.x, y, s.z, s.yaw);
    }
    this.vehicles.push(v);
    if (s.tag) this.tags.set(s.tag, v);
    if (s.stolen) {
      this.stolen.push(v);
      this.pruneStolen();
    }
    this.group.add(v.root);
    return v;
  }

  private paintFor(hex: number): THREE.Material {
    const shared = this.mats.paints.find((p) => p.color.getHex() === hex);
    if (shared) return shared;
    let m = this.paintCache.get(hex);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.3, metalness: 0.6 });
      this.paintCache.set(hex, m);
    }
    return m;
  }

  /** Drop the oldest abandoned stolen cars so carjacking cannot pile up physics bodies. */
  private pruneStolen(): void {
    for (let i = 0; this.stolen.length > MAX_STOLEN && i < this.stolen.length;) {
      const v = this.stolen[i];
      if (v.driven) i++;
      else {
        this.stolen.splice(i, 1);
        this.remove(v);
      }
    }
  }

  remove(v: Vehicle): void {
    const si = this.stolen.indexOf(v);
    if (si >= 0) this.stolen.splice(si, 1);
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
