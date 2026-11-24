/** Deterministic placement of every building, skybridge, vertiport and tree. */
import { hash2, mulberry32, pick, range, type Rng } from '../core/rng';
import { districtAt, hillsMask, inAirport, isWater, SEED, type District } from './layout';
import { GRID, GRID_MAX_I, GRID_MAX_J, GRID_MIN_I, GRID_MIN_J } from './roads';
import { placeLandmarkBuildings } from './landmarkSites';
import { PlanContext, type CityPlan } from './planContext';
import type { SkybridgeSpec, StyleIndex, TowerSpec, Vertiport } from './specs';
import type { Terrain } from './terrain';

export type { CityPlan } from './planContext';

const LOT = 62;

function lotValid(cx: number, cz: number): boolean {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const x = cx + dx * LOT;
      const z = cz + dz * LOT;
      if (isWater(x, z) || inAirport(x, z) || hillsMask(x, z) > 0.2) return false;
    }
  }
  return true;
}

function randomTower(
  ctx: PlanContext,
  x: number,
  z: number,
  h: number,
  a: number,
  rnd: Rng,
  d: District,
): void {
  const styles: StyleIndex[] = d === 'core' ? [0, 0, 2, 1] : d === 'gardens' ? [3, 1] : [1, 0, 3, 2];
  ctx.tower(x, z, {
    height: h,
    a,
    b: a * range(rnd, 0.7, 1.15),
    exponent: range(rnd, 2, 5),
    twist: rnd() < 0.55 ? range(rnd, 0.2, 1.7) : 0,
    taper: range(rnd, 0, 0.45),
    bulge: rnd() < 0.5 ? range(rnd, 0.04, 0.18) : 0,
    bulgeFreq: pick(rnd, [1, 1, 2]),
    rot: rnd() * Math.PI,
    style: pick(rnd, styles),
    diagrid: d === 'core' && h > 160 && rnd() < 0.5,
    neon: pick(rnd, [0, 1, 2] as const),
  });
}

function coreBlock(ctx: PlanContext, cx: number, cz: number, rnd: Rng): void {
  const r = Math.hypot(cx, cz);
  const hmax = 400 * Math.pow(Math.max(0, 1 - r / 720), 1.1) + 70;
  if (rnd() < 0.45 && ctx.free(cx, cz, 30)) {
    randomTower(ctx, cx, cz, hmax * range(rnd, 0.65, 1), range(rnd, 20, 27), rnd, 'core');
    return;
  }
  const ang = rnd() * Math.PI;
  for (const s of [-1, 1]) {
    const x = cx + Math.cos(ang) * 30 * s;
    const z = cz + Math.sin(ang) * 30 * s;
    if (ctx.free(x, z, 20))
      randomTower(ctx, x, z, hmax * range(rnd, 0.45, 0.9), range(rnd, 13, 18), rnd, 'core');
  }
}

function waterfrontBlock(ctx: PlanContext, cx: number, cz: number, rnd: Rng): void {
  if (rnd() < 0.35) {
    const y = ctx.terrain.heightAt(cx, cz);
    const rise = range(rnd, 28, 46);
    const flip = rnd() < 0.5 ? 1 : -1;
    ctx.buildings.push({
      kind: 'ribbon',
      id: ctx.nextId(),
      x: cx,
      z: cz,
      y,
      height: rise + 8,
      district: 'waterfront',
      radius: 70,
      width: range(rnd, 16, 22),
      thickness: 12,
      style: pick(rnd, [0, 1] as const),
      points: [
        [cx - 60, y + 6, cz - 50 * flip],
        [cx - 30, y + rise * 0.8, cz - 20 * flip],
        [cx + 5, y + rise, cz + 10 * flip],
        [cx + 40, y + rise * 0.6, cz + 30 * flip],
        [cx + 58, y + 6, cz + 52 * flip],
      ],
    });
    return;
  }
  const n = rnd() < 0.5 ? 2 : 3;
  for (let k = 0; k < n; k++) {
    const x = cx + range(rnd, -34, 34);
    const z = cz + range(rnd, -34, 34);
    if (!ctx.free(x, z, 18)) continue;
    ctx.reserve(x, z, 18);
    if (rnd() < 0.5) {
      randomTower(ctx, x, z, range(rnd, 35, 95), range(rnd, 11, 16), rnd, 'waterfront');
    } else {
      ctx.buildings.push({
        kind: 'block',
        id: ctx.nextId(),
        x,
        z,
        y: ctx.terrain.heightAt(x, z),
        height: range(rnd, 18, 45),
        district: 'waterfront',
        radius: 18,
        w: range(rnd, 20, 30),
        d: range(rnd, 20, 30),
        rot: 0,
        style: pick(rnd, [1, 3] as const),
      });
    }
  }
}

