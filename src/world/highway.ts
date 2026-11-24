/** Spline roads that leave the grid: the hills highway and the coastal ribbon drive. */
import * as THREE from 'three';
import { baseHeight, coastZ, isWater, waterLevelAt } from './layout';

export interface PathPoint {
  x: number;
  y: number;
  z: number;
  bridge: boolean;
}

export interface RoadPath {
  name: string;
  width: number;
  pts: PathPoint[];
}

const HIGHWAY_CTRL: [number, number][] = [
  [-1440, -800],
  [-1600, -960],
  [-1780, -1300],
  [-1560, -1720],
  [-960, -1880],
  [-260, -1830],
  [300, -1620],
  [540, -1380],
  [746, -1352],
  [960, -1380],
  [1300, -1640],
  [1820, -1700],
  [1975, -1250],
  [1975, -400],
  [1975, 380],
  [1860, 820],
  [1420, 960],
  [960, 960],
];

function sampleSpline(ctrl: [number, number][], step: number): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3(
    ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
  );
  const n = Math.ceil(curve.getLength() / step);
  return curve.getSpacedPoints(n);
}

function profile(points: THREE.Vector3[], minClear: number): PathPoint[] {
  const raw = points.map((p) => {
    const water = isWater(p.x, p.z);
    const h = water ? waterLevelAt(p.x, p.z) + minClear : Math.max(baseHeight(p.x, p.z), 0);
    return { x: p.x, z: p.z, y: h, bridge: water };
  });
  // widen the bridge flag a little so abutments sit on land
  const flags = raw.map((r) => r.bridge);
  for (let i = 0; i < raw.length; i++) {
    for (let k = -3; k <= 3; k++) if (flags[i + k]) raw[i].bridge = true;
  }
  let ys = raw.map((r) => r.y);
  for (let pass = 0; pass < 6; pass++) {
    const next = ys.slice();
    for (let i = 1; i < ys.length - 1; i++) {
      let sum = 0;
      let n = 0;
      for (let k = -6; k <= 6; k++) {
        const j = i + k;
        if (j >= 0 && j < ys.length) {
          sum += ys[j];
          n++;
        }
      }
      next[i] = sum / n;
    }
    ys = next;
  }
  // clamp grade to ~7 %
  const step = Math.hypot(raw[1].x - raw[0].x, raw[1].z - raw[0].z);
  const maxDy = step * 0.07;
  ys[0] = 0;
  ys[ys.length - 1] = 0;
  const clampTo = (v: number, ref: number): number => Math.min(ref + maxDy, Math.max(ref - maxDy, v));
  for (let i = 1; i < ys.length; i++) ys[i] = clampTo(ys[i], ys[i - 1]);
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = clampTo(ys[i], ys[i + 1]);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].bridge) ys[i] = Math.max(ys[i], waterLevelAt(raw[i].x, raw[i].z) + minClear);
    raw[i].y = ys[i] + 0.12;
  }
  return raw;
}

export function buildHighway(): RoadPath {
  return { name: 'Hills Highway', width: 16, pts: profile(sampleSpline(HIGHWAY_CTRL, 10), 8) };
}

export function buildCoastal(): RoadPath {
  const ctrl: [number, number][] = [[-1280, 1120]];
  for (let x = -1180; x <= 400; x += 80) {
    let z = coastZ(x) - 78;
    if (Math.abs(x) < 340) z = Math.min(z, 1140);
    ctrl.push([x, z]);
  }
  ctrl.push([480, 1120]);
  const pts = sampleSpline(ctrl, 8).map((p) => ({ x: p.x, z: p.z, y: 0.1, bridge: false }));
  return { name: 'Ribbon Drive', width: 14, pts };
}
