/** Landing gear: ray-cast spring/damper legs with rolling, braking and lateral tyre friction. */
import * as THREE from 'three';
import { groups, G_STATIC, G_VEHICLE, G_TRAFFIC, RAPIER, type Physics } from '../core/physics';
import type { GearLeg } from './aircraftDefs';

const WHEEL_R = 0.28;
const FILTER = groups(0xffff, G_STATIC | G_VEHICLE | G_TRAFFIC);

export class LandingGear {
  readonly contact: boolean[];
  readonly compression: number[];
  contacts = 0;
  private readonly prevComp: number[];
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private readonly mount = new THREE.Vector3();
  private readonly down = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly pv = new THREE.Vector3();
  private readonly f = new THREE.Vector3();
  private readonly rel = new THREE.Vector3();
  private readonly fo = { x: 0, y: 0, z: 0 };
  private readonly po = { x: 0, y: 0, z: 0 };
  private readonly k: number;
  private readonly c: number;
  private readonly maxN: number;

  constructor(
    private readonly legs: GearLeg[],
    mass: number,
  ) {
    this.contact = legs.map(() => false);
    this.compression = legs.map(() => 0);
    this.prevComp = legs.map(() => 0);
    this.k = (mass * 9.81) / (legs.length * 0.16);
    this.c = 2 * Math.sqrt((this.k * mass) / legs.length) * 0.55;
    this.maxN = ((mass * 9.81) / legs.length) * 8;
  }

  /**
   * Applies gear forces. steer: nose-wheel angle (rad), brake: 0..1.
   * Returns the summed normal force for touchdown detection.
   */
  apply(
    phys: Physics,
    body: RAPIER.RigidBody,
    q: THREE.Quaternion,
    pos: THREE.Vector3,
    lin: THREE.Vector3,
    ang: THREE.Vector3,
    steer: number,
    brake: number,
    extended: boolean,
    dt: number,
  ): void {
    this.contacts = 0;
    this.up.set(0, 1, 0).applyQuaternion(q);
    this.down.copy(this.up).negate();
    for (let i = 0; i < this.legs.length; i++) {
      const L = this.legs[i];
      this.contact[i] = false;
      if (!extended) {
        this.compression[i] = 0;
        this.prevComp[i] = 0;
        continue;
      }
      this.mount.set(L.x, L.y, L.z).applyQuaternion(q).add(pos);
      this.ray.origin.x = this.mount.x;
      this.ray.origin.y = this.mount.y;
      this.ray.origin.z = this.mount.z;
      this.ray.dir.x = this.down.x;
      this.ray.dir.y = this.down.y;
      this.ray.dir.z = this.down.z;
      const max = L.len + WHEEL_R;
      const hit = phys.world.castRay(this.ray, max, true, undefined, FILTER, undefined, body);
      if (!hit) {
        this.compression[i] = 0;
        this.prevComp[i] = 0;
        continue;
      }
      const comp = max - hit.timeOfImpact;
      // no damper spike on the first frame of contact; cap rate for stability
      const rate = this.prevComp[i] === 0 ? 0 : Math.max(-6, Math.min(6, (comp - this.prevComp[i]) / dt));
      this.prevComp[i] = comp;
      this.compression[i] = comp;
      this.contact[i] = true;
      this.contacts++;
      const N = Math.min(this.maxN, Math.max(0, this.k * comp + this.c * rate));
      // contact point velocity
      this.rel.copy(this.mount).addScaledVector(this.down, hit.timeOfImpact).sub(pos);
      this.pv.crossVectors(ang, this.rel).add(lin);
      // tyre axes (projected on the ground plane approx = body plane)
      this.fwd.set(-Math.sin(L.steer ? steer : 0), 0, -Math.cos(L.steer ? steer : 0)).applyQuaternion(q);
      this.side.crossVectors(this.fwd, this.up).normalize();
      const vf = this.pv.dot(this.fwd);
      const vs = this.pv.dot(this.side);
      const mu = 0.85;
      const roll = 0.015 + brake * 0.75;
      const fLong = -Math.sign(vf) * Math.min(Math.abs(vf) * 4000, roll * N);
      const fLat = -Math.sign(vs) * Math.min(Math.abs(vs) * 6000, mu * N);
      this.f
        .copy(this.up)
        .multiplyScalar(N)
        .addScaledVector(this.fwd, fLong)
        .addScaledVector(this.side, fLat);
      this.fo.x = this.f.x;
      this.fo.y = this.f.y;
      this.fo.z = this.f.z;
      this.po.x = this.mount.x;
      this.po.y = this.mount.y - L.len * 0.5;
      this.po.z = this.mount.z;
      body.addForceAtPoint(this.fo, this.po, true);
    }
  }
}