function gardensBlock(ctx: PlanContext, cx: number, cz: number, rnd: Rng): void {
  const y = ctx.terrain.heightAt(cx, cz);
  const roll = rnd();
  if (roll < 0.3) {
    ctx.buildings.push({
      kind: 'canopy',
      id: ctx.nextId(),
      x: cx,
      z: cz,
      y,
      height: range(rnd, 12, 22),
      district: 'gardens',
      radius: 50,
      sx: range(rnd, 60, 100),
      sz: range(rnd, 60, 100),
      freq: pick(rnd, [1, 2]),
      rot: rnd() * Math.PI,
    });
    ctx.addTrees(cx, cz, 60, 18, rnd);
  } else if (roll < 0.45) {
    const rx = range(rnd, 22, 34);
    ctx.buildings.push({
      kind: 'dome',
      id: ctx.nextId(),
      x: cx,
      z: cz,
      y,
      height: rx * 0.7,
      district: 'gardens',
      radius: rx,
      rx,
      rz: rx * range(rnd, 0.8, 1.2),
    });
    ctx.addTrees(cx, cz, 62, 26, rnd);
  } else if (roll < 0.72) {
    ctx.buildings.push({
      kind: 'terrace',
      id: ctx.nextId(),
      x: cx,
      z: cz,
      y,
      height: 0,
      district: 'gardens',
      radius: 50,
      w: range(rnd, 70, 110),
      d: range(rnd, 60, 100),
      levels: Math.floor(range(rnd, 4, 9)),
      levelH: 5.4,
      inset: range(rnd, 5, 9),
      rot: 0,
      style: 3,
    });
    const t = ctx.buildings[ctx.buildings.length - 1];
    if (t.kind === 'terrace') t.height = t.levels * t.levelH;
  } else if (roll < 0.9) {
    if (ctx.free(cx, cz, 22)) {
      ctx.tower(cx, cz, {
        height: range(rnd, 70, 150),
        a: range(rnd, 14, 19),
        exponent: range(rnd, 2, 3),
        twist: range(rnd, 0, 0.6),
        taper: range(rnd, 0.1, 0.3),
        rot: rnd() * 3,
        style: 3,
        forest: true,
      });
      ctx.addTrees(cx, cz, 60, 14, rnd);
    }
  } else {
    ctx.addTrees(cx, cz, 64, 45, rnd);
  }
}

function maglevBlock(ctx: PlanContext, cx: number, cz: number, rnd: Rng): void {
  const n = rnd() < 0.6 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const x = cx + (n === 1 ? 0 : range(rnd, -30, 30));
    const z = cz + (n === 1 ? 0 : range(rnd, -30, 30));
    if (!ctx.free(x, z, 20)) continue;
    ctx.reserve(x, z, 20);
    const roll = rnd();
    if (roll < 0.55) randomTower(ctx, x, z, range(rnd, 45, 150), range(rnd, 12, 18), rnd, 'maglev');
    else if (roll < 0.8) {
      ctx.buildings.push({
        kind: 'block',
        id: ctx.nextId(),
        x,
        z,
        y: ctx.terrain.heightAt(x, z),
        height: range(rnd, 15, 40),
        district: 'maglev',
        radius: 22,
        w: range(rnd, 24, 40),
        d: range(rnd, 24, 40),
        rot: 0,
        style: pick(rnd, [0, 1, 3] as const),
      });
    } else ctx.addTrees(x, z, 26, 10, rnd);
  }
}

export function buildCityPlan(terrain: Terrain, nearRoad: (x: number, z: number) => boolean): CityPlan {
  const ctx = new PlanContext(terrain);
  const vertiports: Vertiport[] = [];
  placeLandmarkBuildings(ctx, vertiports);
  const towerAt = new Map<string, TowerSpec[]>();
  for (let j = GRID_MIN_J; j < GRID_MAX_J; j++) {
    for (let i = GRID_MIN_I; i < GRID_MAX_I; i++) {
      const cx = (i + 0.5) * GRID;
      const cz = (j + 0.5) * GRID;
      if (!lotValid(cx, cz)) continue;
      if (!ctx.free(cx, cz, 4)) continue;
      const rnd = mulberry32(Math.floor(hash2(i, j, SEED) * 1e9));
      const before = ctx.buildings.length;
      const d = districtAt(cx, cz);
      if (d === 'core') coreBlock(ctx, cx, cz, rnd);
      else if (d === 'waterfront') waterfrontBlock(ctx, cx, cz, rnd);
      else if (d === 'gardens') gardensBlock(ctx, cx, cz, rnd);
      else maglevBlock(ctx, cx, cz, rnd);
      const added = ctx.buildings.slice(before).filter((b): b is TowerSpec => b.kind === 'tower');
      if (added.length) towerAt.set(`${i},${j}`, added);
    }
  }
  // Skybridges between neighbouring core towers.
  const skybridges: SkybridgeSpec[] = [];
  for (const [key, list] of towerAt) {
    const [i, j] = key.split(',').map(Number);
    for (const [di, dj] of [
      [1, 0],
      [0, 1],
    ]) {
      const other = towerAt.get(`${i + di},${j + dj}`);
      if (!other) continue;
      const a = list[0];
      const b = other[0];
      if (a.district !== 'core' || b.district !== 'core') continue;
      if (Math.min(a.height, b.height) < 140) continue;
      if (hash2(i * 3 + di, j * 7 + dj, SEED) > 0.55) continue;
      skybridges.push({
        ax: a.x,
        az: a.z,
        bx: b.x,
        bz: b.z,
        y: Math.min(a.height, b.height) * 0.42,
        width: 9,
      });
    }
  }
  scatterHillTrees(ctx, nearRoad);
  return { buildings: ctx.buildings, skybridges, vertiports, trees: ctx.trees };
}

function scatterHillTrees(ctx: PlanContext, nearRoad: (x: number, z: number) => boolean): void {
  const rnd = mulberry32(SEED + 9);
  for (let i = 0; i < 9000; i++) {
    const x = range(rnd, -2040, 2040);
    const z = range(rnd, -2040, 2040);
    if (hillsMask(x, z) < 0.6 || isWater(x, z) || inAirport(x, z)) continue;
    if (hash2(Math.floor(x / 90), Math.floor(z / 90), 5) < 0.35) continue;
    const y = ctx.terrain.heightAt(x, z);
    const slope = Math.abs(ctx.terrain.heightAt(x + 4, z) - y) + Math.abs(ctx.terrain.heightAt(x, z + 4) - y);
    if (slope > 3.5 || y > 175 || nearRoad(x, z)) continue;
    ctx.trees.push({ x, y, z, s: range(rnd, 0.9, 1.8) });
  }
}
