/** Instanced lane-following traffic on the road graph; brakes for the player. Fully pooled. */
import * as THREE from 'three';
import { GROUP_TRAFFIC, RAPIER, type Physics } from '../../core/physics';
import { mulberry32 } from '../../core/rng';
import type { Materials } from '../../render/materials';
import { CARS } from '../../vehicles/carDefs';
import { carShapes, wheelGeometry, wheelRestY } from '../../vehicles/meshes';
import { merge, tint } from '../../vehicles/shapes';
import type { RoadGraph } from '../roads';
import type { Terrain } from '../terrain';

export const MAX_TRAFFIC = 90;
export const TRAFFIC_PAINTS = [
  0xe8e8e8, 0x1b1d22, 0xc8302a, 0x2d6bd6, 0xf2b21b, 0x2a9d8f, 0x8a8f99, 0x5a3f8a,
];

/** Pose and paint of a traffic car that was just taken off the road (carjacked). */
export interface TakenCar {
  x: number;
  y: number;
  z: number;
  yaw: number;
  color: number;
}
const SPAWN_R = 520;
const DESPAWN_R = 700;

interface Agent {
  active: boolean;
  edge: number;
  from: number;
  t: number;
  lane: number;
  speed: number;
  cruise: number;
  yaw: number;
  x: number;
  y: number;
  z: number;
  color: number;
  body: RAPIER.RigidBody;
}

/** Traffic cars share the EV body; it is lifted so the tyres sit on the road (y = 0). */
const TRAFFIC_DEF = CARS.ev;
const LIFT = -(wheelRestY(TRAFFIC_DEF) - TRAFFIC_DEF.wheelRadius);

/** Body, glass, trim and wheels in one vertex-coloured mesh; paint is white so the instance colour shows. */
function carGeometry(): THREE.BufferGeometry {
  const s = carShapes(TRAFFIC_DEF);
  const wy = wheelRestY(TRAFFIC_DEF);
  const wheel = wheelGeometry(TRAFFIC_DEF.wheelRadius);
  const wheels: THREE.BufferGeometry[] = [];
  for (const x of [-1, 1])
    for (const z of [-TRAFFIC_DEF.wheelZ, TRAFFIC_DEF.wheelZ])
      wheels.push(wheel.clone().translate(x * (TRAFFIC_DEF.wheelX + 0.05), wy, z));
  // vertex colours multiply the instance colour: dark parts stay dark on any paint
  return merge([
    ...s.paint.map((g) => tint(g, 0xffffff)),
    ...s.glass.map((g) => tint(g, 0x1a1f26)),
    ...s.trim.map((g) => tint(g, 0x18181a)),
    ...s.chrome.map((g) => tint(g, 0x9a9da2)),
    ...s.plate.map((g) => tint(g, 0xe0e0e0)),
    ...wheels.map((g) => g.clone()),
  ]).translate(0, LIFT, 0);
}

export class Traffic {
  readonly mesh: THREE.InstancedMesh;
  readonly lights: THREE.InstancedMesh;
  readonly tails: THREE.InstancedMesh;
  private readonly agents: Agent[] = [];
  private readonly rnd = mulberry32(99);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly kin = { x: 0, y: 0, z: 0 };
  private readonly kq = { x: 0, y: 0, z: 0, w: 1 };
  private readonly color = new THREE.Color();
  activeCount = 0;
  density = 1;

