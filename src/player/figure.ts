/** Stylised procedural figure with a simple procedural walk cycle (no rigged assets). */
import * as THREE from 'three';

export interface FigureParts {
  root: THREE.Group;
  hips: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  torso: THREE.Mesh;
}

/** Shared part geometries (also used by the instanced pedestrians). */
export const PART_GEO = {
  torso: new THREE.CapsuleGeometry(0.2, 0.42, 4, 8).translate(0, 0.0, 0),
  head: new THREE.SphereGeometry(0.15, 12, 8),
  limb: new THREE.CapsuleGeometry(0.075, 0.62, 3, 6).translate(0, -0.38, 0),
  arm: new THREE.CapsuleGeometry(0.06, 0.5, 3, 6).translate(0, -0.3, 0),
};

export function buildFigure(cloth: THREE.Material, skin: THREE.Material, pants: THREE.Material): FigureParts {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);
  const torso = new THREE.Mesh(PART_GEO.torso, cloth);
  torso.position.y = 0.38;
  const head = new THREE.Mesh(PART_GEO.head, skin);
  head.position.y = 0.82;
  hips.add(torso, head);
  const limb = (x: number, y: number, geo: THREE.BufferGeometry, m: THREE.Material): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    const me = new THREE.Mesh(geo, m);
    me.castShadow = true;
    g.add(me);
    hips.add(g);
    return g;
  };
  const legL = limb(-0.11, 0.02, PART_GEO.limb, pants);
  const legR = limb(0.11, 0.02, PART_GEO.limb, pants);
  const armL = limb(-0.27, 0.62, PART_GEO.arm, cloth);
  const armR = limb(0.27, 0.62, PART_GEO.arm, cloth);
  torso.castShadow = true;
  head.castShadow = true;
  return { root, hips, legL, legR, armL, armR, torso };
}

/** Pose the figure for a walk phase (radians) and amplitude 0..1. */
export function poseWalk(f: FigureParts, phase: number, amp: number, airborne: boolean): void {
  const s = Math.sin(phase) * amp;
  if (airborne) {
    f.legL.rotation.x = 0.5;
    f.legR.rotation.x = -0.3;
    f.armL.rotation.x = -0.9;
    f.armR.rotation.x = -0.9;
    f.hips.position.y = 0.92;
    return;
  }
  f.legL.rotation.x = s * 0.75;
  f.legR.rotation.x = -s * 0.75;
  f.armL.rotation.x = -s * 0.6;
  f.armR.rotation.x = s * 0.6;
  f.armL.rotation.z = 0.08;
  f.armR.rotation.z = -0.08;
  f.hips.position.y = 0.92 + Math.abs(Math.cos(phase)) * 0.05 * amp;
  f.torso.rotation.y = s * 0.12;
}
