/** Superellipse section maths shared by tower meshing, diagrids and colliders. */
import type * as THREE from 'three';
import type { TowerSpec } from '../specs';

export function sgnPow(v: number, p: number): number {
  return Math.sign(v) * Math.pow(Math.abs(v), p);
}

export function sectionScale(s: TowerSpec, t: number): number {
  return (1 - s.taper * t) * (1 + s.bulge * Math.sin(Math.PI * t * s.bulgeFreq));
}

/** World-space point on the tower surface at height fraction t and parameter angle theta. */
export function towerPoint(
  s: TowerSpec,
  t: number,
  theta: number,
  out: THREE.Vector3,
  push = 0,
): THREE.Vector3 {
  const k = sectionScale(s, t);
  const e = 2 / s.exponent;
  let lx = (s.a * k + push) * sgnPow(Math.cos(theta), e);
  let lz = (s.b * k + push) * sgnPow(Math.sin(theta), e);
  const r = s.rot + s.twist * t;
  const c = Math.cos(r);
  const sn = Math.sin(r);
  const x = lx * c + lz * sn;
  lz = -lx * sn + lz * c;
  lx = x;
  return out.set(s.x + lx, s.y + t * s.height, s.z + lz);
}

/** Average horizontal radius at height fraction t. */
export function towerRadius(s: TowerSpec, t: number): number {
  return ((s.a + s.b) / 2) * sectionScale(s, t);
}
