/**
 * Procedural car meshes (forward = -Z, up = +Y), lofted from superellipse cross-sections
 * (body, glasshouse and roof as separate shells), with lamps, grilles, arches and spoked wheels.
 * Aircraft meshes live in aircraftMeshes.ts.
 */
import * as THREE from 'three';
import type { Materials } from '../render/materials';
import type { CarClass, CarDef } from './carDefs';
import { ball, box, cylX, cylZ, loft, merge, tint, type G, type Station } from './shapes';

import { chromeMat, glassMat, mesh, plateMat, trimMat, wheelMat } from './vehicleMats';

/* ------------------------------------------------------------------ cars */

/** Geometry groups of a car body, in car-local space (body centre at origin). */
export interface CarShapes {
  paint: G[];
  glass: G[];
  trim: G[];
  chrome: G[];
  lamp: G[];
  tail: G[];
  plate: G[];
}

/** Wheel-centre height (car-local) at rest. */
export function wheelRestY(d: Pick<CarDef, 'hy' | 'suspensionRest'>): number {
  return -d.hy * 0.4 - d.suspensionRest * 0.85;
}

function arch(r: number, x: number, y: number, z: number): G {
  return new THREE.TorusGeometry(r, 0.055, 6, 18, Math.PI).rotateY(Math.PI / 2).translate(x, y, z);
}

