/** Road graph (grid + spline roads + bridges) used for meshes, traffic, pedestrians and the map. */
import { HALF, hillsMask, inAirport, isWater, riverX } from './layout';
import type { RoadPath } from './highway';
import type { BridgeSpec, BridgeType } from './specs';

export const GRID = 160;
export const ROAD_W = 16;
export const GRID_MIN_I = -9;
export const GRID_MAX_I = 6;
export const GRID_MIN_J = -7;
export const GRID_MAX_J = 7;

export interface RoadNode {
  id: number;
  x: number;
  y: number;
  z: number;
  edges: number[];
  /** True for grid intersections (drawn as intersection pads). */
  junction: boolean;
}

export interface RoadEdge {
  id: number;
  a: number;
  b: number;
  width: number;
  length: number;
  /** 'grid' | 'bridge' | 'highway' | 'coastal' */
  kind: 'grid' | 'bridge' | 'highway' | 'coastal';
}

export class RoadGraph {
  readonly nodes: RoadNode[] = [];
  readonly edges: RoadEdge[] = [];
  readonly bridges: BridgeSpec[] = [];
  private readonly gridIndex = new Map<string, number>();

  constructor(paths: RoadPath[]) {
    for (let j = GRID_MIN_J; j <= GRID_MAX_J; j++) {
      for (let i = GRID_MIN_I; i <= GRID_MAX_I; i++) {
        const x = i * GRID;
        const z = j * GRID;
        if (this.validNode(x, z)) this.gridIndex.set(`${i},${j}`, this.addNode(x, 0, z, true));
      }
    }
    for (let j = GRID_MIN_J; j <= GRID_MAX_J; j++) {
      for (let i = GRID_MIN_I; i <= GRID_MAX_I; i++) {
        const n = this.gridIndex.get(`${i},${j}`);
        if (n === undefined) continue;
        const right = this.gridIndex.get(`${i + 1},${j}`);
        const down = this.gridIndex.get(`${i},${j + 1}`);
        if (right !== undefined && this.clearPath(n, right)) this.addEdge(n, right, ROAD_W, 'grid');
        if (down !== undefined && this.clearPath(n, down)) this.addEdge(n, down, ROAD_W, 'grid');
      }
    }
    this.addRiverBridges();
    for (const p of paths) this.addPath(p);
  }

  private validNode(x: number, z: number): boolean {
    if (isWater(x, z) || inAirport(x, z) || hillsMask(x, z) > 0.05) return false;
    // keep nodes clear of the water edge
    for (const [dx, dz] of [
      [12, 0],
      [-12, 0],
      [0, 12],
      [0, -12],
    ]) {
      if (isWater(x + dx, z + dz)) return false;
    }
    return true;
  }

  private clearPath(a: number, b: number): boolean {
    const A = this.nodes[a];
    const B = this.nodes[b];
    for (let t = 0; t <= 1; t += 0.05) {
      const x = A.x + (B.x - A.x) * t;
      const z = A.z + (B.z - A.z) * t;
      if (isWater(x, z) || inAirport(x, z)) return false;
    }
    return true;
  }

  private addNode(x: number, y: number, z: number, junction: boolean): number {
    const id = this.nodes.length;
    this.nodes.push({ id, x, y, z, edges: [], junction });
    return id;
  }

  private addEdge(a: number, b: number, width: number, kind: RoadEdge['kind']): number {
    const A = this.nodes[a];
    const B = this.nodes[b];
    const id = this.edges.length;
    this.edges.push({ id, a, b, width, kind, length: Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z) });
    A.edges.push(id);
    B.edges.push(id);
    return id;
  }

  private addRiverBridges(): void {
    const types: BridgeType[] = ['cable', 'arch', 'catenary', 'cable'];
    const lines = [-6, -2, 2, 6];
    lines.forEach((j, k) => {
      const z = j * GRID;
      const rx = riverX(z);
      let west: number | undefined;
      let east: number | undefined;
      for (let i = GRID_MIN_I; i <= GRID_MAX_I; i++) {
        const id = this.gridIndex.get(`${i},${j}`);
        if (id === undefined) continue;
        const x = this.nodes[id].x;
        if (x < rx && (west === undefined || x > this.nodes[west].x)) west = id;
        if (x > rx && (east === undefined || x < this.nodes[east].x)) east = id;
      }
      if (west === undefined || east === undefined) return;
      const already = this.nodes[west].edges.some((e) => {
        const E = this.edges[e];
        return E.a === east || E.b === east;
      });
      if (!already) this.addEdge(west, east, ROAD_W, 'bridge');
      this.bridges.push({
        type: types[k],
        x0: this.nodes[west].x + ROAD_W / 2,
        x1: this.nodes[east].x - ROAD_W / 2,
        z,
        y: 0.35,
        width: ROAD_W,
        landmark: k === 0 ? 'strand-bridge' : k === 1 ? 'arc-bridge' : undefined,
      });
    });
  }

  nearestNode(x: number, z: number, junctionOnly = false): number {
    let best = -1;
    let bd = 1e18;
    for (const n of this.nodes) {
      if (junctionOnly && !n.junction) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = n.id;
      }
    }
    return best;
  }

  private addPath(p: RoadPath): void {
    const first = p.pts[0];
    const last = p.pts[p.pts.length - 1];
    const startNode = this.nearestNode(first.x, first.z, true);
    const endNode = this.nearestNode(last.x, last.z, true);
    const kind = p.name === 'Ribbon Drive' ? 'coastal' : 'highway';
    let prev = startNode;
    const every = 4;
    for (let i = every; i < p.pts.length - every; i += every) {
      const q = p.pts[i];
      const id = this.addNode(q.x, q.y, q.z, false);
      this.addEdge(prev, id, p.width, kind);
      prev = id;
    }
    this.addEdge(prev, endNode, p.width, kind);
  }

  otherEnd(edge: number, node: number): number {
    const e = this.edges[edge];
    return e.a === node ? e.b : e.a;
  }

  /** Distance from a point to the nearest road centreline (2D) and that road's width. */
  distanceToRoad(x: number, z: number): { d: number; width: number } {
    let best = 1e9;
    let w = ROAD_W;
    for (const e of this.edges) {
      const A = this.nodes[e.a];
      const B = this.nodes[e.b];
      if (Math.min(A.x, B.x) - 40 > x || Math.max(A.x, B.x) + 40 < x) continue;
      if (Math.min(A.z, B.z) - 40 > z || Math.max(A.z, B.z) + 40 < z) continue;
      const dx = B.x - A.x;
      const dz = B.z - A.z;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (z - A.z) * dz) / l2));
      const d = Math.hypot(x - A.x - dx * t, z - A.z - dz * t);
      if (d < best) {
        best = d;
        w = e.width;
      }
    }
    return { d: best, width: w };
  }
}

export function chunkOf(x: number, z: number): [number, number] {
  return [Math.floor((x + HALF) / 256), Math.floor((z + HALF) / 256)];
}
