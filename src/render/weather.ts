/** Weather: clear / overcast / rain / storm with GPU-animated rain, lightning, wind and wet roads. */
import * as THREE from 'three';
import { mulberry32, noise2 } from '../core/rng';
import type { Materials } from './materials';
import type { Atmosphere } from './sky';

export type WeatherType = 'clear' | 'overcast' | 'rain' | 'storm';
export const WEATHER_TYPES: WeatherType[] = ['clear', 'overcast', 'rain', 'storm'];

interface Targets {
  cloud: number;
  rain: number;
  wind: number;
  fog: number;
}

const TARGETS: Record<WeatherType, Targets> = {
  clear: { cloud: 0.12, rain: 0, wind: 4, fog: 0 },
  overcast: { cloud: 0.7, rain: 0, wind: 7, fog: 0.00012 },
  rain: { cloud: 0.88, rain: 0.75, wind: 9, fog: 0.00028 },
  storm: { cloud: 1, rain: 1, wind: 15, fog: 0.0004 },
};

const N = 7000;
const BOX = 90;
const H = 60;

const vert = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uWind;
uniform float uIntensity;
varying float vAlpha;
void main() {
  float speed = 22.0 + aSeed.w * 6.0;
  vec3 p;
  p.y = mod(aSeed.y - uTime * speed, ${H.toFixed(1)}) - ${(H / 2).toFixed(1)};
  vec2 drift = uWind.xz * uTime * 0.6;
  p.xz = mod(aSeed.xz * ${BOX.toFixed(1)} + drift - uCenter.xz, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
  vec3 vel = normalize(vec3(uWind.x * 0.6, -speed, uWind.z * 0.6));
  float isEnd = mod(float(gl_VertexID), 2.0);
  vec3 world = uCenter + p - vel * isEnd * 0.9;
  vAlpha = step(aSeed.w, uIntensity) * 0.35;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const frag = /* glsl */ `
varying float vAlpha;
void main() {
  if (vAlpha < 0.01) discard;
  gl_FragColor = vec4(0.75, 0.8, 0.9, vAlpha);
}`;

export class Weather {
  type: WeatherType = 'clear';
  cloud = 0.12;
  rain = 0;
  windSpeed = 4;
  fog = 0;
  wet = 0;
  flash = 0;
  readonly wind = new THREE.Vector3(4, 0, 0);
  readonly rainMesh: THREE.LineSegments;
  /** Called when thunder should be heard (distance 0..1). */
  onThunder: ((d: number) => void) | null = null;
  private time = 0;
  private windDir = 0.6;
  private nextFlash = 8;
  private thunderAt = -1;
  private thunderDist = 0;
  private readonly rnd = mulberry32(77);
  private readonly mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const seeds = new Float32Array(N * 2 * 4);
    const pos = new Float32Array(N * 2 * 3);
    for (let i = 0; i < N; i++) {
      const s = [this.rnd(), this.rnd() * H, this.rnd(), this.rnd()];
      seeds.set(s, i * 8);
      seeds.set(s, i * 8 + 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uWind: { value: this.wind },
        uIntensity: { value: 0 },
      },
    });
    this.rainMesh = new THREE.LineSegments(g, this.mat);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    scene.add(this.rainMesh);
  }

  set(type: WeatherType, instant = false): void {
    this.type = type;
    if (instant) {
      const t = TARGETS[type];
      this.cloud = t.cloud;
      this.rain = t.rain;
      this.windSpeed = t.wind;
      this.fog = t.fog;
      this.wet = t.rain > 0 ? 1 : 0;
    }
  }

  update(dt: number, cam: THREE.Vector3, atmos: Atmosphere, mats: Materials): void {
    this.time += dt;
    const t = TARGETS[this.type];
    const k = Math.min(1, dt * 0.15);
    this.cloud += (t.cloud - this.cloud) * k;
    this.rain += (t.rain - this.rain) * k;
    this.windSpeed += (t.wind - this.windSpeed) * k;
    this.fog += (t.fog - this.fog) * k;
    this.wet += ((this.rain > 0.1 ? 1 : 0) - this.wet) * dt * (this.rain > 0.1 ? 0.08 : 0.02);
    // slowly veering wind with gusts
    this.windDir += noise2(this.time * 0.01, 3.3) * 0.02 * dt;
    const gust = 1 + 0.35 * noise2(this.time * 0.35, 9.1) * (this.type === 'storm' ? 1.6 : 0.6);
    const w = this.windSpeed * gust;
    this.wind.set(Math.cos(this.windDir) * w, 0, Math.sin(this.windDir) * w);

    // lightning
    if (this.type === 'storm') {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.flash = 1;
        this.nextFlash = 5 + this.rnd() * 10;
        this.thunderDist = this.rnd();
        this.thunderAt = this.time + 0.4 + this.thunderDist * 2.5;
      }
    }
    if (this.thunderAt > 0 && this.time >= this.thunderAt) {
      this.thunderAt = -1;
      this.onThunder?.(this.thunderDist);
    }
    this.flash = Math.max(0, this.flash - dt * (this.flash > 0.5 ? 6 : 2.5));
    const flicker = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(this.time * 60)) : 0;

    atmos.cloudiness = this.cloud;
    atmos.fogBoost = this.fog;
    atmos.flash = flicker;
    mats.setWet(this.wet);

    const u = this.mat.uniforms;
    u.uTime.value = this.time;
    (u.uCenter.value as THREE.Vector3).copy(cam);
    u.uIntensity.value = this.rain;
    this.rainMesh.visible = this.rain > 0.02;
  }

  /** Mission helper: force a crosswind of the given speed (m/s) from the given heading (rad). */
  forceWind(dir: number): void {
    this.windDir = dir;
  }
}
