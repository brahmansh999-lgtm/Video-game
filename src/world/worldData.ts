/** Immutable generated world description shared by streaming, physics, map and missions. */
import type { RoadPath } from './highway';
import type { RoadGraph } from './roads';
import type { BridgeSpec, BuildingSpec, SkybridgeSpec, TreeSpec, Vertiport } from './specs';
import type { Terrain } from './terrain';

export interface WorldData {
  terrain: Terrain;
  paths: RoadPath[];
  roads: RoadGraph;
  buildings: BuildingSpec[];
  skybridges: SkybridgeSpec[];
  bridges: BridgeSpec[];
  vertiports: Vertiport[];
  trees: TreeSpec[];
  turbines: { x: number; y: number; z: number }[];
  nearRoad: (x: number, z: number) => boolean;
}
