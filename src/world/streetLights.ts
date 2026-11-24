/**
 * Street lamps along every road: instanced poles, emissive lamp heads and an additive pool of
 * light on the road under each lamp, which fades in after dusk. No real light sources, so the
 * cost stays flat however many lamps there are.
 */
import * as THREE from 'three';
import type { Materials } from '../render/materials';
import type { WorldData } from './worldData';

const SPACING = 38;
const POLE_H = 7.6;
const ARM = 2.0;
const POOL_R = 10;

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class StreetLights {
  readonly group = new THREE.Group();
  readonly count: number;
  private readonly poolMat: THREE.MeshBasicMaterial;
  private readonly haloMat: THREE.MeshBasicMaterial;

  constructor(world: WorldData, mats: Materials) {
    const { roads, terrain } = world;
    const xs: { x: number; y: number; z: number; yaw: number }[] = [];
    for (const e of roads.edges) {
      const A = roads.nodes[e.a];
      const B = roads.nodes[e.b];
      const ux = (B.x - A.x) / e.length;
      const uz = (B.z - A.z) / e.length;
      const grid = e.kind === 'grid';
      const off = e.width / 2 + (e.kind === 'bridge' ? -0.5 : 0.8);
      const n = Math.floor(e.length / SPACING);
      const ts: number[] = [];
      if (n === 0) {
        // short spline segments: keep roughly the same density with a deterministic pick
        const h = Math.abs(Math.sin(e.id * 12.9898) * 43758.5453) % 1;
        if (h < e.length / SPACING) ts.push(e.length / 2);
      } else {
        const step = e.length / n;
        for (let k = 0; k < n; k++) ts.push(step * (k + 0.5));
      }
      ts.forEach((t, k) => {
        // skip lamps inside grid intersections
        if (grid && (t < 12 || t > e.length - 12)) return;
        const side = k % 2 === 0 ? 1 : -1;
        const nx = -uz * side;
        const nz = ux * side;
        const x = A.x + ux * t + nx * off;
        const z = A.z + uz * t + nz * off;
        const f = t / e.length;
        const y = grid ? terrain.heightAt(x, z) : A.y + (B.y - A.y) * f;
        // local +X (the arm) points back over the road
        xs.push({ x, y, z, yaw: Math.atan2(nz, -nx) });
      });
    }
    this.count = xs.length;

    const pole = new THREE.CylinderGeometry(0.07, 0.11, POLE_H, 8).translate(0, POLE_H / 2, 0);
    const arm = new THREE.BoxGeometry(ARM, 0.08, 0.08).translate(ARM / 2, POLE_H - 0.05, 0);
    const base = new THREE.CylinderGeometry(0.18, 0.22, 0.5, 8).translate(0, 0.25, 0);
    const head = new THREE.BoxGeometry(0.75, 0.1, 0.32).translate(ARM - 0.1, POLE_H - 0.14, 0);
    const halo = new THREE.SphereGeometry(0.5, 10, 6)
      .scale(1.4, 0.35, 1)
      .translate(ARM - 0.1, POLE_H - 0.22, 0);
    const pool = new THREE.PlaneGeometry(POOL_R * 2, POOL_R * 2)
      .rotateX(-Math.PI / 2)
      .translate(ARM, 0.09, 0);

    const poleMesh = new THREE.InstancedMesh(
      mergeSimple([pole, arm, base]),
      mats.darkMetal,
      Math.max(1, xs.length),
    );
    poleMesh.castShadow = false;
    const headMesh = new THREE.InstancedMesh(head, mats.lightLamp, Math.max(1, xs.length));
    this.haloMat = new THREE.MeshBasicMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    const haloMesh = new THREE.InstancedMesh(halo, this.haloMat, Math.max(1, xs.length));
    this.poolMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: 0xffcf8a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const poolMesh = new THREE.InstancedMesh(pool, this.poolMat, Math.max(1, xs.length));
    poolMesh.renderOrder = 2;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    xs.forEach((l, i) => {
      q.setFromAxisAngle(up, l.yaw);
      p.set(l.x, l.y, l.z);
      m.compose(p, q, one);
      poleMesh.setMatrixAt(i, m);
      headMesh.setMatrixAt(i, m);
      haloMesh.setMatrixAt(i, m);
      poolMesh.setMatrixAt(i, m);
    });
    for (const im of [poleMesh, headMesh, haloMesh, poolMesh]) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
    this.group.add(poleMesh, headMesh, haloMesh, poolMesh);
  }

  /** night: 0 day .. 1 full night. */
  update(night: number): void {
    const k = THREE.MathUtils.smoothstep(night, 0.25, 0.8);
    this.poolMat.opacity = 0.55 * k;
    this.haloMat.opacity = 0.35 * k;
    this.poolMat.visible = k > 0.01;
    this.haloMat.visible = k > 0.01;
  }
}

/** Merge non-indexed copies of simple primitives (position + normal only). */
function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g of parts) {
    const ng = g.toNonIndexed();
    pos.push(...(ng.attributes.position.array as Float32Array));
    nor.push(...(ng.attributes.normal.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
