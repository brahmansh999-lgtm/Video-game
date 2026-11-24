/** Aircraft: aerodynamic model + landing gear + VTOL hover assist, built on a Rapier dynamic body. */
import * as THREE from 'three';
import { events } from '../core/events';
import { GROUP_VEHICLE, RAPIER, type Physics } from '../core/physics';
import { clamp, damp } from '../core/rng';
import { settings } from '../core/settings';
import type { InputManager } from '../input/InputManager';
import { rumble } from '../input/rumble';
import type { Materials } from '../render/materials';
import { RUNWAYS } from '../world/structures';
import { waterLevelAt } from '../world/layout';
import { AIRCRAFT, type AircraftDef, type AircraftKind } from './aircraftDefs';
import { LandingGear } from './aircraftGear';
import { computeAero, newAeroResult, type AeroControls, type AeroState } from './flightModel';
import { buildAircraftMesh, type AircraftVisual } from './aircraftMeshes';
import { BodyInterp, yawQuat, type Telemetry, type Vehicle } from './vehicle';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export interface FlightData {
  airspeed: number;
  altitude: number;
  agl: number;
  vs: number;
  heading: number;
  pitch: number;
  roll: number;
  throttle: number;
  flaps: number;
  gearDown: boolean;
  g: number;
  alpha: number;
  stall: boolean;
  onGround: boolean;
  hover: boolean;
  tilt: number;
  brake: boolean;
}

export class Aircraft implements Vehicle {
  readonly kind: AircraftKind;
  readonly name: string;
  readonly root: THREE.Group;
  readonly body: RAPIER.RigidBody;
  readonly def: AircraftDef;
  driven = false;
  onImpact: ((s: number) => void) | null = null;
  /** shared wind vector (m/s, world) */
  wind = new THREE.Vector3();
  readonly data: FlightData = {
    airspeed: 0,
    altitude: 0,
    agl: 0,
    vs: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    throttle: 0,
    flaps: 0,
    gearDown: true,
    g: 1,
    alpha: 0,
    stall: false,
    onGround: true,
    hover: true,
    tilt: 0,
    brake: true,
  };
  crashed = false;
  lookBack = false;

  private readonly vis: AircraftVisual;
  private readonly gear: LandingGear;
  private readonly interp = new BodyInterp();
  private readonly ctl: AeroControls = {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle: 0,
    flaps: 0,
    gearDown: true,
    thrustDir: new THREE.Vector3(0, 0, -1),
    aeroWeight: 1,
  };
  private readonly st: AeroState = {
    q: new THREE.Quaternion(),
    vel: new THREE.Vector3(),
    angVel: new THREE.Vector3(),
    altitude: 0,
    agl: 0,
    wind: this.wind,
  };
  private readonly res = newAeroResult();
  private readonly pos = new THREE.Vector3();
  private readonly prevVel = new THREE.Vector3();
  private readonly acc = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly e = new THREE.Euler();
  private readonly fo = { x: 0, y: 0, z: 0 };
  private airborneTime = 0;
  private maxAglSinceGround = 0;
  private stallWarnTimer = 0;
  private hoverTargetAlt = 0;
  private hoverYaw = 0;
  private propAngle = 0;
  private strobeT = 0;
  private gearAnim = 1;
  private readonly yawQ = new THREE.Quaternion();
  private readonly invYawQ = new THREE.Quaternion();

