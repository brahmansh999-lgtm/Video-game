/**
 * Phases 1–6: streamed world, sky and weather, city life, on-foot character, cars, aircraft,
 * HUDs, audio, Architect Vision, Landmark Codex, map and photo mode.
 * Keyboard/mouse and gamepad work interchangeably.
 */
import * as THREE from 'three';
import { audio } from './audio/audioEngine';
import { events } from './core/events';
import { GameLoop } from './core/loop';
import { Physics } from './core/physics';
import { saveSettings, settings, type QualityName } from './core/settings';
import { GameAudio } from './gameAudio';
import { GameFlow } from './gameFlow';
import { MissionRunner } from './missions/runner';
import type { MissionCtx } from './missions/types';
import { GameHud } from './gameHud';
import { InputManager } from './input/InputManager';
import { PlayerController } from './player/playerController';
import { Materials } from './render/materials';
import { PRESETS, type QualityPreset } from './render/quality';
import { Renderer } from './render/renderer';
import { Atmosphere } from './render/sky';
import { ArchitectVision } from './render/vision';
import { WEATHER_TYPES, Weather } from './render/weather';
import { GamepadTest } from './ui/gamepadTest';
import { renderWorldMap } from './ui/mapRender';
import { MapScreen } from './ui/mapScreen';
import { PerfOverlay, Toasts } from './ui/overlays';
import { PhotoMode } from './ui/photoMode';
import { VehicleManager, defaultSpawns } from './vehicles/vehicleManager';
import { ChunkManager } from './world/chunks';
import { createStaticColliders } from './world/colliders';
import { resolveLandmarks, type Landmark } from './world/landmarks';
import { DISTRICT_NAMES, districtAt } from './world/layout';
import { Life } from './world/life/life';
import { Turbines } from './world/turbines';
import { Water } from './world/water';
import { generateWorld } from './world/world';
import type { WorldData } from './world/worldData';

type Progress = (p: number, text: string) => void;
type Mode = 'menu' | 'play' | 'map' | 'photo';
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const QUALITIES: QualityName[] = ['low', 'medium', 'high', 'ultra'];

export class Game {
  private loop!: GameLoop;
  private r!: Renderer;
  private atmos!: Atmosphere;
  private weather!: Weather;
  private mats!: Materials;
  private world!: WorldData;
  private chunks!: ChunkManager;
  private water!: Water;
  private turbines!: Turbines;
  private life!: Life;
  private physics!: Physics;
  private input!: InputManager;
  private vehicles!: VehicleManager;
  private player!: PlayerController;
  private landmarks!: Landmark[];
  private vision!: ArchitectVision;
  private hud!: GameHud;
  private gameAudio!: GameAudio;
  private map!: MapScreen;
  private photo!: PhotoMode;
  private perf!: PerfOverlay;
  private padTest!: GamepadTest;
  private mode: Mode = 'menu';
  private runner!: MissionRunner;
  private flow!: GameFlow;
  private dayFrozen = false;
  private attract = 0;
  private q: QualityPreset = PRESETS[settings.quality];
  private statusTimer = 0;
  private status = '';
  private readonly vehiclePos = new THREE.Vector3();

  private constructor() {}