  constructor(
    private readonly roads: RoadGraph,
    private readonly terrain: Terrain,
    phys: Physics,
    mats: Materials,
  ) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.5 });
    this.mesh = new THREE.InstancedMesh(carGeometry(), mat, MAX_TRAFFIC);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    // headlights and tail lights as separate emissive instances
    const ls = carShapes(TRAFFIC_DEF);
    this.lights = new THREE.InstancedMesh(merge(ls.lamp).translate(0, LIFT, 0), mats.lightLamp, MAX_TRAFFIC);
    this.lights.frustumCulled = false;
    this.tails = new THREE.InstancedMesh(merge(ls.tail).translate(0, LIFT, 0), mats.redLight, MAX_TRAFFIC);
    this.tails.frustumCulled = false;
    const palette = TRAFFIC_PAINTS;
    for (let i = 0; i < MAX_TRAFFIC; i++) {
      const body = phys.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -500 - i * 5, 0),
      );
      phys.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.9, 0.7, 2.1).setTranslation(0, 0.7, 0).setCollisionGroups(GROUP_TRAFFIC),
        body,
      );
      this.agents.push({
        active: false,
        edge: 0,
        from: 0,
        t: 0,
        lane: 0,
        speed: 0,
        cruise: 13,
        yaw: 0,
        x: 0,
        y: -500,
        z: 0,
        color: palette[i % palette.length],
        body,
      });
      this.color.setHex(palette[i % palette.length]);
      this.mesh.setColorAt(i, this.color);
      this.m.makeTranslation(0, -1000, 0);
      this.mesh.setMatrixAt(i, this.m);
      this.lights.setMatrixAt(i, this.m);
      this.tails.setMatrixAt(i, this.m);
    }
  }

  private spawn(a: Agent, px: number, pz: number): boolean {
    const edges = this.roads.edges;
    for (let tries = 0; tries < 12; tries++) {
      const e = edges[Math.floor(this.rnd() * edges.length)];
      const A = this.roads.nodes[e.a];
      const B = this.roads.nodes[e.b];
      const mx = (A.x + B.x) / 2;
      const mz = (A.z + B.z) / 2;
      const d = Math.hypot(mx - px, mz - pz);
      if (d > SPAWN_R || d < 90) continue;
      a.edge = e.id;
      a.from = this.rnd() < 0.5 ? e.a : e.b;
      a.t = this.rnd() * e.length;
      a.lane = this.rnd() < 0.5 ? 2.2 : 5.8;
      a.cruise = e.kind === 'highway' ? 24 + this.rnd() * 6 : 11 + this.rnd() * 5;
      a.speed = a.cruise;
      a.x = mx;
      a.z = mz;
      a.active = true;
      return true;
    }
    return false;
  }

  private advanceEdge(a: Agent): void {
    const to = this.roads.otherEnd(a.edge, a.from);
    const node = this.roads.nodes[to];
    const opts = node.edges;
    let next = a.edge;
    if (opts.length > 1) {
      for (let k = 0; k < 4; k++) {
        const c = opts[Math.floor(this.rnd() * opts.length)];
        if (c !== a.edge) {
          next = c;
          break;
        }
      }
    }
    a.from = to;
    a.edge = next;
    a.t = 0;
    const e = this.roads.edges[next];
    a.cruise = e.kind === 'highway' ? 24 + this.rnd() * 6 : 11 + this.rnd() * 5;
  }

  /**
   * Index of a stopped (or crawling) traffic car whose bodywork is within `reach` metres of p,
   * or -1. Distance is measured to the car's footprint, not its centre.
   */
  stealable(p: THREE.Vector3, reach: number): number {
    let best = -1;
    let bd = reach;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (!a.active || a.speed > 2.5 || Math.abs(p.y - a.y) > 2.5) continue;
      const dx = p.x - a.x;
      const dz = p.z - a.z;
      if (dx * dx + dz * dz > 64) continue;
      // into the car's local frame (forward = -Z)
      const c = Math.cos(a.yaw);
      const sn = Math.sin(a.yaw);
      const lx = dx * c - dz * sn;
      const lz = dx * sn + dz * c;
      const d = Math.hypot(Math.max(0, Math.abs(lx) - 0.9), Math.max(0, Math.abs(lz) - 2.1));
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** Take traffic car i off the road (it is replaced by a drivable car) and return its pose. */
  take(i: number): TakenCar {
    const a = this.agents[i];
    const out = { x: a.x, y: a.y, z: a.z, yaw: a.yaw, color: a.color };
    a.active = false;
    a.speed = 0;
    this.kin.x = 0;
    this.kin.y = -500 - i * 5;
    this.kin.z = 0;
    a.body.setTranslation(this.kin, true);
    a.body.setNextKinematicTranslation(this.kin);
    this.m.makeTranslation(0, -1000, 0);
    this.mesh.setMatrixAt(i, this.m);
    this.lights.setMatrixAt(i, this.m);
    this.tails.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
    this.tails.instanceMatrix.needsUpdate = true;
    return out;
  }

  /** obstacles: positions the cars should not drive into (player, player vehicle). */
  fixed(dt: number, focus: THREE.Vector3, obstacles: THREE.Vector3[], _night: number): void {
    const want = Math.floor(MAX_TRAFFIC * this.density);
    this.activeCount = 0;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (!a.active) {
        if (i < want) this.spawn(a, focus.x, focus.z);
        if (!a.active) continue;
      }
      if (i >= want || Math.hypot(a.x - focus.x, a.z - focus.z) > DESPAWN_R) {
        a.active = false;
        this.kin.x = 0;
        this.kin.y = -500 - i * 5;
        this.kin.z = 0;
        a.body.setNextKinematicTranslation(this.kin);
        this.m.makeTranslation(0, -1000, 0);
        this.mesh.setMatrixAt(i, this.m);
        this.lights.setMatrixAt(i, this.m);
        this.tails.setMatrixAt(i, this.m);
        continue;
      }
      this.activeCount++;
      const e = this.roads.edges[a.edge];
      const A = this.roads.nodes[a.from];
      const B = this.roads.nodes[this.roads.otherEnd(a.edge, a.from)];
      const dx = (B.x - A.x) / e.length;
      const dz = (B.z - A.z) / e.length;
      // look ahead for obstacles in our lane
      let target = a.cruise;
      const fx = a.x + dx * 3;
      const fz = a.z + dz * 3;
      for (const o of obstacles) {
        const ox = o.x - fx;
        const oz = o.z - fz;
        const ahead = ox * dx + oz * dz;
        const lat = Math.abs(-ox * dz + oz * dx);
        if (ahead > -1 && ahead < 22 && lat < 3.0 && Math.abs(o.y - a.y) < 4)
          target = Math.min(target, Math.max(0, (ahead - 1.4) * 0.9));
      }
      for (let j = 0; j < this.agents.length; j++) {
        const b = this.agents[j];
        if (j === i || !b.active || b.edge !== a.edge || b.from !== a.from || b.lane !== a.lane) continue;
        const gap = b.t - a.t;
        if (gap > 0 && gap < 16) target = Math.min(target, b.speed * (gap / 16));
      }
      a.speed += (target - a.speed) * Math.min(1, dt * (target < a.speed ? 4 : 1.2));
      a.t += a.speed * dt;
      if (a.t >= e.length) this.advanceEdge(a);
      const e2 = this.roads.edges[a.edge];
      const A2 = this.roads.nodes[a.from];
      const B2 = this.roads.nodes[this.roads.otherEnd(a.edge, a.from)];
      const ux = (B2.x - A2.x) / e2.length;
      const uz = (B2.z - A2.z) / e2.length;
      const f = Math.min(1, a.t / e2.length);
      a.x = A2.x + (B2.x - A2.x) * f - uz * a.lane;
      a.z = A2.z + (B2.z - A2.z) * f + ux * a.lane;
      a.y = e2.kind === 'grid' ? this.terrain.heightAt(a.x, a.z) : A2.y + (B2.y - A2.y) * f;
      const yaw = Math.atan2(-ux, -uz);
      let dy = yaw - a.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      a.yaw += dy * Math.min(1, dt * 8);
      this.q.setFromAxisAngle(this.up, a.yaw);
      this.kin.x = a.x;
      this.kin.y = a.y;
      this.kin.z = a.z;
      this.kq.x = this.q.x;
      this.kq.y = this.q.y;
      this.kq.z = this.q.z;
      this.kq.w = this.q.w;
      a.body.setNextKinematicTranslation(this.kin);
      a.body.setNextKinematicRotation(this.kq);
      this.p.set(a.x, a.y, a.z);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      // lamps are always placed: their emissive strength already follows the time of day
      this.lights.setMatrixAt(i, this.m);
      this.tails.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
    this.tails.instanceMatrix.needsUpdate = true;
  }
}
