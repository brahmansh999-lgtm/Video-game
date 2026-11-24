/** Shared placement context for the city planner and landmark sites. */
import { range, type Rng } from '../core/rng';
import { districtAt, isWater } from './layout';
import type { BuildingSpec, SkybridgeSpec, TowerSpec, TreeSpec, Vertiport } from './specs';
import type { Terrain } from './terrain';

export const RING_RADIUS = 900;

export interface CityPlan {
  buildings: BuildingSpec[];
  skybridges: SkybridgeSpec[];
  vertiports: Vertiport[];
  trees: TreeSpec[];
}

export class PlanContext {
  readonly buildings: BuildingSpec[] = [];
  readonly trees: TreeSpec[] = [];
  readonly reserved: { x: number; z: number; r: number }[] = [];
  constructor(readonly terrain: Terrain) {}

  nextId(): number {
    return this.buildings.length;
  }

  free(x: number, z: number, r: number): boolean {
    if (Math.abs(Math.hypot(x, z) - RING_RADIUS) < r + 16) return false;
    for (const q of this.reserved) if (Math.hypot(q.x - x, q.z - z) < q.r + r) return false;
    return true;
  }

  reserve(x: number, z: number, r: number): void {
    this.reserved.push({ x, z, r });
  }

  tower(x: number, z: number, p: Partial<TowerSpec> & { height: number; a: number }): TowerSpec {
    const s: TowerSpec = {
      kind: 'tower',
      id: this.nextId(),
      x,
      z,
      y: this.terrain.heightAt(x, z),
      district: districtAt(x, z),
      radius: Math.max(p.a, p.b ?? p.a),
      b: p.a,
      exponent: 2.5,
      twist: 0,
      taper: 0,
      bulge: 0,
      bulgeFreq: 1,
      rot: 0,
      style: 0,
      diagrid: false,
      neon: 0,
      forest: false,
      vertiport: false,
      ...p,
    };
    this.buildings.push(s);
    return s;
  }

  addTrees(x: number, z: number, r: number, n: number, rnd: Rng): void {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * r;
      const tx = x + Math.cos(a) * d;
      const tz = z + Math.sin(a) * d;
      if (isWater(tx, tz)) continue;
      this.trees.push({ x: tx, z: tz, y: this.terrain.heightAt(tx, tz), s: range(rnd, 0.8, 1.5) });
    }
  }
}
