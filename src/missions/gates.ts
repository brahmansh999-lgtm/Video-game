/** Pooled 3D mission markers: ring gates and ground beacons. */
import * as THREE from 'three';
import { settings } from '../core/settings';
import type { Gate } from './types';

const POOL = 4;

export class GateRenderer {
  readonly group = new THREE.Group();
  private readonly rings: THREE.Mesh[] = [];
  private readonly beacons: THREE.Mesh[] = [];
  private readonly ringMat = new THREE.MeshBasicMaterial({
    color: 0x30ffd0,
    transparent: true,
    opacity: 0.85,
    fog: false,
  });
  private readonly nextMat = new THREE.MeshBasicMaterial({
    color: 0x30ffd0,
    transparent: true,
    opacity: 0.3,
    fog: false,
  });
  private readonly beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffc23a,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  private t = 0;

  constructor(scene: THREE.Scene) {
    const ring = new THREE.TorusGeometry(1, 0.06, 8, 48);
    const beam = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
    for (let i = 0; i < POOL; i++) {
      const r = new THREE.Mesh(ring, this.ringMat);
      r.visible = false;
      r.frustumCulled = false;
      const b = new THREE.Mesh(beam, this.beaconMat);
      b.visible = false;
      b.frustumCulled = false;
      this.rings.push(r);
      this.beacons.push(b);
      this.group.add(r, b);
    }
    scene.add(this.group);
  }

  update(dt: number, gates: readonly Gate[] | null): void {
    this.t += dt;
    const cb = settings.colorBlindHud;
    this.ringMat.color.setHex(cb ? 0xffd23f : 0x30ffd0);
    this.nextMat.color.copy(this.ringMat.color);
    this.beaconMat.color.setHex(cb ? 0x3f9bff : 0xffc23a);
    let r = 0;
    let b = 0;
    const list = gates ?? [];
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g.ring && r < POOL) {
        const m = this.rings[r++];
        m.visible = true;
        m.material = i === 0 ? this.ringMat : this.nextMat;
        m.position.copy(g.pos);
        m.rotation.set(0, g.yaw ?? 0, 0);
        const pulse = i === 0 ? 1 + Math.sin(this.t * 4) * 0.03 : 1;
        m.scale.setScalar(g.radius * pulse);
      } else if (!g.ring && b < POOL) {
        const m = this.beacons[b++];
        m.visible = true;
        m.position.copy(g.pos);
        m.scale.set(g.radius, 400, g.radius);
      }
    }
    for (; r < POOL; r++) this.rings[r].visible = false;
    for (; b < POOL; b++) this.beacons[b].visible = false;
  }
}
