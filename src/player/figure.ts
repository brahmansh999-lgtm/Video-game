/**
 * Procedural human figure (no rigged assets): a jointed hierarchy with hips, spine, neck, head,
 * two-segment arms (shoulder/elbow, hands) and legs (hip/knee, shoes), plus a walk/run cycle
 * with knee and elbow bend, torso lean and counter-rotation. The same body shapes are merged
 * into single-mesh parts for the instanced pedestrians.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface FigureParts {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  torso: THREE.Mesh;
}

/* ---------------------------------------------------------------- dimensions (metres) */
export const BODY = {
  hipY: 0.93,
  hipX: 0.095,
  thigh: 0.44,
  shin: 0.43,
  spineY: 0.04,
  torsoH: 0.54,
  shoulderX: 0.2,
  shoulderY: 0.47,
  upperArm: 0.29,
  forearm: 0.25,
  neckY: 0.53,
};

/* ---------------------------------------------------------------- shape helpers */
type G = THREE.BufferGeometry;

/** Tapered limb segment hanging down from its joint (top at y=0). */
function segment(rTop: number, rBot: number, len: number, seg = 12): G {
  return new THREE.CylinderGeometry(rBot, rTop, len, seg, 1).translate(0, -len / 2, 0);
}

function ball(r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 14): G {
  return new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7)))
    .scale(sx, sy, sz)
    .translate(x, y, z);
}

/** Paint a flat vertex colour onto a geometry (so merged parts can carry several tones). */
function tint(g: G, hex: number): G {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function merge(parts: G[]): G {
  const clean = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const m = mergeGeometries(clean, false);
  if (!m) throw new Error('figure geometry merge failed');
  m.computeVertexNormals();
  return m;
}

/** Torso: lathed chest-to-waist profile, flattened front-to-back (top of waist at y=0). */
function torsoShape(): G {
  const pts = [
    [0.0, -0.02],
    [0.145, -0.02],
    [0.15, 0.06],
    [0.145, 0.16],
    [0.16, 0.27],
    [0.18, 0.37],
    [0.185, 0.44],
    [0.165, 0.5],
    [0.11, 0.54],
    [0.055, 0.56],
    [0.0, 0.565],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 20).scale(1, 1, 0.62);
}

/** Pelvis block worn under the torso (pants). */
function pelvisShape(): G {
  return ball(0.15, 0, 0.0, 0, 1, 0.6, 0.66, 16);
}

function shoeShape(): G {
  // toe points forward (-Z)
  return new THREE.CapsuleGeometry(0.052, 0.13, 4, 10)
    .rotateX(Math.PI / 2)
    .scale(1.05, 0.62, 1)
    .translate(0, -0.035, -0.045);
}

function handShape(): G {
  return ball(0.042, 0, -0.045, 0, 0.75, 1.35, 1.0, 10);
}

/** Head centred on its own origin: skull, jaw, nose, ears and eyes. */
function headShapes(): { skin: G; eyes: G; hair: G; brows: G } {
  const skin = merge([
    ball(0.105, 0, 0, 0, 0.9, 1.08, 1.0, 22),
    ball(0.07, 0, -0.06, -0.025, 1.0, 0.8, 1.0, 14), // jaw / chin
    new THREE.ConeGeometry(0.018, 0.045, 8).rotateX(-Math.PI / 2).translate(0, -0.012, -0.11), // nose
    ball(0.024, -0.095, -0.005, 0.005, 0.5, 1.1, 0.9, 8), // ears
    ball(0.024, 0.095, -0.005, 0.005, 0.5, 1.1, 0.9, 8),
  ]);
  const eyes = merge([
    ball(0.013, -0.034, 0.012, -0.093, 1, 1, 0.6, 8),
    ball(0.013, 0.034, 0.012, -0.093, 1, 1, 0.6, 8),
  ]);
  const brows = merge([
    new THREE.BoxGeometry(0.035, 0.008, 0.012).translate(-0.035, 0.038, -0.094),
    new THREE.BoxGeometry(0.035, 0.008, 0.012).translate(0.035, 0.038, -0.094),
  ]);
  const hair = new THREE.SphereGeometry(0.113, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.56)
    .rotateX(0.42)
    .scale(0.93, 1.06, 1.04)
    .translate(0, 0.012, 0.008);
  return { skin, eyes, hair, brows };
}

/* ---------------------------------------------------------------- instanced pedestrian parts */
const WHITE = 0xffffff;

/**
 * Single-geometry body parts for instancing. Each part pivots at its joint; vertex colours are
 * multiplied with the per-instance colour (shirt / pants / skin tone / hair colour).
 */
export const PED_GEO = {
  /** pivot at waist; shirt colour (with sleeve caps) */
  torso: merge([
    tint(torsoShape(), WHITE),
    tint(ball(0.068, -BODY.shoulderX, BODY.shoulderY - 0.02, 0, 1, 1.05, 1, 12), WHITE),
    tint(ball(0.068, BODY.shoulderX, BODY.shoulderY - 0.02, 0, 1, 1.05, 1, 12), WHITE),
    tint(segment(0.062, 0.056, 0.12).translate(-BODY.shoulderX - 0.005, BODY.shoulderY, 0), WHITE),
    tint(segment(0.062, 0.056, 0.12).translate(BODY.shoulderX + 0.005, BODY.shoulderY, 0), WHITE),
  ]),
  /** pivot at neck base; skin tone (eyes / brows painted dark) */
  head: (() => {
    const h = headShapes();
    return merge([
      tint(segment(0.048, 0.052, 0.12).translate(0, 0.12, 0), WHITE),
      tint(h.skin.translate(0, 0.2, 0), WHITE),
      tint(h.eyes.translate(0, 0.2, 0), 0x1a1a1a),
      tint(h.brows.translate(0, 0.2, 0), 0x2a2420),
    ]);
  })(),
  hair: headShapes().hair.translate(0, 0.2, 0),
  /** pivot at hip; pants with darker shoes */
  leg: merge([
    tint(ball(0.1, 0, 0.0, 0, 1, 0.9, 0.95, 12), WHITE),
    tint(segment(0.09, 0.066, BODY.thigh), WHITE),
    tint(segment(0.066, 0.05, BODY.shin).translate(0, -BODY.thigh, 0), WHITE),
    tint(shoeShape().translate(0, -BODY.thigh - BODY.shin, 0), 0x262626),
  ]),
  /** pivot at shoulder; bare arm (short sleeves are on the torso) with a slight elbow bend */
  arm: merge([
    tint(segment(0.047, 0.04, BODY.upperArm), WHITE),
    tint(
      merge([segment(0.04, 0.033, BODY.forearm), handShape().translate(0, -BODY.forearm, 0)])
        .rotateX(0.22)
        .translate(0, -BODY.upperArm, 0),
      WHITE,
    ),
  ]),
};

export const SKIN_TONES = [0xf1c8a8, 0xe0ac87, 0xc68c64, 0xa86e4a, 0x8a5536, 0x613b26, 0xf5d5bd];
export const HAIR_COLORS = [0x1c1612, 0x2e2018, 0x5a3a22, 0x8b5a2b, 0xc9a05a, 0x9a9a9a, 0x101010, 0x6b2e1a];

/* ---------------------------------------------------------------- the player figure */
const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1f1f22, roughness: 0.55 });
const hairMat = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.9 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
const beltMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.6, metalness: 0.1 });
const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.7 });

