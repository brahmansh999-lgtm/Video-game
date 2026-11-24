/** Terrain heightfield (8 m grid, shared by rendering and physics) and chunk meshes. */
import * as THREE from 'three';
import { smoothstep } from '../core/rng';
import {
  CHUNK,
  HALF,
  WORLD,
  baseHeight,
  districtAt,
  hillsMask,
  inAirport,
  isWater,
  type District,
} from './layout';
import type { RoadPath } from './highway';

export const HF_N = 512;
export const HF_STEP = WORLD / HF_N;
const ROW = HF_N + 1;

const COLORS: Record<District, [number, number, number]> = {
  core: [0.3, 0.31, 0.33],
  waterfront: [0.5, 0.48, 0.44],
  gardens: [0.2, 0.36, 0.13],
  maglev: [0.36, 0.36, 0.37],
  aeroport: [0.26, 0.36, 0.16],
  hills: [0.24, 0.36, 0.14],
};

export class Terrain {
  readonly heights = new Float32Array(ROW * ROW);

  constructor(paths: RoadPath[]) {
    for (let iz = 0; iz <= HF_N; iz++) {
      for (let ix = 0; ix <= HF_N; ix++) {
        this.heights[iz * ROW + ix] = baseHeight(ix * HF_STEP - HALF, iz * HF_STEP - HALF);
      }
    }
    for (const p of paths) this.flatten(p);
  }

