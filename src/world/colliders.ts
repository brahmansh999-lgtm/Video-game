/** Simple static colliders for everything in the world (never render trimeshes). */
import * as THREE from 'three';
import { GROUP_STATIC, RAPIER, type Physics } from '../core/physics';
import { bridgeColliders } from './architecture/bridge';
import { terraceBoxes } from './architecture/massing';
import { ribbonColliders, type OrientedBox } from './architecture/ribbon';
import { canopyColumns, canopyHeight, domeHullPoints } from './architecture/shellCanopy';
import { towerHullPoints } from './architecture/loftTower';
import { WORLD } from './layout';
import { damCollider, maglevColliders } from './structures';
import { HF_N } from './terrain';
import type { WorldData } from './worldData';

export function createStaticColliders(phys: Physics, w: WorldData): number {
  const world = phys.world;
  let count = 0;
  const add = (d: RAPIER.ColliderDesc | null): void => {
    if (!d) return;
    d.setCollisionGroups(GROUP_STATIC).setFriction(0.9);
    world.createCollider(d);
    count++;
  };
  const box = (b: OrientedBox): void => {
    add(
      RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz)
        .setTranslation(b.cx, b.cy, b.cz)
        .setRotation({ x: b.q.x, y: b.q.y, z: b.q.z, w: b.q.w }),
    );
  };
  const qY = (a: number): RAPIER.Rotation => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    return { x: q.x, y: q.y, z: q.z, w: q.w };
  };

  add(RAPIER.ColliderDesc.heightfield(HF_N, HF_N, w.terrain.rapierHeights(), { x: WORLD, y: 1, z: WORLD }));

  for (const s of w.buildings) {
    switch (s.kind) {
      case 'tower': {
        const d = RAPIER.ColliderDesc.convexHull(towerHullPoints(s));
        add(d ? d.setTranslation(s.x, s.y, s.z) : null);
        break;
      }
      case 'ribbon':
        for (const b of ribbonColliders(s)) box(b);
        break;
      case 'canopy': {
        for (const c of canopyColumns(s))
          add(RAPIER.ColliderDesc.cylinder(c.h / 2, c.r).setTranslation(c.x, c.y + c.h / 2, c.z));
        const h = canopyHeight(s, 0, 0) * 0.75;
        add(
          RAPIER.ColliderDesc.cuboid(s.sx * 0.3, 0.6, s.sz * 0.3)
            .setTranslation(s.x, s.y + h, s.z)
            .setRotation(qY(s.rot)),
        );
        break;
      }
      case 'dome': {
        const d = RAPIER.ColliderDesc.convexHull(domeHullPoints(s));
        add(d ? d.setTranslation(s.x, s.y, s.z) : null);
        break;
      }
      case 'terrace':
        for (const b of terraceBoxes(s))
          add(
            RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(s.x, b.y, s.z).setRotation(qY(s.rot)),
          );
        break;
      case 'block':
        add(
          RAPIER.ColliderDesc.cuboid(s.w / 2, s.height / 2 + 0.5, s.d / 2)
            .setTranslation(s.x, s.y + s.height / 2 + 0.5, s.z)
            .setRotation(qY(s.rot)),
        );
        break;
      case 'hangar':
        add(
          RAPIER.ColliderDesc.cuboid(s.span / 2, s.height * 0.45, s.length / 2)
            .setTranslation(s.x, s.y + s.height * 0.45, s.z)
            .setRotation(qY(s.rot)),
        );
        break;
    }
  }
  for (const sb of w.skybridges) {
    const len = Math.hypot(sb.bx - sb.ax, sb.bz - sb.az);
    add(
      RAPIER.ColliderDesc.cuboid(sb.width / 2, 3.4, len / 2)
        .setTranslation((sb.ax + sb.bx) / 2, sb.y + 3.2, (sb.az + sb.bz) / 2)
        .setRotation(qY(Math.atan2(sb.bx - sb.ax, sb.bz - sb.az))),
    );
  }
  for (const b of w.bridges) for (const o of bridgeColliders(b)) box(o);
  for (const p of w.paths) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const a = p.pts[i];
      const b = p.pts[i + 1];
      if (!a.bridge && !b.bridge) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      box({
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2 - 1.1,
        cz: (a.z + b.z) / 2,
        hx: p.width / 2 + 1,
        hy: 1,
        hz: len / 2 + 0.4,
        q,
      });
    }
  }
  for (const o of maglevColliders()) box(o);
  box(damCollider());
  for (const v of w.vertiports)
    add(RAPIER.ColliderDesc.cylinder(0.25, 14).setTranslation(v.x, v.y - 0.25, v.z));
  for (const t of w.trees)
    add(RAPIER.ColliderDesc.cylinder(1.6 * t.s, 0.35 * t.s).setTranslation(t.x, t.y + 1.6 * t.s, t.z));
  for (const t of w.turbines) add(RAPIER.ColliderDesc.cylinder(40, 2.2).setTranslation(t.x, t.y + 40, t.z));
  return count;
}
