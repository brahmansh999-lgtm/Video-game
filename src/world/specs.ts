/** Data descriptors for everything placed in the world (pure data, no three.js objects). */
import type { District } from './layout';

/** Facade atlas style index: 0 glass, 1 white, 2 dark, 3 warm. */
export type StyleIndex = 0 | 1 | 2 | 3;

interface Base {
  id: number;
  x: number;
  z: number;
  /** Ground elevation at the footprint. */
  y: number;
  height: number;
  district: District;
  landmark?: string;
  /** Approximate footprint radius for map / vision labels. */
  radius: number;
}

export interface TowerSpec extends Base {
  kind: 'tower';
  a: number;
  b: number;
  exponent: number;
  twist: number;
  taper: number;
  bulge: number;
  bulgeFreq: number;
  rot: number;
  style: StyleIndex;
  diagrid: boolean;
  neon: 0 | 1 | 2;
  forest: boolean;
  vertiport: boolean;
}

export interface RibbonSpec extends Base {
  kind: 'ribbon';
  points: [number, number, number][];
  width: number;
  thickness: number;
  style: StyleIndex;
}

export interface CanopySpec extends Base {
  kind: 'canopy';
  sx: number;
  sz: number;
  freq: number;
  rot: number;
}

export interface DomeSpec extends Base {
  kind: 'dome';
  rx: number;
  rz: number;
}

export interface TerraceSpec extends Base {
  kind: 'terrace';
  w: number;
  d: number;
  levels: number;
  levelH: number;
  inset: number;
  rot: number;
  style: StyleIndex;
}

export interface BlockSpec extends Base {
  kind: 'block';
  w: number;
  d: number;
  rot: number;
  style: StyleIndex;
}

export interface HangarSpec extends Base {
  kind: 'hangar';
  span: number;
  length: number;
  rot: number;
}

export type BuildingSpec =
  TowerSpec | RibbonSpec | CanopySpec | DomeSpec | TerraceSpec | BlockSpec | HangarSpec;

export interface SkybridgeSpec {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y: number;
  width: number;
}

export type BridgeType = 'cable' | 'arch' | 'catenary';

export interface BridgeSpec {
  type: BridgeType;
  x0: number;
  x1: number;
  z: number;
  y: number;
  width: number;
  landmark?: string;
}

export interface Vertiport {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface TreeSpec {
  x: number;
  y: number;
  z: number;
  s: number;
}
