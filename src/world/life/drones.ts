/** Drones and air taxis flying elliptical flight lanes (analytic motion, instanced, zero allocation). */
import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';
import type { Materials } from '../../render/materials';
import { MeshBuilder } from '../architecture/meshBuilder';

interface Lane {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  y: number;
  speed: number;
  phase: number;
  dir: number;
}

const DRONES = 36;
const TAXIS = 14;

function droneGeo(): THREE.BufferGeometry {
  const b = new MeshBuilder({ color: true });
  b.setColor(0x2b2e33).box(0, 0, 0, 0.5, 0.12, 0.5);
  b.setColor(0x111111);
  for (const [x, z] of [
    [-0.7, -0.7],
    [0.7, -0.7],
    [-0.7, 0.7],
    [0.7, 0.7],
  ])
    b.box(x, 0.12, z, 0.35, 0.02, 0.35);
  b.setColor(0xff3030).box(0, -0.15, 0, 0.12, 0.05, 0.12);
  return b.toGeometry() as THREE.BufferGeometry;
}

function taxiGeo(): THREE.BufferGeometry {
  const b = new MeshBuilder({ color: true });
  b.setColor(0xf0f0f0).box(0, 0, 0, 1.1, 0.8, 2.4);
  b.setColor(0x1b2630).box(0, 0.45, -1.0, 1.0, 0.4, 0.9);
  b.setColor(0x2a9d8f);
  for (const [x, z] of [
    [-2.4, -1.4],
    [2.4, -1.4],
    [-2.4, 1.6],
    [2.4, 1.6],
  ])
    b.box(x, 0.3, z, 0.9, 0.08, 0.9);
  b.setColor(0x2a9d8f).box(0, 0.25, 0.2, 2.6, 0.05, 0.25);
  return b.toGeometry() as THREE.BufferGeometry;
}

export class Drones {
  readonly group = new THREE.Group();
  private readonly drones: THREE.InstancedMesh;
  private readonly taxis: THREE.InstancedMesh;
  private readonly beacons: THREE.InstancedMesh;
  private readonly lanes: Lane[] = [];
  private t = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);

  constructor(mats: Materials) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.4 });
    this.drones = new THREE.InstancedMesh(droneGeo(), mat, DRONES);
    this.taxis = new THREE.InstancedMesh(taxiGeo(), mat, TAXIS);
    this.beacons = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.35, 6, 4),
      mats.redLight,
      DRONES + TAXIS,
    );
    for (const im of [this.drones, this.taxis, this.beacons]) im.frustumCulled = false;
    this.taxis.castShadow = true;
    this.group.add(this.drones, this.taxis, this.beacons);
    const rnd = mulberry32(55);
    for (let i = 0; i < DRONES + TAXIS; i++) {
      const taxi = i >= DRONES;
      this.lanes.push({
        cx: (rnd() - 0.5) * 1800,
        cz: (rnd() - 0.5) * 1600,
        rx: 120 + rnd() * (taxi ? 700 : 300),
        rz: 120 + rnd() * (taxi ? 600 : 300),
        y: taxi ? 140 + Math.floor(rnd() * 4) * 30 : 50 + rnd() * 80,
        speed: taxi ? 30 + rnd() * 15 : 10 + rnd() * 8,
        phase: rnd() * Math.PI * 2,
        dir: rnd() < 0.5 ? 1 : -1,
      });
    }
  }

  update(dt: number): void {
    this.t += dt;
    for (let i = 0; i < this.lanes.length; i++) {
      const L = this.lanes[i];
      const r = (L.rx + L.rz) / 2;
      const a = L.phase + ((this.t * L.speed) / r) * L.dir;
      const x = L.cx + Math.cos(a) * L.rx;
      const z = L.cz + Math.sin(a) * L.rz;
      const y = L.y + Math.sin(a * 3) * 4;
      // tangent heading
      const tx = -Math.sin(a) * L.rx * L.dir;
      const tz = Math.cos(a) * L.rz * L.dir;
      const yaw = Math.atan2(-tx, -tz);
      this.q.setFromEuler(this.e.set(-0.08, yaw, 0.15 * L.dir));
      this.p.set(x, y, z);
      this.m.compose(this.p, this.q, this.s);
      if (i < DRONES) this.drones.setMatrixAt(i, this.m);
      else this.taxis.setMatrixAt(i - DRONES, this.m);
      const blink = Math.sin(this.t * 6 + i) > 0.6;
      this.p.y -= blink ? 0.4 : 9999;
      this.m.makeTranslation(this.p.x, this.p.y, this.p.z);
      this.beacons.setMatrixAt(i, this.m);
    }
    this.drones.instanceMatrix.needsUpdate = true;
    this.taxis.instanceMatrix.needsUpdate = true;
    this.beacons.instanceMatrix.needsUpdate = true;
  }
}
