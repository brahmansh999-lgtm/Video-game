/** Shader water: fresnel, scrolling normal maps, sun glint and optional planar reflections. */
import * as THREE from 'three';
import { REFLECT_LAYER } from '../render/sky';
import { waterNormals } from '../render/textures';
import { RESERVOIR, RESERVOIR_LEVEL, SEA_LEVEL } from './layout';

const vert = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vMirror;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vMirror = textureMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
uniform sampler2D normalMap;
uniform sampler2D reflectionMap;
uniform float useReflection;
uniform float time;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 waterColor;
uniform vec3 skyColor;
uniform vec3 horizonColor;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float rain;
varying vec4 vMirror;
varying vec3 vWorld;
vec3 sampleNormal(vec2 uv) {
  vec2 a = uv / 60.0 + vec2(time * 0.012, time * 0.008);
  vec2 b = uv / 23.0 - vec2(time * 0.017, -time * 0.011);
  vec3 n = texture2D(normalMap, a).xyz * 2.0 - 1.0;
  n += texture2D(normalMap, b).xyz * 2.0 - 1.0;
  return normalize(vec3(n.x, 2.6 - rain * 1.2, n.y));
}
void main() {
  vec3 n = sampleNormal(vWorld.xz);
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(horizonColor, skyColor, clamp(r.y * 1.6, 0.0, 1.0));
  if (useReflection > 0.5) {
    vec2 dist = n.xz * 0.04;
    vec3 refl = texture2D(reflectionMap, vMirror.xy / vMirror.w + dist).rgb;
    sky = mix(sky, refl, 0.85);
  }
  float spec = pow(max(dot(r, sunDir), 0.0), 220.0) * 4.0;
  vec3 col = mix(waterColor, sky, fres) + sunColor * spec;
  float dist = length(cameraPosition - vWorld);
  float fogF = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
  gl_FragColor = vec4(mix(col, fogColor, fogF), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Water {
  readonly sea: THREE.Mesh;
  readonly reservoir: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
  private readonly mirrorCam = new THREE.PerspectiveCamera();
  private readonly texMatrix = new THREE.Matrix4();
  reflections = false;
  private frame = 0;

  constructor(scene: THREE.Scene) {
    const nm = waterNormals();
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        normalMap: { value: nm },
        reflectionMap: { value: this.rt.texture },
        useReflection: { value: 0 },
        textureMatrix: { value: this.texMatrix },
        time: { value: 0 },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color(1, 1, 1) },
        waterColor: { value: new THREE.Color(0x0b2c38) },
        skyColor: { value: new THREE.Color(0x6aa0d8) },
        horizonColor: { value: new THREE.Color(0xbfd0e0) },
        fogColor: { value: new THREE.Color() },
        fogDensity: { value: 0 },
        rain: { value: 0 },
      },
    });
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000).rotateX(-Math.PI / 2), this.material);
    this.sea.position.y = SEA_LEVEL;
    this.sea.frustumCulled = false;
    this.reservoir = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2).scale(RESERVOIR.rx + 40, 1, RESERVOIR.rz + 40),
      this.material,
    );
    this.reservoir.position.set(RESERVOIR.x, RESERVOIR_LEVEL, RESERVOIR.z);
    scene.add(this.sea, this.reservoir);
    this.mirrorCam.layers.set(REFLECT_LAYER);
  }

  private readonly _tmp = new THREE.Vector3();
  private readonly _target = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();

  update(
    dt: number,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    sunDir: THREE.Vector3,
    sunColor: THREE.Color,
    fog: THREE.FogExp2,
    night: number,
    rain: number,
  ): void {
    const u = this.material.uniforms;
    u.time.value += dt;
    (u.sunDir.value as THREE.Vector3).copy(sunDir);
    (u.sunColor.value as THREE.Color).copy(sunColor).multiplyScalar(sunDir.y > 0 ? 1 : 0.15);
    (u.fogColor.value as THREE.Color).copy(fog.color);
    u.fogDensity.value = fog.density;
    (u.horizonColor.value as THREE.Color).copy(fog.color);
    (u.skyColor.value as THREE.Color).setRGB(
      0.36 * (1 - night) + 0.02,
      0.55 * (1 - night) + 0.03,
      0.85 * (1 - night) + 0.06,
    );
    (u.waterColor.value as THREE.Color).setRGB(
      0.03 * (1 - night) + 0.005,
      0.15 * (1 - night) + 0.01,
      0.2 * (1 - night) + 0.02,
    );
    u.rain.value = rain;
    u.useReflection.value = this.reflections ? 1 : 0;
    if (!this.reflections) return;
    this.frame++;
    if (this.frame % 2 === 1) return;
    // Mirror the camera across the sea plane (y = SEA_LEVEL).
    const h = SEA_LEVEL;
    const mc = this.mirrorCam;
    mc.position.copy(camera.position);
    mc.position.y = 2 * h - camera.position.y;
    camera.getWorldDirection(this._dir);
    this._target.copy(camera.position).add(this._dir);
    this._target.y = 2 * h - this._target.y;
    mc.up.set(0, -1, 0);
    this._tmp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    mc.up.set(this._tmp.x, -this._tmp.y, this._tmp.z);
    mc.lookAt(this._target);
    mc.near = camera.near;
    mc.far = camera.far;
    mc.projectionMatrix.copy(camera.projectionMatrix);
    mc.updateMatrixWorld();
    this.texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.texMatrix.multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);
    const prevRT = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    const prevFog = scene.fog;
    renderer.shadowMap.autoUpdate = false;
    this.sea.visible = false;
    this.reservoir.visible = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, mc);
    renderer.setRenderTarget(prevRT);
    this.sea.visible = true;
    this.reservoir.visible = true;
    scene.fog = prevFog;
    renderer.shadowMap.autoUpdate = prevShadow;
  }
}
