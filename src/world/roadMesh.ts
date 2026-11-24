/** Road surface meshes per chunk (grid edges, junction pads and spline roads). */
import type { MeshBuilder } from './architecture/meshBuilder';
import type { RoadPath } from './highway';
import { CHUNK, HALF } from './layout';
import type { RoadGraph } from './roads';
import type { Terrain } from './terrain';

function inChunk(x: number, z: number, cx: number, cz: number): boolean {
  return Math.floor((x + HALF) / CHUNK) === cx && Math.floor((z + HALF) / CHUNK) === cz;
}

/** Plain asphalt region of the road texture (between lane markings). */
const PLAIN_U = 0.38;

export function gridRoads(
  graph: RoadGraph,
  terrain: Terrain,
  cx: number,
  cz: number,
  b: MeshBuilder,
  lod: 0 | 1 | 2,
): void {
  const step = lod === 0 ? 8 : lod === 1 ? 32 : 80;
  for (const e of graph.edges) {
    if (e.kind !== 'grid') continue;
    const A = graph.nodes[e.a];
    const B = graph.nodes[e.b];
    if (!inChunk((A.x + B.x) / 2, (A.z + B.z) / 2, cx, cz)) continue;
    const dx = B.x - A.x;
    const dz = B.z - A.z;
    const len = Math.hypot(dx, dz);
    const tx = dx / len;
    const tz = dz / len;
    const px = -tz * (e.width / 2);
    const pz = tx * (e.width / 2);
    const inset = e.width / 2;
    const usable = len - inset * 2;
    const n = Math.max(1, Math.ceil(usable / step));
    const start = b.vertexCount;
    for (let i = 0; i <= n; i++) {
      const s = inset + (usable * i) / n;
      const x = A.x + tx * s;
      const z = A.z + tz * s;
      const y1 = terrain.heightAt(x + px, z + pz) + 0.08;
      const y2 = terrain.heightAt(x - px, z - pz) + 0.08;
      b.vertex(x + px, y1, z + pz, 0, 1, 0, 0, s / 16);
      b.vertex(x - px, y2, z - pz, 0, 1, 0, 1, s / 16);
    }
    for (let i = 0; i < n; i++) {
      const a = start + i * 2;
      b.quad(a, a + 2, a + 3, a + 1);
    }
  }
  for (const nd of graph.nodes) {
    if (!nd.junction || nd.edges.length === 0 || !inChunk(nd.x, nd.z, cx, cz)) continue;
    const h = 8;
    const y = terrain.heightAt(nd.x, nd.z) + 0.1;
    const a = b.vertex(nd.x - h, y, nd.z - h, 0, 1, 0, PLAIN_U, 0);
    const c = b.vertex(nd.x - h, y, nd.z + h, 0, 1, 0, PLAIN_U, 0.05);
    const d = b.vertex(nd.x + h, y, nd.z + h, 0, 1, 0, PLAIN_U + 0.06, 0.05);
    const e = b.vertex(nd.x + h, y, nd.z - h, 0, 1, 0, PLAIN_U + 0.06, 0);
    b.quad(a, c, d, e);
  }
}

/** Spline road (highway/coastal) strips with mitred joints, plus bridge decks over water. */
export function pathRoads(
  path: RoadPath,
  cx: number,
  cz: number,
  road: MeshBuilder,
  solid: MeshBuilder,
): void {
  const pts = path.pts;
  const hw = path.width / 2;
  let dist = 0;
  const side: [number, number][] = pts.map((_p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return [-dz / l, dx / l];
  });
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const d0 = dist;
    dist += segLen;
    if (!inChunk((a.x + b.x) / 2, (a.z + b.z) / 2, cx, cz)) continue;
    const [sax, saz] = side[i];
    const [sbx, sbz] = side[i + 1];
    const v0 = road.vertex(a.x + sax * hw, a.y, a.z + saz * hw, 0, 1, 0, 0, d0 / 16);
    const v1 = road.vertex(a.x - sax * hw, a.y, a.z - saz * hw, 0, 1, 0, 1, d0 / 16);
    const v2 = road.vertex(b.x - sbx * hw, b.y, b.z - sbz * hw, 0, 1, 0, 1, dist / 16);
    const v3 = road.vertex(b.x + sbx * hw, b.y, b.z + sbz * hw, 0, 1, 0, 0, dist / 16);
    road.quad(v0, v3, v2, v1);
    if (a.bridge || b.bridge) {
      solid.setColor(0xb7b4ac);
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const rot = Math.atan2(b.x - a.x, b.z - a.z);
      solid.box(mx, (a.y + b.y) / 2 - 1.1, mz, hw + 1, 1, segLen / 2 + 0.3, rot, 24, 28.8, false, true);
      if (i % 4 === 0) solid.box(a.x, a.y - 16, a.z, 2, 15, 2, rot);
    }
  }
}
