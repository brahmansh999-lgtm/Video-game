/** Generates the deterministic world description. */
import { buildCityPlan } from './cityPlan';
import { buildCoastal, buildHighway } from './highway';
import { RoadGraph } from './roads';
import { Terrain } from './terrain';
import { placeTurbines } from './turbines';
import type { WorldData } from './worldData';

export function generateWorld(): WorldData {
  const paths = [buildHighway(), buildCoastal()];
  const terrain = new Terrain(paths);
  const roads = new RoadGraph(paths);
  const nearRoad = (x: number, z: number): boolean => {
    const r = roads.distanceToRoad(x, z);
    return r.d < r.width / 2 + 7;
  };
  const plan = buildCityPlan(terrain, nearRoad);
  const turbines = placeTurbines(terrain, nearRoad);
  return {
    terrain,
    paths,
    roads,
    buildings: plan.buildings,
    skybridges: plan.skybridges,
    bridges: roads.bridges,
    vertiports: plan.vertiports,
    trees: plan.trees,
    turbines,
    nearRoad,
  };
}
