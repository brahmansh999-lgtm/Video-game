/** Stylised pedestrians walking the sidewalks: 6 instanced meshes (one per body part), pooled. */
import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';
import type { Materials } from '../../render/materials';
import { BODY, HAIR_COLORS, PED_GEO, SKIN_TONES } from '../../player/figure';
import type { RoadGraph } from '../roads';
import type { Terrain } from '../terrain';

export const MAX_PEDS = 160;
const SIDEWALK = 10.5;
const R_SPAWN = 230;
const R_DESPAWN = 300;

interface Ped {
  active: boolean;
  edge: number;
  from: number;
  t: number;
  side: number;
  speed: number;
  phase: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

type PartKey = keyof typeof PED_GEO;
type Tone = 'shirt' | 'skin' | 'hair' | 'pants';
const TORSO_Y = BODY.hipY + BODY.spineY;
const PARTS: { geo: PartKey; tone: Tone; ox: number; oy: number; swing: number }[] = [
  { geo: 'torso', tone: 'shirt', ox: 0, oy: TORSO_Y, swing: 0 },
  { geo: 'head', tone: 'skin', ox: 0, oy: TORSO_Y + BODY.neckY - 0.02, swing: 0 },
  { geo: 'hair', tone: 'hair', ox: 0, oy: TORSO_Y + BODY.neckY - 0.02, swing: 0 },
  { geo: 'leg', tone: 'pants', ox: -BODY.hipX, oy: BODY.hipY, swing: 0.55 },
  { geo: 'leg', tone: 'pants', ox: BODY.hipX, oy: BODY.hipY, swing: -0.55 },
  { geo: 'arm', tone: 'skin', ox: -BODY.shoulderX, oy: TORSO_Y + BODY.shoulderY, swing: -0.45 },
  { geo: 'arm', tone: 'skin', ox: BODY.shoulderX, oy: TORSO_Y + BODY.shoulderY, swing: 0.45 },
];

export class Pedestrians {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly peds: Ped[] = [];
  private readonly rnd = mulberry32(31);
  private readonly root = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly out = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly sc = new THREE.Vector3(1, 1, 1);
  private readonly hidden = new THREE.Matrix4().makeTranslation(0, -2000, 0);
  density = 1;

