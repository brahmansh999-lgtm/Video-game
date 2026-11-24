/** Static infrastructure: maglev viaduct & stations, airport surfaces, dam, vertiport pads. */
import * as THREE from 'three';
import type { ChunkBuilders } from './architecture/meshBuilder';
import type { OrientedBox } from './architecture/ribbon';
import { CHUNK, DAM_Z, HALF, RESERVOIR_LEVEL, riverX } from './layout';
import { RING_RADIUS } from './planContext';
import type { Vertiport } from './specs';

export const MAGLEV_Y = 18;
export const STATION_ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
export const STATION_NAMES = ['East Halo', 'Harbour Halo', 'Gardens Halo', 'Halo Station'];

export interface Runway {
  name: string;
  x: number;
  z0: number;
  z1: number;
  width: number;
  heading: number;
}

export const RUNWAYS: Runway[] = [
  { name: '36L / 18R', x: 1300, z0: -1350, z1: 450, width: 45, heading: 0 },
  { name: '36R / 18L', x: 1650, z0: -1300, z1: 300, width: 45, heading: 0 },
];

const TAXI: { x0: number; z0: number; x1: number; z1: number; w: number }[] = [
  { x0: 1215, z0: -1320, x1: 1215, z1: 430, w: 22 },
  { x0: 1215, z0: -1320, x1: 1300, z1: -1320, w: 22 },
  { x0: 1215, z0: 420, x1: 1300, z1: 420, w: 22 },
  { x0: 1300, z0: -1250, x1: 1650, z1: -1250, w: 22 },
  { x0: 1300, z0: 250, x1: 1650, z1: 250, w: 22 },
];

const inChunk = (x: number, z: number, cx: number, cz: number): boolean =>
  Math.floor((x + HALF) / CHUNK) === cx && Math.floor((z + HALF) / CHUNK) === cz;

export function ringPoint(angle: number, r = RING_RADIUS): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(angle) * r, MAGLEV_Y, Math.sin(angle) * r);
}

const SEG = 72 * 4;

export function maglevGeometry(
  cx: number,
  cz: number,
  out: ChunkBuilders,
  lod: 0 | 1 | 2,
  nearRoad: (x: number, z: number) => boolean,
): void {
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2;
    const a1 = ((i + 1) / SEG) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const m = ringPoint(am);
    if (!inChunk(m.x, m.z, cx, cz)) continue;
    const len = (Math.PI * 2 * RING_RADIUS) / SEG;
    const rot = -am;
    out.solid.setColor(0xd8d8d4);
    out.solid.box(m.x, MAGLEV_Y - 1.2, m.z, 5, 1.2, len / 2 + 0.2, rot, 24, 28.8, true, true);
    if (lod < 2) {
      out.neon.box(
        m.x + Math.cos(am) * 4.6,
        MAGLEV_Y + 0.1,
        m.z + Math.sin(am) * 4.6,
        0.12,
        0.1,
        len / 2,
        rot,
      );
      out.neon.box(
        m.x - Math.cos(am) * 4.6,
        MAGLEV_Y + 0.1,
        m.z - Math.sin(am) * 4.6,
        0.12,
        0.1,
        len / 2,
        rot,
      );
    }
    // piers every second segment, with an inverted catenary soffit
    if (i % 2 === 0 && !nearRoad(m.x, m.z)) {
      const p = ringPoint(a0);
      out.solid.setColor(0xc9c6bf);
      out.solid.box(p.x, (MAGLEV_Y - 2.4) / 2, p.z, 1.6, (MAGLEV_Y - 2.4) / 2, 1.6, rot);
      if (lod === 0) {
        const q = ringPoint(a0 + (Math.PI * 4) / SEG);
        const steps = 6;
        let prev = new THREE.Vector3(p.x, MAGLEV_Y - 8, p.z);
        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          const sag = Math.cosh((t - 0.5) * 2.2) - Math.cosh(1.1);
          const pt = new THREE.Vector3().lerpVectors(p, q, t);
          pt.y = MAGLEV_Y - 2.4 + sag * 4.5;
          out.metal.beam(prev, pt, 0.9);
          prev = pt;
        }
      }
    }
  }
  STATION_ANGLES.forEach((ang) => {
    const c = ringPoint(ang);
    if (!inChunk(c.x, c.z, cx, cz)) return;
    const rot = -ang;
    const ox = Math.cos(ang) * 9;
    const oz = Math.sin(ang) * 9;
    out.solid.setColor(0xeeeeea);
    for (const s of [-1, 1]) out.solid.box(c.x + ox * s, MAGLEV_Y - 1.5, c.z + oz * s, 3.5, 1.5, 60, rot);
    out.facade.setStyle(0);
    out.facade.box(c.x + ox * 1.6, MAGLEV_Y / 2, c.z + oz * 1.6, 5, MAGLEV_Y / 2, 8, rot);
    // the halo: elliptical ring of members floating above the platforms
    const n = lod === 0 ? 40 : 14;
    for (let k = 0; k < n; k++) {
      const t0 = (k / n) * Math.PI * 2;
      const t1 = ((k + 1) / n) * Math.PI * 2;
      const P = (t: number): THREE.Vector3 => {
        const lx = Math.cos(t) * 22;
        const lz = Math.sin(t) * 66;
        const cs = Math.cos(rot);
        const sn = Math.sin(rot);
        return new THREE.Vector3(
          c.x + lx * cs + lz * sn,
          MAGLEV_Y + 14 + Math.sin(t * 2) * 3,
          c.z - lx * sn + lz * cs,
        );
      };
      const a = P(t0);
      const b = P(t1);
      out.metal.beam(a, b, 1.6);
      if (k % 4 === 0) out.metal.beam(new THREE.Vector3(a.x, MAGLEV_Y, a.z), a, 0.6);
      if (lod < 2) {
        const an = a.clone();
        an.y -= 1;
        const bn = b.clone();
        bn.y -= 1;
        out.neon.beam(an, bn, 0.3);
      }
    }
  });
}

