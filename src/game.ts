/**
 * Phase 1 build: render loop, physically based sky with day/night, quality presets,
 * input manager (keyboard/mouse + gamepad) and the controller test screen.
 */
import * as THREE from 'three';
import { events } from './core/events';
import { GameLoop } from './core/loop';
import { saveSettings, settings, type QualityName } from './core/settings';
import { InputManager } from './input/InputManager';
import { FreeCam } from './player/freeCam';
import { PRESETS, type QualityPreset } from './render/quality';
import { Renderer } from './render/renderer';
import { Atmosphere } from './render/sky';
import { GamepadTest } from './ui/gamepadTest';
import { ControlsHint, PerfOverlay, Toasts } from './ui/overlays';

type Progress = (p: number, text: string) => void;
const QUALITIES: QualityName[] = ['low', 'medium', 'high', 'ultra'];

export class Game {
  private loop!: GameLoop;
  private r!: Renderer;
  private atmos!: Atmosphere;
  private input!: InputManager;
  private readonly cam = new FreeCam();
  private perf!: PerfOverlay;
  private hint!: ControlsHint;
  private padTest!: GamepadTest;
  private q: QualityPreset = PRESETS[settings.quality];

  private constructor() {}

  static async create(canvas: HTMLCanvasElement, ui: HTMLElement, progress: Progress): Promise<Game> {
    const g = new Game();
    progress(0.2, 'Creating renderer');
    g.r = new Renderer(canvas);
    g.atmos = new Atmosphere(g.r.renderer, g.r.scene);
    g.r.setSunMesh(g.atmos.sunMesh);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4096, 4096).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x5f6468, roughness: 0.9 }),
    );
    ground.receiveShadow = true;
    const grid = new THREE.GridHelper(4096, 64, 0x31e8ff, 0x2a3440);
    grid.position.y = 0.05;
    g.r.scene.add(ground, grid);
    for (let i = 0; i < 9; i++) {
      const h = 60 + i * 25;
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(14, 18, h, 24),
        new THREE.MeshStandardMaterial({ color: 0x7fa6c0, roughness: 0.2, metalness: 0.6 }),
      );
      m.position.set((i % 3) * 90 - 90, h / 2, Math.floor(i / 3) * 90 - 90);
      m.castShadow = true;
      g.r.scene.add(m);
    }
    g.input = new InputManager(canvas);
    new Toasts(ui);
    g.perf = new PerfOverlay(ui);
    g.hint = new ControlsHint(ui);
    g.padTest = new GamepadTest(ui);
    g.applyQuality(settings.quality, false);
    canvas.addEventListener('click', () => g.input.requestPointerLock());
    g.cam.pos.set(0, 40, 320);
    g.loop = new GameLoop({ fixed: () => undefined, frame: (dt) => g.frame(dt) });
    progress(1, 'Ready');
    return g;
  }

  private applyQuality(name: QualityName, announce = true): void {
    settings.quality = name;
    saveSettings();
    this.q = PRESETS[name];
    this.r.applyQuality(this.q);
    this.atmos.configureShadows(this.q.shadows, this.q.shadowMapSize, this.q.shadowRange);
    if (announce) events.emit('toast', { text: `Quality: ${this.q.label}` });
  }

  private frame(dt: number): void {
    const input = this.input;
    input.update(dt);
    if (input.perfToggled) this.perf.toggle();
    if (input.pressed('vision')) this.padTest.toggle();
    if (input.pressed('cameraMode')) {
      const i = QUALITIES.indexOf(this.q.name);
      this.applyQuality(QUALITIES[(i + 1) % QUALITIES.length]);
    }
    const scrub = input.value('yawRight') - input.value('yawLeft');
    if (scrub !== 0) this.atmos.time = (this.atmos.time + scrub * dt * 3 + 24) % 24;
    this.padTest.update(input);
    if (!this.padTest.visible) this.cam.update(dt, input, this.r.camera, () => 0);
    this.atmos.update(dt, settings.dayLengthMinutes, this.r.camera.position, scrub !== 0);
    this.r.render(dt);
    this.hint.update(input, `${this.q.label} · ${input.padConnected ? 'controller ✓' : 'no controller'}`);
    this.perf.update(dt, this.loop.fps, this.loop.frameMs, this.r.renderer, '');
  }

  start(): void {
    this.loop.start();
  }
}
