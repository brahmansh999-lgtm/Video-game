/** Maglev trains running a timetable on the elevated ring, stopping at four halo stations. */
import * as THREE from 'three';
import type { Materials } from '../../render/materials';
import { MeshBuilder } from '../architecture/meshBuilder';
import { RING_RADIUS } from '../planContext';
import { MAGLEV_Y, STATION_ANGLES } from '../structures';

const CARS = 4;
const CAR_LEN = 24;
const CRUISE = 36;
const ACCEL = 1.6;
const DWELL = 18;
const CIRC = Math.PI * 2 * RING_RADIUS;

export interface Train {
  s: number;
  v: number;
  dwell: number;
  /** runaway trains skip stations until they reach `terminus` (arc length) */
  runaway: boolean;
  terminus: number;
  stopped: boolean;
}

function carGeo(): THREE.BufferGeometry {
  const b = new MeshBuilder({ color: true });
  b.setColor(0xf4f4f2).box(0, 2.1, 0, 1.6, 1.6, CAR_LEN / 2 - 0.4);
  b.setColor(0x15222c).box(0, 2.5, 0, 1.63, 0.55, CAR_LEN / 2 - 1.2);
  b.setColor(0x31e8ff).box(0, 0.62, 0, 1.4, 0.1, CAR_LEN / 2 - 0.6);
  return b.toGeometry() as THREE.BufferGeometry;
}

export class Maglev {
  readonly mesh: THREE.InstancedMesh;
  readonly trains: Train[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly stationS = STATION_ANGLES.map((a) => a * RING_RADIUS);

  constructor(mats: Materials) {
    void mats;
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.3,
      metalness: 0.3,
      emissive: 0x000000,
    });
    this.mesh = new THREE.InstancedMesh(carGeo(), mat, CARS * 3);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < 3; i++) {
      this.trains.push({
        s: this.stationS[i] + 1,
        v: 0,
        dwell: 4 + i * 6,
        runaway: false,
        terminus: 0,
        stopped: false,
      });
    }
  }

  /** World position of a train's lead car. */
  position(i: number, out: THREE.Vector3): THREE.Vector3 {
    const a = this.trains[i].s / RING_RADIUS;
    return out.set(Math.cos(a) * RING_RADIUS, MAGLEV_Y + 2, Math.sin(a) * RING_RADIUS);
  }

  /** Make train i a runaway heading for the station `stops` stations ahead. */
  makeRunaway(i: number, stops: number, startS: number): void {
    const t = this.trains[i];
    t.s = startS;
    t.v = 8;
    t.dwell = 0;
    t.runaway = true;
    t.stopped = false;
    const k = this.stationS.findIndex((s) => s > startS + 50);
    const idx = ((k < 0 ? 0 : k) + stops - 1) % this.stationS.length;
    let term = this.stationS[idx];
    while (term < startS) term += CIRC;
    t.terminus = term;
  }

  reset(): void {
    this.trains.forEach((t, i) => {
      t.s = this.stationS[i] + 1;
      t.v = 0;
      t.dwell = 4 + i * 6;
      t.runaway = false;
      t.stopped = false;
    });
  }

  private nextStop(t: Train): number {
    if (t.runaway) return t.terminus;
    let best = Infinity;
    for (const st of this.stationS) {
      let d = st - t.s;
      while (d < 1) d += CIRC;
      best = Math.min(best, t.s + d);
    }
    return best;
  }

  update(dt: number): void {
    for (const t of this.trains) {
      if (t.stopped) continue;
      if (t.dwell > 0) {
        t.dwell -= dt;
        continue;
      }
      const stop = this.nextStop(t);
      const dist = stop - t.s;
      const cruise = t.runaway ? CRUISE * 1.15 : CRUISE;
      const brakeDist = (t.v * t.v) / (2 * ACCEL);
      if (dist <= brakeDist + 2) t.v = Math.max(1.2, t.v - ACCEL * dt);
      else t.v = Math.min(cruise, t.v + ACCEL * dt);
      t.s += t.v * dt;
      if (t.s >= stop - 0.5) {
        t.s = stop;
        t.v = 0;
        if (t.runaway) {
          t.stopped = true;
        } else t.dwell = DWELL;
      }
      if (!t.runaway && t.s > CIRC) t.s -= CIRC;
    }
    let k = 0;
    for (const t of this.trains) {
      for (let c = 0; c < CARS; c++) {
        const s = t.s - c * CAR_LEN - CAR_LEN / 2;
        const a = s / RING_RADIUS;
        this.p.set(Math.cos(a) * RING_RADIUS, MAGLEV_Y + 0.3, Math.sin(a) * RING_RADIUS);
        // direction of travel = increasing angle -> tangent (-sin, cos)
        this.q.setFromAxisAngle(this.up, Math.atan2(Math.sin(a), -Math.cos(a)));
        this.m.compose(this.p, this.q, this.s);
        this.mesh.setMatrixAt(k++, this.m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
