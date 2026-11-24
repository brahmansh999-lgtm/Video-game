/** Common vehicle contract and render interpolation helper. */
import * as THREE from 'three';
import type { RAPIER } from '../core/physics';
import type { InputManager } from '../input/InputManager';

export type VehicleKind = 'car' | 'plane' | 'jet' | 'vtol';

export interface Telemetry {
  speed: number;
  rpm: number;
  gear: number;
  throttle: number;
}

export interface Vehicle {
  readonly kind: VehicleKind;
  readonly name: string;
  readonly root: THREE.Object3D;
  readonly body: RAPIER.RigidBody;
  driven: boolean;
  /** Called every frame while driven, for edge-triggered actions. */
  frameInput(input: InputManager): void;
  fixed(dt: number, input: InputManager | null): void;
  render(alpha: number, dt: number): void;
  speed(): number;
  canExit(): boolean;
  exitPosition(out: THREE.Vector3): THREE.Vector3;
  reset(x: number, y: number, z: number, yaw: number): void;
  /** Impact callback (strength 0..1). */
  onImpact: ((strength: number) => void) | null;
  telemetry(): Telemetry;
  dispose(): void;
}

export class BodyInterp {
  readonly prevP = new THREE.Vector3();
  readonly currP = new THREE.Vector3();
  readonly prevQ = new THREE.Quaternion();
  readonly currQ = new THREE.Quaternion();

  snap(body: RAPIER.RigidBody): void {
    const t = body.translation();
    const r = body.rotation();
    this.currP.set(t.x, t.y, t.z);
    this.currQ.set(r.x, r.y, r.z, r.w);
    this.prevP.copy(this.currP);
    this.prevQ.copy(this.currQ);
  }

  push(body: RAPIER.RigidBody): void {
    this.prevP.copy(this.currP);
    this.prevQ.copy(this.currQ);
    const t = body.translation();
    const r = body.rotation();
    this.currP.set(t.x, t.y, t.z);
    this.currQ.set(r.x, r.y, r.z, r.w);
  }

  apply(obj: THREE.Object3D, alpha: number): void {
    obj.position.lerpVectors(this.prevP, this.currP, alpha);
    obj.quaternion.slerpQuaternions(this.prevQ, this.currQ, alpha);
  }
}

/** Shared yaw quaternion helper (no allocation). */
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
export function yawQuat(yaw: number): { x: number; y: number; z: number; w: number } {
  _q.setFromAxisAngle(_up, yaw);
  return { x: _q.x, y: _q.y, z: _q.z, w: _q.w };
}
