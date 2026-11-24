/** Wind turbines on the hill ridges: two instanced meshes, rotors animated without allocation. */
import * as THREE from 'three';
import { hash2 } from '../core/rng';
import type { Materials } from '../render/materials';
import { hillsMask, inAirport, isWater } from './layout';
import type { Terrain } from './terrain';

export const HUB_HEIGHT = 82;

export function placeTurbines(
  terrain: Terrain,
  nearRoad: (x: number, z: number) => boolean,
): { x: number; y: number; z: number }[] {
  const res: { x: number; y: number; z: number }[] = [];
  for (let gz = -2000; gz < 2000 && res.length < 26; gz += 70) {
    for (let gx = -2000; gx < 2000 && res.length < 26; gx += 70) {
      const x = gx + (hash2(gx, gz, 3) - 0.5) * 40;
      const z = gz + (hash2(gx, gz, 4) - 0.5) * 40;
      if (hillsMask(x, z) < 0.9 || isWater(x, z) || inAirport(x, z) || nearRoad(x, z)) continue;
      const y = terrain.heightAt(x, z);
      if (y < 95) continue;
      // ridge test: higher than surroundings
      const around =
        (terrain.heightAt(x + 60, z) +
          terrain.heightAt(x - 60, z) +
          terrain.heightAt(x, z + 60) +
          terrain.heightAt(x, z - 60)) /
        4;
      if (y < around + 2) continue;
      if (res.some((t) => Math.hypot(t.x - x, t.z - z) < 170)) continue;
      res.push({ x, y, z });
    }
  }
  return res;
}

export class Turbines {
  readonly group = new THREE.Group();
  private readonly rotors: THREE.InstancedMesh;
  private angle = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly yaw: number[];

  constructor(
    private readonly sites: { x: number; y: number; z: number }[],
    mats: Materials,
  ) {
    const tower = new THREE.CylinderGeometry(1.4, 2.4, HUB_HEIGHT, 10).translate(0, HUB_HEIGHT / 2, 0);
    const towers = new THREE.InstancedMesh(tower, mats.slab, sites.length);
    const nacelle = new THREE.BoxGeometry(3, 3, 9).translate(0, HUB_HEIGHT, 1.5);
    const nac = new THREE.InstancedMesh(nacelle, mats.slab, sites.length);
    const blade = new THREE.BoxGeometry(1.6, 34, 0.4).translate(0, 17, 0);
    const blades: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) blades.push(blade.clone().rotateZ((i * Math.PI * 2) / 3));
    const rotorGeo = mergeGeoms(blades);
    this.rotors = new THREE.InstancedMesh(rotorGeo, mats.slab, sites.length);
    this.yaw = sites.map((_, i) => 0.6 + i * 0.05);
    sites.forEach((t, i) => {
      this.m.makeRotationY(this.yaw[i]).setPosition(t.x, t.y, t.z);
      towers.setMatrixAt(i, this.m);
      nac.setMatrixAt(i, this.m);
    });
    for (const im of [towers, nac, this.rotors]) {
      im.castShadow = true;
      im.computeBoundingSphere();
      im.frustumCulled = false;
    }
    this.group.add(towers, nac, this.rotors);
    this.update(0, 1);
  }

  update(dt: number, wind: number): void {
    this.angle += dt * (0.6 + wind * 0.08);
    for (let i = 0; i < this.sites.length; i++) {
      const t = this.sites[i];
      this.e.set(0, this.yaw[i], this.angle + i, 'YXZ');
      this.q.setFromEuler(this.e);
      this.p.set(t.x - Math.sin(this.yaw[i]) * 3.5, t.y + HUB_HEIGHT, t.z - Math.cos(this.yaw[i]) * 3.5);
      this.m.compose(this.p, this.q, this.s);
      this.rotors.setMatrixAt(i, this.m);
    }
    this.rotors.instanceMatrix.needsUpdate = true;
  }

  centroid(): THREE.Vector3 {
    const c = new THREE.Vector3();
    for (const t of this.sites) c.add(new THREE.Vector3(t.x, t.y, t.z));
    return c.divideScalar(Math.max(1, this.sites.length));
  }
}

function mergeGeoms(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...(ng.getAttribute('position').array as Float32Array));
    nor.push(...(ng.getAttribute('normal').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