export interface FigureStyle {
  hair?: number;
  skin?: number;
}

export function buildFigure(
  cloth: THREE.Material,
  skin: THREE.Material,
  pants: THREE.Material,
  style: FigureStyle = {},
): FigureParts {
  const skinM =
    style.skin !== undefined ? new THREE.MeshStandardMaterial({ color: style.skin, roughness: 0.65 }) : skin;
  const hairM =
    style.hair !== undefined
      ? new THREE.MeshStandardMaterial({ color: style.hair, roughness: 0.9 })
      : hairMat;
  const meshes: THREE.Mesh[] = [];
  const add = (parent: THREE.Object3D, geo: G, m: THREE.Material): THREE.Mesh => {
    const me = new THREE.Mesh(geo, m);
    me.castShadow = true;
    parent.add(me);
    meshes.push(me);
    return me;
  };
  const group = (parent: THREE.Object3D, x: number, y: number, z = 0): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const root = new THREE.Group();
  const hips = group(root, 0, BODY.hipY);
  add(hips, pelvisShape(), pants);
  add(
    hips,
    new THREE.CylinderGeometry(0.152, 0.152, 0.045, 20).scale(1, 1, 0.68).translate(0, 0.05, 0),
    beltMat,
  );

  const spine = group(hips, 0, BODY.spineY);
  const torso = add(spine, torsoShape(), cloth);
  // jacket details: collar and a zip stripe
  add(
    spine,
    new THREE.TorusGeometry(0.062, 0.018, 6, 16).rotateX(Math.PI / 2).translate(0, BODY.neckY, 0),
    cloth,
  );
  add(spine, new THREE.BoxGeometry(0.012, 0.42, 0.01).translate(0, 0.28, -0.112), stripeMat);

  const neck = group(spine, 0, BODY.neckY - 0.02);
  add(neck, segment(0.048, 0.052, 0.12).translate(0, 0.12, 0), skinM);
  const head = group(neck, 0, 0.2);
  const hs = headShapes();
  add(head, hs.skin, skinM);
  add(head, hs.eyes, eyeMat);
  add(head, hs.brows, hairM);
  add(head, hs.hair, hairM);

  const arm = (side: number): [THREE.Group, THREE.Group] => {
    const sh = group(spine, side * BODY.shoulderX, BODY.shoulderY);
    add(sh, ball(0.07, 0, 0, 0, 1, 1, 1, 12), cloth);
    add(sh, segment(0.058, 0.048, BODY.upperArm), cloth);
    const el = group(sh, 0, -BODY.upperArm);
    add(el, ball(0.047, 0, 0, 0, 1, 1, 1, 10), cloth);
    add(el, segment(0.046, 0.04, BODY.forearm - 0.03), cloth);
    add(el, segment(0.042, 0.036, 0.035).translate(0, -BODY.forearm + 0.035, 0), skinM); // wrist
    add(el, handShape().translate(0, -BODY.forearm, 0), skinM);
    return [sh, el];
  };
  const [armL, elbowL] = arm(-1);
  const [armR, elbowR] = arm(1);

  const leg = (side: number): [THREE.Group, THREE.Group] => {
    const hp = group(hips, side * BODY.hipX, 0);
    add(hp, segment(0.092, 0.068, BODY.thigh), pants);
    const kn = group(hp, 0, -BODY.thigh);
    add(kn, ball(0.068, 0, 0, 0, 1, 1, 1, 10), pants);
    add(kn, segment(0.066, 0.05, BODY.shin), pants);
    add(kn, shoeShape().translate(0, -BODY.shin, 0), shoeMat);
    return [hp, kn];
  };
  const [legL, kneeL] = leg(-1);
  const [legR, kneeR] = leg(1);
  for (const m of meshes) m.receiveShadow = true;

  return { root, hips, spine, head, legL, legR, kneeL, kneeR, armL, armR, elbowL, elbowR, torso };
}

