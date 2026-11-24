/** Third-person spring-arm camera with collision avoidance, plus vehicle and aircraft camera modes. */
import * as THREE from 'three';
import { groups, G_STATIC, RAPIER, type Physics } from '../core/physics';
import { clamp, damp } from '../core/rng';
import { settings } from '../core/settings';
import type { InputManager } from '../input/InputManager';

export type AirCam = 'chase' | 'cockpit' | 'wing' | 'orbit';
export const AIR_CAMS: AirCam[] = ['chase', 'cockpit', 'wing', 'orbit'];

const FILTER = groups(0xffff, G_STATIC);

export class CameraRig {
  yaw = 0;
  pitch = -0.15;
  airCam: AirCam = 'chase';
  private dist = 5;
  private lastLookInput = 0;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  private readonly pivot = new THREE.Vector3();
  private readonly want = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly smoothQ = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly lookAtM = new THREE.Matrix4();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private freeYaw = 0;
  private freePitch = 0;

  constructor(
    private readonly phys: Physics,
    private readonly cam: THREE.PerspectiveCamera,
  ) {}

  /** Reads look input; returns true if the player is actively looking. */
  private look(dt: number, input: InputManager): boolean {
    const inv = settings.invertCameraY ? -1 : 1;
    const dx =
      input.look.x * dt * 2.6 * settings.cameraSensitivity +
      input.mouse.x * 0.0024 * settings.mouseSensitivity;
    const dy =
      (input.look.y * dt * 1.9 * settings.cameraSensitivity +
        input.mouse.y * 0.0024 * settings.mouseSensitivity) *
      inv;
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -1.35, 1.1);
    const active = Math.abs(dx) + Math.abs(dy) > 1e-4;
    if (active) this.lastLookInput = 0;
    return active;
  }

  private spring(pivot: THREE.Vector3, dist: number, dt: number, exclude: RAPIER.RigidBody | null): void {
    this.dir.set(0, 0, 1).applyEuler(this.e.set(this.pitch, this.yaw, 0, 'YXZ'));
    this.ray.origin.x = pivot.x;
    this.ray.origin.y = pivot.y;
    this.ray.origin.z = pivot.z;
    this.ray.dir.x = this.dir.x;
    this.ray.dir.y = this.dir.y;
    this.ray.dir.z = this.dir.z;
    const hit = this.phys.world.castRay(
      this.ray,
      dist + 0.4,
      true,
      undefined,
      FILTER,
      undefined,
      exclude ?? undefined,
    );
    const target = hit ? Math.max(0.6, hit.timeOfImpact - 0.4) : dist;
    // pull in fast, ease out slowly
    this.dist += (target - this.dist) * damp(target < this.dist ? 25 : 3, dt);
    this.want.copy(pivot).addScaledVector(this.dir, this.dist);
    this.cam.position.copy(this.want);
    this.cam.lookAt(pivot);
  }

  foot(dt: number, input: InputManager, head: THREE.Vector3, aiming: boolean): void {
    this.look(dt, input);
    this.pivot.copy(head);
    const right = this.tmp.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (aiming) this.pivot.addScaledVector(right, 0.7);
    this.spring(this.pivot, aiming ? 2.4 : 4.6, dt, null);
    this.cam.fov += ((aiming ? settings.fov - 18 : settings.fov) - this.cam.fov) * damp(8, dt);
  }

  car(
    dt: number,
    input: InputManager,
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    speed: number,
    lookBack: boolean,
    body: RAPIER.RigidBody,
  ): void {
    const active = this.look(dt, input);
    this.lastLookInput += dt;
    this.e.setFromQuaternion(quat, 'YXZ');
    const carYaw = this.e.y + (lookBack ? Math.PI : 0);
    if (!active && (this.lastLookInput > 1.2 || lookBack)) {
      let d = carYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * damp(lookBack ? 20 : 3.5, dt);
      this.pitch += (-0.18 - this.pitch) * damp(2, dt);
    }
    this.pivot.copy(pos).setY(pos.y + 1.6);
    this.spring(this.pivot, 7 + Math.min(speed, 60) * 0.04, dt, body);
    this.cam.fov += (settings.fov + Math.min(speed, 70) * 0.18 - this.cam.fov) * damp(4, dt);
  }

  cycleAirCam(): AirCam {
    const i = (AIR_CAMS.indexOf(this.airCam) + 1) % AIR_CAMS.length;
    this.airCam = AIR_CAMS[i];
    this.freeYaw = 0;
    this.freePitch = 0;
    return this.airCam;
  }

  air(
    dt: number,
    input: InputManager,
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    span: number,
    length: number,
    lookBack: boolean,
    body: RAPIER.RigidBody,
  ): void {
    const fov = settings.fov + 5;
    if (this.airCam === 'orbit') {
      this.look(dt, input);
      this.pivot.copy(pos);
      this.spring(this.pivot, length * 2.4 + 6, dt, body);
      this.cam.fov += (fov - this.cam.fov) * damp(4, dt);
      return;
    }
    // free-look offsets for cockpit / chase
    const inv = settings.invertCameraY ? -1 : 1;
    this.freeYaw -= input.look.x * dt * 2.4 + input.mouse.x * 0.0024;
    this.freePitch = clamp(
      this.freePitch - (input.look.y * dt * 1.8 + input.mouse.y * 0.0024) * inv,
      -1.2,
      1.2,
    );
    if (
      Math.abs(input.look.x) + Math.abs(input.look.y) < 0.01 &&
      input.mouse.x === 0 &&
      input.mouse.y === 0
    ) {
      this.freeYaw += (0 - this.freeYaw) * damp(1.5, dt);
      this.freePitch += (0 - this.freePitch) * damp(1.5, dt);
    }
    const yawOff = this.freeYaw + (lookBack ? Math.PI : 0);
    this.smoothQ.slerp(quat, damp(this.airCam === 'chase' ? 6 : 30, dt));
    if (this.airCam === 'chase') {
      // keep the horizon a little steadier than the aircraft
      this.e.setFromQuaternion(this.smoothQ, 'YXZ');
      this.e.z *= 0.5;
      this.q.setFromEuler(this.e);
      this.tmp
        .set(0, length * 0.35 + 1.5, length * 1.6 + 7)
        .applyAxisAngle(this.up, yawOff)
        .applyQuaternion(this.q);
      this.cam.position.copy(pos).add(this.tmp);
      this.tmp.set(0, 1.2, -20).applyAxisAngle(this.up, yawOff).applyQuaternion(this.q).add(pos);
      this.lookAtM.lookAt(this.cam.position, this.tmp, this.up.set(0, 1, 0).applyQuaternion(this.q));
      this.cam.quaternion.setFromRotationMatrix(this.lookAtM);
      this.up.set(0, 1, 0);
    } else {
      const off =
        this.airCam === 'cockpit'
          ? this.tmp.set(0, 0.85, -length * 0.38)
          : this.tmp.set(span * 0.42, 0.6, 0.8);
      this.cam.position.copy(off.applyQuaternion(quat)).add(pos);
      this.e.set(this.freePitch, yawOff, 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.cam.quaternion.copy(quat).multiply(this.q);
    }
    this.cam.fov += (fov - this.cam.fov) * damp(4, dt);
  }

  syncTo(yaw: number): void {
    this.yaw = yaw;
    this.pitch = -0.15;
  }

  resetSmooth(q: THREE.Quaternion): void {
    this.smoothQ.copy(q);
  }
}
