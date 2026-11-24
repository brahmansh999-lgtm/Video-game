/** On-foot player: Rapier KinematicCharacterController capsule with walk/sprint/jump. */
import * as THREE from 'three';
import { GROUP_PLAYER, RAPIER, type Physics } from '../core/physics';
import { damp } from '../core/rng';
import type { InputManager } from '../input/InputManager';
import { rumble } from '../input/rumble';
import type { Materials } from '../render/materials';
import { SEA_LEVEL } from '../world/layout';
import { buildFigure, poseWalk, type FigureParts } from './figure';

const HALF_H = 0.55;
const RADIUS = 0.35;
const WALK = 4.6;
const SPRINT = 8.8;
const GRAVITY = 24;
const JUMP_V = 7.6;

export class Character {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly figure: FigureParts;
  readonly root: THREE.Group;
  /** camera-relative move intent, set each frame */
  yaw = 0;
  grounded = true;
  speed = 0;
  active = true;
  private readonly ctrl: RAPIER.KinematicCharacterController;
  private vy = 0;
  private readonly vel = new THREE.Vector3();
  private readonly prevP = new THREE.Vector3();
  private readonly currP = new THREE.Vector3();
  private readonly safeP = new THREE.Vector3();
  private readonly desired = { x: 0, y: 0, z: 0 };
  private phase = 0;
  private jumpQueued = false;
  private facing = 0;
  private airTime = 0;
  private inputMag = 0;

  constructor(
    private readonly phys: Physics,
    mats: Materials,
    x: number,
    y: number,
    z: number,
  ) {
    const w = phys.world;
    this.body = w.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + HALF_H + RADIUS, z),
    );
    this.collider = w.createCollider(
      RAPIER.ColliderDesc.capsule(HALF_H, RADIUS).setCollisionGroups(GROUP_PLAYER),
      this.body,
    );
    this.ctrl = w.createCharacterController(0.04);
    this.ctrl.setUp({ x: 0, y: 1, z: 0 });
    this.ctrl.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.ctrl.setMinSlopeSlideAngle((40 * Math.PI) / 180);
    this.ctrl.enableAutostep(0.45, 0.2, true);
    this.ctrl.enableSnapToGround(0.45);
    this.ctrl.setApplyImpulsesToDynamicBodies(true);
    this.figure = buildFigure(mats.cloth[0], mats.skin, mats.cloth[2]);
    this.root = this.figure.root;
    this.currP.set(x, y + HALF_H + RADIUS, z);
    this.prevP.copy(this.currP);
    this.safeP.copy(this.currP);
  }

  frameInput(input: InputManager): void {
    if (input.pressed('jump')) this.jumpQueued = true;
  }

  fixed(dt: number, input: InputManager | null, camYaw: number): void {
    if (!this.active) return;
    let mx = 0;
    let mz = 0;
    let sprint = false;
    if (input) {
      mx = input.move.x;
      mz = input.move.y;
      sprint = input.isDown('sprint');
    }
    this.inputMag = Math.min(1, Math.hypot(mx, mz));
    // camera-relative direction (forward = -z rotated by camera yaw)
    const s = Math.sin(camYaw);
    const c = Math.cos(camYaw);
    const dx = mx * c - mz * s;
    const dz = -mx * s - mz * c;
    const target = (sprint ? SPRINT : WALK) * this.inputMag;
    const k = damp(this.grounded ? 12 : 2.5, dt);
    const len = Math.hypot(dx, dz) || 1;
    this.vel.x += ((dx / len) * target - this.vel.x) * k;
    this.vel.z += ((dz / len) * target - this.vel.z) * k;
    if (this.inputMag > 0.1) this.facing = Math.atan2(-dx, -dz);
    if (this.grounded) {
      this.vy = -1;
      if (this.jumpQueued) {
        this.vy = JUMP_V;
        this.grounded = false;
      }
    } else this.vy -= GRAVITY * dt;
    this.jumpQueued = false;
    this.desired.x = this.vel.x * dt;
    this.desired.y = this.vy * dt;
    this.desired.z = this.vel.z * dt;
    this.ctrl.computeColliderMovement(this.collider, this.desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const mv = this.ctrl.computedMovement();
    const t = this.body.translation();
    const wasGrounded = this.grounded;
    this.grounded = this.ctrl.computedGrounded();
    if (!this.grounded) this.airTime += dt;
    if (this.grounded && !wasGrounded && this.airTime > 0.5) rumble(0.3, 0.2, 90);
    if (this.grounded) this.airTime = 0;
    if (this.vy > 0 && mv.y < this.desired.y * 0.5) this.vy = 0;
    const nx = t.x + mv.x;
    const ny = t.y + mv.y;
    const nz = t.z + mv.z;
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.speed = Math.hypot(mv.x, mv.z) / dt;
    this.prevP.copy(this.currP);
    this.currP.set(nx, ny, nz);
    if (this.grounded && ny > SEA_LEVEL + 1) this.safeP.set(nx, ny + 0.3, nz);
    if (ny < SEA_LEVEL - 1.2) this.teleport(this.safeP.x, this.safeP.y - HALF_H - RADIUS, this.safeP.z);
  }

  render(alpha: number, dt: number): void {
    this.root.position.lerpVectors(this.prevP, this.currP, alpha);
    this.root.position.y -= HALF_H + RADIUS;
    let dr = this.facing - this.root.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    this.root.rotation.y += dr * damp(12, dt);
    this.phase += dt * (2.2 + this.speed * 1.35);
    poseWalk(this.figure, this.phase, Math.min(1, this.speed / 5), !this.grounded);
  }

  /** Feet position (interpolated). */
  position(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.root.position);
  }

  headPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.root.position).setY(this.root.position.y + 1.65);
  }

  teleport(x: number, y: number, z: number): void {
    const p = { x, y: y + HALF_H + RADIUS, z };
    this.body.setTranslation(p, true);
    this.body.setNextKinematicTranslation(p);
    this.currP.set(p.x, p.y, p.z);
    this.prevP.copy(this.currP);
    this.safeP.copy(this.currP);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.root.position.set(x, y, z);
  }

  setActive(on: boolean): void {
    this.active = on;
    this.collider.setEnabled(on);
    this.root.visible = on;
  }

  dispose(): void {
    this.phys.world.removeCharacterController(this.ctrl);
    this.phys.world.removeRigidBody(this.body);
  }
}