  static async create(canvas: HTMLCanvasElement, ui: HTMLElement, progress: Progress): Promise<Game> {
    const g = new Game();
    progress(0.02, 'Starting physics');
    g.physics = await Physics.create();
    g.r = new Renderer(canvas);
    g.atmos = new Atmosphere(g.r.renderer, g.r.scene);
    g.r.setSunMesh(g.atmos.sunMesh);
    g.weather = new Weather(g.r.scene);
    progress(0.06, 'Generating terrain, roads and city plan');
    await tick();
    g.world = generateWorld();
    progress(0.25, 'Building colliders');
    await tick();
    createStaticColliders(g.physics, g.world);
    g.mats = new Materials();
    g.chunks = new ChunkManager(g.world, g.mats);
    g.r.scene.add(g.chunks.root);
    for (const p of g.chunks.prebuild()) {
      progress(0.3 + p * 0.45, 'Streaming districts');
      await tick();
    }
    g.water = new Water(g.r.scene);
    g.turbines = new Turbines(g.world.turbines, g.mats);
    g.r.scene.add(g.turbines.group);
    g.landmarks = resolveLandmarks(g.world, g.turbines.centroid());
    progress(0.78, 'Bringing the city to life');
    await tick();
    g.life = new Life(g.world, g.physics, g.mats);
    g.r.scene.add(g.life.group);
    g.vehicles = new VehicleManager(g.physics, g.mats, g.world);
    for (const s of defaultSpawns(g.world)) g.vehicles.spawn(s);
    g.r.scene.add(g.vehicles.group);
    g.player = new PlayerController(g.physics, g.mats, g.r.camera, g.vehicles, g.world, g.r.scene);
    g.player.placeOnFoot(80, 78, 0);
    progress(0.86, 'Drawing the map');
    await tick();
    g.input = new InputManager(canvas);
    new Toasts(ui);
    const mapImage = renderWorldMap(g.world);
    g.hud = new GameHud(ui, mapImage, g.world, g.landmarks, g.mats, g.r.scene);
    g.map = new MapScreen(ui, mapImage, g.world, g.landmarks);
    g.map.onClose = () => {
      g.hud.setWaypoint(g.map.waypoint);
      g.mode = 'play';
      g.hud.setVisible(true);
    };
    g.photo = new PhotoMode(ui, g.r, g.atmos, g.landmarks, (x, z) => g.world.terrain.heightAt(x, z));
    g.photo.onExit = () => {
      g.mode = 'play';
      g.hud.setVisible(true);
    };
    g.vision = new ArchitectVision(g.world, g.chunks, g.r.scene, ui);
    g.gameAudio = new GameAudio(g.weather);
    g.perf = new PerfOverlay(ui);
    g.padTest = new GamepadTest(ui);
    if (settings.showFps) g.perf.toggle();
    g.applyQuality(settings.quality, false);
    g.hookEvents(canvas);
    g.setupMissions(ui);
    progress(0.95, 'Warming up');
    await tick();
    g.chunks.warm(g.player.pos.set(80, 2, 78), g.q);
    g.loop = new GameLoop({ fixed: (dt) => g.fixed(dt), frame: (dt, a) => g.frame(dt, a) });
    if (import.meta.env.DEV) {
      (window as unknown as { __flux: unknown }).__flux = { game: g, player: g.player, vehicles: g.vehicles };
    }
    g.flow.openMain();
    return g;
  }

  private setupMissions(ui: HTMLElement): void {
    const ctx: MissionCtx = {
      player: this.player,
      vehicles: this.vehicles,
      world: this.world,
      landmarks: this.landmarks,
      maglev: this.life.maglev,
      atmos: this.atmos,
      weather: this.weather,
      stats: { time: 0, touchdownScore: null, photos: 0, crashes: 0, extra: 0 },
      flags: { visionUsed: false, photographed: new Set(), lastTouchdown: null, crashed: false },
      elapsed: 0,
      spawn: (sp) => {
        const v = this.vehicles.spawn(sp);
        this.player.hookImpact(v);
        return v;
      },
      setTime: (h, frozen) => {
        this.atmos.time = h;
        this.dayFrozen = !!frozen;
      },
      setWeather: (w) => this.weather.set(w, true),
      toast: (t) => events.emit('toast', { text: t, ms: 1600 }),
    };
    this.runner = new MissionRunner(ui, this.r.scene, ctx);
    this.flow = new GameFlow({
      ui,
      input: this.input,
      runner: this.runner,
      freeRoam: (fresh) => this.startFreeRoam(fresh),
      resume: () => this.resume(),
      openMap: (codex) => this.openMap(codex),
      togglePadTest: () => this.padTest.toggle(),
      applyQuality: (q) => this.applyQuality(q),
      onMenuOpen: () => {
        this.mode = 'menu';
        this.input.exitPointerLock();
        this.hud.setVisible(false);
      },
    });
  }