export function carShapes(
  def: Pick<CarDef, 'id' | 'hx' | 'hy' | 'hz' | 'wheelRadius' | 'wheelZ' | 'suspensionRest'>,
): CarShapes {
  const s: CarShapes = { paint: [], glass: [], trim: [], chrome: [], lamp: [], tail: [], plate: [] };
  const { hx, hz } = def;
  const wy = wheelRestY(def);
  const ar = def.wheelRadius + 0.08;
  const sides = [-1, 1];
  const id: CarClass = def.id;

  if (id === 'coupe') {
    const lower: Station[] = [
      [-2.25, 0.82, -0.27, -0.1],
      [-2.17, 0.94, -0.34, 0.0],
      [-1.6, 0.98, -0.36, 0.07],
      [-0.5, 0.98, -0.36, 0.13],
      [0.6, 0.99, -0.36, 0.17],
      [1.5, 1.0, -0.35, 0.2],
      [2.08, 0.95, -0.32, 0.2],
      [2.25, 0.84, -0.26, 0.13],
    ];
    s.paint.push(loft(lower, 5));
    s.glass.push(
      loft(
        [
          [-0.85, 0.86, 0.02, 0.08],
          [-0.15, 0.76, 0.02, 0.58],
          [0.55, 0.74, 0.02, 0.6],
          [1.55, 0.8, 0.02, 0.26],
          [1.95, 0.88, 0.02, 0.17],
        ],
        6,
      ),
    );
    s.paint.push(
      loft(
        [
          [-0.1, 0.66, 0.54, 0.59],
          [0.0, 0.71, 0.53, 0.63],
          [0.6, 0.7, 0.53, 0.64],
          [1.0, 0.66, 0.44, 0.52],
        ],
        8,
      ),
    );
    // rear wing on struts
    s.paint.push(box(0, 0.36, 2.05, 1.75, 0.04, 0.32));
    for (const x of sides) s.trim.push(box(x * 0.55, 0.27, 2.05, 0.05, 0.16, 0.12));
    // side intakes, front splitter, diffuser
    for (const x of sides) s.trim.push(box(x * 0.985, -0.08, 0.95, 0.04, 0.16, 0.6));
    s.trim.push(box(0, -0.33, -2.15, 1.7, 0.04, 0.2), box(0, -0.3, 2.18, 1.5, 0.08, 0.16));
    s.trim.push(box(0, -0.18, -2.22, 0.9, 0.1, 0.06)); // grille
    for (const x of sides) {
      s.lamp.push(ball(1, x * 0.66, -0.02, -2.12, 0.24, 0.045, 0.1, 12));
      s.tail.push(box(x * 0.6, 0.12, 2.2, 0.55, 0.04, 0.05));
      s.chrome.push(cylZ(0.05, 0.05, 0.12, x * 0.35, -0.27, 2.22, 10));
    }
    s.tail.push(box(0, 0.12, 2.21, 0.5, 0.025, 0.04));
  } else if (id === 'offroad') {
    const lower: Station[] = [
      [-2.2, 0.98, -0.42, 0.14],
      [-2.1, 1.04, -0.55, 0.24],
      [-1.0, 1.05, -0.6, 0.31],
      [1.9, 1.05, -0.6, 0.35],
      [2.2, 1.0, -0.5, 0.32],
    ];
    s.paint.push(loft(lower, 10));
    s.glass.push(
      loft(
        [
          [-0.95, 0.99, 0.24, 0.3],
          [-0.55, 0.96, 0.24, 0.98],
          [1.85, 0.96, 0.24, 1.0],
          [2.05, 0.98, 0.24, 0.4],
        ],
        10,
      ),
    );
    s.paint.push(
      loft(
        [
          [-0.62, 0.93, 0.94, 1.02],
          [1.95, 0.93, 0.95, 1.04],
        ],
        10,
      ),
    );
    // roof rack, bull bar, skid plate, spare wheel, snorkel
    for (const x of sides) s.trim.push(box(x * 0.8, 1.13, 0.7, 0.05, 0.05, 2.3));
    for (const z of [-0.2, 0.5, 1.2, 1.7]) s.trim.push(box(0, 1.13, z, 1.6, 0.04, 0.05));
    for (const x of sides) s.trim.push(box(x * 0.8, 1.07, 0.7, 0.05, 0.1, 0.05));
    s.trim.push(box(0, -0.05, -2.32, 1.5, 0.08, 0.08), box(0, 0.2, -2.32, 1.3, 0.06, 0.06));
    for (const x of sides) s.trim.push(box(x * 0.55, 0.06, -2.32, 0.07, 0.42, 0.07));
    s.trim.push(box(0, -0.55, -1.9, 1.4, 0.05, 0.6));
    s.trim.push(cylZ(0.42, 0.42, 0.24, 0, 0.1, 2.36, 20));
    s.chrome.push(cylZ(0.2, 0.2, 0.26, 0, 0.1, 2.36, 14));
    s.trim.push(box(0.95, 0.65, -1.1, 0.1, 0.9, 0.12));
    s.trim.push(box(0, -0.05, -2.205, 1.0, 0.3, 0.04)); // grille
    for (const x of sides) {
      s.lamp.push(cylZ(0.13, 0.13, 0.06, x * 0.72, 0.08, -2.2, 16));
      s.chrome.push(new THREE.TorusGeometry(0.135, 0.02, 6, 16).translate(x * 0.72, 0.08, -2.23));
      s.tail.push(box(x * 0.9, 0.12, 2.2, 0.16, 0.3, 0.04));
    }
  } else {
    // EV hatch
    const lower: Station[] = [
      [-1.95, 0.78, -0.3, -0.02],
      [-1.87, 0.86, -0.38, 0.08],
      [-1.55, 0.9, -0.42, 0.16],
      [-0.8, 0.9, -0.42, 0.22],
      [0.9, 0.9, -0.42, 0.25],
      [1.72, 0.89, -0.4, 0.24],
      [1.95, 0.8, -0.32, 0.17],
    ];
    s.paint.push(loft(lower, 5));
    s.glass.push(
      loft(
        [
          [-0.95, 0.8, 0.12, 0.2],
          [-0.35, 0.76, 0.12, 0.78],
          [1.15, 0.76, 0.12, 0.8],
          [1.68, 0.78, 0.12, 0.42],
          [1.86, 0.8, 0.12, 0.2],
        ],
        6,
      ),
    );
    s.paint.push(
      loft(
        [
          [-0.3, 0.68, 0.75, 0.8],
          [-0.2, 0.73, 0.73, 0.85],
          [1.1, 0.73, 0.73, 0.87],
          [1.22, 0.69, 0.75, 0.82],
        ],
        8,
      ),
    );
    s.trim.push(box(0, -0.24, -1.92, 1.1, 0.12, 0.06)); // lower grille
    s.lamp.push(box(0, 0.1, -1.92, 1.25, 0.035, 0.05)); // light bar
    for (const x of sides) s.lamp.push(ball(1, x * 0.62, 0.04, -1.88, 0.2, 0.05, 0.08, 12));
    s.tail.push(box(0, 0.13, 1.94, 1.45, 0.05, 0.05));
    s.chrome.push(box(0, 0.24, -1.3, 0.25, 0.02, 0.3)); // badge strip
  }

  // shared: mirrors, side skirts, arches, plate, beltline chrome
  const mz = id === 'offroad' ? -0.5 : id === 'coupe' ? -0.25 : -0.45;
  const my = id === 'offroad' ? 0.5 : id === 'coupe' ? 0.22 : 0.3;
  for (const x of sides) {
    s.paint.push(ball(1, x * (hx + 0.05), my, mz, 0.08, 0.06, 0.1, 10));
    s.trim.push(box(x * (hx - 0.02), -def.hy + 0.04, 0, 0.06, 0.08, hz * 1.2));
    for (const z of [-def.wheelZ, def.wheelZ]) s.trim.push(arch(ar, x * (hx - 0.01), wy, z));
    s.chrome.push(box(x * (hx - 0.005), id === 'offroad' ? 0.28 : 0.14, 0.3, 0.015, 0.018, hz * 0.95));
    // door handles
    s.chrome.push(box(x * (hx + 0.005), id === 'offroad' ? 0.2 : 0.08, -0.15, 0.02, 0.03, 0.16));
  }
  s.plate.push(box(0, -0.12, hz + 0.02, 0.42, 0.12, 0.02), box(0, -0.22, -hz - 0.02, 0.42, 0.11, 0.02));
  return s;
}

