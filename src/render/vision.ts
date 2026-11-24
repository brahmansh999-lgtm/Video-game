/**
 * Architect Vision: swaps chunk materials to a blueprint / structural rendering (no geometry
 * rebuild) and overlays height labels, district boundaries and the day's sun-path arc.
 */
import * as THREE from 'three';
import { DISTRICT_COLORS, HALF, WORLD, districtAt } from '../world/layout';
import type { ChunkManager } from '../world/chunks';
import type { WorldData } from '../world/worldData';
import { sunDirection } from './sky';

const LABELS = 16;
const SUN_R = 900;

export class ArchitectVision {
  on = false;
  readonly group = new THREE.Group();
  private readonly boundaries: THREE.LineSegments;
  private readonly sunPath: THREE.Line;
  private readonly sunMarker: THREE.Mesh;
  private readonly labelRoot: HTMLDivElement;
  private readonly labels: HTMLDivElement[] = [];
  private readonly labelText: string[] = [];
  private readonly candidates: number[] = [];
  private readonly dist: Float32Array;
  private readonly v = new THREE.Vector3();
  private readonly sun = new THREE.Vector3();
  private readonly byScore = (i: number, j: number): number => {
    const b = this.world.buildings;
    return b[j].height / (200 + this.dist[j]) - b[i].height / (200 + this.dist[i]);
  };

  constructor(
    private readonly world: WorldData,
    private readonly chunks: ChunkManager,
    private readonly scene: THREE.Scene,
    ui: HTMLElement,
  ) {
    this.dist = new Float32Array(world.buildings.length);
    this.boundaries = this.buildBoundaries();
    const pts = new Float32Array(97 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.sunPath = new THREE.Line(
      g,
      new THREE.LineBasicMaterial({ color: 0xffc23a, fog: false, depthTest: false, transparent: true }),
    );
    this.sunPath.frustumCulled = false;
    this.sunPath.renderOrder = 10;
    this.sunMarker = new THREE.Mesh(
      new THREE.SphereGeometry(18, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, fog: false, depthTest: false }),
    );
    this.sunMarker.renderOrder = 11;
    this.group.add(this.boundaries, this.sunPath, this.sunMarker);
    this.group.visible = false;
    scene.add(this.group);
    this.labelRoot = document.createElement('div');
    this.labelRoot.className = 'vision-labels hidden';
    ui.appendChild(this.labelRoot);
    for (let i = 0; i < LABELS; i++) {
      const d = document.createElement('div');
      d.className = 'vlabel';
      this.labelRoot.appendChild(d);
      this.labels.push(d);
      this.labelText.push('');
    }
  }

  /** Lines along every edge where the district changes (sampled on a 32 m grid). */
  private buildBoundaries(): THREE.LineSegments {
    const step = 32;
    const n = WORLD / step;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    const at = (i: number, j: number): string =>
      districtAt(i * step - HALF + step / 2, j * step - HALF + step / 2);
    const push = (x0: number, z0: number, x1: number, z1: number, d: string): void => {
      c.set(DISTRICT_COLORS[d as keyof typeof DISTRICT_COLORS]);
      for (const [x, z] of [
        [x0, z0],
        [x1, z1],
      ]) {
        pos.push(x, this.world.terrain.heightAt(x, z) + 3, z);
        col.push(c.r, c.g, c.b);
      }
    };
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const d = at(i, j);
        const x = i * step - HALF;
        const z = j * step - HALF;
        if (i + 1 < n && at(i + 1, j) !== d) push(x + step, z, x + step, z + step, d);
        if (j + 1 < n && at(i, j + 1) !== d) push(x, z + step, x + step, z + step, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.LineBasicMaterial({ vertexColors: true, fog: false });
    const ls = new THREE.LineSegments(g, m);
    ls.frustumCulled = false;
    return ls;
  }

  toggle(): boolean {
    this.set(!this.on);
    return this.on;
  }

  set(on: boolean): void {
    this.on = on;
    this.chunks.setVision(on);
    this.group.visible = on;
    this.labelRoot.classList.toggle('hidden', !on);
  }

  update(cam: THREE.PerspectiveCamera, focus: THREE.Vector3, hours: number): void {
    if (!this.on) return;
    // thin the fog so the analysis reads at distance
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) fog.density *= 0.35;
    // sun path around the player
    const attr = this.sunPath.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k <= 96; k++) {
      sunDirection((k / 96) * 24, this.sun);
      attr.setXYZ(
        k,
        focus.x + this.sun.x * SUN_R,
        Math.max(focus.y, focus.y + this.sun.y * SUN_R),
        focus.z + this.sun.z * SUN_R,
      );
    }
    attr.needsUpdate = true;
    sunDirection(hours, this.sun);
    this.sunMarker.position.copy(focus).addScaledVector(this.sun, SUN_R);
    this.sunMarker.visible = this.sun.y > 0;

    // height labels for the tallest nearby buildings in view
    const b = this.world.buildings;
    this.candidates.length = 0;
    for (let i = 0; i < b.length; i++) {
      const s = b[i];
      const d = Math.hypot(s.x - cam.position.x, s.z - cam.position.z);
      this.dist[i] = d;
      if (d < 900 && s.height > 40) this.candidates.push(i);
    }
    // score: tall and close first
    this.candidates.sort(this.byScore);
    const W = window.innerWidth;
    const H = window.innerHeight;
    let shown = 0;
    for (let k = 0; k < this.candidates.length && shown < LABELS; k++) {
      const s = b[this.candidates[k]];
      this.v.set(s.x, s.y + s.height + 6, s.z).project(cam);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1 || Math.abs(this.v.y) > 1) continue;
      const el = this.labels[shown];
      const txt = `${Math.round(s.height)} m${s.landmark ? ' ★' : ''}`;
      if (this.labelText[shown] !== txt) {
        this.labelText[shown] = txt;
        el.textContent = txt;
      }
      el.style.transform = `translate(${((this.v.x * 0.5 + 0.5) * W).toFixed(0)}px, ${((-this.v.y * 0.5 + 0.5) * H).toFixed(0)}px)`;
      el.style.display = '';
      shown++;
    }
    for (let k = shown; k < LABELS; k++) this.labels[k].style.display = 'none';
  }
}
