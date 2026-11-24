/** City life: traffic, pedestrians, drones / air taxis and maglev trains, scaled by the quality density. */
import * as THREE from 'three';
import type { Physics } from '../../core/physics';
import type { Materials } from '../../render/materials';
import type { WorldData } from '../worldData';
import { Drones } from './drones';
import { FleeingDrivers } from './fleeingDrivers';
import { Maglev } from './maglev';
import { Pedestrians } from './pedestrians';
import { Traffic } from './traffic';

export class Life {
  readonly group = new THREE.Group();
  readonly traffic: Traffic;
  readonly peds: Pedestrians;
  readonly drones: Drones;
  readonly maglev: Maglev;
  readonly drivers: FleeingDrivers;
  /** Positions traffic must not drive into (player, player's vehicle). */
  private readonly obstacles = [new THREE.Vector3(), new THREE.Vector3()];

  constructor(world: WorldData, phys: Physics, mats: Materials) {
    this.traffic = new Traffic(world.roads, world.terrain, phys, mats);
    this.peds = new Pedestrians(world.roads, world.terrain, mats);
    this.drones = new Drones(mats);
    this.maglev = new Maglev(mats);
    this.drivers = new FleeingDrivers(world.terrain, mats);
    this.group.add(
      this.traffic.mesh,
      this.traffic.lights,
      this.traffic.tails,
      this.peds.group,
      this.drones.group,
      this.maglev.mesh,
      this.drivers.group,
    );
  }

  setDensity(d: number): void {
    this.traffic.density = d;
    this.peds.density = d;
  }

  fixed(dt: number, focus: THREE.Vector3, playerVehicle: THREE.Vector3 | null, night: number): void {
    this.obstacles[0].copy(focus);
    if (playerVehicle) this.obstacles[1].copy(playerVehicle);
    else this.obstacles[1].copy(focus);
    this.traffic.fixed(dt, focus, this.obstacles, night);
    this.maglev.update(dt);
  }

  frame(dt: number, focus: THREE.Vector3): void {
    this.peds.update(dt, focus, focus);
    this.drones.update(dt);
    this.drivers.update(dt);
  }
}
