/** Ribbon buildings: a rectangular section swept along a Catmull-Rom spline. */
import * as THREE from 'three';
import type { RibbonSpec } from '../specs';
import type { ChunkBuilders, MeshBuilder } from './meshBuilder';

export interface OrientedBox {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  q: THREE.Quaternion;
}

const UP = new THREE.Vector3(0, 1, 0);

interface Frame {
  p: THREE.Vector3;
  t: THREE.Vector3;
  side: THREE.Vector3;
  n: THREE.Vector3;
  s: number;
}

export function ribbonCurve(spec: RibbonSpec): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    spec.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    false,
    'centripetal',
  );
}

function frames(curve: THREE.CatmullRomCurve3, count: number): Frame[] {
  const out: Frame[] = [];
  const len = curve.getLength();
  for (let i = 0; i <= count; i++) {
    const u = i / count;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u).normalize();
    const side = new THREE.Vector3().crossVectors(t, UP);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const n = new THREE.Vector3().crossVectors(side, t).normalize();
    out.push({ p, t, side, n, s: u * len });
  }
  return out;
}

function strip(
  b: MeshBuilder,
  fr: Frame[],
  ca: [number, number],
  cb: [number, number],
  normalSign: [number, number],
  vSpan: number,
): void {
  const start = b.vertexCount;
  const tmp = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  for (const f of fr) {
    nrm.copy(f.side).multiplyScalar(normalSign[0]).addScaledVector(f.n, normalSign[1]).normalize();
    for (const [k, c] of [ca, cb].entries()) {
      tmp.copy(f.p).addScaledVector(f.side, c[0]).addScaledVector(f.n, c[1]);
      b.vertex(tmp.x, tmp.y, tmp.z, nrm.x, nrm.y, nrm.z, f.s / 24, k * vSpan);
    }
  }
  for (let i = 0; i < fr.length - 1; i++) {
    const a = start + i * 2;
    b.quad(a, a + 2, a + 3, a + 1);
  }
}

export function ribbonBuilding(spec: RibbonSpec, out: ChunkBuilders, lod: 0 | 1 | 2): void {
  const curve = ribbonCurve(spec);
  const len = curve.getLength();
  const count = Math.max(6, Math.ceil(len / (lod === 0 ? 5 : lod === 1 ? 16 : 40)));
  const fr = frames(curve, count);
  const w = spec.width / 2;
  const h = spec.thickness / 2;
  const vSpan = spec.thickness / 28.8;
  out.facade.setStyle(spec.style);
  // glazed side faces (outer and inner)
  strip(out.facade, fr, [w, -h], [w, h], [1, 0], vSpan);
  strip(out.facade, fr, [-w, h], [-w, -h], [-1, 0], vSpan);
  out.solid.setColor(0xf4f4f0);
  strip(out.solid, fr, [w, h], [-w, h], [0, 1], 1);
  strip(out.solid, fr, [-w, -h], [w, -h], [0, -1], 1);
  if (lod === 2) return;
  // neon lines along the top edges
  strip(out.neon, fr, [w + 0.15, h - 0.5], [w + 0.15, h + 0.05], [1, 0], 1);
  strip(out.neon, fr, [-w - 0.15, h + 0.05], [-w - 0.15, h - 0.5], [-1, 0], 1);
  // slab fins every 4 m along the glazing (LOD0 only)
  if (lod === 0) {
    out.solid.setColor(0xffffff);
    for (let i = 0; i < fr.length; i += 2) {
      const f = fr[i];
      for (const sgn of [1, -1]) {
        const a = f.p
          .clone()
          .addScaledVector(f.side, sgn * (w + 0.35))
          .addScaledVector(f.n, -h);
        const b2 = f.p
          .clone()
          .addScaledVector(f.side, sgn * (w + 0.35))
          .addScaledVector(f.n, h);
        out.solid.beam(a, b2, 0.5);
      }
    }
  }
}

/** Collider boxes approximating the swept ribbon. */
export function ribbonColliders(spec: RibbonSpec): OrientedBox[] {
  const curve = ribbonCurve(spec);
  const len = curve.getLength();
  const count = Math.max(4, Math.ceil(len / 12));
  const fr = frames(curve, count);
  const res: OrientedBox[] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < fr.length - 1; i++) {
    const a = fr[i];
    const b = fr[i + 1];
    const mid = a.p.clone().add(b.p).multiplyScalar(0.5);
    const t = b.p.clone().sub(a.p);
    const segLen = t.length();
    t.normalize();
    const side = new THREE.Vector3().crossVectors(t, UP).normalize();
    const n = new THREE.Vector3().crossVectors(side, t).normalize();
    m.makeBasis(side, n, t);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    res.push({
      cx: mid.x,
      cy: mid.y,
      cz: mid.z,
      hx: spec.width / 2,
      hy: spec.thickness / 2,
      hz: segLen / 2 + 0.6,
      q,
    });
  }
  return res;
}

/** Bounding radius in plan (for map / labels). */
export function ribbonExtent(spec: RibbonSpec): { x: number; z: number; r: number; top: number } {
  let minx = 1e9;
  let maxx = -1e9;
  let minz = 1e9;
  let maxz = -1e9;
  let top = 0;
  for (const [x, y, z] of spec.points) {
    minx = Math.min(minx, x);
    maxx = Math.max(maxx, x);
    minz = Math.min(minz, z);
    maxz = Math.max(maxz, z);
    top = Math.max(top, y);
  }
  return {
    x: (minx + maxx) / 2,
    z: (minz + maxz) / 2,
    r: Math.hypot(maxx - minx, maxz - minz) / 2,
    top: top + spec.thickness / 2,
  };
}