  private startFreeRoam(fresh: boolean): void {
    this.mode = 'play';
    this.hud.setVisible(true);
    if (!fresh) return;
    this.player.placeOnFoot(80, 78, 0);
    this.weather.set('clear', true);
    this.atmos.time = 13;
    this.dayFrozen = false;
  }

  private resume(): void {
    if (this.runner.def && !this.runner.active) this.runner.abandon();
    this.mode = 'play';
    this.hud.setVisible(true);
  }

  private openMap(codex: boolean): void {
    const p = this.player;
    this.mode = 'map';
    this.input.exitPointerLock();
    this.hud.setVisible(false);
    this.map.waypoint = this.hud.waypoint;
    this.map.show(p.pos.x, p.pos.z, p.heading());
    if (codex) this.map.showCodex();
  }

  private hookEvents(canvas: HTMLCanvasElement): void {
    const unlock = (): void => audio.unlock();
    canvas.addEventListener('click', () => {
      unlock();
      if (this.mode === 'play') this.input.requestPointerLock();
    });
    window.addEventListener('keydown', unlock);
    events.on('touchdown', ({ verticalSpeed, centreline, score, onRunway }) => {
      const where = onRunway ? `centreline ${centreline.toFixed(1)} m` : 'off runway';
      events.emit('toast', {
        text: `Touchdown ${verticalSpeed.toFixed(1)} m/s · ${where} · score ${score}`,
        ms: 4000,
      });
    });
    events.on('vehicleEntered', () => {
      const v = this.player.vehicle;
      if (v) events.emit('toast', { text: v.name, ms: 1600 });
    });
    events.on('landmarkDiscovered', () => audio.chime());
  }

  private applyQuality(name: QualityName, announce = true): void {
    settings.quality = name;
    saveSettings();
    this.q = PRESETS[name];
    this.r.applyQuality(this.q);
    this.atmos.configureShadows(this.q.shadows, this.q.shadowMapSize, this.q.shadowRange);
    this.water.reflections = this.q.waterReflections;
    this.life.setDensity(this.q.density);
    if (announce) events.emit('toast', { text: `Quality: ${this.q.label}` });
  }

  private fixed(dt: number): void {
    if (this.mode !== 'play') return; // map and photo mode pause the simulation
    const input = this.padTest.visible ? null : this.input;
    this.player.fixed(dt, input);
    this.vehicles.fixed(dt, this.player.vehicle, input);
    const v = this.player.vehicle;
    if (v) {
      const t = v.body.translation();
      this.vehiclePos.set(t.x, t.y, t.z);
    }
    this.life.fixed(dt, this.player.pos, v ? this.vehiclePos : null, this.atmos.night);
    this.physics.step();
  }

  private debugInput(dt: number): void {
    const input = this.input;
    if (input.pressed('padTest')) this.padTest.toggle();
    if (input.perfToggled) this.perf.toggle();
    if (input.pressed('debugQuality')) {
      const i = QUALITIES.indexOf(this.q.name);
      this.applyQuality(QUALITIES[(i + 1) % QUALITIES.length]);
    }
    if (input.pressed('debugWeather')) {
      const next = WEATHER_TYPES[(WEATHER_TYPES.indexOf(this.weather.type) + 1) % WEATHER_TYPES.length];
      this.weather.set(next);
      events.emit('toast', { text: `Weather: ${next}` });
    }
    const scrub = input.value('debugTimeFwd') - input.value('debugTimeBack');
    if (scrub !== 0) this.atmos.time = (this.atmos.time + scrub * dt * 3 + 24) % 24;
  }