  /** Blend terrain towards the road profile around a spline road. */
  private flatten(path: RoadPath): void {
    const bestD = new Float32Array(ROW * ROW).fill(1e9);
    const bestY = new Float32Array(ROW * ROW);
    const reach = path.width / 2 + 24;
    for (let i = 0; i < path.pts.length - 1; i++) {
      const a = path.pts[i];
      const b = path.pts[i + 1];
      if (a.bridge && b.bridge) continue;
      const minX = Math.min(a.x, b.x) - reach;
      const maxX = Math.max(a.x, b.x) + reach;
      const minZ = Math.min(a.z, b.z) - reach;
      const maxZ = Math.max(a.z, b.z) + reach;
      const ix0 = Math.max(0, Math.floor((minX + HALF) / HF_STEP));
      const ix1 = Math.min(HF_N, Math.ceil((maxX + HALF) / HF_STEP));
      const iz0 = Math.max(0, Math.floor((minZ + HALF) / HF_STEP));
      const iz1 = Math.min(HF_N, Math.ceil((maxZ + HALF) / HF_STEP));
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const x = ix * HF_STEP - HALF;
          const z = iz * HF_STEP - HALF;
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
          const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
          const k = iz * ROW + ix;
          if (d < bestD[k]) {
            bestD[k] = d;
            bestY[k] = a.y + (b.y - a.y) * t - 0.15;
          }
        }
      }
    }
    for (let k = 0; k < bestD.length; k++) {
      if (bestD[k] > reach) continue;
      const w = 1 - smoothstep(path.width / 2 + 2, reach, bestD[k]);
      const x = (k % ROW) * HF_STEP - HALF;
      const z = Math.floor(k / ROW) * HF_STEP - HALF;
      if (isWater(x, z)) continue;
      this.heights[k] += (bestY[k] - this.heights[k]) * w;
    }
  }

  sample(ix: number, iz: number): number {
    ix = ix < 0 ? 0 : ix > HF_N ? HF_N : ix;
    iz = iz < 0 ? 0 : iz > HF_N ? HF_N : iz;
    return this.heights[iz * ROW + ix];
  }

  /** Bilinear height, matching the physics heightfield closely. */
  heightAt(x: number, z: number): number {
    const fx = (x + HALF) / HF_STEP;
    const fz = (z + HALF) / HF_STEP;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const h00 = this.sample(ix, iz);
    const h10 = this.sample(ix + 1, iz);
    const h01 = this.sample(ix, iz + 1);
    const h11 = this.sample(ix + 1, iz + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  /** Heights reordered for Rapier (column-major, rows along z). */
  rapierHeights(): Float32Array {
    const out = new Float32Array(ROW * ROW);
    for (let iz = 0; iz <= HF_N; iz++) {
      for (let ix = 0; ix <= HF_N; ix++) out[iz + ix * ROW] = this.heights[iz * ROW + ix];
    }
    return out;
  }

  private color(x: number, z: number, h: number, slope: number, out: number[]): void {
    const d = districtAt(x, z);
    let [r, g, b] = COLORS[d];
    const hm = hillsMask(x, z);
    if (hm > 0.2) {
      const rock = smoothstep(0.35, 0.7, slope);
      r += (0.42 - r) * rock;
      g += (0.4 - g) * rock;
      b += (0.36 - b) * rock;
      const high = smoothstep(130, 190, h);
      r += (0.62 - r) * high * 0.6;
      g += (0.62 - g) * high * 0.6;
      b += (0.6 - b) * high * 0.6;
    }
    if (inAirport(x, z)) {
      r = 0.27;
      g = 0.38;
      b = 0.17;
    }
    if (h < 0.6 && d !== 'aeroport') {
      const sand = 1 - smoothstep(-2, 0.6, h);
      r += (0.62 - r) * sand;
      g += (0.56 - g) * sand;
      b += (0.42 - b) * sand;
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
  }

  chunkGeometry(cx: number, cz: number, lod: 0 | 1 | 2): THREE.BufferGeometry {
    const step = lod === 0 ? 1 : lod === 1 ? 2 : 4;
    const cells = CHUNK / HF_STEP / step;
    const ix0 = (cx * CHUNK) / HF_STEP;
    const iz0 = (cz * CHUNK) / HF_STEP;
    const vRow = cells + 1;
    const count = vRow * vRow + cells * 4 * 2 + 8;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const idx: number[] = [];
    const c3 = [0, 0, 0];
    let v = 0;
    const put = (ix: number, iz: number, drop: number): number => {
      const x = ix * HF_STEP - HALF;
      const z = iz * HF_STEP - HALF;
      const h = this.sample(ix, iz);
      const hx = this.sample(ix + step, iz) - this.sample(ix - step, iz);
      const hz = this.sample(ix, iz + step) - this.sample(ix, iz - step);
      const nx = -hx;
      const ny = 2 * step * HF_STEP;
      const nz = -hz;
      const l = Math.hypot(nx, ny, nz);
      pos[v * 3] = x;
      pos[v * 3 + 1] = h - drop;
      pos[v * 3 + 2] = z;
      nor[v * 3] = nx / l;
      nor[v * 3 + 1] = ny / l;
      nor[v * 3 + 2] = nz / l;
      this.color(x, z, h, 1 - ny / l, c3);
      col[v * 3] = c3[0];
      col[v * 3 + 1] = c3[1];
      col[v * 3 + 2] = c3[2];
      uv[v * 2] = x / 24;
      uv[v * 2 + 1] = z / 24;
      return v++;
    };
    for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) put(ix0 + i * step, iz0 + j * step, 0);
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const a = j * vRow + i;
        idx.push(a, a + vRow, a + 1, a + 1, a + vRow, a + vRow + 1);
      }
    }
    // skirts hide cracks between neighbouring LODs
    const edges: [number, number, number, number][] = [
      [0, 0, 1, 0],
      [cells, 0, 0, 1],
      [cells, cells, -1, 0],
      [0, cells, 0, -1],
    ];
    for (const [sx, sz, dx, dz] of edges) {
      for (let k = 0; k < cells; k++) {
        const i0 = sx + dx * k;
        const j0 = sz + dz * k;
        const i1 = i0 + dx;
        const j1 = j0 + dz;
        const a = j0 * vRow + i0;
        const b = j1 * vRow + i1;
        const a2 = put(ix0 + i0 * step, iz0 + j0 * step, 6);
        const b2 = put(ix0 + i1 * step, iz0 + j1 * step, 6);
        idx.push(a, b, b2, a, b2, a2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, v * 2), 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
}
