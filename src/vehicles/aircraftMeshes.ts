/**
 * Procedural aircraft meshes (forward = -Z): lathed fuselages, aerofoil-section wings and fins,
 * canopies, propellers / ducted fans, navigation lights and anti-collision strobes.
 */
import * as THREE from 'three';
import type { Materials } from '../render/materials';
import { wheelGeometry } from './meshes';
import { ball, box, cylZ, finPanel, latheZ, loft, merge, wingPanel, type G } from './shapes';
import {
  chromeMat,
  glassMat,
  mesh,
  navGreen,
  navRed,
  navWhite,
  nozzleGlow,
  trimMat,
  wheelMat,
} from './vehicleMats';

/* ------------------------------------------------------------------ aircraft */

export interface AircraftVisual {
  root: THREE.Group;
  gear: THREE.Group;
  prop: THREE.Object3D | null;
  rotors: THREE.Object3D[];
  /** Blinking anti-collision strobes. */
  strobes: THREE.Object3D[];
}

const blurMat = new THREE.MeshBasicMaterial({
  color: 0x111111,
  transparent: true,
  opacity: 0.18,
  side: THREE.DoubleSide,
  depthWrite: false,
});

/** Red on the left (-X) wingtip, green on the right. */
function navLights(root: THREE.Group, tipX: number, y: number, z: number): void {
  root.add(mesh(ball(0.07, -tipX, y, z, 1, 1, 1.4, 8), navRed, false));
  root.add(mesh(ball(0.07, tipX, y, z, 1, 1, 1.4, 8), navGreen, false));
}

function strobe(root: THREE.Group, x: number, y: number, z: number, r = 0.07): THREE.Object3D {
  const m = mesh(ball(r, x, y, z, 1, 1, 1, 8), navWhite, false);
  root.add(m);
  return m;
}