  constructor(
    private readonly roads: RoadGraph,
    private readonly terrain: Terrain,
    mats: Materials,
  ) {
    const color = new THREE.Color();
    PARTS.forEach((part, k) => {
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: part.tone === 'skin' ? 0.65 : part.tone === 'hair' ? 0.9 : 0.85,
      });
      const im = new THREE.InstancedMesh(PED_GEO[part.geo], mat, MAX_PEDS);
      im.frustumCulled = false;
      im.castShadow = k < 5;
      for (let i = 0; i < MAX_PEDS; i++) {
        im.setMatrixAt(i, this.hidden);
        if (part.tone === 'skin') color.setHex(SKIN_TONES[(i * 7 + 3) % SKIN_TONES.length]);
        else if (part.tone === 'hair') color.setHex(HAIR_COLORS[(i * 5 + 1) % HAIR_COLORS.length]);
        else if (part.tone === 'pants') color.copy(mats.cloth[(i * 5 + 2) % mats.cloth.length].color);
        else color.copy(mats.cloth[(i * 3) % mats.cloth.length].color);
        im.setColorAt(i, color);
      }
      this.meshes.push(im);
      this.group.add(im);
    });
    for (let i = 0; i < MAX_PEDS; i++) {
      this.peds.push({
        active: false,
        edge: 0,
        from: 0,
        t: 0,
        side: 1,
        speed: 1.3,
        phase: 0,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        scale: 0.92 + ((i * 37) % 17) / 100,
      });
    }
  }

  private spawn(p: Ped, fx: number, fz: number): void {
    const edges = this.roads.edges;
    for (let tries = 0; tries < 10; tries++) {
      const e = edges[Math.floor(this.rnd() * edges.length)];
      if (e.kind !== 'grid') continue;
      const A = this.roads.nodes[e.a];
      const d = Math.hypot(A.x - fx, A.z - fz);
      if (d > R_SPAWN) continue;
      p.edge = e.id;
      p.from = this.rnd() < 0.5 ? e.a : e.b;
      p.t = this.rnd() * e.length;
      p.side = this.rnd() < 0.5 ? 1 : -1;
      p.speed = 1.1 + this.rnd() * 0.7;
      p.phase = this.rnd() * 6;
      p.x = A.x;
      p.z = A.z;
      p.active = true;
      return;
    }
  }

  update(dt: number, focus: THREE.Vector3, player: THREE.Vector3): void {
    const want = Math.floor(MAX_PEDS * this.density);
    for (let i = 0; i < MAX_PEDS; i++) {
      const p = this.peds[i];
      if (!p.active && i < want) this.spawn(p, focus.x, focus.z);
      if (!p.active || i >= want || Math.hypot(p.x - focus.x, p.z - focus.z) > R_DESPAWN) {
        p.active = false;
        for (const m of this.meshes) m.setMatrixAt(i, this.hidden);
        continue;
      }
      const e = this.roads.edges[p.edge];
      p.t += p.speed * dt;
      if (p.t >= e.length) {
        const to = this.roads.otherEnd(p.edge, p.from);
        const opts = this.roads.nodes[to].edges;
        let next = p.edge;
        for (let k = 0; k < 4; k++) {
          const c = opts[Math.floor(this.rnd() * opts.length)];
          if (this.roads.edges[c].kind === 'grid' && c !== p.edge) {
            next = c;
            break;
          }
        }
        if (next === p.edge) p.from = to;
        else {
          p.from = to;
          p.edge = next;
        }
        p.t = 0;
      }
      const e2 = this.roads.edges[p.edge];
      const A = this.roads.nodes[p.from];
      const B = this.roads.nodes[this.roads.otherEnd(p.edge, p.from)];
      const ux = (B.x - A.x) / e2.length;
      const uz = (B.z - A.z) / e2.length;
      const f = Math.min(1, p.t / e2.length);
      let x = A.x + (B.x - A.x) * f - uz * SIDEWALK * p.side;
      let z = A.z + (B.z - A.z) * f + ux * SIDEWALK * p.side;
      // step aside for the player
      const dpx = x - player.x;
      const dpz = z - player.z;
      const dp = Math.hypot(dpx, dpz);
      if (dp < 1.6 && dp > 0.01) {
        x += (dpx / dp) * (1.6 - dp);
        z += (dpz / dp) * (1.6 - dp);
      }
      p.x = x;
      p.z = z;
      p.y = this.terrain.heightAt(x, z);
      p.yaw = Math.atan2(-ux, -uz);
      p.phase += dt * p.speed * 3.2;
      this.q.setFromEuler(this.e.set(0, p.yaw, 0));
      this.p.set(p.x, p.y, p.z);
      this.sc.setScalar(p.scale);
      this.root.compose(this.p, this.q, this.sc);
      const s = Math.sin(p.phase);
      const bob = Math.abs(Math.cos(p.phase)) * 0.02;
      for (let k = 0; k < PARTS.length; k++) {
        const part = PARTS[k];
        const ax = s * part.swing;
        // torso counter-rotates slightly; head and hair follow the torso
        const ay = k < 3 ? s * 0.08 : 0;
        const az = k >= 5 ? Math.sign(part.ox) * 0.07 : 0; // arms hang slightly away from the body
        this.q.setFromEuler(this.e.set(ax, ay, az));
        this.p.set(part.ox, part.oy + bob, 0);
        this.local.compose(this.p, this.q, this.one);
        this.out.multiplyMatrices(this.root, this.local);
        this.meshes[k].setMatrixAt(i, this.out);
      }
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
