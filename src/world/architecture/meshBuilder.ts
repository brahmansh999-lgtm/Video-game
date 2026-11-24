/** Growable indexed mesh builder used by all procedural generators. */
import * as THREE from 'three';

const STYLE_COLORS = [0x4f7590, 0xc9cbc8, 0x262c33, 0x9b8068];

export class MeshBuilder {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];
  readonly col: number[] | null;
  readonly sty: number[] | null;
  readonly idx: number[] = [];
  private r = 1;
  private g = 1;
  private b = 1;
  private s = 0;

  constructor(opts: { color?: boolean; style?: boolean } = {}) {
    this.col = opts.color ? [] : null;
    this.sty = opts.style ? [] : null;
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  setColor(hex: number): this {
    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;
    // vertex colours are linear in three.js
    this.r = Math.pow(this.r, 2.2);
    this.g = Math.pow(this.g, 2.2);
    this.b = Math.pow(this.b, 2.2);
    return this;
  }

  setStyle(s: number): this {
    this.s = s;
    // colour-only builders (far LOD) approximate the facade style with a flat colour
    if (this.col && !this.sty) this.setColor(STYLE_COLORS[s] ?? 0x8899aa);
    return this;
  }

  /** Appends an indexed geometry that has position/normal/color attributes. */
  appendGeometry(g: THREE.BufferGeometry): void {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const c = g.getAttribute('color');
    const base = this.vertexCount;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.uv.push(0, 0);
      if (this.col) this.col.push(c ? c.getX(i) : this.r, c ? c.getY(i) : this.g, c ? c.getZ(i) : this.b);
      this.sty?.push(this.s);
    }
    const idx = g.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) this.idx.push(base + idx.getX(i));
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col?.push(this.r, this.g, this.b);
    this.sty?.push(this.s);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  /** Flat quad from 4 corners (counter-clockwise when seen from the front). */
  flatQuad(
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
  ): void {
    const ax = p1.x - p0.x;
    const ay = p1.y - p0.y;
    const az = p1.z - p0.z;
    const bx = p3.x - p0.x;
    const by = p3.y - p0.y;
    const bz = p3.z - p0.z;
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const a = this.vertex(p0.x, p0.y, p0.z, nx, ny, nz, u0, v0);
    const b = this.vertex(p1.x, p1.y, p1.z, nx, ny, nz, u1, v0);
    const c = this.vertex(p2.x, p2.y, p2.z, nx, ny, nz, u1, v1);
    const d = this.vertex(p3.x, p3.y, p3.z, nx, ny, nz, u0, v1);
    this.quad(a, b, c, d);
  }

  /**
   * Axis-aligned box (after Y rotation) centred at (cx, cy, cz) with half extents.
   * UVs are metric: u = metres / uScale, v = metres / vScale (facade convention).
   */
  box(
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rotY = 0,
    uScale = 24,
    vScale = 28.8,
    top = true,
    bottom = false,
  ): void {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const P = (x: number, y: number, z: number): THREE.Vector3 =>
      new THREE.Vector3(cx + x * c + z * s, cy + y, cz - x * s + z * c);
    const y0 = -hy;
    const y1 = hy;
    const corners = [P(-hx, 0, hz), P(hx, 0, hz), P(hx, 0, -hz), P(-hx, 0, -hz)];
    const lens = [2 * hx, 2 * hz, 2 * hx, 2 * hz];
    let u = 0;
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const v0 = (cy + y0) / vScale;
      const v1 = (cy + y1) / vScale;
      this.flatQuad(
        new THREE.Vector3(a.x, cy + y0, a.z),
        new THREE.Vector3(b.x, cy + y0, b.z),
        new THREE.Vector3(b.x, cy + y1, b.z),
        new THREE.Vector3(a.x, cy + y1, a.z),
        u / uScale,
        v0,
        (u + lens[i]) / uScale,
        v1,
      );
      u += lens[i];
    }
    if (top) {
      const t = corners.map((p) => new THREE.Vector3(p.x, cy + y1, p.z));
      this.flatQuad(t[0], t[1], t[2], t[3], 0, 0, (2 * hx) / uScale, (2 * hz) / uScale);
    }
    if (bottom) {
      const t = corners.map((p) => new THREE.Vector3(p.x, cy + y0, p.z));
      this.flatQuad(t[3], t[2], t[1], t[0], 0, 0, (2 * hx) / uScale, (2 * hz) / uScale);
    }
  }

  /** Square beam between two points (used for cables, members, hangers). */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number): void {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-4) return;
    dir.divideScalar(len);
    const ref = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const s1 = new THREE.Vector3()
      .crossVectors(dir, ref)
      .normalize()
      .multiplyScalar(w / 2);
    const s2 = new THREE.Vector3()
      .crossVectors(dir, s1)
      .normalize()
      .multiplyScalar(w / 2);
    const offs = [
      [s1, s2],
      [s2, s1.clone().negate()],
      [s1.clone().negate(), s2.clone().negate()],
      [s2.clone().negate(), s1],
    ];
    for (const [o1, o2] of offs) {
      const p0 = a.clone().add(o1).add(o2);
      const p1 = a.clone().add(o1).sub(o2);
      const p2 = b.clone().add(o1).sub(o2);
      const p3 = b.clone().add(o1).add(o2);
      this.flatQuad(p0, p1, p2, p3, 0, 0, 1, len / 4);
    }
  }

  /** Vertical cylinder (open ended unless capped). */
  cylinder(x: number, y0: number, z: number, r: number, h: number, seg = 10, cap = true): void {
    const base = this.vertexCount;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      this.vertex(x + cx * r, y0, z + sz * r, cx, 0, sz, i / seg, y0 / 4);
      this.vertex(x + cx * r, y0 + h, z + sz * r, cx, 0, sz, i / seg, (y0 + h) / 4);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      this.quad(a, a + 1, a + 3, a + 2);
    }
    if (cap) {
      const c = this.vertex(x, y0 + h, z, 0, 1, 0, 0.5, 0.5);
      const ring = this.vertexCount;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        this.vertex(x + Math.cos(a) * r, y0 + h, z + Math.sin(a) * r, 0, 1, 0, 0, 0);
      }
      for (let i = 0; i < seg; i++) this.tri(c, ring + i + 1, ring + i);
    }
  }

  toGeometry(): THREE.BufferGeometry | null {
    if (this.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.sty) g.setAttribute('aStyle', new THREE.Float32BufferAttribute(this.sty, 1));
    const n = this.pos.length / 3;
    g.setIndex(
      n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1),
    );
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** The set of builders a chunk fills, one per shared material. */
export interface ChunkBuilders {
  facade: MeshBuilder;
  solid: MeshBuilder;
  neon: MeshBuilder;
  shell: MeshBuilder;
  road: MeshBuilder;
  metal: MeshBuilder;
  /** Structural member transforms (diagrids) -> instanced. */
  members: THREE.Matrix4[];
  /** Tree transforms -> instanced. */
  trees: THREE.Matrix4[];
}

export function newBuilders(): ChunkBuilders {
  return {
    facade: new MeshBuilder({ style: true }),
    solid: new MeshBuilder({ color: true }),
    neon: new MeshBuilder(),
    shell: new MeshBuilder(),
    road: new MeshBuilder(),
    metal: new MeshBuilder(),
    members: [],
    trees: [],
  };
}

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _m = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Matrix that maps a unit Y-aligned member onto the segment a-b with thickness w. */
export function memberMatrix(a: THREE.Vector3, b: THREE.Vector3, w: number): THREE.Matrix4 {
  _d.subVectors(b, a);
  const len = _d.length();
  _d.divideScalar(len || 1);
  _q.setFromUnitVectors(_up, _d);
  _m.addVectors(a, b).multiplyScalar(0.5);
  _s.set(w, len, w);
  return new THREE.Matrix4().compose(_m, _q, _s);
}
