/** Car built on Rapier's DynamicRayCastVehicleController with an engine/gearbox model. */
import * as THREE from 'three';
import { GROUP_VEHICLE, RAPIER, type Physics } from '../core/physics';
import { clamp, damp, lerp } from '../core/rng';
import type { InputManager } from '../input/InputManager';
import type { Materials } from '../render/materials';
import { SEA_LEVEL } from '../world/layout';
import type { CarDef } from './carDefs';
import { buildCarMesh, type CarVisual } from './meshes';
import { BodyInterp, yawQuat, type Telemetry, type Vehicle } from './vehicle';

const DOWN = { x: 0, y: -1, z: 0 };
const AXLE = { x: -1, y: 0, z: 0 };

export class Car implements Vehicle {
  readonly kind = 'car' as const;
  readonly name: string;
  readonly root: THREE.Group;
  readonly body: RAPIER.RigidBody;
  driven = false;
  onImpact: ((s: number) => void) | null = null;
  horn = false;
  lookBack = false;
  /** True when the car fell into water and needs a respawn. */
  sunk = false;

  private readonly ctrl: RAPIER.DynamicRayCastVehicleController;
  private readonly vis: CarVisual;
  private readonly interp = new BodyInterp();
  private steer = 0;
  private gear = 0;
  private rpm = 800;
  private throttle = 0;
  private braking = false;
  private flippedTime = 0;
  private readonly prevVel = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly wq = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly e = new THREE.Euler();
  private readonly fwd = new THREE.Vector3();
  private readonly force = { x: 0, y: 0, z: 0 };
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(
    private readonly phys: Physics,
    readonly def: CarDef,
    mats: Materials,
    paint: THREE.Material,
    x: number,
    y: number,
    z: number,
    yaw: number,
  ) {
    this.name = def.name;
    const world = phys.world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y + def.wheelRadius + def.suspensionRest + def.hy, z)
        .setRotation(yawQuat(yaw))
        .setLinearDamping(0.05)
        .setAngularDamping(0.6)
        .setCanSleep(true),
    );
    const vol = 8 * def.hx * def.hy * def.hz;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(def.hx, def.hy, def.hz)
        .setDensity(def.mass / vol)
        .setFriction(0.4)
        .setRestitution(0.05)
        .setCollisionGroups(GROUP_VEHICLE),
      this.body,
    );
    this.ctrl = world.createVehicleController(this.body);
    this.ctrl.indexUpAxis = 1;
    this.ctrl.setIndexForwardAxis = 2;
    const wy = -def.hy * 0.4;
    const pts = [
      { x: -def.wheelX, y: wy, z: -def.wheelZ },
      { x: def.wheelX, y: wy, z: -def.wheelZ },
      { x: -def.wheelX, y: wy, z: def.wheelZ },
      { x: def.wheelX, y: wy, z: def.wheelZ },
    ];
    pts.forEach((p, i) => {
      this.ctrl.addWheel(p, DOWN, AXLE, def.suspensionRest, def.wheelRadius);
      this.ctrl.setWheelSuspensionStiffness(i, def.suspensionStiffness);
      this.ctrl.setWheelSuspensionCompression(i, 2.4);
      this.ctrl.setWheelSuspensionRelaxation(i, 3.0);
      this.ctrl.setWheelMaxSuspensionTravel(i, def.suspensionRest * 1.2);
      this.ctrl.setWheelMaxSuspensionForce(i, def.mass * 40);
      this.ctrl.setWheelFrictionSlip(i, def.frictionSlip);
      this.ctrl.setWheelSideFrictionStiffness(i, 1.2);
    });
    this.vis = buildCarMesh(def, mats, paint);
    this.root = this.vis.root;
    this.interp.snap(this.body);
    this.interp.apply(this.root, 1);
  }

  speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  /** Signed forward speed (m/s), positive when moving forward (-Z). */
  forwardSpeed(): number {
    const r = this.body.rotation();
    this.q.set(r.x, r.y, r.z, r.w);
    this.fwd.set(0, 0, -1).applyQuaternion(this.q);
    const v = this.body.linvel();
    return v.x * this.fwd.x + v.y * this.fwd.y + v.z * this.fwd.z;
  }

  frameInput(input: InputManager): void {
    this.horn = input.isDown('horn');
    this.lookBack = input.isDown('lookBack');
  }

  fixed(dt: number, input: InputManager | null): void {
    const d = this.def;
    const fs = this.forwardSpeed();
    let accel = 0;
    let brake = 0;
    let steerIn = 0;
    let hand = false;
    if (input && this.driven) {
      accel = input.value('accelerate');
      brake = input.value('brake');
      steerIn = -input.move.x;
      hand = input.isDown('handbrake');
    }
    // speed-sensitive steering with smoothing
    const maxSteer = d.maxSteer * lerp(1, 0.22, clamp(Math.abs(fs) / 45, 0, 1));
    this.steer += (steerIn * maxSteer - this.steer) * damp(steerIn === 0 ? 9 : 6, dt);
    // gearbox
    const gears = d.gears;
    const top = gears[this.gear];
    const ratio = clamp(Math.abs(fs) / top, 0, 1.05);
    this.rpm = d.idle + ratio * (d.redline - d.idle);
    if (gears.length > 1) {
      if (ratio > 0.93 && this.gear < gears.length - 1) this.gear++;
      else if (this.gear > 0 && Math.abs(fs) < gears[this.gear - 1] * 0.62) this.gear--;
    }
    let drive = 0;
    this.braking = false;
    if (accel > 0.02) {
      const gearMult = gears.length > 1 ? 1 / (1 + this.gear * 0.38) : 1;
      const falloff = 1 - Math.pow(ratio, 6) * (this.gear === gears.length - 1 ? 1 : 0.4);
      drive = accel * d.driveForce * gearMult * Math.max(0, falloff);
      if (fs < -1) {
        brake = Math.max(brake, accel);
        drive = 0;
      }
    }
    if (brake > 0.02) {
      if (fs > 1.5) {
        this.braking = true;
      } else {
        drive = -brake * d.driveForce * 0.45 * (fs < -14 ? 0 : 1);
        brake = 0;
      }
    }
    this.throttle = Math.max(accel, drive < 0 ? brake : 0);
    const per = -drive / (d.allWheelDrive ? 4 : 2);
    for (let i = 0; i < 4; i++) {
      this.ctrl.setWheelEngineForce(i, d.allWheelDrive || i >= 2 ? per : 0);
      this.ctrl.setWheelSteering(i, i < 2 ? this.steer : 0);
      let b = this.braking ? brake * d.brakeForce : 0;
      if (!this.driven && Math.abs(fs) < 2) b = d.brakeForce * 0.5;
      if (hand && i >= 2) b = d.brakeForce * 1.6;
      this.ctrl.setWheelBrake(i, b);
      this.ctrl.setWheelSideFrictionStiffness(i, hand && i >= 2 ? 0.35 : 1.2);
    }
    // aerodynamic drag and downforce
    const v = this.body.linvel();
    const sp = Math.hypot(v.x, v.y, v.z);
    const cd = 0.42;
    this.body.resetForces(true);
    this.force.x = -v.x * sp * cd;
    this.force.y = -sp * sp * (d.id === 'coupe' ? 1.2 : 0.4);
    this.force.z = -v.z * sp * cd;
    this.body.addForce(this.force, true);
    this.ctrl.updateVehicle(dt);
    if (this.driven) this.body.wakeUp();

    // impacts
    this.v.set(v.x, v.y, v.z);
    const dv = this.v.distanceTo(this.prevVel);
    if (dv > 2.8 && this.onImpact) this.onImpact(clamp(dv / 14, 0.15, 1));
    this.prevVel.copy(this.v);

    // self-righting when flipped
    const r = this.body.rotation();
    this.q.set(r.x, r.y, r.z, r.w);
    const upY = 1 - 2 * (r.x * r.x + r.z * r.z);
    if (upY < 0.25 && sp < 3) this.flippedTime += dt;
    else this.flippedTime = 0;
    if (this.flippedTime > 1.5) {
      const t = this.body.translation();
      this.e.setFromQuaternion(this.q, 'YXZ');
      this.reset(t.x, t.y + 1.2, t.z, this.e.y);
    }
    const t = this.body.translation();
    if (t.y < SEA_LEVEL - 1.5) this.sunk = true;
    this.interp.push(this.body);
  }

  render(alpha: number, dt: number): void {
    this.interp.apply(this.root, alpha);
    const d = this.def;
    for (let i = 0; i < 4; i++) {
      const len = this.ctrl.wheelSuspensionLength(i) ?? d.suspensionRest;
      const rot = this.ctrl.wheelRotation(i) ?? 0;
      const x = i % 2 === 0 ? -d.wheelX : d.wheelX;
      const z = i < 2 ? -d.wheelZ : d.wheelZ;
      this.e.set(-rot, i < 2 ? this.steer : 0, 0, 'YXZ');
      this.wq.setFromEuler(this.e);
      this.v.set(x + (i % 2 === 0 ? -0.05 : 0.05), -d.hy * 0.4 - len, z);
      this.m.compose(this.v, this.wq, this.one);
      this.vis.wheels.setMatrixAt(i, this.m);
    }
    this.vis.wheels.instanceMatrix.needsUpdate = true;
    this.vis.brake.visible = this.braking || !this.driven;
    void dt;
  }

  telemetry(): Telemetry {
    return { speed: this.forwardSpeed(), rpm: this.rpm, gear: this.gear + 1, throttle: this.throttle };
  }

  canExit(): boolean {
    return this.speed() < 6;
  }

  exitPosition(out: THREE.Vector3): THREE.Vector3 {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.q.set(r.x, r.y, r.z, r.w);
    out.set(-(this.def.hx + 0.9), 0, 0).applyQuaternion(this.q);
    out.x += t.x;
    out.z += t.z;
    out.y = t.y + 0.5;
    return out;
  }

  reset(x: number, y: number, z: number, yaw: number): void {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation(yawQuat(yaw), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevVel.set(0, 0, 0);
    this.sunk = false;
    this.flippedTime = 0;
    this.interp.snap(this.body);
  }

  dispose(): void {
    this.phys.world.removeVehicleController(this.ctrl);
    this.phys.world.removeRigidBody(this.body);
    this.root.removeFromParent();
  }
}
