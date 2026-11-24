/** Simple massing generators: terraced green-roof buildings, blocks and long-span hangars. */
import * as THREE from 'three';
import type { BlockSpec, HangarSpec, TerraceSpec } from '../specs';
import type { ChunkBuilders } from './meshBuilder';

export function terrace(s: TerraceSpec, out: ChunkBuilders, lod: 0 | 1 | 2): void {
  out.facade.setStyle(s.style);
  const c = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  for (let i = 0; i < s.levels; i++) {
    const w = s.w / 2 - i * s.inset;
    const d = s.d / 2 - i * s.inset;
    if (w < 4 || d < 4) break;
    const y = s.y + i * s.levelH;
    out.facade.box(s.x, y + s.levelH / 2, s.z, w, s.levelH / 2, d, s.rot, 24, 28.8, false);
    out.solid.setColor(0x4f7a32);
    out.solid.box(s.x, y + s.levelH + 0.3, s.z, w, 0.3, d, s.rot);
    if (lod === 0 && i < s.levels - 1) {
      // planters along the terrace edge
      const n = Math.max(2, Math.floor((w * 2) / 7));
      for (let k = 0; k < n; k++) {
        const lx = -w + (k + 0.5) * ((w * 2) / n);
        for (const lz of [d - s.inset * 0.5, -d + s.inset * 0.5]) {
          const x = s.x + lx * c + lz * sn;
          const z = s.z - lx * sn + lz * c;
          const sc = 0.45 + (k % 3) * 0.08;
          out.trees.push(new THREE.Matrix4().makeScale(sc, sc, sc).setPosition(x, y + s.levelH + 0.6, z));
        }
      }
    }
  }
}

export function terraceBoxes(s: TerraceSpec): { y: number; hx: number; hy: number; hz: number }[] {
  const res: { y: number; hx: number; hy: number; hz: number }[] = [];
  for (let i = 0; i < s.levels; i++) {
    const w = s.w / 2 - i * s.inset;
    const d = s.d / 2 - i * s.inset;
    if (w < 4 || d < 4) break;
    res.push({ y: s.y + i * s.levelH + s.levelH / 2, hx: w, hy: s.levelH / 2 + 0.3, hz: d });
  }
  return res;
}

export function block(s: BlockSpec, out: ChunkBuilders, lod: 0 | 1 | 2): void {
  out.facade.setStyle(s.style);
  out.facade.box(s.x, s.y + s.height / 2, s.z, s.w / 2, s.height / 2, s.d / 2, s.rot, 24, 28.8, false);
  out.solid.setColor(0x8c8c88);
  out.solid.box(s.x, s.y + s.height + 0.5, s.z, s.w / 2 + 0.3, 0.5, s.d / 2 + 0.3, s.rot);
  if (lod === 0) {
    out.solid.setColor(0x6d6d6a);
    out.solid.box(s.x, s.y + s.height + 2, s.z, s.w * 0.15, 1.5, s.d * 0.15, s.rot);
    out.neon.box(
      s.x,
      s.y + s.height + 1.05,
      s.z,
      s.w / 2 + 0.35,
      0.08,
      s.d / 2 + 0.35,
      s.rot,
      24,
      28.8,
      false,
    );
  }
}

/** Barrel-vault hangar (long-span shell roof) with glazed gable ends. */
export function hangar(s: HangarSpec, out: ChunkBuilders, lod: 0 | 1 | 2): void {
  const seg = lod === 0 ? 20 : lod === 1 ? 8 : 4;
  const c = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  const W = (lx: number, y: number, lz: number, v: THREE.Vector3): THREE.Vector3 =>
    v.set(s.x + lx * c + lz * sn, s.y + y, s.z - lx * sn + lz * c);
  const b = out.solid.setColor(0xe9ebee);
  const start = b.vertexCount;
  const p = new THREE.Vector3();
  const half = s.length / 2;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    const lx = Math.cos(a) * (s.span / 2);
    const y = Math.sin(a) * s.height;
    const nx = Math.cos(a) / (s.span / 2);
    const ny = Math.sin(a) / s.height;
    const l = Math.hypot(nx, ny);
    const wnx = (nx / l) * c;
    const wnz = -(nx / l) * sn;
    for (const lz of [-half, half]) {
      W(lx, y, lz, p);
      b.vertex(p.x, p.y, p.z, wnx, ny / l, wnz, 0, 0);
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = start + i * 2;
    b.quad(a, a + 1, a + 3, a + 2);
  }
  // glazed gables
  out.facade.setStyle(0);
  for (const lz of [-half, half]) {
    const g0 = out.facade.vertexCount;
    W(0, 0, lz, p);
    const sgn = lz > 0 ? 1 : -1;
    const nx = sn * sgn;
    const nz = c * sgn;
    out.facade.vertex(p.x, p.y, p.z, nx, 0, nz, 0, 0);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI;
      W(Math.cos(a) * (s.span / 2) * 0.98, Math.sin(a) * s.height * 0.98, lz, p);
      out.facade.vertex(
        p.x,
        p.y,
        p.z,
        nx,
        0,
        nz,
        (Math.cos(a) * s.span) / 48,
        (Math.sin(a) * s.height) / 28.8,
      );
    }
    for (let i = 0; i < seg; i++) {
      if (sgn > 0) out.facade.tri(g0, g0 + i + 1, g0 + i + 2);
      else out.facade.tri(g0, g0 + i + 2, g0 + i + 1);
    }
  }
  if (lod === 0) {
    // structural ribs
    for (let k = 0; k <= 8; k++) {
      const lz = -half + (k / 8) * s.length;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI;
        const a1 = ((i + 1) / seg) * Math.PI;
        const pa = W(
          Math.cos(a0) * (s.span / 2 + 0.6),
          Math.sin(a0) * (s.height + 0.6),
          lz,
          new THREE.Vector3(),
        );
        const pb = W(
          Math.cos(a1) * (s.span / 2 + 0.6),
          Math.sin(a1) * (s.height + 0.6),
          lz,
          new THREE.Vector3(),
        );
        out.metal.beam(pa, pb, 0.8);
      }
    }
  }
}
