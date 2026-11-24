/** Parametric shell canopies (TPMS-like undulating surfaces) and perforated domes. */
import * as THREE from 'three';
import type { CanopySpec, DomeSpec } from '../specs';
import type { ChunkBuilders } from './meshBuilder';

export interface ColumnCollider {
  x: number;
  z: number;
  y: number;
  h: number;
  r: number;
}

/** Height of the canopy surface at normalised coordinates u, v in [-1, 1]. */
export function canopyHeight(s: CanopySpec, u: number, v: number): number {
  const wave = Math.cos(Math.PI * s.freq * u) * Math.cos(Math.PI * s.freq * v);
  const corner = Math.pow(u * u * v * v, 1.5);
  return s.height * (0.62 + 0.38 * wave) * (1 - corner);
}

function toWorld(s: CanopySpec, u: number, v: number, y: number, out: THREE.Vector3): THREE.Vector3 {
  const lx = (u * s.sx) / 2;
  const lz = (v * s.sz) / 2;
  const c = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  return out.set(s.x + lx * c + lz * sn, s.y + y, s.z - lx * sn + lz * c);
}

const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();

export function shellCanopy(s: CanopySpec, out: ChunkBuilders, lod: 0 | 1 | 2): void {
  const n = lod === 0 ? 30 : lod === 1 ? 12 : 5;
  const b = lod === 2 ? out.solid.setColor(0xeeeeea) : out.shell;
  const start = b.vertexCount;
  const e = 0.01;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * 2 - 1;
      const v = (j / n) * 2 - 1;
      toWorld(s, u, v, canopyHeight(s, u, v), _p);
      toWorld(s, u + e, v, canopyHeight(s, u + e, v), _a).sub(_p);
      toWorld(s, u, v + e, canopyHeight(s, u, v + e), _b).sub(_p);
      _n.crossVectors(_b, _a).normalize();
      b.vertex(_p.x, _p.y, _p.z, _n.x, _n.y, _n.z, ((u + 1) * s.sx) / 30, ((v + 1) * s.sz) / 30);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = start + j * (n + 1) + i;
      b.quad(a, a + n + 1, a + n + 2, a + 1);
    }
  }
  if (lod === 2) return;
  // Edge ring beam in metal and support columns
  for (const c of canopyColumns(s)) out.metal.cylinder(c.x, c.y, c.z, c.r, c.h, lod === 0 ? 10 : 6, false);
  // a soft glowing lantern line under the apex
  toWorld(s, 0, 0, canopyHeight(s, 0, 0) - 0.6, _p);
  out.neon.box(_p.x, _p.y, _p.z, 0.3, 0.15, 0.3);
}

export function canopyColumns(s: CanopySpec): ColumnCollider[] {
  const res: ColumnCollider[] = [];
  const f = s.freq;
  const pts: [number, number][] = [];
  for (let i = -f; i <= f; i++) {
    for (let j = -f; j <= f; j++) {
      const u = (i + 0.5) / f;
      const v = j / f;
      if (Math.abs(u) < 0.95 && Math.abs(v) < 0.95) pts.push([u, v]);
    }
  }
  for (const [u, v] of pts) {
    const h = canopyHeight(s, u, v);
    toWorld(s, u, v, 0, _p);
    res.push({ x: _p.x, z: _p.z, y: s.y, h, r: 0.7 });
  }
  return res;
}

export function dome(s: DomeSpec, out: ChunkBuilders, lod: 0 | 1 | 2): void {
  const lat = lod === 0 ? 14 : lod === 1 ? 7 : 4;
  const lon = lod === 0 ? 32 : lod === 1 ? 14 : 8;
  const b = lod === 2 ? out.solid.setColor(0xeeeeea) : out.shell;
  const start = b.vertexCount;
  for (let j = 0; j <= lat; j++) {
    const phi = (j / lat) * (Math.PI / 2);
    for (let i = 0; i <= lon; i++) {
      const th = (i / lon) * Math.PI * 2;
      const cx = Math.cos(th) * Math.cos(phi);
      const cz = Math.sin(th) * Math.cos(phi);
      const cy = Math.sin(phi);
      const nx = cx / s.rx;
      const ny = cy / s.height;
      const nz = cz / s.rz;
      const l = Math.hypot(nx, ny, nz);
      b.vertex(
        s.x + cx * s.rx,
        s.y + cy * s.height,
        s.z + cz * s.rz,
        nx / l,
        ny / l,
        nz / l,
        (i / lon) * 6,
        (j / lat) * 2,
      );
    }
  }
  for (let j = 0; j < lat; j++) {
    for (let i = 0; i < lon; i++) {
      const a = start + j * (lon + 1) + i;
      b.quad(a, a + lon + 1, a + lon + 2, a + 1);
    }
  }
  if (lod === 2) return;
  // inner glazed drum
  out.facade.setStyle(0);
  out.facade.box(s.x, s.y + 4, s.z, s.rx * 0.45, 4, s.rz * 0.45, 0);
  out.neon.box(s.x, s.y + 0.15, s.z, s.rx * 0.98, 0.15, 0.3, 0);
}

export function domeHullPoints(s: DomeSpec): Float32Array {
  const pts: number[] = [];
  for (let j = 0; j <= 4; j++) {
    const phi = (j / 4) * (Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const th = (i / 12) * Math.PI * 2;
      pts.push(
        Math.cos(th) * Math.cos(phi) * s.rx,
        Math.sin(phi) * s.height,
        Math.sin(th) * Math.cos(phi) * s.rz,
      );
    }
  }
  return new Float32Array(pts);
}