/** Wheel with tyre, rim, five spokes and a hub (vertex coloured), axis along X. */
export function wheelGeometry(r: number, w = 0.26): G {
  const parts: G[] = [
    tint(cylX(r, w, 0, 0, 0, 24), 0x151515),
    tint(new THREE.TorusGeometry(r * 0.86, r * 0.12, 6, 24).rotateY(Math.PI / 2), 0x1b1b1b),
    tint(cylX(r * 0.66, w + 0.015, 0, 0, 0, 20), 0x5a5f66),
    tint(cylX(r * 0.2, w + 0.04, 0, 0, 0, 10), 0xc8ccd2),
  ];
  for (let k = 0; k < 5; k++) {
    parts.push(
      tint(
        new THREE.BoxGeometry(w + 0.03, r * 1.15, 0.06)
          .translate(0, r * 0.3, 0)
          .rotateX((k / 5) * Math.PI * 2),
        0xc8ccd2,
      ),
    );
  }
  return merge(parts);
}

export interface CarVisual {
  root: THREE.Group;
  wheels: THREE.InstancedMesh;
  brake: THREE.Mesh;
}

export function buildCarMesh(def: CarDef, mats: Materials, paint: THREE.Material): CarVisual {
  const root = new THREE.Group();
  const s = carShapes(def);
  root.add(mesh(merge(s.paint), paint));
  root.add(mesh(merge(s.glass), glassMat));
  root.add(mesh(merge(s.trim), trimMat));
  root.add(mesh(merge(s.chrome), chromeMat, false));
  root.add(mesh(merge(s.plate), plateMat, false));
  root.add(mesh(merge(s.lamp), mats.lightLamp, false));
  // own material so each car's tail lights can glow dim (running) or bright (braking)
  const brake = mesh(merge(s.tail), mats.redLight.clone(), false);
  root.add(brake);
  const wheels = new THREE.InstancedMesh(wheelGeometry(def.wheelRadius), wheelMat, 4);
  wheels.castShadow = true;
  wheels.frustumCulled = false;
  root.add(wheels);
  return { root, wheels, brake };
}
