/**
 * Rigid-body aerodynamic model evaluated every physics step.
 *
 *  Lift    L = ½ρV²S·C_L(α)        C_L linear to α_stall, then blends to flat-plate (stall)
 *  Drag    D = ½ρV²S·(C_D0 + C_L²/(πeAR)·φ_ground + flaps + gear)
 *  Side    Y = ½ρV²S·C_Yβ·β
 *  Moments pitch M = qSc(Cm0 + Cmα·α + Cmδe·δe + Cmq·q̂), roll L = qSb(Clδa·δa + Clp·p̂ + Clβ·β),
 *          yaw N = qSb(Cnβ·β + Cnr·r̂ + Cnδr·δr), with post-stall wing drop / autorotation.
 * Body axes: x right, y up, z aft (forward = -z).
 */
import * as THREE from 'three';
import { clamp, smoothstep } from '../core/rng';
import type { AircraftDef } from './aircraftDefs';

export interface AeroControls {
  elevator: number;
  aileron: number;
  rudder: number;
  throttle: number;
  flaps: number;
  gearDown: boolean;
  /** extra thrust direction override for VTOL (body frame, unit) */
  thrustDir: THREE.Vector3;
  /** 0..1 how much the wings fly (VTOL in hover = 0.4) */
  aeroWeight: number;
}

export interface AeroState {
  q: THREE.Quaternion;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  altitude: number;
  agl: number;
  wind: THREE.Vector3;
}

export interface AeroResult {
  force: THREE.Vector3;
  torque: THREE.Vector3;
  airspeed: number;
  alpha: number;
  beta: number;
  stall: number;
  CL: number;
  thrust: number;
}

const _inv = new THREE.Quaternion();
const _vb = new THREE.Vector3();
const _wb = new THREE.Vector3();
const _vAir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _liftDir = new THREE.Vector3();
const _dragDir = new THREE.Vector3();
const _tb = new THREE.Vector3();
const _thrust = new THREE.Vector3();

const _cl = { CL: 0, stall: 0 };

export function liftCoefficient(
  def: AircraftDef,
  alpha: number,
  flapCL: number,
): { CL: number; stall: number } {
  const as = def.alphaStall;
  const lin = def.CL0 + def.CLa * alpha + flapCL;
  const plate = 1.05 * Math.sin(2 * alpha);
  const s = alpha >= 0 ? smoothstep(as, as + 0.12, alpha) : smoothstep(-as + 0.05, -as - 0.07, alpha);
  const linClamped = clamp(lin, def.CL0 + def.CLa * (-as + 0.05), def.CL0 + def.CLa * as + flapCL);
  _cl.CL = linClamped * (1 - s) + plate * 0.7 * s;
  _cl.stall = s;
  return _cl;
}

export function computeAero(def: AircraftDef, st: AeroState, c: AeroControls, out: AeroResult): AeroResult {
  out.force.set(0, 0, 0);
  out.torque.set(0, 0, 0);
  _inv.copy(st.q).invert();
  _vAir.copy(st.vel).sub(st.wind);
  _vb.copy(_vAir).applyQuaternion(_inv);
  _wb.copy(st.angVel).applyQuaternion(_inv);
  const V = _vAir.length();
  const rho = 1.225 * Math.exp(-Math.max(0, st.altitude) / 8500);
  const u = -_vb.z;
  const alpha = V > 1 ? Math.atan2(-_vb.y, Math.max(0.1, Math.abs(u)) * Math.sign(u || 1)) : 0;
  const beta = V > 1 ? Math.atan2(_vb.x, Math.max(1, Math.abs(u))) : 0;
  out.airspeed = V;
  out.alpha = alpha;
  out.beta = beta;
  const qd = 0.5 * rho * V * V;
  const flapI = Math.round(clamp(c.flaps, 0, def.flapCL.length - 1));
  const { CL: clRaw, stall } = liftCoefficient(def, alpha, def.flapCL[flapI]);
  // ground effect
  const hb = Math.max(0.05, st.agl / def.b);
  const ge = (16 * hb) ** 2 / (1 + (16 * hb) ** 2);
  const CL = clRaw * (1 + 0.1 * (1 - ge));
  const AR = (def.b * def.b) / def.S;
  const CD =
    def.CD0 +
    ((CL * CL) / (Math.PI * def.e * AR)) * ge +
    def.flapCD[flapI] +
    (c.gearDown ? def.gearCD : 0) +
    stall * 0.25;
  out.CL = CL;
  out.stall = V > 8 ? stall : 0;
  const w = c.aeroWeight;

  if (V > 0.5) {
    _dragDir.copy(_vAir).multiplyScalar(-1 / V);
    _right.set(1, 0, 0).applyQuaternion(st.q);
    _liftDir.crossVectors(_right, _vAir).normalize();
    out.force.addScaledVector(_liftDir, qd * def.S * CL * w);
    out.force.addScaledVector(_dragDir, qd * def.S * CD * (0.35 + 0.65 * w));
    out.force.addScaledVector(_right, qd * def.S * def.CYb * beta * w);
  }

  // thrust
  let T = def.maxThrust * c.throttle;
  if (def.propVmax > 0) T *= clamp(1 - Math.max(0, u) / def.propVmax, 0, 1);
  else T *= 1 + Math.max(0, u) / 450;
  _thrust.copy(c.thrustDir).applyQuaternion(st.q).multiplyScalar(T);
  out.force.add(_thrust);
  out.thrust = T;

  // moments (body frame), with propwash keeping tail surfaces alive at low speed
  const Vs = Math.max(V, 1);
  const wash = def.propVmax > 0 ? 0.5 * rho * 14 * 14 * c.throttle : 0;
  const qc = (qd + wash) * def.S;
  const pHat = (-_wb.z * def.b) / (2 * Vs);
  const rHat = (-_wb.y * def.b) / (2 * Vs);
  const qHat = (_wb.x * def.c) / (2 * Vs);
  const alphaEff = Math.sin(clamp(alpha, -1.5, 1.5));
  const Mpitch =
    qd * def.S * def.c * (def.Cm0 + def.Cma * alphaEff + def.Cmq * qHat - 0.12 * stall) * w +
    qc * def.c * def.Cmde * c.elevator * (1 - 0.5 * stall);
  const Lroll =
    qd * def.S * def.b * (def.Clp * (1 - 0.85 * stall) * pHat + def.Clb * beta + 0.28 * stall * rHat) * w +
    qc * def.b * def.Cla * c.aileron * (1 - 0.5 * stall);
  const Nyaw = qd * def.S * def.b * (def.Cnb * beta + def.Cnr * rHat) * w + qc * def.b * def.Cndr * c.rudder;
  _tb.set(Mpitch, -Nyaw, -Lroll);
  out.torque.copy(_tb.applyQuaternion(st.q));
  return out;
}

export function newAeroResult(): AeroResult {
  return {
    force: new THREE.Vector3(),
    torque: new THREE.Vector3(),
    airspeed: 0,
    alpha: 0,
    beta: 0,
    stall: 0,
    CL: 0,
    thrust: 0,
  };
}
