/** Diagrid exoskeleton: instanced structural members following the lofted surface. */
import * as THREE from 'three';
import type { TowerSpec } from '../specs';
import { memberMatrix } from './meshBuilder';
import { towerPoint } from './towerShape';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * Generates diamond-pattern members over a lofted tower. Nodes on alternate rings are
 * offset by half a bay so members run along helical (geodesic-like) lines.
 */
export function diagridSkin(s: TowerSpec, out: THREE.Matrix4[], bays = 12, module = 16): void {
  const rings = Math.max(2, Math.round(s.height / module));
  const push = 0.9;
  const w = 0.9;
  for (let k = 0; k < rings; k++) {
    const t0 = k / rings;
    const t1 = (k + 1) / rings;
    const off0 = k % 2 === 0 ? 0 : 0.5;
    for (let j = 0; j < bays; j++) {
      const th0 = ((j + off0) / bays) * Math.PI * 2;
      towerPoint(s, t0, th0, _a, push);
      // two members rising to the neighbouring nodes above
      const thL = ((j + off0 - 0.5) / bays) * Math.PI * 2;
      const thR = ((j + off0 + 0.5) / bays) * Math.PI * 2;
      towerPoint(s, t1, thL, _b, push);
      out.push(memberMatrix(_a, _b, w));
      towerPoint(s, t1, thR, _b, push);
      out.push(memberMatrix(_a, _b, w));
    }
    // ring beam at each node level
    if (k % 2 === 0) {
      for (let j = 0; j < bays; j++) {
        towerPoint(s, t0, ((j + off0) / bays) * Math.PI * 2, _a, push);
        towerPoint(s, t0, ((j + 1 + off0) / bays) * Math.PI * 2, _b, push);
        out.push(memberMatrix(_a, _b, w * 0.7));
      }
    }
  }
}
