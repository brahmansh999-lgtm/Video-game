/** Hand-placed landmark buildings, airport buildings and rooftop vertiports. */
import type { PlanContext } from './planContext';
import type { Vertiport } from './specs';

const BLOCK = 64;

export function placeLandmarkBuildings(ctx: PlanContext, vertiports: Vertiport[]): void {
  const T = ctx.terrain;
  // Central plaza (player start) stays open.
  ctx.reserve(80, 80, BLOCK);
  ctx.addTrees(80, 80, 60, 0, () => 0.5);

  // --- Flux Core ---------------------------------------------------------
  ctx.tower(-80, -80, {
    height: 470,
    a: 27,
    b: 24,
    exponent: 3,
    twist: 2.2,
    taper: 0.35,
    bulge: 0.12,
    style: 0,
    diagrid: true,
    neon: 1,
    landmark: 'helix-spire',
  });
  ctx.reserve(-80, -80, BLOCK);
  ctx.tower(240, -80, {
    height: 300,
    a: 26,
    exponent: 7,
    taper: 0.55,
    rot: 0.785,
    style: 2,
    neon: 2,
    landmark: 'prism-exchange',
  });
  ctx.reserve(240, -80, BLOCK);
  ctx.tower(-80, 240, {
    height: 340,
    a: 24,
    exponent: 2,
    bulge: 0.2,
    bulgeFreq: 1,
    style: 1,
    diagrid: true,
    neon: 1,
    landmark: 'diagrid-crown',
  });
  ctx.reserve(-80, 240, BLOCK);
  ctx.tower(210, 210, {
    height: 265,
    a: 17,
    exponent: 3.5,
    twist: 1.4,
    taper: 0.2,
    style: 0,
    neon: 1,
    landmark: 'twin-flux',
  });
  ctx.tower(270, 270, {
    height: 245,
    a: 17,
    exponent: 3.5,
    twist: -1.4,
    taper: 0.2,
    style: 0,
    neon: 1,
    landmark: 'twin-flux',
  });
  ctx.reserve(240, 240, BLOCK);
  const trio: [number, number][] = [
    [80 - 32, -400 - 20],
    [80 + 32, -400 - 20],
    [80, -400 + 34],
  ];
  trio.forEach(([x, z], i) =>
    ctx.tower(x, z, {
      height: 210 + i * 25,
      a: 14,
      exponent: 4,
      rot: i,
      style: 2,
      neon: 2,
      landmark: 'skybridge-trio',
    }),
  );
  ctx.reserve(80, -400, BLOCK);

  // --- Ribbon Waterfront ---------------------------------------------------
  ctx.buildings.push({
    kind: 'ribbon',
    id: ctx.nextId(),
    x: -430,
    z: 1215,
    y: 0,
    height: 78,
    district: 'waterfront',
    radius: 140,
    width: 22,
    thickness: 14,
    style: 0,
    landmark: 'mobius-ribbon',
    points: [
      [-575, 6, 1150],
      [-540, 34, 1205],
      [-480, 62, 1262],
      [-410, 72, 1270],
      [-350, 52, 1225],
      [-330, 30, 1180],
      [-380, 12, 1150],
    ],
  });
  ctx.reserve(-450, 1215, 120);
  ctx.buildings.push({
    kind: 'canopy',
    id: ctx.nextId(),
    x: -1000,
    z: 1215,
    y: T.heightAt(-1000, 1215),
    height: 24,
    district: 'waterfront',
    radius: 60,
    sx: 120,
    sz: 64,
    freq: 2,
    rot: 0,
    landmark: 'wave-hall',
  });
  ctx.reserve(-1000, 1215, 64);
  ctx.tower(300, 1188, {
    height: 130,
    a: 9,
    exponent: 2,
    twist: 0.8,
    style: 1,
    neon: 1,
    landmark: 'marina-lantern',
  });

  // --- Canopy Gardens --------------------------------------------------------
  const g = (x: number, z: number): number => T.heightAt(x, z);
  ctx.buildings.push({
    kind: 'canopy',
    id: ctx.nextId(),
    x: -720,
    z: -80,
    y: g(-720, -80),
    height: 26,
    district: 'gardens',
    radius: 56,
    sx: 110,
    sz: 110,
    freq: 2,
    rot: 0.3,
    landmark: 'gyroid-pavilion',
  });
  ctx.reserve(-720, -80, BLOCK);
  ctx.buildings.push({
    kind: 'dome',
    id: ctx.nextId(),
    x: -1040,
    z: 240,
    y: g(-1040, 240),
    height: 28,
    district: 'gardens',
    radius: 36,
    rx: 36,
    rz: 30,
    landmark: 'voronoi-grove',
  });
  ctx.reserve(-1040, 240, BLOCK);
  ctx.buildings.push({
    kind: 'terrace',
    id: ctx.nextId(),
    x: -720,
    z: 240,
    y: g(-720, 240),
    height: 54,
    district: 'gardens',
    radius: 60,
    w: 118,
    d: 108,
    levels: 10,
    levelH: 5.4,
    inset: 5.5,
    rot: 0,
    style: 3,
    landmark: 'terrace-mountain',
  });
  ctx.reserve(-720, 240, BLOCK);
  ctx.tower(-1040, -80, {
    height: 190,
    a: 18,
    exponent: 2.4,
    twist: 0.5,
    taper: 0.25,
    style: 3,
    forest: true,
    landmark: 'forest-spire',
  });
  ctx.reserve(-1040, -80, BLOCK);
  ctx.buildings.push({
    kind: 'canopy',
    id: ctx.nextId(),
    x: -1200,
    z: -240,
    y: g(-1200, -240),
    height: 20,
    district: 'gardens',
    radius: 60,
    sx: 120,
    sz: 92,
    freq: 1,
    rot: -0.2,
    landmark: 'cloud-canopy',
  });
  ctx.reserve(-1200, -240, BLOCK);
  for (const [x, z] of [
    [-720, -80],
    [-1040, 240],
    [-1200, -240],
  ] as const) {
    ctx.addTrees(x, z, 62, 22, mulberryLike(x * 7 + z));
  }

  // --- Aeroport ------------------------------------------------------------
  ctx.buildings.push({
    kind: 'hangar',
    id: ctx.nextId(),
    x: 1150,
    z: -300,
    y: 0,
    height: 32,
    district: 'aeroport',
    radius: 60,
    span: 92,
    length: 120,
    rot: 0,
    landmark: 'wing-hangar',
  });
  ctx.buildings.push({
    kind: 'hangar',
    id: ctx.nextId(),
    x: 1150,
    z: -560,
    y: 0,
    height: 22,
    district: 'aeroport',
    radius: 50,
    span: 64,
    length: 90,
    rot: 0,
  });
  ctx.buildings.push({
    kind: 'hangar',
    id: ctx.nextId(),
    x: 1150,
    z: -760,
    y: 0,
    height: 22,
    district: 'aeroport',
    radius: 50,
    span: 64,
    length: 90,
    rot: 0,
  });
  ctx.tower(1150, 80, {
    height: 72,
    a: 7,
    exponent: 2,
    taper: -0.7,
    style: 2,
    neon: 1,
    landmark: 'beacon-tower',
  });
  ctx.buildings.push({
    kind: 'block',
    id: ctx.nextId(),
    x: 1150,
    z: 250,
    y: 0,
    height: 18,
    district: 'aeroport',
    radius: 70,
    w: 70,
    d: 150,
    rot: 0,
    style: 0,
  });

  // --- Vertiports ----------------------------------------------------------
  const vp: [string, number, number, number][] = [
    ['VP-1 Core Plaza', -240, 80, 92],
    ['VP-2 Harbour', -880, 880, 74],
    ['VP-3 Gardens', -1200, 400, 66],
    ['VP-4 Ring East', 560, 400, 104],
    ['VP-5 Riverside', 400, -720, 84],
    ['VP-6 Aeroport Gate', 1150, 430, 58],
  ];
  vp.forEach(([name, x, z, h], i) => {
    const t = ctx.tower(x, z, {
      height: h,
      a: 17,
      b: 17,
      exponent: 3,
      taper: 0.04,
      style: i % 2 === 0 ? 1 : 0,
      neon: 2,
      vertiport: true,
    });
    ctx.reserve(x, z, BLOCK);
    vertiports.push({ id: i, name, x, y: t.y + h + 0.5, z });
  });
}

function mulberryLike(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}
