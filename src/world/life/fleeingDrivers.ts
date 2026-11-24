/** Drivers thrown out of carjacked traffic: they stumble out of the door and run off, then vanish. */
import * as THREE from 'three';
import { HAIR_COLORS, SKIN_TONES, buildFigure, poseWalk, type FigureParts } from '../../player/figure';
import type { Materials } from '../../render/materials';
import type { Terrain } from '../terrain';

const POOL = 4;
const LIFE = 7;

interface Runner {
  fig: FigureParts;
  t: number;
  x: number;
  z: number;
  y: number;
  dx: number;
  dz: number;
  phase: number;
}

export class FleeingDrivers {
  readonly group = new THREE.Group();
  private readonly pool: Runner[] = [];
  private next = 0;

  constructor(
    private readonly terrain: Terrain,
    mats: Materials,
  ) {
    for (let i = 0; i < POOL; i++) {
      const fig = buildFigure(
        mats.cloth[(i * 3 + 1) % mats.cloth.length],
        mats.skin,
        mats.cloth[(i + 2) % mats.cloth.length],
        {
          skin: SKIN_TONES[(i * 3 + 2) % SKIN_TONES.length],
          hair: HAIR_COLORS[(i * 2 + 1) % HAIR_COLORS.length],
        },
      );
      fig.root.visible = false;
      this.group.add(fig.root);
      this.pool.push({ fig, t: LIFE, x: 0, z: 0, y: 0, dx: 0, dz: 1, phase: 0 });
    }
  }

  /** Spawn a driver at (x, y, z) fleeing along (dx, dz). y is the road surface height. */
  spawn(x: number, y: number, z: number, dx: number, dz: number): void {
    const r = this.pool[this.next];
    this.next = (this.next + 1) % POOL;
    const l = Math.hypot(dx, dz) || 1;
    r.x = x;
    r.y = y;
    r.z = z;
    r.dx = dx / l;
    r.dz = dz / l;
    r.t = 0;
    r.phase = 0;
    r.fig.root.visible = true;
    r.fig.root.rotation.set(0, Math.atan2(-r.dx, -r.dz), 0);
  }

  update(dt: number): void {
    for (const r of this.pool) {
      if (r.t >= LIFE) continue;
      r.t += dt;
      if (r.t >= LIFE) {
        r.fig.root.visible = false;
        continue;
      }
      // a short stumble out of the door, then a sprint
      const sp = r.t < 0.35 ? 1.5 : 6.2;
      r.x += r.dx * sp * dt;
      r.z += r.dz * sp * dt;
      const g = this.terrain.heightAt(r.x, r.z);
      // stay on bridges/elevated roads if we started above the terrain
      const y = r.y - g > 2 ? r.y : g;
      r.fig.root.position.set(r.x, y, r.z);
      r.phase += dt * (2.2 + sp * 1.35);
      poseWalk(r.fig, r.phase, Math.min(1, sp / 5), false);
    }
  }
}