export function maglevColliders(): OrientedBox[] {
  const res: OrientedBox[] = [];
  const q = new THREE.Quaternion();
  for (let i = 0; i < SEG; i++) {
    const am = ((i + 0.5) / SEG) * Math.PI * 2;
    const m = ringPoint(am);
    const len = (Math.PI * 2 * RING_RADIUS) / SEG;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -am);
    res.push({ cx: m.x, cy: MAGLEV_Y - 1.2, cz: m.z, hx: 5, hy: 1.2, hz: len / 2 + 0.3, q: q.clone() });
  }
  return res;
}

export function airportGeometry(
  cx: number,
  cz: number,
  out: ChunkBuilders,
  lod: 0 | 1 | 2,
  runway: ChunkBuilders['road'],
): void {
  for (const r of RUNWAYS) {
    for (let z = r.z0; z < r.z1; z += 90) {
      const z1 = Math.min(r.z1, z + 90);
      if (!inChunk(r.x, (z + z1) / 2, cx, cz)) continue;
      const hw = r.width / 2;
      const a = runway.vertex(r.x - hw, 0.06, z, 0, 1, 0, 0, (z - r.z0) / 90);
      const b = runway.vertex(r.x - hw, 0.06, z1, 0, 1, 0, 0, (z1 - r.z0) / 90);
      const c = runway.vertex(r.x + hw, 0.06, z1, 0, 1, 0, 1, (z1 - r.z0) / 90);
      const d = runway.vertex(r.x + hw, 0.06, z, 0, 1, 0, 1, (z - r.z0) / 90);
      runway.quad(a, b, c, d);
      if (lod < 2) {
        for (let lz = z; lz < z1; lz += 30) {
          out.neon.box(r.x - hw - 1, 0.25, lz, 0.25, 0.2, 0.25);
          out.neon.box(r.x + hw + 1, 0.25, lz, 0.25, 0.2, 0.25);
        }
      }
    }
  }
  for (const t of TAXI) {
    const mx = (t.x0 + t.x1) / 2;
    const mz = (t.z0 + t.z1) / 2;
    if (!inChunk(mx, mz, cx, cz)) continue;
    out.solid.setColor(0x3b3d41);
    const hx = Math.abs(t.x1 - t.x0) / 2 + t.w / 2;
    const hz = Math.abs(t.z1 - t.z0) / 2 + t.w / 2;
    out.solid.box(mx, 0.03, mz, hx, 0.02, hz, 0, 24, 28.8, true);
  }
  // apron
  if (inChunk(1240, -100, cx, cz)) {
    out.solid.setColor(0x4a4c50);
    out.solid.box(1240, 0.035, -100, 30, 0.02, 520);
  }
}

export function damGeometry(cx: number, cz: number, out: ChunkBuilders): void {
  const x = riverX(DAM_Z);
  if (!inChunk(x, DAM_Z, cx, cz)) return;
  out.solid.setColor(0xb4b0a6);
  const top = RESERVOIR_LEVEL + 3;
  out.solid.box(x, (top - 10) / 2, DAM_Z, 105, (top + 10) / 2, 9);
  out.solid.box(x, (top - 10) / 2 - 4, DAM_Z + 10, 100, (top + 2) / 2 - 4, 4);
  out.neon.box(x, top + 0.1, DAM_Z - 9.2, 105, 0.1, 0.15);
  for (let k = -3; k <= 3; k++) out.metal.box(x + k * 26, top + 2, DAM_Z, 1.5, 2, 9.5);
}

export function damCollider(): OrientedBox {
  const top = RESERVOIR_LEVEL + 3;
  return {
    cx: riverX(DAM_Z),
    cy: (top - 10) / 2,
    cz: DAM_Z,
    hx: 105,
    hy: (top + 10) / 2,
    hz: 9,
    q: new THREE.Quaternion(),
  };
}

export function vertiportPads(vps: Vertiport[], cx: number, cz: number, out: ChunkBuilders): void {
  for (const v of vps) {
    if (!inChunk(v.x, v.z, cx, cz)) continue;
    out.solid.setColor(0x2b2e33);
    out.solid.cylinder(v.x, v.y - 0.5, v.z, 14, 0.5, 24, true);
    out.solid.setColor(0xf2f2f2);
    out.solid.box(v.x - 3, v.y + 0.02, v.z, 0.8, 0.02, 4.5);
    out.solid.box(v.x + 3, v.y + 0.02, v.z, 0.8, 0.02, 4.5);
    out.solid.box(v.x, v.y + 0.02, v.z, 3, 0.02, 0.7);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      out.neon.box(v.x + Math.cos(a) * 12.5, v.y + 0.1, v.z + Math.sin(a) * 12.5, 0.4, 0.1, 0.4);
    }
  }
}