  constructor(
    private readonly phys: Physics,
    kind: AircraftKind,
    mats: Materials,
    paint: THREE.Material,
    x: number,
    y: number,
    z: number,
    yaw: number,
    private readonly groundAt: (x: number, z: number) => number,
  ) {
    this.kind = kind;
    this.def = AIRCRAFT[kind];
    this.name = this.def.name;
    const d = this.def;
    const restY = Math.max(...d.gear.map((g) => -g.y + g.len + 0.28)) - 0.16;
    this.body = phys.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y + restY, z)
        .setRotation(yawQuat(yaw))
        .setAdditionalMassProperties(
          d.mass,
          { x: 0, y: 0, z: 0 },
          { x: d.inertia[0], y: d.inertia[1], z: d.inertia[2] },
          { x: 0, y: 0, z: 0, w: 1 },
        )
        .setCanSleep(false)
        .setCcdEnabled(true),
    );
    phys.world.createCollider(
      RAPIER.ColliderDesc.cuboid(d.hull[0], d.hull[1], d.hull[2])
        .setDensity(0)
        .setFriction(0.5)
        .setCollisionGroups(GROUP_VEHICLE),
      this.body,
    );
    const span = d.b / 2;
    phys.world.createCollider(
      RAPIER.ColliderDesc.cuboid(span, 0.12, d.c / 2)
        .setTranslation(0, d.kind === 'jet' ? 0 : 0.4, d.kind === 'jet' ? 1.5 : -0.6)
        .setDensity(0)
        .setCollisionGroups(GROUP_VEHICLE),
      this.body,
    );
    this.gear = new LandingGear(d.gear, d.mass);
    this.vis = buildAircraftMesh(kind, mats, paint);
    this.root = this.vis.root;
    this.data.hover = kind === 'vtol';
    this.ctl.aeroWeight = 1;
    this.interp.snap(this.body);
    this.interp.apply(this.root, 1);
    this.hoverYaw = yaw;
  }

  speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  frameInput(input: InputManager): void {
    const d = this.data;
    if (input.pressed('gear') && !d.onGround) {
      d.gearDown = !d.gearDown;
      events.emit('toast', { text: d.gearDown ? 'Gear down' : 'Gear up', ms: 900 });
    }
    if (input.pressed('flaps')) {
      d.flaps = (d.flaps + 1) % this.def.flapCL.length;
      events.emit('toast', { text: `Flaps ${['UP', '1', 'FULL'][d.flaps]}`, ms: 900 });
    }
    if (this.kind === 'vtol' && input.pressed('hover')) {
      if (!d.hover || d.airspeed < 45) {
        d.hover = !d.hover;
        this.hoverTargetAlt = this.pos.y;
        events.emit('toast', { text: d.hover ? 'VTOL: hover mode' : 'VTOL: forward flight', ms: 1200 });
      } else events.emit('toast', { text: 'Slow below 45 m/s to convert to hover', ms: 1400 });
    }
    this.lookBack = input.isDown('lookBack');
  }

  fixed(dt: number, input: InputManager | null): void {
    const d = this.def;
    const fd = this.data;
    const t = this.body.translation();
    const r = this.body.rotation();
    const lv = this.body.linvel();
    const av = this.body.angvel();
    this.pos.set(t.x, t.y, t.z);
    this.st.q.set(r.x, r.y, r.z, r.w);
    this.st.vel.set(lv.x, lv.y, lv.z);
    this.st.angVel.set(av.x, av.y, av.z);
    const ground = this.groundAt(t.x, t.z);
    this.st.altitude = t.y;
    this.st.agl = Math.max(0, t.y - ground - 1);

    // --- pilot input
    let pitchIn = 0;
    let rollIn = 0;
    let yawIn = 0;
    let thrUp = 0;
    let thrDown = 0;
    let brake = !this.driven;
    if (input && this.driven) {
      const inv = settings.invertFlightPitch ? -1 : 1;
      pitchIn = -input.move.y * inv;
      rollIn = input.move.x;
      yawIn = input.value('yawRight') - input.value('yawLeft');
      thrUp = input.value('throttleUp');
      thrDown = input.value('throttleDown');
      brake =
        input.isDown('wheelBrake') ||
        (thrDown > 0.3 && fd.throttle <= 0.001 && fd.onGround) ||
        (this.kind === 'vtol' && fd.hover && fd.onGround);
    }
    fd.brake = brake;
    if (!(this.kind === 'vtol' && fd.hover))
      fd.throttle = clamp(fd.throttle + (thrUp - thrDown) * dt * 0.7, 0, 1);
    const k = damp(8, dt);
    this.ctl.elevator += (pitchIn - this.ctl.elevator) * k;
    this.ctl.aileron += (rollIn - this.ctl.aileron) * k;
    this.ctl.rudder += (yawIn - this.ctl.rudder) * k;
    this.ctl.flaps = fd.flaps;
    this.ctl.gearDown = fd.gearDown;

    // --- VTOL tilt & hover assist
    if (this.kind === 'vtol') {
      // conversion is scheduled with airspeed so the wing takes over before the rotors tilt away
      const tiltTarget = fd.hover ? 0 : Math.min(1, 0.25 + fd.airspeed / 42);
      fd.tilt += clamp(tiltTarget - fd.tilt, -dt * 0.35, dt * 0.35);
      const a = (fd.tilt * Math.PI) / 2;
      this.ctl.thrustDir.set(0, Math.cos(a), -Math.sin(a));
      this.ctl.aeroWeight = 0.25 + 0.75 * fd.tilt;
    }
    this.ctl.throttle = fd.throttle;
    const hoverW = this.kind === 'vtol' ? 1 - fd.tilt : 0;

    // --- aerodynamics
    computeAero(d, this.st, this.ctl, this.res);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.fo.x = this.res.force.x;
    this.fo.y = this.res.force.y;
    this.fo.z = this.res.force.z;
    this.body.addForce(this.fo, true);
    this.fo.x = this.res.torque.x;
    this.fo.y = this.res.torque.y;
    this.fo.z = this.res.torque.z;
    this.body.addTorque(this.fo, true);
    if (hoverW > 0.01 && this.driven) this.hoverAssist(dt, hoverW, pitchIn, rollIn, yawIn, thrUp - thrDown);

    // --- landing gear
    const steer = fd.airspeed < 35 ? -this.ctl.rudder * 0.5 : 0;
    const wasGround = fd.onGround;
    this.gear.apply(
      this.phys,
      this.body,
      this.st.q,
      this.pos,
      this.st.vel,
      this.st.angVel,
      steer,
      brake ? 1 : 0,
      fd.gearDown,
      dt,
    );
    fd.onGround = this.gear.contacts > 0;
    if (!fd.onGround) {
      this.airborneTime += dt;
      this.maxAglSinceGround = Math.max(this.maxAglSinceGround, this.st.agl);
    }
    if (fd.onGround && !wasGround && this.airborneTime > 1.5 && this.maxAglSinceGround > 4) this.touchdown();
    if (fd.onGround) {
      this.airborneTime = 0;
      this.maxAglSinceGround = 0;
    }

    // --- telemetry
    this.acc.copy(this.st.vel).sub(this.prevVel).divideScalar(dt);
    const dv = this.tmp.copy(this.st.vel).sub(this.prevVel).length();
    this.prevVel.copy(this.st.vel);
    this.tmp2.set(0, 1, 0).applyQuaternion(this.st.q);
    const gLoad = (this.acc.y + 9.81) * this.tmp2.y + this.acc.x * this.tmp2.x + this.acc.z * this.tmp2.z;
    fd.g += (gLoad / 9.81 - fd.g) * damp(10, dt);
    fd.airspeed = this.res.airspeed;
    fd.altitude = t.y;
    fd.agl = this.st.agl;
    fd.vs = lv.y;
    this.e.setFromQuaternion(this.st.q, 'YXZ');
    fd.heading = ((-THREE.MathUtils.radToDeg(this.e.y) % 360) + 360) % 360;
    fd.pitch = THREE.MathUtils.radToDeg(this.e.x);
    fd.roll = THREE.MathUtils.radToDeg(-this.e.z);
    fd.alpha = THREE.MathUtils.radToDeg(this.res.alpha);
    fd.stall = this.res.stall > 0.25 && !fd.onGround && hoverW < 0.5;
    if (fd.stall && this.driven) {
      this.stallWarnTimer -= dt;
      if (this.stallWarnTimer <= 0) {
        rumble(0.6, 0.9, 220);
        this.stallWarnTimer = 0.45;
      }
    }

    // --- crash detection
    if (!this.crashed) {
      const water = waterLevelAt(t.x, t.z);
      if (dv > 13) this.crash('Structural impact');
      else if (t.y < water + 0.3 && ground < water) this.crash('Ditched in the water');
      else if (fd.onGround && Math.abs(fd.roll) > 60) this.crash('Wingtip strike');
      else if (dv > 3 && this.onImpact) this.onImpact(clamp(dv / 13, 0.2, 1));
    }
    this.interp.push(this.body);
  }

  private hoverAssist(
    dt: number,
    w: number,
    pitchIn: number,
    rollIn: number,
    yawIn: number,
    climb: number,
  ): void {
    const fd = this.data;
    const m = this.def.mass;
    if (Math.abs(climb) > 0.05) this.hoverTargetAlt = this.pos.y + climb * 4;
    if (fd.onGround && climb <= 0.05) {
      // settled on a pad: idle the rotors so the gear carries the weight and holds position
      this.hoverTargetAlt = this.pos.y;
      fd.throttle = 0;
      return;
    }
    const vsCmd = clamp((this.hoverTargetAlt - this.pos.y) * 0.9, -6, 6);
    const up = this.tmp2.set(0, 1, 0).applyQuaternion(this.st.q);
    const need = (m * (9.81 + (vsCmd - this.st.vel.y) * 2.2)) / Math.max(0.5, up.y);
    const thr = clamp(need / this.def.maxThrust, 0, 1);
    fd.throttle = thr * w + fd.throttle * (1 - w);
    // attitude hold: stick commands pitch/roll angles
    this.e.setFromQuaternion(this.st.q, 'YXZ');
    const tgtPitch = pitchIn * 0.26;
    const tgtRoll = -rollIn * 0.26;
    if (Math.abs(yawIn) > 0.05) this.hoverYaw = this.e.y - yawIn * 0.6;
    const I = this.def.inertia;
    // angular velocity expressed in the heading (yaw-only) frame
    this.yawQ.setFromAxisAngle(Y_AXIS, this.e.y);
    this.invYawQ.copy(this.yawQ).invert();
    const avL = this.tmp.copy(this.st.angVel).applyQuaternion(this.invYawQ);
    const tx = (tgtPitch - this.e.x) * 9 - avL.x * 4.5;
    const tz = (tgtRoll - this.e.z) * 9 - avL.z * 4.5;
    let dy = this.hoverYaw - this.e.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const ty = dy * 3 - avL.y * 3;
    this.tmp
      .set(tx * I[0], ty * I[1], tz * I[2])
      .applyQuaternion(this.yawQ)
      .multiplyScalar(w);
    this.fo.x = this.tmp.x;
    this.fo.y = this.tmp.y;
    this.fo.z = this.tmp.z;
    this.body.addTorque(this.fo, true);
    // extra translational damping so hovering feels controllable
    const v = this.st.vel;
    this.fo.x = -v.x * m * 0.25 * w;
    this.fo.y = 0;
    this.fo.z = -v.z * m * 0.25 * w;
    this.body.addForce(this.fo, true);
    void dt;
  }

  private touchdown(): void {
    const t = this.body.translation();
    const vs = Math.abs(this.prevVel.y);
    let onRunway = false;
    let centre = 99;
    for (const r of RUNWAYS) {
      if (t.z > r.z0 && t.z < r.z1 && Math.abs(t.x - r.x) < r.width / 2) {
        onRunway = true;
        centre = Math.abs(t.x - r.x);
      }
    }
    const score = clamp(Math.round(100 - vs * 22 - (onRunway ? centre * 2.5 : 40)), 0, 100);
    if (vs > 7.5) {
      this.crash('Hard landing');
      return;
    }
    rumble(Math.min(1, vs / 5), 0.5, 180);
    events.emit('touchdown', { verticalSpeed: vs, centreline: centre, score, onRunway });
  }

  private crash(reason: string): void {
    this.crashed = true;
    rumble(1, 1, 600);
    if (this.onImpact) this.onImpact(1);
    events.emit('crash', { reason });
  }

  render(alpha: number, dt: number): void {
    this.interp.apply(this.root, alpha);
    const fd = this.data;
    this.gearAnim += clamp((fd.gearDown ? 1 : 0) - this.gearAnim, -dt * 0.8, dt * 0.8);
    this.vis.gear.visible = this.gearAnim > 0.05;
    this.vis.gear.scale.y = Math.max(0.05, this.gearAnim);
    this.propAngle += dt * (5 + fd.throttle * 60);
    if (this.vis.prop) this.vis.prop.rotation.z = this.propAngle;
    for (const r of this.vis.rotors) r.rotation.x = (-fd.tilt * Math.PI) / 2;
    // anti-collision strobes: double flash every 1.4 s
    this.strobeT = (this.strobeT + dt) % 1.4;
    const on = this.strobeT < 0.06 || (this.strobeT > 0.16 && this.strobeT < 0.22);
    for (const s of this.vis.strobes) s.visible = on;
  }

  telemetry(): Telemetry {
    return {
      speed: this.data.airspeed,
      rpm: 1000 + this.data.throttle * 6000,
      gear: 0,
      throttle: this.data.throttle,
    };
  }

  canExit(): boolean {
    return this.data.onGround && this.speed() < 2;
  }

  exitPosition(out: THREE.Vector3): THREE.Vector3 {
    const t = this.body.translation();
    const r = this.body.rotation();
    const q = this.st.q.set(r.x, r.y, r.z, r.w);
    out.set(-(this.def.b / 2 + 1.5), 0, 0.5).applyQuaternion(q);
    out.x += t.x;
    out.z += t.z;
    out.y = t.y;
    return out;
  }

  reset(x: number, y: number, z: number, yaw: number): void {
    const restY = Math.max(...this.def.gear.map((g) => -g.y + g.len + 0.28)) - 0.12;
    this.body.setTranslation({ x, y: y + restY, z }, true);
    this.body.setRotation(yawQuat(yaw), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevVel.set(0, 0, 0);
    this.crashed = false;
    this.data.gearDown = true;
    this.data.throttle = 0;
    this.data.flaps = 0;
    this.data.onGround = true;
    this.data.hover = this.kind === 'vtol';
    this.data.tilt = 0;
    this.hoverYaw = yaw;
    this.hoverTargetAlt = y;
    this.interp.snap(this.body);
  }

  /** Puts the aircraft in the air at a given speed (mission starts). */
  launch(x: number, y: number, z: number, yaw: number, speed: number): void {
    this.reset(x, y, z, yaw);
    const fx = -Math.sin(yaw) * speed;
    const fz = -Math.cos(yaw) * speed;
    this.body.setLinvel({ x: fx, y: 0, z: fz }, true);
    this.prevVel.set(fx, 0, fz);
    this.data.gearDown = false;
    this.data.onGround = false;
    this.data.throttle = 0.7;
    this.data.hover = false;
    this.data.tilt = 1;
    this.airborneTime = 3;
    this.maxAglSinceGround = 100;
  }

  dispose(): void {
    this.phys.world.removeRigidBody(this.body);
    this.root.removeFromParent();
  }
}
