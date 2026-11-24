/** Physically based sky, sun/moon lighting, PMREM environment, stars, fog and day/night cycle. */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { clamp, lerp, mulberry32, smoothstep } from '../core/rng';

export const REFLECT_LAYER = 2;

export class Atmosphere {
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5b5243, 0.8);
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  readonly fog = new THREE.FogExp2(0xbfd0e0, 0.00022);
  /** Hours 0..24. */
  time = 13;
  /** 0 day .. 1 night. */
  night = 0;
  cloudiness = 0.15;
  fogBoost = 0;
  /** Extra hemisphere light for lightning flashes. */
  flash = 0;
  /** Sun mesh used as the god-ray light source. */
  readonly sunMesh: THREE.Mesh;

  private readonly stars: THREE.Points;
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly envScene = new THREE.Scene();
  private readonly envSky = new Sky();
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lastEnvElev = 999;
  private lastEnvCloud = -1;
  private envTimer = 0;
  private readonly shadowTarget = new THREE.Object3D();
  private readonly tmpColor = new THREE.Color();
  private skyTime = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
  ) {
    this.sky.scale.setScalar(9000);
    this.sky.layers.enable(REFLECT_LAYER);
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    const u = this.sky.material.uniforms;
    u.mieDirectionalG.value = 0.8;
    u.cloudScale.value = 0.00025;
    u.cloudSpeed.value = 0.00003;

    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.sun.target = this.shadowTarget;
    scene.add(this.sun, this.shadowTarget, this.hemi);
    scene.fog = this.fog;

    this.pmrem = new THREE.PMREMGenerator(renderer);

    const rnd = mulberry32(42);
    const n = 2500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rnd() * Math.PI * 2;
      const y = rnd() * 0.95 + 0.05;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * r * 7000, y * 7000, Math.sin(th) * r * 7000], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2.2,
        sizeAttenuation: false,
        transparent: true,
        fog: false,
      }),
    );
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(140, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: false }),
    );
    this.sunMesh.frustumCulled = false;
  }

  configureShadows(enabled: boolean, mapSize: number, range: number): void {
    this.renderer.shadowMap.enabled = enabled;
    this.sun.castShadow = enabled;
    const cam = this.sun.shadow.camera;
    cam.left = -range;
    cam.right = range;
    cam.top = range;
    cam.bottom = -range;
    cam.near = 1;
    cam.far = 1600;
    cam.updateProjectionMatrix();
    if (this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** Advance time and update lighting. focus = position the shadow frustum follows. */
  update(dt: number, dayLengthMinutes: number, focus: THREE.Vector3, timeFrozen: boolean): void {
    if (!timeFrozen && dayLengthMinutes > 0) {
      this.time = (this.time + (dt * 24) / (dayLengthMinutes * 60)) % 24;
    }
    this.skyTime += dt;
    // Sun path: rises in the east (+x), sets in the west, tilted towards the south (+z).
    const h = ((this.time - 6) / 12) * Math.PI;
    const elev = Math.sin(h) * 1.15;
    const az = h;
    this.sunDir.set(Math.cos(az), elev, 0.45).normalize();
    const elevDeg = THREE.MathUtils.radToDeg(Math.asin(this.sunDir.y));
    this.night = 1 - smoothstep(-7, 4, elevDeg);
    const day = 1 - this.night;
    const cloud = this.cloudiness;

    const u = this.sky.material.uniforms;
    (u.sunPosition.value as THREE.Vector3).copy(this.sunDir);
    u.turbidity.value = lerp(2.5, 12, cloud);
    u.rayleigh.value = lerp(1.2, 0.6, cloud) * (1 - this.night * 0.6) + 0.15;
    u.mieCoefficient.value = lerp(0.004, 0.02, cloud);
    u.cloudCoverage.value = lerp(0.25, 0.92, cloud);
    u.cloudDensity.value = lerp(0.35, 0.95, cloud);
    u.time.value = this.skyTime;
    u.showSunDisc.value = cloud > 0.75 ? 0 : 1;

    // Sun / moon light
    const moon = this.night > 0.5;
    const lightDir = this.tmpVec.copy(this.sunDir);
    if (moon) lightDir.set(-this.sunDir.x, Math.max(0.35, -this.sunDir.y), -0.3).normalize();
    const warm = smoothstep(2, 25, elevDeg);
    if (moon) this.sun.color.setRGB(0.55, 0.65, 1);
    else this.sun.color.setRGB(1, lerp(0.62, 0.97, warm), lerp(0.38, 0.92, warm));
    this.sun.intensity = moon ? 0.3 * (1 - cloud * 0.7) : day * lerp(0.5, 2.6, warm) * (1 - cloud * 0.75);
    this.hemi.intensity = lerp(0.1, 0.5, day) * (1 - cloud * 0.25) + cloud * 0.3 * day + this.flash * 3;
    this.hemi.color.setRGB(lerp(0.25, 0.75, day), lerp(0.3, 0.85, day), lerp(0.5, 1, day));
    this.hemi.groundColor.setRGB(0.3 * day + 0.05, 0.27 * day + 0.05, 0.22 * day + 0.07);

    this.shadowTarget.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(lightDir, 800);
    this.shadowTarget.updateMatrixWorld();

    // Fog colour approximates the horizon colour.
    const fogDay = this.tmpColor.setRGB(
      lerp(0.62, 0.7, cloud),
      lerp(0.72, 0.72, cloud),
      lerp(0.84, 0.74, cloud),
    );
    const sunset = smoothstep(18, 2, elevDeg) * day;
    fogDay.r += sunset * 0.25;
    fogDay.g += sunset * 0.05;
    fogDay.b -= sunset * 0.15;
    this.fog.color.setRGB(
      lerp(fogDay.r, 0.035, this.night),
      lerp(fogDay.g, 0.045, this.night),
      lerp(fogDay.b, 0.075, this.night),
    );
    this.fog.density = 0.00016 + cloud * 0.00045 + this.fogBoost;

    const sm = this.stars.material as THREE.PointsMaterial;
    sm.opacity = clamp(this.night * (1 - cloud * 1.1), 0, 1);
    this.stars.visible = sm.opacity > 0.01;
    this.stars.position.copy(focus);

    this.sunMesh.position.copy(focus).addScaledVector(this.sunDir, 5000);
    this.sunMesh.visible = !moon;
    this.renderer.toneMappingExposure = lerp(0.55, 0.5, this.night);

    // Re-render the environment map when lighting changed noticeably.
    this.envTimer -= dt;
    if (
      this.envTimer <= 0 &&
      (Math.abs(elevDeg - this.lastEnvElev) > 1.5 || Math.abs(cloud - this.lastEnvCloud) > 0.05)
    ) {
      this.refreshEnv(elevDeg);
      this.envTimer = 0.5;
    }
  }

  private readonly tmpVec = new THREE.Vector3();

  private refreshEnv(elevDeg: number): void {
    this.lastEnvElev = elevDeg;
    this.lastEnvCloud = this.cloudiness;
    const src = this.sky.material.uniforms;
    const dst = this.envSky.material.uniforms;
    for (const k of [
      'turbidity',
      'rayleigh',
      'mieCoefficient',
      'mieDirectionalG',
      'cloudCoverage',
      'cloudDensity',
    ]) {
      dst[k].value = src[k].value;
    }
    (dst.sunPosition.value as THREE.Vector3).copy(this.sunDir);
    dst.showSunDisc.value = 0;
    const rt = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
    this.envRT?.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = lerp(0.13, 0.03, this.night);
  }
}