export function buildAircraftMesh(
  kind: 'plane' | 'jet' | 'vtol',
  mats: Materials,
  paint: THREE.Material,
): AircraftVisual {
  const root = new THREE.Group();
  const body: G[] = [];
  const glass: G[] = [];
  const dark: G[] = [];
  const accent: G[] = [];
  const gear = new THREE.Group();
  const rotors: THREE.Object3D[] = [];
  const strobes: THREE.Object3D[] = [];
  let prop: THREE.Object3D | null = null;
  const gearMesh = (x: number, z: number, len: number, fairing = false): void => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, len, 8), mats.metal);
    leg.position.set(x, -len / 2, z);
    const w = new THREE.Mesh(wheelGeometry(0.27, 0.16), wheelMat);
    w.position.set(x, -len, z);
    w.castShadow = true;
    gear.add(leg, w);
    if (fairing) {
      const f = new THREE.Mesh(ball(1, x, -len + 0.08, z, 0.15, 0.3, 0.55, 12), paint);
      f.castShadow = true;
      gear.add(f);
    }
  };

  if (kind === 'plane') {
    body.push(
      latheZ(
        [
          [-3.78, 0.02],
          [-3.7, 0.3],
          [-3.45, 0.5],
          [-3.0, 0.58],
          [-2.0, 0.64],
          [-0.4, 0.65],
          [0.8, 0.58],
          [2.2, 0.4],
          [3.6, 0.2],
          [4.5, 0.08],
        ],
        26,
      ),
    );
    glass.push(ball(1, 0, 0.42, -0.95, 0.5, 0.42, 1.25, 20));
    // high-set wing with dihedral, struts
    body.push(wingPanel(0.4, 5.6, 0.62, -1.0, 1.6, 1.0, 0.2, 0.16, 0.25));
    body.push(wingPanel(-0.4, -5.6, 0.62, -1.0, 1.6, 1.0, 0.2, 0.16, 0.25));
    for (const x of [-1, 1]) {
      dark.push(
        new THREE.CylinderGeometry(0.035, 0.035, 2.3, 6).rotateZ(-x * 1.05).translate(x * 1.6, 0.05, -0.9),
      );
    }
    body.push(wingPanel(0.15, 2.0, 0.15, 3.9, 0.9, 0.6, 0.2, 0.08));
    body.push(wingPanel(-0.15, -2.0, 0.15, 3.9, 0.9, 0.6, 0.2, 0.08));
    accent.push(finPanel(0.15, 1.5, 3.95, 1.3, 0.65, 0.55, 0.1));
    // cheat line stripe + cowling
    accent.push(
      latheZ(
        [
          [-3.0, 0.6],
          [-2.95, 0.6],
          [-2.55, 0.62],
          [-2.5, 0.62],
        ],
        26,
      ).scale(1.02, 1.02, 1),
    );
    dark.push(cylZ(0.05, 0.05, 0.4, 0.35, -0.42, -2.7, 8), cylZ(0.05, 0.05, 0.4, -0.35, -0.42, -2.7, 8));
    navLights(root, 5.6, 0.87, -0.8);
    strobes.push(strobe(root, 0, 1.65, 4.5));
    // propeller: spinner + two blades + faint disc
    const p = new THREE.Group();
    p.position.z = -3.82;
    p.add(mesh(cylZ(0.18, 0.0, 0.42, 0, 0, -0.18, 14), chromeMat));
    for (const sgn of [-1, 1]) {
      const blade = mesh(ball(1, 0, sgn * 0.5, 0, 0.07, 0.5, 0.025, 8), trimMat);
      blade.rotation.y = sgn * 0.25;
      p.add(blade);
    }
    p.add(new THREE.Mesh(new THREE.CircleGeometry(1.0, 28), blurMat));
    prop = p;
    root.add(p);
    gearMesh(0, -2.6, 1.0);
    gearMesh(1.1, 0.55, 1.0, true);
    gearMesh(-1.1, 0.55, 1.0, true);
  } else if (kind === 'jet') {
    body.push(
      latheZ(
        [
          [-8.3, 0.02],
          [-8.0, 0.18],
          [-7.2, 0.46],
          [-5.5, 0.82],
          [-3.0, 0.97],
          [2.0, 1.0],
          [5.0, 0.9],
          [6.9, 0.72],
          [7.6, 0.62],
        ],
        28,
      ),
    );
    glass.push(ball(1, 0, 0.62, -4.6, 0.5, 0.48, 1.7, 22));
    accent.push(box(0, 0.62, -3.1, 0.06, 0.12, 0.1)); // canopy frame
    // cranked delta wings
    body.push(wingPanel(0.7, 5.3, -0.1, 0.9, 5.6, 1.3, 3.4, 0.24, -0.1));
    body.push(wingPanel(-0.7, -5.3, -0.1, 0.9, 5.6, 1.3, 3.4, 0.24, -0.1));
    body.push(wingPanel(0.6, 2.7, 0.05, 6.6, 2.0, 0.85, 1.0, 0.12));
    body.push(wingPanel(-0.6, -2.7, 0.05, 6.6, 2.0, 0.85, 1.0, 0.12));
    // twin canted fins
    for (const x of [-1, 1]) {
      accent.push(
        finPanel(0, 2.4, 0, 2.2, 0.9, 1.3, 0.12)
          .rotateZ(-x * 0.32)
          .translate(x * 0.7, 0.55, 5.4),
      );
    }
    // intakes
    for (const x of [-1, 1]) {
      body.push(
        loft(
          [
            [-3.2, 0.32, -0.5, 0.25],
            [-1.0, 0.36, -0.55, 0.3],
            [2.5, 0.3, -0.45, 0.2],
          ],
          6,
        ).translate(x * 1.0, 0, 0),
      );
      dark.push(box(x * 1.0, -0.12, -3.21, 0.5, 0.62, 0.04));
    }
    dark.push(cylZ(0.62, 0.5, 0.9, 0, -0.05, 7.9, 20));
    root.add(mesh(cylZ(0.47, 0.47, 0.04, 0, -0.05, 8.3, 20), nozzleGlow, false));
    navLights(root, 5.3, 0.0, 4.35);
    strobes.push(strobe(root, 0, -0.95, 0), strobe(root, 0, 0.98, 1.5));
    gearMesh(0, -5.0, 1.3);
    gearMesh(1.4, 1.6, 1.3);
    gearMesh(-1.4, 1.6, 1.3);
  } else {
    body.push(
      latheZ(
        [
          [-3.5, 0.05],
          [-3.4, 0.4],
          [-3.0, 0.85],
          [-2.0, 1.1],
          [1.5, 1.12],
          [3.0, 0.72],
          [3.8, 0.38],
          [3.95, 0.12],
        ],
        28,
        0.9,
      ),
    );
    glass.push(ball(1, 0, 0.22, -2.05, 0.92, 0.7, 1.35, 24));
    for (const x of [-1, 1])
      for (let k = 0; k < 4; k++) glass.push(ball(1, x * 1.035, 0.3, -0.7 + k * 0.6, 0.04, 0.2, 0.17, 12)); // cabin windows
    body.push(wingPanel(0.6, 4.2, 0.3, 0.6, 1.4, 1.0, 0.1, 0.14));
    body.push(wingPanel(-0.6, -4.2, 0.3, 0.6, 1.4, 1.0, 0.1, 0.14));
    body.push(wingPanel(0.4, 1.8, 0.5, 3.3, 0.8, 0.5, 0.25, 0.08, 0.3));
    body.push(wingPanel(-0.4, -1.8, 0.5, 3.3, 0.8, 0.5, 0.25, 0.08, 0.3));
    accent.push(finPanel(0.6, 1.1, 3.45, 1.0, 0.55, 0.45, 0.09));
    for (const [x, z] of [
      [4.4, -1.2],
      [-4.4, -1.2],
      [4.4, 2.2],
      [-4.4, 2.2],
    ]) {
      const pod = new THREE.Group();
      pod.position.set(x, 0.4, z);
      const duct = mesh(
        new THREE.TorusGeometry(1.12, 0.1, 10, 36).rotateX(Math.PI / 2).scale(1, 2.6, 1),
        paint,
      );
      const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(1.03, 1.03, 0.5, 28, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.6, side: THREE.BackSide }),
      );
      const hub = mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.55, 14), mats.darkMetal);
      pod.add(duct, inner, hub);
      for (let k = 0; k < 3; k++) {
        const strut = mesh(new THREE.BoxGeometry(0.06, 0.05, 1.0).translate(0, 0, 0.55), mats.darkMetal);
        strut.rotation.y = (k / 3) * Math.PI * 2;
        pod.add(strut);
      }
      pod.add(
        new THREE.Mesh(new THREE.CircleGeometry(1.0, 28).rotateX(-Math.PI / 2).translate(0, 0.1, 0), blurMat),
      );
      pod.add(mesh(ball(0.06, Math.sign(x) * 1.2, 0, 0, 1, 1, 1, 8), x < 0 ? navRed : navGreen, false));
      rotors.push(pod);
      root.add(pod);
    }
    strobes.push(strobe(root, 0, 1.75, 3.6), strobe(root, 0, -1.0, 0.5));
    gearMesh(1.0, -1.5, 0.7);
    gearMesh(-1.0, -1.5, 0.7);
    gearMesh(1.0, 1.8, 0.7);
    gearMesh(-1.0, 1.8, 0.7);
  }
  root.add(mesh(merge(body), paint));
  root.add(mesh(merge(glass), glassMat));
  if (dark.length) root.add(mesh(merge(dark), mats.darkMetal));
  if (accent.length) root.add(mesh(merge(accent), trimMat));
  root.add(gear);
  return { root, gear, prop, rotors, strobes };
}
