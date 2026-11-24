/** Streams 256 m chunks in and out with three detail levels and time-sliced building. */
import * as THREE from 'three';
import type { Materials } from '../render/materials';
import type { QualityPreset } from '../render/quality';
import { buildChunk, type ChunkIndex, type Lod } from './chunkBuild';
import { CHUNK, CHUNKS, HALF } from './layout';
import type { WorldData } from './worldData';

interface Chunk {
  cx: number;
  cz: number;
  index: ChunkIndex;
  lods: (THREE.Group | null)[];
  shown: number;
  dist: number;
  want: Lod;
}

export class ChunkManager {
  readonly root = new THREE.Group();
  private readonly chunks: Chunk[] = [];
  private vision = false;
  private readonly queue: Chunk[] = [];
  private readonly byDist = (a: Chunk, b: Chunk): number => a.dist - b.dist;
  builtThisFrame = 0;

  constructor(
    private readonly world: WorldData,
    private readonly mats: Materials,
  ) {
    this.root.name = 'chunks';
    this.root.matrixAutoUpdate = false;
    for (let cz = 0; cz < CHUNKS; cz++) {
      for (let cx = 0; cx < CHUNKS; cx++) {
        this.chunks.push({
          cx,
          cz,
          index: { buildings: [], treeIdx: [] },
          lods: [null, null, null],
          shown: -1,
          dist: 1e9,
          want: 2,
        });
      }
    }
    const idx = (x: number, z: number): number => {
      const cx = Math.min(CHUNKS - 1, Math.max(0, Math.floor((x + HALF) / CHUNK)));
      const cz = Math.min(CHUNKS - 1, Math.max(0, Math.floor((z + HALF) / CHUNK)));
      return cz * CHUNKS + cx;
    };
    for (const b of world.buildings) this.chunks[idx(b.x, b.z)].index.buildings.push(b);
    world.trees.forEach((t, i) => this.chunks[idx(t.x, t.z)].index.treeIdx.push(i));
  }

  /** Builds every chunk at the lowest detail (used during loading). */
  *prebuild(): Generator<number> {
    let n = 0;
    for (const c of this.chunks) {
      this.ensure(c, 2);
      n++;
      if (n % 8 === 0) yield n / this.chunks.length;
    }
  }

  private ensure(c: Chunk, lod: Lod): THREE.Group {
    let g = c.lods[lod];
    if (!g) {
      g = buildChunk(this.world, c.index, this.mats, c.cx, c.cz, lod);
      g.visible = false;
      c.lods[lod] = g;
      this.root.add(g);
      if (this.vision) this.applyVision(g, true);
    }
    return g;
  }

  private drop(c: Chunk, lod: Lod): void {
    const g = c.lods[lod];
    if (!g) return;
    this.root.remove(g);
    g.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      else if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    c.lods[lod] = null;
  }

  update(cam: THREE.Vector3, q: QualityPreset, budgetMs: number): void {
    this.queue.length = 0;
    const t0 = performance.now();
    this.builtThisFrame = 0;
    for (const c of this.chunks) {
      const x = (c.cx + 0.5) * CHUNK - HALF;
      const z = (c.cz + 0.5) * CHUNK - HALF;
      const dx = Math.max(0, Math.abs(cam.x - x) - CHUNK / 2);
      const dz = Math.max(0, Math.abs(cam.z - z) - CHUNK / 2);
      const d = Math.hypot(dx, dz);
      c.dist = d;
      let want = d < q.lod1 ? 0 : d < q.lod2 ? 1 : d < q.drawDistance ? 2 : -1;
      // fall back to whatever is already built while the wanted level is queued
      if (want >= 0 && !c.lods[want]) {
        c.want = want as Lod;
        this.queue.push(c);
        if (want < 2 && c.lods[want + 1]) want = want + 1;
        else if (c.lods[2]) want = 2;
        else if (want > 0 && c.lods[want - 1]) want = want - 1;
        else want = -1;
      }
      if (c.shown !== want) {
        if (c.shown >= 0 && c.lods[c.shown]) (c.lods[c.shown] as THREE.Group).visible = false;
        if (want >= 0 && c.lods[want]) (c.lods[want] as THREE.Group).visible = true;
        c.shown = want;
      }
      if (d > q.lod1 * 1.7 && c.lods[0] && c.shown !== 0) this.drop(c, 0);
      if (d > q.lod2 * 1.5 && c.lods[1] && c.shown !== 1) this.drop(c, 1);
    }
    this.queue.sort(this.byDist);
    for (const c of this.queue) {
      if (this.builtThisFrame > 0 && performance.now() - t0 > budgetMs) break;
      this.ensure(c, c.want);
      this.builtThisFrame++;
    }
  }

  /** Synchronously builds full detail around a point (spawn / teleport). */
  warm(p: THREE.Vector3, q: QualityPreset): void {
    this.update(p, q, 1e6);
  }

  setVision(on: boolean): void {
    this.vision = on;
    for (const c of this.chunks) for (const g of c.lods) if (g) this.applyVision(g, on);
  }

  private applyVision(g: THREE.Group, on: boolean): void {
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const base = o.userData.base as THREE.Material | undefined;
      if (!base) return;
      o.material = on ? (this.mats.visionFor(base) ?? base) : base;
    });
  }

  meshCount(): number {
    let n = 0;
    for (const c of this.chunks) if (c.shown >= 0) n++;
    return n;
  }
}