  /** Gameplay input that opens screens or toggles overlays. */
  private playInput(): void {
    const input = this.input;
    const p = this.player;
    if (input.pressed('pause')) {
      this.flow.openPause();
      return;
    }
    if (input.pressed('map')) {
      this.openMap(false);
      return;
    }
    // R3 is photo mode on foot and look-back in vehicles; P always opens photo mode.
    if (input.pressed('photo') && (p.mode === 'foot' || input.device === 'keyboard')) {
      this.mode = 'photo';
      this.hud.setVisible(false);
      this.photo.enter();
      return;
    }
    if (input.pressed('vision')) {
      if (p.mode === 'air') events.emit('toast', { text: `HUD: ${this.hud.flight.cycle()}`, ms: 900 });
      else {
        const on = this.vision.toggle();
        events.emit('visionToggled', { on });
        events.emit('toast', { text: on ? 'Architect Vision on' : 'Architect Vision off', ms: 1200 });
      }
    }
    if (input.pressed('radio') && p.mode !== 'foot') this.gameAudio.cycleRadio();
    if (p.mode !== 'air') {
      if (input.pressed('mapZoomIn')) this.hud.minimap.zoom(1);
      if (input.pressed('mapZoomOut')) this.hud.minimap.zoom(-1);
    }
    p.frameInput(input);
  }

  private frame(dt: number, alpha: number): void {
    const input = this.input;
    input.update(dt);
    if (input.padConnected && input.device !== 'keyboard') audio.unlock();
    this.debugInput(dt);
    this.padTest.update(input);
    const blocked = this.padTest.visible;
    if (this.mode === 'menu') this.flow.update(input);
    else if (this.mode === 'play' && !blocked) this.playInput();
    else if (this.mode === 'map') this.map.update(dt, input);
    else if (this.mode === 'photo') this.photo.update(input);

    if (this.mode === 'play') {
      this.vehicles.render(alpha, dt);
      this.player.frame(dt, alpha, input);
      this.life.frame(dt, this.player.pos);
      this.runner.update(dt, dt);
      this.hud.missionTarget = this.runner.currentMarker();
    } else if (this.mode === 'photo') this.photo.frame(dt, input);
    else if (this.mode === 'menu' && this.flow.inMainMenu) this.attractCamera(dt);

    const camPos = this.r.camera.position;
    const frozen =
      this.mode !== 'play' || this.dayFrozen || input.isDown('debugTimeFwd') || input.isDown('debugTimeBack');
    this.atmos.update(this.mode === 'map' ? 0 : dt, settings.dayLengthMinutes, this.player.pos, frozen);
    this.weather.update(dt, camPos, this.atmos, this.mats);
    this.vehicles.wind.copy(this.weather.wind);
    this.mats.setNight(this.atmos.night);
    this.vision.update(this.r.camera, this.player.pos, this.atmos.time);
    this.chunks.update(camPos, this.q, 5);
    this.turbines.update(dt, this.weather.windSpeed);
    this.water.update(
      dt,
      this.r.renderer,
      this.r.scene,
      this.r.camera,
      this.atmos.sunDir,
      this.atmos.sun.color,
      this.atmos.fog,
      this.atmos.night,
      this.weather.rain,
    );
    this.gameAudio.update(dt, this.player, this.weather, this.world, this.mode !== 'play');
    this.updateStatus(dt);
    if (this.mode === 'play') this.hud.update(dt, input, this.player, this.r.camera, this.status);
    this.r.render(dt);
    const extra = `Chunks shown ${this.chunks.meshCount()} · built ${this.chunks.builtThisFrame}\nTraffic ${this.life.traffic.activeCount}`;
    this.perf.update(dt, this.loop.fps, this.loop.frameMs, this.r.renderer, extra);
  }

  /** Slow orbit around the Flux Core behind the main menu. */
  private attractCamera(dt: number): void {
    this.attract += dt * 0.04;
    const cam = this.r.camera;
    cam.position.set(Math.sin(this.attract) * 820, 260, Math.cos(this.attract) * 820);
    cam.lookAt(0, 160, 0);
    cam.fov = 55;
    cam.updateProjectionMatrix();
  }

  private updateStatus(dt: number): void {
    this.statusTimer -= dt;
    if (this.statusTimer > 0) return;
    this.statusTimer = 0.5;
    const h = Math.floor(this.atmos.time);
    const m = Math.floor((this.atmos.time - h) * 60);
    const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const pos = this.player.pos;
    this.status = `${DISTRICT_NAMES[districtAt(pos.x, pos.z)]} · ${clock} · ${this.weather.type} · ${this.q.label}`;
  }

  start(): void {
    this.loop.start();
  }
}
