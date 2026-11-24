/** Builds the meshes of one 256 m chunk at a given level of detail. */
import * as THREE from 'three';
import type { Materials } from '../render/materials';
import { REFLECT_LAYER } from '../render/sky';
import { bridge } from './architecture/bridge';
import { loftTower, skybridge } from './architecture/loftTower';
import { block, hangar, terrace } from './architecture/massing';
import { MeshBuilder, newBuilders, type ChunkBuilders } from './architecture/meshBuilder';
import { ribbonBuilding } from './architecture/ribbon';
import { dome, shellCanopy } from './architecture/shellCanopy';
import { CHUNK, HALF, districtAt } from './layout';
import { gridRoads, pathRoads } from './roadMesh';
import type { BuildingSpec } from './specs';
import { airportGeometry, damGeometry, maglevGeometry, vertiportPads } from './structures';
import type { WorldData } from './worldData';

export type Lod = 0 | 1 | 2;

function buildingGeometry(s: BuildingSpec, out: ChunkBuilders, lod: Lod): void {
  switch (s.kind) {
    case 'tower':
      loftTower(s, out, lod);
      break;
    case 'ribbon':
      ribbonBuilding(s, out, lod);
      break;
    case 'canopy':
      shellCanopy(s, out, lod);
      break;
    case 'dome':
      dome(s, out, lod);
      break;
    case 'terrace':
      terrace(s, out, lod);
      break;
    case 'block':
      block(s, out, lod);
      break;
    case 'hangar':
      hangar(s, out, lod);
      break;
  }
}

let treeGeo: THREE.BufferGeometry | null = null;
const memberGeo = new THREE.BoxGeometry(1, 1, 1);

export function treeGeometry(): THREE.BufferGeometry {
  if (treeGeo) return treeGeo;
  const b = new MeshBuilder({ color: true });
  b.setColor(0x5a4632).cylinder(0, 0, 0, 0.35, 3.2, 5, false);
  const crown = new THREE.IcosahedronGeometry(2.6, 0).toNonIndexed();
  crown.translate(0, 5, 0);
  crown.scale(1, 1.25, 1);
  const p = crown.getAttribute('position');
  const n = crown.getAttribute('normal');
  b.setColor(0x3d7a2a);
  for (let i = 0; i < p.count; i += 3) {
    const a = b.vertex(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), 0, 0);
    b.vertex(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1), n.getX(i + 1), n.getY(i + 1), n.getZ(i + 1), 0, 0);
    b.vertex(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2), n.getX(i + 2), n.getY(i + 2), n.getZ(i + 2), 0, 0);
    b.tri(a, a + 1, a + 2);
  }
  treeGeo = b.toGeometry();
  if (!treeGeo) throw new Error('tree geometry');
  return treeGeo;
}

export interface ChunkIndex {
  buildings: BuildingSpec[];
  treeIdx: number[];
}

export function buildChunk(
  world: WorldData,
  index: ChunkIndex,
  mats: Materials,
  cx: number,
  cz: number,
  lod: Lod,
): THREE.Group {
  const out = newBuilders();
  const runway = new MeshBuilder();
  const discard = new MeshBuilder();
  if (lod >= 1) {
    // far detail: roads, metal work and runways collapse into the vertex-coloured solid mesh
    out.road = out.solid;
    out.metal = out.solid;
  }
  if (lod === 2) {
    out.facade = new MeshBuilder({ color: true });
    out.solid = out.facade;
    out.road = out.facade;
    out.metal = out.facade;
    out.shell = out.facade;
    out.neon = discard;
  }
  for (const s of index.buildings) buildingGeometry(s, out, lod);
  const inChunk = (x: number, z: number): boolean =>
    Math.floor((x + HALF) / CHUNK) === cx && Math.floor((z + HALF) / CHUNK) === cz;
  for (const sb of world.skybridges) {
    if (inChunk((sb.ax + sb.bx) / 2, (sb.az + sb.bz) / 2))
      skybridge(sb.ax, sb.az, sb.bx, sb.bz, sb.y, sb.width, out);
  }
  for (const br of world.bridges) if (inChunk((br.x0 + br.x1) / 2, br.z)) bridge(br, out, lod);
  if (lod >= 1) out.solid.setColor(0x34363a);
  gridRoads(world.roads, world.terrain, cx, cz, out.road, lod);
  for (const p of world.paths) {
    if (lod >= 1) out.solid.setColor(0x34363a);
    pathRoads(p, cx, cz, out.road, out.solid);
  }
  maglevGeometry(cx, cz, out, lod, world.nearRoad);
  airportGeometry(cx, cz, out, lod, lod === 0 ? runway : out.solid.setColor(0x3a3c40));
  damGeometry(cx, cz, out);
  vertiportPads(world.vertiports, cx, cz, out);
  if (lod < 2) {
    const step = lod === 0 ? 1 : 3;
    for (let i = 0; i < index.treeIdx.length; i += step) {
      const t = world.trees[index.treeIdx[i]];
      out.trees.push(new THREE.Matrix4().makeScale(t.s, t.s, t.s).setPosition(t.x, t.y, t.z));
    }
  } else {
    out.trees.length = 0;
  }
  if (lod > 0) out.members.length = 0;

  const g = new THREE.Group();
  g.name = `chunk-${cx}-${cz}-${lod}`;
  const district = districtAt((cx + 0.5) * CHUNK - HALF, (cz + 0.5) * CHUNK - HALF);
  const neonMat =
    district === 'maglev'
      ? mats.neonMagenta
      : district === 'gardens' || district === 'hills' || district === 'aeroport'
        ? mats.neonAmber
        : mats.neonCyan;
  const add = (b: MeshBuilder, m: THREE.Material, cast: boolean, reflect: boolean): void => {
    const geo = b.toGeometry();
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, m);
    mesh.userData.base = m;
    mesh.castShadow = cast && lod === 0;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    if (reflect) mesh.layers.enable(REFLECT_LAYER);
    g.add(mesh);
  };
  const terrainGeo = world.terrain.chunkGeometry(cx, cz, lod);
  if (lod === 2) {
    out.facade.appendGeometry(terrainGeo);
    terrainGeo.dispose();
    add(out.facade, mats.solid, false, true);
    g.matrixAutoUpdate = false;
    return g;
  }
  const terrainMesh = new THREE.Mesh(terrainGeo, mats.terrain);
  terrainMesh.receiveShadow = true;
  terrainMesh.matrixAutoUpdate = false;
  terrainMesh.userData.base = mats.terrain;
  terrainMesh.layers.enable(REFLECT_LAYER);
  g.add(terrainMesh);
  add(out.facade, mats.facade, true, true);
  add(out.solid, mats.solid, true, true);
  add(out.neon, neonMat, false, false);
  add(out.shell, mats.shell, true, false);
  add(out.road, mats.road, false, false);
  add(out.metal, mats.metal, true, false);
  add(runway, mats.runway, false, false);
  if (out.members.length) {
    const im = new THREE.InstancedMesh(memberGeo, mats.metal, out.members.length);
    out.members.forEach((m, i) => im.setMatrixAt(i, m));
    im.userData.base = mats.metal;
    im.castShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  if (out.trees.length) {
    const im = new THREE.InstancedMesh(treeGeometry(), mats.treeMat, out.trees.length);
    out.trees.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = lod === 0;
    im.receiveShadow = true;
    im.userData.base = mats.treeMat;
    im.computeBoundingSphere();
    g.add(im);
  }
  g.matrixAutoUpdate = false;
  return g;
}
