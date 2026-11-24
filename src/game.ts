/**
 * Phase 2 build: streamed world, day/night sky, quality presets and a debug fly camera
 * driven by keyboard/mouse or gamepad interchangeably.
 */
import { events } from './core/events';
import { GameLoop } from './core/loop';
import { Physics } from './core/physics';
import { saveSettings, settings, type QualityName } from './core/settings';
import { InputManager } from './input/InputManager';
import { FreeCam } from './player/freeCam';
import { Materials } from './render/materials';
import { PRESETS, type QualityPreset } from './render/quality';
import { Renderer } from './render/renderer';
import { Atmosphere } from './render/sky';
import { GamepadTest } from './ui/gamepadTest';
import { ControlsHint, PerfOverlay, Toasts } from './ui/overlays';
import { ChunkManager } from './world/chunks';
import { createStaticColliders } from './world/colliders';
import { DISTRICT_NAMES, districtAt } from './world/layout';
import { Turbines } from './world/turbines';
import { Water } from './world/water';
import { generateWorld } from './world/world';
import type { WorldData } from './world/worldData';

type Progress = (p: number, text: string) => void;
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const QUALITIES: QualityName[] = ['low', 'medium', 'high', 'ultra'];

export class Game {
  private loop!: GameLoop;
  private r!: Renderer;
  private atmos!: Atmosphere;
  private mats!: Materials;
  private world!: WorldData;
  private chunks!: ChunkManager;
  private water!: Water;
  private turbines!: Turbines;
  private physics!: Physics;
  private input!: InputManager;
  private readonly cam = new FreeCam();
  private perf!: PerfOverlay;
  private hint!: ControlsHint;
  private padTest!: GamepadTest;
  private q: QualityPreset = PRESETS[settings.quality];
  private statusTimer = 0;
  private status = '';

  private constructor() {}

  static async create(canvas: HTMLCanvasElement, ui: HTMLElement, progress: Progress): Promise<Game> {
    const g = new Game();
    progress(0.02, 'Starting physics');
    g.physics = await Physics.create();
    g.r = new Renderer(canvas);
    g.atmos = new Atmosphere(g.r.renderer, g.r.scene);
    g.r.setSunMesh(g.atmos.sunMesh);
    progress(0.06, 'Generating terrain, roads and city plan');
    await tick();
    g.world = generateWorld();
    progress(0.3, 'Building colliders');
    await tick();
    createStaticColliders(g.physics, g.world);
    g.mats = new Materials();
    g.chunks = new ChunkManager(g.world, g.mats);
    g.r.scene.add(g.chunks.root);
    for (const p of g.chunks.prebuild()) {
      progress(0.35 + p * 0.55, 'Streaming districts');
      await tick();
    }
    g.water = new Water(g.r.scene);
    g.turbines = new Turbines(g.world.turbines, g.mats);
    g.r.scene.add(g.turbines.group);
    g.input = new InputManager(canvas);
    new Toasts(ui);
    g.perf = new PerfOverlay(ui);
    g.hint = new ControlsHint(ui);
    g.padTest = new GamepadTest(ui);
    if (settings.showFps) g.perf.toggle();
    g.applyQuality(settings.quality, false);
    canvas.addEventListener('click', () => g.input.requestPointerLock());
    g.cam.pos.set(60, 70, 420);
    g.cam.yaw = 0.15;
    g.cam.pitch = 0.05;
    progress(0.95, 'Warming up');
    await tick();
    g.chunks.warm(g.cam.pos, g.q);
    g.loop = new GameLoop({ fixed: () => g.physics.step(), frame: (dt) => g.frame(dt) });
    (window as unknown as { __flux: unknown }).__flux = { cam: g.cam, r: g.r, atmos: g.atmos, game: g };
    return g;
  }

  private applyQuality(name: QualityName, announce = true): void {
    settings.quality = name;
    saveSettings();
    this.q = PRESETS[name];
    this.r.applyQuality(this.q);
    this.atmos.configureShadows(this.q.shadows, this.q.shadowMapSize, this.q.shadowRange);
    this.water.reflections = this.q.waterReflections;
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
    if (!this.padTest.visible) {
      this.cam.update(dt, input, this.r.camera, (x, z) => this.world.terrain.heightAt(x, z));
    }
    const camPos = this.r.camera.position;
    this.atmos.update(dt, settings.dayLengthMinutes, camPos, scrub !== 0);
    this.mats.setNight(this.atmos.night);
    this.chunks.update(camPos, this.q, 5);
    this.turbines.update(dt, 6);
    this.water.update(
      dt,
      this.r.renderer,
      this.r.scene,
      this.r.camera,
      this.atmos.sunDir,
      this.atmos.sun.color,
      this.atmos.fog,
      this.atmos.night,
      0,
    );
    this.r.render(dt);
    this.statusTimer -= dt;
    if (this.statusTimer <= 0) {
      this.statusTimer = 0.5;
      const h = Math.floor(this.atmos.time);
      const m = Math.floor((this.atmos.time - h) * 60);
      const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const pad = input.padConnected ? 'controller ✓' : 'no controller';
      this.status = `${DISTRICT_NAMES[districtAt(camPos.x, camPos.z)]} · ${clock} · ${this.q.label} · ${pad}`;
    }
    this.hint.update(input, this.status);
    const extra = `Chunks visible ${this.chunks.meshCount()} · built ${this.chunks.builtThisFrame}`;
    this.perf.update(dt, this.loop.fps, this.loop.frameMs, this.r.renderer, extra);
  }

  start(): void {
    this.loop.start();
  }
}