/**
 * Pose the figure for a gait phase (radians) and amplitude 0..1 (0 = idle, 1 = full run).
 * Includes knee/elbow bend, torso lean and counter-rotation, and idle breathing.
 */
export function poseWalk(f: FigureParts, phase: number, amp: number, airborne: boolean): void {
  if (airborne) {
    f.legL.rotation.x = 0.65;
    f.kneeL.rotation.x = -1.1;
    f.legR.rotation.x = -0.25;
    f.kneeR.rotation.x = -0.5;
    f.armL.rotation.set(-0.5, 0, -0.35);
    f.armR.rotation.set(0.7, 0, 0.35);
    f.elbowL.rotation.x = 0.6;
    f.elbowR.rotation.x = 0.6;
    f.spine.rotation.set(-0.1, 0, 0);
    f.hips.position.y = BODY.hipY;
    f.head.rotation.set(-0.1, 0, 0);
    return;
  }
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const run = Math.max(0, amp - 0.55) / 0.45; // 0 walking → 1 sprinting
  const stride = 0.55 + 0.35 * run;
  // positive X rotation swings a hanging limb forward (toward -Z)
  f.legL.rotation.x = -s * stride * amp;
  f.legR.rotation.x = s * stride * amp;
  // knees bend most while the leg swings forward (lifted), little on the stance leg
  const bendL = Math.max(0, -c) * (0.9 + 0.7 * run) + 0.08;
  const bendR = Math.max(0, c) * (0.9 + 0.7 * run) + 0.08;
  f.kneeL.rotation.x = -bendL * amp;
  f.kneeR.rotation.x = -bendR * amp;
  // arms counter-swing, elbows flex more when running
  const armSwing = (0.45 + 0.45 * run) * amp;
  f.armL.rotation.set(s * armSwing, 0, -0.09);
  f.armR.rotation.set(-s * armSwing, 0, 0.09);
  const elbow = 0.18 + 0.15 * amp + 1.0 * run * amp;
  f.elbowL.rotation.x = elbow + Math.max(0, s) * 0.3 * amp;
  f.elbowR.rotation.x = elbow + Math.max(0, -s) * 0.3 * amp;
  // body: bob, forward lean, counter-rotation; idle breathing
  const breathe = Math.sin(phase * 0.35) * 0.006 * (1 - amp);
  f.hips.position.y = BODY.hipY - 0.02 * amp + Math.abs(c) * (0.04 + 0.03 * run) * amp;
  f.hips.rotation.y = s * 0.1 * amp;
  f.spine.rotation.set(-(0.04 + 0.16 * run) * amp, -s * 0.18 * amp, 0);
  f.spine.scale.set(1 + breathe, 1 + breathe * 0.5, 1 + breathe * 1.4);
  f.head.rotation.set(-(0.03 + 0.1 * run) * amp, s * 0.08 * amp, 0);
}
