/** Deterministic macro layout of the 4 x 4 km world: districts, water, terrain heights. */
import { fbm, smoothstep } from '../core/rng';

export const WORLD = 4096;
export const HALF = WORLD / 2;
export const CHUNK = 256;
export const CHUNKS = WORLD / CHUNK;
export const SEED = 1337;

export const SEA_LEVEL = -1.5;
export const RESERVOIR_LEVEL = 26;
export const DAM_Z = -1350;

export type District = 'core' | 'waterfront' | 'gardens' | 'maglev' | 'aeroport' | 'hills';

export const DISTRICT_NAMES: Record<District, string> = {
  core: 'Flux Core',
  waterfront: 'Ribbon Waterfront',
  gardens: 'Canopy Gardens',
  maglev: 'Maglev Ring',
  aeroport: 'Aeroport',
  hills: 'Outer Hills',
};

export const DISTRICT_COLORS: Record<District, string> = {
  core: '#4fc3ff',
  waterfront: '#36e0c0',
  gardens: '#8fd14f',
  maglev: '#c48bff',
  aeroport: '#ffb347',
  hills: '#c9a26b',
};

/** Centre of the river channel for a given z. */
export function riverX(z: number): number {
  return 720 + 40 * Math.sin(z / 350);
}
export const RIVER_HALF_WIDTH = 55;

export function coastZ(x: number): number {
  return 1350 + 35 * Math.sin(x / 260) + 20 * Math.sin(x / 97);
}

export const MARINA = { x0: -250, x1: 250, z0: 1190 };
export const RESERVOIR = { x: 720, z: -1640, rx: 250, rz: 200 };
export const AIRPORT = { x0: 1080, x1: 1900, z0: -1450, z1: 650 };

export function inAirport(x: number, z: number): boolean {
  return x > AIRPORT.x0 && x < AIRPORT.x1 && z > AIRPORT.z0 && z < AIRPORT.z1;
}

/** 0 = city, 1 = full hills. */
export function hillsMask(x: number, z: number): number {
  const north = smoothstep(-1120, -1320, z);
  const west = smoothstep(-1520, -1720, x);
  const east = smoothstep(1920, 2000, x);
  return Math.max(north, west, east);
}

export function districtAt(x: number, z: number): District {
  if (inAirport(x, z)) return 'aeroport';
  if (hillsMask(x, z) > 0.5) return 'hills';
  if (z > 640) return 'waterfront';
  if (Math.hypot(x, z) < 540) return 'core';
  if (x < -500) return 'gardens';
  return 'maglev';
}

export function inSea(x: number, z: number): boolean {
  if (z > coastZ(x)) return true;
  return x > MARINA.x0 && x < MARINA.x1 && z > MARINA.z0;
}

export function inRiver(x: number, z: number): boolean {
  return z > DAM_Z && Math.abs(x - riverX(z)) < RIVER_HALF_WIDTH;
}

export function inReservoir(x: number, z: number): boolean {
  const dx = (x - RESERVOIR.x) / RESERVOIR.rx;
  const dz = (z - RESERVOIR.z) / RESERVOIR.rz;
  return dx * dx + dz * dz < 1 || (z < DAM_Z && z > DAM_Z - 140 && Math.abs(x - riverX(z)) < 70);
}

export function isWater(x: number, z: number): boolean {
  return inSea(x, z) || inRiver(x, z) || inReservoir(x, z);
}

export function waterLevelAt(x: number, z: number): number {
  return inReservoir(x, z) && !inRiver(x, z) ? RESERVOIR_LEVEL : SEA_LEVEL;
}

/** Natural terrain before roads are cut in. */
export function baseHeight(x: number, z: number): number {
  const hm = hillsMask(x, z);
  let h = 0;
  if (hm > 0) {
    const n = fbm(x / 650, z / 650, 5, SEED);
    h = hm * (45 + 120 * Math.max(-0.3, n + 0.25));
  }
  // Gentle park mounds in the gardens
  if (districtAt(x, z) === 'gardens') {
    const gx = Math.abs(x - Math.round(x / 160) * 160);
    const gz = Math.abs(z - Math.round(z / 160) * 160);
    h += Math.max(0, fbm(x / 180, z / 180, 2, 7) * 7) * smoothstep(18, 40, Math.min(gx, gz));
  }
  // Carve water bodies with soft banks.
  const seaD = Math.min(coastZ(x) - z, 1e9);
  if (seaD < 30) h = Math.min(h, -8 + Math.max(0, seaD) * 0.3);
  const riverD = Math.abs(x - riverX(z)) - RIVER_HALF_WIDTH;
  if (z > DAM_Z - 160 && riverD < 30) {
    const bed = z > DAM_Z ? -8 : RESERVOIR_LEVEL - 10;
    h = Math.min(h, bed + Math.max(0, riverD) * (z > DAM_Z ? 0.3 : 1.2));
  }
  const dx = (x - RESERVOIR.x) / (RESERVOIR.rx + 40);
  const dz = (z - RESERVOIR.z) / (RESERVOIR.rz + 40);
  const rd = Math.sqrt(dx * dx + dz * dz);
  if (rd < 1.15) h = Math.min(h, RESERVOIR_LEVEL - 10 + Math.max(0, rd - 0.85) * 120);
  if (x > MARINA.x0 - 20 && x < MARINA.x1 + 20 && z > MARINA.z0 - 20) h = Math.min(h, -8);
  const ax = Math.max(AIRPORT.x0 - x, 0, x - AIRPORT.x1);
  const az = Math.max(AIRPORT.z0 - z, 0, z - AIRPORT.z1);
  h *= smoothstep(0, 220, Math.hypot(ax, az));
  return h;
}
