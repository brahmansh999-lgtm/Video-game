/** Procedural vehicle meshes (forward = -Z, up = +Y). */
import * as THREE from 'three';
import type { Materials } from '../render/materials';
import { MeshBuilder } from '../world/architecture/meshBuilder';
import type { CarDef } from './carDefs';

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** A frustum-like block: bottom rect (w0,l0) to top rect (w1,l1) shifted by dz. */
function taperBox(
  b: MeshBuilder,
  y0: number,
  y1: number,
  w0: number,
  l0: number,
  w1: number,
  l1: number,
  dz = 0,
): void {
  const bot = [V(-w0, y0, l0), V(w0, y0, l0), V(w0, y0, -l0), V(-w0, y0, -l0)];
  const top = [V(-w1, y1, l1 + dz), V(w1, y1, l1 + dz), V(w1, y1, -l1 + dz), V(-w1, y1, -l1 + dz)];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    b.flatQuad(bot[i], bot[j], top[j], top[i], 0, 0, 1, 1);
  }
  b.flatQuad(top[0], top[1], top[2], top[3], 0, 0, 1, 1);
}

function mesh(b: MeshBuilder, m: THREE.Material, cast = true): THREE.Mesh {
  const g = b.toGeometry() ?? new THREE.BufferGeometry();
  const me = new THREE.Mesh(g, m);
  me.castShadow = cast;
  me.receiveShadow = true;
  return me;
}

export interface CarVisual {
  root: THREE.Group;
  wheels: THREE.InstancedMesh;
  brake: THREE.Mesh;
}

export function buildCarMesh(def: CarDef, mats: Materials, paint: THREE.Material): CarVisual {
  const root = new THREE.Group();
  const body = new MeshBuilder();
  const glass = new MeshBuilder();
  const lamp = new MeshBuilder();
  const tail = new MeshBuilder();
  const { hx, hy, hz } = def;
  const y0 = -hy;
  if (def.id === 'coupe') {
    taperBox(body, y0, y0 + 0.55, hx, hz, hx * 0.97, hz * 0.96);
    taperBox(glass, y0 + 0.55, y0 + 0.98, hx * 0.92, hz * 0.5, hx * 0.72, hz * 0.26, 0.25);
    body.box(0, y0 + 0.62, hz * 0.92, hx * 0.95, 0.05, 0.14);
  } else if (def.id === 'offroad') {
    taperBox(body, y0, y0 + 0.75, hx, hz, hx, hz * 0.98);
    taperBox(glass, y0 + 0.75, y0 + 1.35, hx * 0.95, hz * 0.62, hx * 0.9, hz * 0.55, 0.2);
    body.box(0, y0 + 1.42, 0.2, hx * 0.92, 0.06, hz * 0.55);
    body.box(0, y0 + 0.3, -hz - 0.08, hx * 0.9, 0.18, 0.08);
  } else {
    taperBox(body, y0, y0 + 0.6, hx, hz, hx * 0.96, hz * 0.95);
    taperBox(glass, y0 + 0.6, y0 + 1.25, hx * 0.94, hz * 0.82, hx * 0.82, hz * 0.45, 0.15);
  }
  for (const s of [-1, 1]) {
    lamp.box(s * hx * 0.65, y0 + 0.42, -hz - 0.01, hx * 0.22, 0.06, 0.02);
    tail.box(s * hx * 0.7, y0 + 0.45, hz + 0.01, hx * 0.2, 0.05, 0.02);
  }
  root.add(mesh(body, paint), mesh(glass, mats.windowDark), mesh(lamp, mats.lightLamp, false));
  const brake = mesh(tail, mats.redLight, false);
  root.add(brake);
  const wg = new THREE.CylinderGeometry(def.wheelRadius, def.wheelRadius, 0.3, 14).rotateZ(Math.PI / 2);
  const wheels = new THREE.InstancedMesh(wg, mats.tire, 4);
  wheels.castShadow = true;
  wheels.frustumCulled = false;
  root.add(wheels);
  return { root, wheels, brake };
}

export interface AircraftVisual {
  root: THREE.Group;
  gear: THREE.Group;
  prop: THREE.Object3D | null;
  rotors: THREE.Object3D[];
}

function lathe(b: MeshBuilder, profile: [number, number][], seg: number): void {
  // profile: [z, radius] from nose (-z) to tail
  const start = b.vertexCount;
  for (const [z, r] of profile) {
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      b.vertex(Math.cos(a) * r, Math.sin(a) * r * 0.95, z, Math.cos(a), Math.sin(a), 0, i / seg, z);
    }
  }
  for (let k = 0; k < profile.length - 1; k++) {
    for (let i = 0; i < seg; i++) {
      const a = start + k * (seg + 1) + i;
      const c = a + seg + 1;
      b.quad(a, a + 1, c + 1, c);
    }
  }
}

function wing(
  b: MeshBuilder,
  x0: number,
  x1: number,
  y: number,
  z: number,
  chordRoot: number,
  chordTip: number,
  sweep: number,
  thick: number,
  dihedral = 0,
): void {
  const p = [
    V(x0, y, z - chordRoot / 2),
    V(x1, y + dihedral, z - chordTip / 2 + sweep),
    V(x1, y + dihedral, z + chordTip / 2 + sweep),
    V(x0, y, z + chordRoot / 2),
  ];
  const top = p.map((v) => v.clone().setY(v.y + thick / 2));
  const bot = p.map((v) => v.clone().setY(v.y - thick / 2));
  b.flatQuad(top[0], top[3], top[2], top[1], 0, 0, 1, 1);
  b.flatQuad(bot[0], bot[1], bot[2], bot[3], 0, 0, 1, 1);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    b.flatQuad(bot[i], bot[j], top[j], top[i], 0, 0, 1, 1);
  }
}

