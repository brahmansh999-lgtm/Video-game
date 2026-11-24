/** Small procedural-shape toolkit for vehicles: superellipse lofts, tinting and merging. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type G = THREE.BufferGeometry;

/** One loft station: [z, half width, bottom y, top y]. */
export type Station = [number, number, number, number];

/**
 * Lofts a smooth body through cross-sections along Z. Each section is a superellipse
 * (exp 2 = ellipse, 4 = rounded box, 10+ = nearly square). Ends are capped.
 */
export function loft(st: Station[], exp = 4, seg = 28): G {
  const pos: number[] = [];
  const idx: number[] = [];
  const e = 2 / exp;
  const ring = (z: number, hw: number, y0: number, y1: number): void => {
    const cy = (y0 + y1) / 2;
    const hh = (y1 - y0) / 2;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(
        hw * Math.sign(c) * Math.pow(Math.abs(c), e),
        cy + hh * Math.sign(s) * Math.pow(Math.abs(s), e),
        z,
      );
    }
  };
  for (const [z, hw, y0, y1] of st) ring(z, hw, y0, y1);
  for (let k = 0; k < st.length - 1; k++) {
    for (let i = 0; i < seg; i++) {
      const a = k * seg + i;
      const b = k * seg + ((i + 1) % seg);
      const c = b + seg;
      const d = a + seg;
      idx.push(a, b, c, a, c, d);
    }
  }
  // caps get their own vertices so they shade flat
  const cap = (k: number, front: boolean): void => {
    const [z, , y0, y1] = st[k];
    const base = pos.length / 3;
    for (let i = 0; i < seg; i++) pos.push(pos[(k * seg + i) * 3], pos[(k * seg + i) * 3 + 1], z);
    const c = pos.length / 3;
    pos.push(0, (y0 + y1) / 2, z);
    for (let i = 0; i < seg; i++) {
      const i1 = (i + 1) % seg;
      if (front) idx.push(c, base + i1, base + i);
      else idx.push(c, base + i, base + i1);
    }
  };
  cap(0, true);
  cap(st.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Lathe along Z: profile of [z, radius] from nose to tail, capped both ends. */
export function latheZ(profile: [number, number][], seg = 24, squashY = 0.95): G {
  return loft(
    profile.map(([z, r]) => [z, Math.max(r, 0.002), -r * squashY, r * squashY] as Station),
    2,
    seg,
  );
}

export function ball(r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 16): G {
  return new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.6)))
    .scale(sx, sy, sz)
    .translate(x, y, z);
}

export function box(x: number, y: number, z: number, w: number, h: number, d: number): G {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** Cylinder whose axis runs along X (wheels, spare tyres) or Z (exhausts, nozzles). */
export function cylX(r: number, w: number, x: number, y: number, z: number, seg = 18): G {
  return new THREE.CylinderGeometry(r, r, w, seg).rotateZ(Math.PI / 2).translate(x, y, z);
}

export function cylZ(r0: number, r1: number, len: number, x: number, y: number, z: number, seg = 18): G {
  return new THREE.CylinderGeometry(r1, r0, len, seg).rotateX(-Math.PI / 2).translate(x, y, z);
}

/**
 * A wing / tailplane panel. Root at x0, tip at x1 (either side), leading edge toward -Z.
 * Rounded leading edge via a flattened superellipse cross section.
 */
export function wingPanel(
  x0: number,
  x1: number,
  y: number,
  z: number,
  chordRoot: number,
  chordTip: number,
  sweep: number,
  thick: number,
  dihedral = 0,
): G {
  // loft along local Z = span, then rotate so the span runs along X
  const span = Math.abs(x1 - x0);
  const g = loft(
    [
      [0, chordRoot / 2, -thick / 2, thick / 2],
      [span, chordTip / 2, -thick * 0.35, thick * 0.35],
    ],
    2.6,
    16,
  );
  // currently: chord along X, thickness along Y, span along Z
  g.rotateY(Math.PI / 2); // span → +X (0..span), chord → Z
  const pos = g.attributes.position;
  const dir = Math.sign(x1 - x0) || 1;
  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const t = sx / span;
    pos.setXYZ(i, x0 + dir * sx, y + pos.getY(i) + dihedral * t, z + pos.getZ(i) + sweep * t);
  }
  // mirroring flips the winding: restore outward-facing triangles
  const index = g.getIndex();
  if (dir < 0 && index) {
    for (let i = 0; i < index.count; i += 3) {
      const b1 = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b1);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Vertical fin: like a wing panel standing up from y0 to y0+height. */
export function finPanel(
  y0: number,
  height: number,
  z: number,
  chordRoot: number,
  chordTip: number,
  sweep: number,
  thick: number,
): G {
  const g = wingPanel(0, height, 0, 0, chordRoot, chordTip, sweep, thick);
  g.rotateZ(Math.PI / 2); // span along +Y
  g.translate(0, y0, z);
  return g;
}

/** Paint a flat colour into the vertex colours (hex is sRGB). */
export function tint(g: G, hex: number): G {
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

/** Merge geometries that may differ in index/uv presence. Keeps normals as computed per part. */
export function merge(parts: G[]): G {
  const hasColor = parts.every((p) => p.attributes.color);
  const clean = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p.clone();
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && !(hasColor && k === 'color')) g.deleteAttribute(k);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  });
  const m = mergeGeometries(clean, false);
  if (!m) throw new Error('vehicle geometry merge failed');
  m.computeBoundingSphere();
  return m;
}
