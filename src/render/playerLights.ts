/**
 * Real light sources that follow the player after dark: headlights on the driven car, a
 * landing light on aircraft, and a soft fill light around the player on foot. A fixed set of
 * two lights is reused so shaders never recompile when switching vehicles.
 */
import * as THREE from 'three';
import type { PlayerController } from '../player/playerController';

const HEAD_CAR = 70;
const HEAD_AIR = 140;
const FILL_FOOT = 3.2;
const FILL_CAR = 2.2;

export class PlayerLights {
  readonly group = new THREE.Group();
  private readonly spot = new THREE.SpotLight(0xfff0d6, 0, 120, 0.5, 0.55, 1);
  private readonly fill = new THREE.PointLight(0xffe4bf, 0, 30, 1);
  private readonly target = new THREE.Object3D();
  private readonly v = new THREE.Vector3();

  constructor() {
    this.spot.target = this.target;
    this.spot.castShadow = false;
    this.group.add(this.spot, this.fill, this.target);
  }

  update(player: PlayerController, night: number): void {
    const k = THREE.MathUtils.smoothstep(night, 0.15, 0.7);
    const veh = player.vehicle;
    if (k <= 0) {
      this.spot.intensity = 0;
      this.fill.intensity = 0;
      return;
    }
    if (!veh) {
      this.spot.intensity = 0;
      this.fill.intensity = FILL_FOOT * k;
      this.fill.position.copy(player.pos).y += 2.6;
      return;
    }
    const root = veh.root;
    root.updateMatrixWorld();
    const air = veh.kind !== 'car';
    // lamp just ahead of the nose, aimed forward and a little down
    this.spot.position.copy(
      this.v.set(0, air ? -0.4 : 0.15, air ? -3.5 : -2.4).applyMatrix4(root.matrixWorld),
    );
    this.target.position.copy(
      this.v.set(0, air ? -12 : -1.6, air ? -60 : -22).applyMatrix4(root.matrixWorld),
    );
    this.spot.angle = air ? 0.38 : 0.62;
    this.spot.distance = air ? 300 : 120;
    this.spot.intensity = (air ? HEAD_AIR : HEAD_CAR) * k;
    // fill sits ahead of the nose (not over the roof) so it lights the road without glare on the car
    this.fill.intensity = (air ? 0 : FILL_CAR) * k;
    this.fill.position.copy(this.v.set(0, 3, -9).applyMatrix4(root.matrixWorld));
  }
}
