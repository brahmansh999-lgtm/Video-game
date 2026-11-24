/** Lofted superellipse towers with twist, taper and sinusoidal bulge. */
import * as THREE from 'three';
import type { TowerSpec } from '../specs';
import { memberMatrix, type ChunkBuilders } from './meshBuilder';
import { diagridSkin } from './diagrid';
import { towerPoint } from './towerShape';

export { towerPoint, towerRadius, sectionScale } from './towerShape';

const FLOOR = 3.6;

const _p = new THREE.Vector3();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _pu = new THREE.Vector3();
const _pd = new THREE.Vector3();
const _T = new THREE.Vector3();
const _V = new THREE.Vector3();
const _N = new THREE.Vector3();

interface RingOpts {
  segs: number;
  levels: number;
  t0: number;
  t1: number;
  push: number;
}

/** Emits a lofted wall between t0..t1 into a builder (facade, solid or neon). */
function loftWall(
  s: TowerSpec,
  b: ChunkBuilders['facade'],
  o: RingOpts,
  uvMetric: boolean,
  basePerimeter: number,
): void {
  const ringSize = o.segs + 1;
  const start = b.vertexCount;
  for (let k = 0; k <= o.levels; k++) {
    const t = o.t0 + ((o.t1 - o.t0) * k) / o.levels;
    const dt = Math.max(0.002, (o.t1 - o.t0) / Math.max(1, o.levels));
    for (let i = 0; i <= o.segs; i++) {
      const th = (i / o.segs) * Math.PI * 2;
      const dth = (Math.PI * 2) / o.segs;
      towerPoint(s, t, th, _p, o.push);
      towerPoint(s, t, th + dth * 0.5, _pa, o.push);
      towerPoint(s, t, th - dth * 0.5, _pb, o.push);
      towerPoint(s, Math.min(1, t + dt * 0.5), th, _pu, o.push);
      towerPoint(s, Math.max(0, t - dt * 0.5), th, _pd, o.push);
      _T.subVectors(_pa, _pb);
      _V.subVectors(_pu, _pd);
      _N.crossVectors(_V, _T).normalize();
      const u = uvMetric ? ((i / o.segs) * basePerimeter) / 24 : i / o.segs;
      const v = (_p.y - s.y) / 28.8;
      b.vertex(_p.x, _p.y, _p.z, _N.x, _N.y, _N.z, u, v);
    }
  }
  for (let k = 0; k < o.levels; k++) {
    for (let i = 0; i < o.segs; i++) {
      const a = start + k * ringSize + i;
      const up = a + ringSize;
      b.quad(a, up, up + 1, a + 1);
    }
  }
}

function cap(s: TowerSpec, b: ChunkBuilders['solid'], segs: number, t: number): void {
  const c = b.vertex(s.x, s.y + t * s.height, s.z, 0, 1, 0, 0, 0);
  const start = b.vertexCount;
  for (let i = 0; i <= segs; i++) {
    towerPoint(s, t, (i / segs) * Math.PI * 2, _p);
    b.vertex(_p.x, _p.y, _p.z, 0, 1, 0, 0, 0);
  }
  for (let i = 0; i < segs; i++) b.tri(c, start + i + 1, start + i);
}

export function perimeter(s: TowerSpec): number {
  let p = 0;
  towerPoint(s, 0, 0, _pa);
  for (let i = 1; i <= 32; i++) {
    towerPoint(s, 0, (i / 32) * Math.PI * 2, _pb);
    p += _pa.distanceTo(_pb);
    _pa.copy(_pb);
  }
  return p;
}

export function loftTower(s: TowerSpec, out: ChunkBuilders, lod: 0 | 1 | 2): void {
  const per = Math.round(perimeter(s) / 3) * 3;
  if (lod === 2) {
    loftWall(s, out.facade.setStyle(s.style), { segs: 8, levels: 2, t0: 0, t1: 1, push: 0 }, true, per);
    cap(s, out.solid.setColor(0x9a9a9a), 8, 1);
    return;
  }
  const segs = lod === 0 ? 40 : 14;
  const levels = lod === 0 ? Math.max(4, Math.ceil(s.height / 12)) : Math.max(2, Math.ceil(s.height / 45));
  out.facade.setStyle(s.style);
  loftWall(s, out.facade, { segs, levels, t0: 0, t1: 1, push: 0 }, true, per);
  out.solid.setColor(0xd0d0cc);
  cap(s, out.solid, segs, 1);
  // Neon crown
  const crownT = 1 - 1.6 / s.height;
  if (s.neon > 0 || lod === 0) {
    loftWall(s, out.neon, { segs, levels: 1, t0: crownT, t1: 1, push: 0.25 }, false, per);
  }
  if (lod !== 0) return;
  // Floor-slab bands every four floors
  out.solid.setColor(0xf2f2ee);
  const bandEvery = FLOOR * 4;
  for (let y = bandEvery; y < s.height - 4; y += bandEvery) {
    const t = y / s.height;
    const dt = 0.45 / s.height;
    loftWall(s, out.solid, { segs, levels: 1, t0: t - dt, t1: t + dt, push: 0.45 }, false, per);
  }
  if (s.diagrid) diagridSkin(s, out.members);
  if (s.forest) {
    for (let y = FLOOR * 3; y < s.height - 6; y += FLOOR * 3) {
      const t = y / s.height;
      for (let i = 0; i < 9; i++) {
        towerPoint(s, t, ((i + (y % 2)) / 9) * Math.PI * 2, _p, 1.2);
        const sc = 0.35 + ((i * 7 + y) % 5) * 0.06;
        out.trees.push(new THREE.Matrix4().makeScale(sc, sc, sc).setPosition(_p.x, _p.y, _p.z));
      }
    }
  }
}

/** Points for a convex hull collider. */
export function towerHullPoints(s: TowerSpec): Float32Array {
  const pts: number[] = [];
  const levels = 6;
  const segs = 12;
  for (let k = 0; k <= levels; k++) {
    for (let i = 0; i < segs; i++) {
      towerPoint(s, k / levels, (i / segs) * Math.PI * 2, _p);
      pts.push(_p.x - s.x, _p.y - s.y, _p.z - s.z);
    }
  }
  return new Float32Array(pts);
}

/** Skybridge between two towers: a glazed tube with neon edges. */
export function skybridge(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  y: number,
  width: number,
  out: ChunkBuilders,
): void {
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(bx - ax, bz - az);
  const cx = (ax + bx) / 2;
  const cz = (az + bz) / 2;
  out.facade.setStyle(0);
  out.facade.box(cx, y + 3, cz, width / 2, 3, len / 2, rot, 24, 28.8, false, true);
  out.solid.setColor(0xf0f0ec);
  out.solid.box(cx, y + 6.4, cz, width / 2 + 0.6, 0.4, len / 2, rot);
  out.neon.box(cx, y - 0.1, cz, width / 2 + 0.3, 0.12, len / 2, rot);
  const a = new THREE.Vector3(ax, y, az);
  const b = new THREE.Vector3(bx, y, bz);
  out.members.push(memberMatrix(a, b, 0.8));
}
