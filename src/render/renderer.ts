/** WebGL renderer, camera and the post-processing chain. */
import * as THREE from 'three';
import {
  BloomEffect,
  BrightnessContrastEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  HueSaturationEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { QualityPreset } from './quality';

export type PhotoFilter = 'none' | 'mono' | 'warm' | 'cool' | 'vivid';

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private preset: QualityPreset | null = null;
  private readonly bloom: BloomEffect;
  private readonly tone: ToneMappingEffect;
  private readonly hue: HueSaturationEffect;
  private readonly bc: BrightnessContrastEffect;
  private readonly vignette: VignetteEffect;
  readonly dof: DepthOfFieldEffect;
  private godRays: GodRaysEffect | null = null;
  private dofEnabled = false;
  private sunMesh: THREE.Mesh | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.3, 9000);
    this.scene.add(this.camera);
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.bloom = new BloomEffect({
      intensity: 0.9,
      luminanceThreshold: 0.82,
      luminanceSmoothing: 0.25,
      mipmapBlur: true,
      radius: 0.7,
    });
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.hue = new HueSaturationEffect({ saturation: 0.08, hue: 0 });
    this.bc = new BrightnessContrastEffect({ brightness: 0, contrast: 0.06 });
    this.vignette = new VignetteEffect({ darkness: 0.35, offset: 0.3 });
    this.dof = new DepthOfFieldEffect(this.camera, { focusDistance: 40, focusRange: 20, bokehScale: 3 });
    window.addEventListener('resize', () => this.resize());
  }

  setSunMesh(mesh: THREE.Mesh): void {
    this.sunMesh = mesh;
  }

  applyQuality(p: QualityPreset): void {
    this.preset = p;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.maxPixelRatio));
    this.rebuild();
    this.resize();
  }

  setDof(on: boolean): void {
    if (this.dofEnabled === on) return;
    this.dofEnabled = on;
    this.rebuild();
  }

  setFilter(f: PhotoFilter): void {
    this.hue.saturation = f === 'mono' ? -1 : f === 'vivid' ? 0.45 : 0.08;
    this.hue.hue = f === 'warm' ? 0.06 : f === 'cool' ? -0.08 : 0;
    this.bc.contrast = f === 'vivid' ? 0.15 : f === 'mono' ? 0.12 : 0.06;
  }

  private rebuild(): void {
    const p = this.preset;
    if (!p) return;
    this.composer.removeAllPasses();
    this.renderer.toneMapping = p.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    if (!p.post && !this.dofEnabled) return;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (p.godRays && this.sunMesh) {
      if (!this.godRays) {
        this.godRays = new GodRaysEffect(this.camera, this.sunMesh, {
          density: 0.94,
          decay: 0.92,
          weight: 0.35,
          exposure: 0.5,
          samples: 48,
          clampMax: 1,
        });
      }
      this.composer.addPass(new EffectPass(this.camera, this.godRays));
    }
    if (p.bloom) this.composer.addPass(new EffectPass(this.camera, this.bloom));
    if (this.dofEnabled) this.composer.addPass(new EffectPass(this.camera, this.dof));
    this.composer.addPass(new EffectPass(this.camera, this.tone, this.hue, this.bc, this.vignette));
    if (p.smaa)
      this.composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
  }

  render(dt: number): void {
    this.renderer.info.reset();
    if (this.preset?.post || this.dofEnabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  /** Renders one frame and returns it as a PNG data URL. */
  capturePng(): string {
    this.render(0);
    return this.canvas.toDataURL('image/png');
  }
}