export function buildAircraftMesh(
  kind: 'plane' | 'jet' | 'vtol',
  mats: Materials,
  paint: THREE.Material,
): AircraftVisual {
  const root = new THREE.Group();
  const body = new MeshBuilder();
  const glass = new MeshBuilder();
  const dark = new MeshBuilder();
  const gear = new THREE.Group();
  const rotors: THREE.Object3D[] = [];
  let prop: THREE.Object3D | null = null;
  const gearMesh = (x: number, z: number, len: number): void => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 6), mats.metal);
    leg.position.set(x, -len / 2, z);
    const w = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12).rotateZ(Math.PI / 2),
      mats.tire,
    );
    w.position.set(x, -len, z);
    gear.add(leg, w);
  };
  if (kind === 'plane') {
    lathe(
      body,
      [
        [-3.6, 0.05],
        [-3.3, 0.5],
        [-2.2, 0.62],
        [0.5, 0.6],
        [2.5, 0.35],
        [4.4, 0.12],
      ],
      14,
    );
    taperBox(glass, 0.3, 0.95, 0.5, 0.9, 0.38, 0.55, 0.1);
    wing(body, 0.5, 5.6, 0.45, -1.1, 1.6, 1.0, 0.2, 0.16, 0.25);
    wing(body, -0.5, -5.6, 0.45, -1.1, 1.6, 1.0, 0.2, 0.16, 0.25);
    wing(body, 0.2, 2.0, 0.15, 3.9, 0.9, 0.6, 0.2, 0.08);
    wing(body, -0.2, -2.0, 0.15, 3.9, 0.9, 0.6, 0.2, 0.08);
    body.flatQuad(V(0, 0.3, 3.4), V(0, 0.3, 4.5), V(0, 1.7, 4.6), V(0, 1.7, 4.0), 0, 0, 1, 1);
    const p = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 20),
      new THREE.MeshBasicMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      }),
    );
    p.position.z = -3.7;
    prop = p;
    root.add(p);
    gearMesh(0, -2.6, 1.0);
    gearMesh(1.1, 0.55, 1.0);
    gearMesh(-1.1, 0.55, 1.0);
  } else if (kind === 'jet') {
    lathe(
      body,
      [
        [-8, 0.05],
        [-7, 0.45],
        [-4.5, 0.9],
        [2, 0.95],
        [6, 0.8],
        [7.5, 0.6],
      ],
      16,
    );
    taperBox(glass, 0.6, 1.2, 0.45, 1.4, 0.2, 0.7, -0.2);
    wing(body, 0.6, 5.2, 0.0, 0.8, 5.5, 1.4, 3.4, 0.25);
    wing(body, -0.6, -5.2, 0.0, 0.8, 5.5, 1.4, 3.4, 0.25);
    wing(body, 0.5, 2.6, 0.1, 6.6, 2.0, 0.9, 1.0, 0.12);
    wing(body, -0.5, -2.6, 0.1, 6.6, 2.0, 0.9, 1.0, 0.12);
    body.flatQuad(V(0, 0.7, 4.8), V(0, 0.7, 7.4), V(0, 3.4, 8.0), V(0, 3.4, 6.8), 0, 0, 1, 1);
    dark.cylinder(0, -0.1, 7.5, 0.55, 0.01, 12, true);
    gearMesh(0, -5.0, 1.3);
    gearMesh(1.4, 1.6, 1.3);
    gearMesh(-1.4, 1.6, 1.3);
  } else {
    lathe(
      body,
      [
        [-3.4, 0.1],
        [-3.0, 0.9],
        [-1.5, 1.15],
        [1.5, 1.1],
        [3.2, 0.6],
        [3.8, 0.3],
      ],
      16,
    );
    taperBox(glass, 0.2, 1.05, 0.95, 1.3, 0.75, 0.9, -0.6);
    wing(body, 0.6, 4.2, 0.3, 0.6, 1.4, 1.0, 0.1, 0.14);
    wing(body, -0.6, -4.2, 0.3, 0.6, 1.4, 1.0, 0.1, 0.14);
    for (const [x, z] of [
      [4.4, -1.2],
      [-4.4, -1.2],
      [4.4, 2.2],
      [-4.4, 2.2],
    ]) {
      const pod = new THREE.Group();
      pod.position.set(x, 0.4, z);
      const duct = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.12, 6, 20).rotateX(Math.PI / 2), paint);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.0, 20).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: 0x111111,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
        }),
      );
      pod.add(duct, disc);
      rotors.push(pod);
      root.add(pod);
    }
    gearMesh(1.0, -1.5, 0.7);
    gearMesh(-1.0, -1.5, 0.7);
    gearMesh(1.0, 1.8, 0.7);
    gearMesh(-1.0, 1.8, 0.7);
  }
  root.add(mesh(body, paint), mesh(glass, mats.windowDark), mesh(dark, mats.darkMetal));
  root.add(gear);
  return { root, gear, prop, rotors };
}
