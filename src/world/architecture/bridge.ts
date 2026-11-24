/** Bridge generators: cable-stayed, arch and catenary (suspension) variants spanning along x. */
import * as THREE from 'three';
import type { BridgeSpec } from '../specs';
import type { ChunkBuilders } from './meshBuilder';
import type { OrientedBox } from './ribbon';

const Q0 = new THREE.Quaternion();
const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

export function bridgeTopHeight(b: BridgeSpec): number {
  return b.type === 'cable' ? 78 : b.type === 'arch' ? 42 : 48;
}

export function bridge(b: BridgeSpec, out: ChunkBuilders, lod: 0 | 1 | 2): void {
  const len = b.x1 - b.x0;
  const xm = (b.x0 + b.x1) / 2;
  const hw = b.width / 2;
  // deck surface (road texture runs along the span)
  const r = out.road;
  const y = b.y + 0.02;
  const a = r.vertex(b.x0, y, b.z - hw, 0, 1, 0, 1, 0);
  const c = r.vertex(b.x0, y, b.z + hw, 0, 1, 0, 0, 0);
  const d = r.vertex(b.x1, y, b.z + hw, 0, 1, 0, 0, len / 16);
  const e = r.vertex(b.x1, y, b.z - hw, 0, 1, 0, 1, len / 16);
  r.quad(a, c, d, e);
  out.solid.setColor(0xbdbab2);
  out.solid.box(xm, b.y - 1, b.z, len / 2, 1, hw + 1.5, 0, 24, 28.8, false, true);
  out.solid.box(xm, b.y + 0.55, b.z - hw - 1, len / 2, 0.55, 0.5, 0);
  out.solid.box(xm, b.y + 0.55, b.z + hw + 1, len / 2, 0.55, 0.5, 0);
  out.neon.box(xm, b.y - 2.05, b.z, len / 2, 0.08, hw + 1.2, 0);
  const cw = lod === 0 ? 0.3 : 0.6;
  const steps = lod === 0 ? 1 : 3;
  const m = out.metal;
  if (b.type === 'cable') {
    const H = bridgeTopHeight(b);
    for (const sz of [-1, 1]) {
      m.beam(V(xm, b.y - 12, b.z + sz * (hw + 3)), V(xm, b.y + H, b.z + sz * 1.2), 2.4);
    }
    m.beam(V(xm, b.y + H - 4, b.z - 1.5), V(xm, b.y + H - 4, b.z + 1.5), 2);
    const n = 12;
    for (let i = 1; i <= n; i += steps) {
      const top = b.y + H - 2 - i * 2.2;
      for (const side of [-1, 1]) {
        const dx = side * ((i / n) * (len / 2 - 8));
        for (const sz of [-1, 1]) {
          m.beam(V(xm, top, b.z + sz * 1.4), V(xm + dx, b.y + 0.8, b.z + sz * (hw + 1)), cw);
        }
      }
    }
  } else if (b.type === 'arch') {
    const rise = bridgeTopHeight(b);
    const span = len - 20;
    const segs = lod === 0 ? 24 : 10;
    for (const sz of [-1, 1]) {
      const zz = b.z + sz * (hw + 1.5);
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        const p0 = V(b.x0 + 10 + t0 * span, b.y + rise * 4 * t0 * (1 - t0), zz);
        const p1 = V(b.x0 + 10 + t1 * span, b.y + rise * 4 * t1 * (1 - t1), zz);
        m.beam(p0, p1, 1.8);
        if (i > 0 && (lod === 0 || i % 2 === 0)) m.beam(V(p0.x, b.y + 1, zz), p0, cw);
      }
    }
  } else {
    const H = bridgeTopHeight(b);
    const tx0 = b.x0 + 18;
    const tx1 = b.x1 - 18;
    for (const tx of [tx0, tx1]) {
      for (const sz of [-1, 1])
        m.beam(V(tx, b.y - 10, b.z + sz * (hw + 2)), V(tx, b.y + H, b.z + sz * (hw + 2)), 2.2);
      m.beam(V(tx, b.y + H - 2, b.z - hw - 2), V(tx, b.y + H - 2, b.z + hw + 2), 1.6);
    }
    const span = tx1 - tx0;
    const sag = H - 6;
    const half = span / 2;
    const aCat = half / 1.5;
    const xc = (tx0 + tx1) / 2;
    const denom = Math.cosh(half / aCat) - 1;
    const yAt = (x: number): number => b.y + (H - sag) + (sag * (Math.cosh((x - xc) / aCat) - 1)) / denom;
    const segs = lod === 0 ? 26 : 10;
    for (const sz of [-1, 1]) {
      const zz = b.z + sz * (hw + 2);
      for (let i = 0; i < segs; i++) {
        const x0 = tx0 + (i / segs) * span;
        const x1 = tx0 + ((i + 1) / segs) * span;
        m.beam(V(x0, yAt(x0), zz), V(x1, yAt(x1), zz), 0.7);
        if (i > 0 && (lod === 0 || i % 2 === 0)) m.beam(V(x0, b.y + 1, zz), V(x0, yAt(x0), zz), cw);
      }
      m.beam(V(tx0, b.y + H, zz), V(b.x0, b.y + 1, zz), 0.7);
      m.beam(V(tx1, b.y + H, zz), V(b.x1, b.y + 1, zz), 0.7);
    }
  }
}

export function bridgeColliders(b: BridgeSpec): OrientedBox[] {
  const len = b.x1 - b.x0;
  const xm = (b.x0 + b.x1) / 2;
  const res: OrientedBox[] = [
    { cx: xm, cy: b.y - 1, cz: b.z, hx: len / 2 + 2, hy: 1, hz: b.width / 2 + 1.5, q: Q0 },
    { cx: xm, cy: b.y + 0.55, cz: b.z - b.width / 2 - 1, hx: len / 2, hy: 0.55, hz: 0.5, q: Q0 },
    { cx: xm, cy: b.y + 0.55, cz: b.z + b.width / 2 + 1, hx: len / 2, hy: 0.55, hz: 0.5, q: Q0 },
  ];
  const H = bridgeTopHeight(b);
  if (b.type === 'cable') {
    res.push({ cx: xm, cy: b.y + H / 2, cz: b.z, hx: 2, hy: H / 2, hz: b.width / 2 + 3, q: Q0 });
  } else if (b.type === 'catenary') {
    for (const tx of [b.x0 + 18, b.x1 - 18]) {
      for (const sz of [-1, 1]) {
        res.push({
          cx: tx,
          cy: b.y + H / 2,
          cz: b.z + sz * (b.width / 2 + 2),
          hx: 1.2,
          hy: H / 2,
          hz: 1.2,
          q: Q0,
        });
      }
    }
  }
  return res;
}
