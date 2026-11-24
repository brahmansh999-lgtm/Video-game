/**
 * Renders the whole world once into a cached top-down map canvas from the world data
 * (terrain/district colours, water, roads, building footprints, runways, maglev ring).
 * The minimap and the full-screen map both sample this cache, so neither costs draw calls.
 */
import { DISTRICT_COLORS, HALF, WORLD, districtAt, isWater } from '../world/layout';
import { RING_RADIUS } from '../world/planContext';
import { RUNWAYS } from '../world/structures';
import type { WorldData } from '../world/worldData';

export const MAP_PX = 1024;
export const toMap = (v: number): number => ((v + HALF) / WORLD) * MAP_PX;

const GROUND: Record<string, string> = {
  core: '#3a3f47',
  waterfront: '#4a4b4a',
  gardens: '#344a2c',
  maglev: '#3e4046',
  aeroport: '#3b4a30',
  hills: '#3d4a2e',
};

export function renderWorldMap(world: WorldData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = MAP_PX;
  c.height = MAP_PX;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.fillStyle = '#0d2a3a';
  g.fillRect(0, 0, MAP_PX, MAP_PX);
  // ground, 16 m cells
  const cell = 16;
  const px = (cell / WORLD) * MAP_PX;
  for (let z = -HALF; z < HALF; z += cell) {
    for (let x = -HALF; x < HALF; x += cell) {
      const cx = x + cell / 2;
      const cz = z + cell / 2;
      if (isWater(cx, cz)) continue;
      const h = world.terrain.heightAt(cx, cz);
      const d = districtAt(cx, cz);
      g.fillStyle = GROUND[d];
      g.globalAlpha = d === 'hills' ? Math.min(1, 0.65 + h / 400) : 1;
      g.fillRect(toMap(x), toMap(z), px + 0.6, px + 0.6);
    }
  }
  g.globalAlpha = 1;
  // roads
  g.strokeStyle = '#9aa3ad';
  g.lineCap = 'round';
  for (const e of world.roads.edges) {
    const a = world.roads.nodes[e.a];
    const b = world.roads.nodes[e.b];
    g.lineWidth = e.kind === 'highway' ? 3 : 2;
    g.beginPath();
    g.moveTo(toMap(a.x), toMap(a.z));
    g.lineTo(toMap(b.x), toMap(b.z));
    g.stroke();
  }
  // maglev ring
  g.strokeStyle = DISTRICT_COLORS.maglev;
  g.lineWidth = 2;
  g.setLineDash([6, 4]);
  g.beginPath();
  g.arc(toMap(0), toMap(0), (RING_RADIUS / WORLD) * MAP_PX, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  // runways
  g.fillStyle = '#c9ced4';
  for (const r of RUNWAYS) {
    g.fillRect(
      toMap(r.x - r.width / 2),
      toMap(r.z0),
      (r.width / WORLD) * MAP_PX,
      ((r.z1 - r.z0) / WORLD) * MAP_PX,
    );
  }
  // buildings
  const s = MAP_PX / WORLD;
  for (const b of world.buildings) {
    g.fillStyle = b.landmark ? '#e8f3ff' : '#b7c2cf';
    g.strokeStyle = g.fillStyle;
    switch (b.kind) {
      case 'tower':
      case 'dome':
        g.beginPath();
        g.arc(toMap(b.x), toMap(b.z), Math.max(1.5, b.radius * s), 0, Math.PI * 2);
        g.fill();
        break;
      case 'ribbon':
        g.lineWidth = Math.max(2, b.width * s);
        g.beginPath();
        b.points.forEach(([x, , z], i) => (i ? g.lineTo(toMap(x), toMap(z)) : g.moveTo(toMap(x), toMap(z))));
        g.stroke();
        break;
      case 'canopy':
        g.globalAlpha = 0.7;
        g.fillRect(toMap(b.x - b.sx / 2), toMap(b.z - b.sz / 2), b.sx * s, b.sz * s);
        g.globalAlpha = 1;
        break;
      case 'terrace':
        g.fillRect(toMap(b.x - b.w / 2), toMap(b.z - b.d / 2), b.w * s, b.d * s);
        break;
      case 'block':
        g.fillRect(toMap(b.x - b.w / 2), toMap(b.z - b.d / 2), b.w * s, b.d * s);
        break;
      case 'hangar':
        g.fillRect(toMap(b.x - b.span / 2), toMap(b.z - b.length / 2), b.span * s, b.length * s);
        break;
    }
  }
  // vertiports
  g.fillStyle = '#31e8ff';
  g.font = 'bold 9px system-ui';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const v of world.vertiports) {
    g.beginPath();
    g.arc(toMap(v.x), toMap(v.z), 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#05070c';
    g.fillText('H', toMap(v.x), toMap(v.z) + 0.5);
    g.fillStyle = '#31e8ff';
  }
  return c;
}
