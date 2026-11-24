/**
 * Phases 1–4: streamed world, sky, on-foot character, cars, aircraft with a full flight model,
 * flight HUD, vehicle audio, and a debug free camera. Keyboard/mouse and gamepad interchangeable.
 */
import * as THREE from 'three';
import { audio } from './audio/audioEngine';
import { VehicleSound, type EngineVoice } from './audio/vehicleSound';
import { events } from './core/events';
import { GameLoop } from './core/loop';
import { Physics } from './core/physics';
import { saveSettings, settings, type QualityName } from './core/settings';
import { InputManager } from './input/InputManager';
import { FreeCam } from './player/freeCam';
import { PlayerController } from './player/playerController';
import { Materials } from './render/materials';
import { PRESETS, type QualityPreset } from './render/quality';
import { Renderer } from './render/renderer';
import { Atmosphere } from './render/sky';
import { FlightHud } from './ui/flightHud';
import { GamepadTest } from './ui/gamepadTest';
import { Hud } from './ui/hud';
import { PerfOverlay, Toasts } from './ui/overlays';
import { Aircraft } from './vehicles/aircraft';
import { Car } from './vehicles/car';
import { VehicleManager, defaultSpawns } from './vehicles/vehicleManager';
import { ChunkManager } from './world/chunks';
import { createStaticColliders } from './world/colliders';
import { DISTRICT_NAMES, districtAt } from './world/layout';
import { RUNWAYS } from './world/structures';
import { Turbines } from './world/turbines';
import { Water } from './world/water';
import { generateWorld } from './world/world';
import type { WorldData } from './world/worldData';

type Progress = (p: number, text: string) => void;
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const QUALITIES: QualityName[] = ['low', 'medium', 'high', 'ultra'];

interface SoundParams {
  rpm: number;
  load: number;
  speed: number;
  horn: boolean;
  stall: boolean;
  rain: number;
  cityLevel: number;
  altitude: number;
}

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
  private vehicles!: VehicleManager;
  private player!: PlayerController;
  private readonly freeCam = new FreeCam();
  private freeCamOn = false;
  private perf!: PerfOverlay;
  private hud!: Hud;
  private flightHud!: FlightHud;
  private padTest!: GamepadTest;
  private sound!: VehicleSound;
  private q: QualityPreset = PRESETS[settings.quality];
  private statusTimer = 0;
  private status = '';
  private readonly waypoint = new THREE.Vector3();
  private waypointLabel = '';
  private readonly soundParams: SoundParams = {
    rpm: 0,
    load: 0,
    speed: 0,
    horn: false,
    stall: false,
    rain: 0,
    cityLevel: 1,
    altitude: 0,
  };

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
      progress(0.35 + p * 0.5, 'Streaming districts');
      await tick();
    }
    g.water = new Water(g.r.scene);
    g.turbines = new Turbines(g.world.turbines, g.mats);
    g.r.scene.add(g.turbines.group);
    progress(0.88, 'Parking vehicles');
    await tick();
    g.vehicles = new VehicleManager(g.physics, g.mats, g.world);
    for (const s of defaultSpawns(g.world)) g.vehicles.spawn(s);
    g.r.scene.add(g.vehicles.group);
    g.player = new PlayerController(g.physics, g.mats, g.r.camera, g.vehicles, g.world, g.r.scene);
    g.player.placeOnFoot(80, 78, 0);
    g.input = new InputManager(canvas);
    new Toasts(ui);
    g.hud = new Hud(ui);
    g.flightHud = new FlightHud(ui);
    g.perf = new PerfOverlay(ui);
    g.padTest = new GamepadTest(ui);
    g.sound = new VehicleSound(audio);
    if (settings.showFps) g.perf.toggle();
    g.applyQuality(settings.quality, false);
    const unlock = (): void => audio.unlock();
    canvas.addEventListener('click', () => {
      unlock();
      g.input.requestPointerLock();
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
      const v = g.player.vehicle;
      if (v) events.emit('toast', { text: v.name, ms: 1600 });
    });
    progress(0.95, 'Warming up');
    await tick();
    g.chunks.warm(g.player.pos.set(80, 2, 78), g.q);
    g.loop = new GameLoop({ fixed: (dt) => g.fixed(dt), frame: (dt, a) => g.frame(dt, a) });
    if (import.meta.env.DEV)
      (window as unknown as { __flux: unknown }).__flux = { game: g, player: g.player, vehicles: g.vehicles };
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

  private fixed(dt: number): void {
    const input = this.freeCamOn || this.padTest.visible ? null : this.input;
    this.player.fixed(dt, input);
    this.vehicles.fixed(dt, this.player.vehicle, input);
    this.physics.step();
  }

  private debugInput(dt: number): void {
    const input = this.input;
    if (input.pressed('padTest') || (this.player.mode !== 'air' && input.pressed('vision')))
      this.padTest.toggle();
    if (input.perfToggled) this.perf.toggle();
    if (input.pressed('debugQuality')) {
      const i = QUALITIES.indexOf(this.q.name);
      this.applyQuality(QUALITIES[(i + 1) % QUALITIES.length]);
    }
    const scrub = input.value('debugTimeFwd') - input.value('debugTimeBack');
    if (scrub !== 0) this.atmos.time = (this.atmos.time + scrub * dt * 3 + 24) % 24;
    if (this.player.mode === 'foot' && input.pressed('photo')) {
      this.freeCamOn = !this.freeCamOn;
      if (this.freeCamOn) this.freeCam.fromCamera(this.r.camera);
      events.emit('toast', {
        text: this.freeCamOn ? 'Free camera (P / R3 to return)' : 'Back to player',
        ms: 1400,
      });
    }
  }

  private frame(dt: number, alpha: number): void {
    const input = this.input;
    input.update(dt);
    if (input.padConnected && input.device !== 'keyboard') audio.unlock();
    this.debugInput(dt);
    this.padTest.update(input);
    const blocked = this.freeCamOn || this.padTest.visible;
    if (!blocked) {
      this.player.frameInput(input);
      if (this.player.mode === 'air' && input.pressed('vision')) {
        events.emit('toast', { text: `HUD: ${this.flightHud.cycle()}`, ms: 900 });
      }
    }
    this.vehicles.render(alpha, dt);
    if (this.freeCamOn) {
      this.freeCam.update(dt, input, this.r.camera, (x, z) => this.world.terrain.heightAt(x, z));
      this.player.character.render(alpha, dt);
    } else this.player.frame(dt, alpha, blocked ? this.idleInput() : input);

    const camPos = this.r.camera.position;
    const frozen = input.isDown('debugTimeFwd') || input.isDown('debugTimeBack');
    this.atmos.update(dt, settings.dayLengthMinutes, this.player.pos, frozen);
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
    this.updateAudio(dt);
    this.updateHud(dt);
    this.r.render(dt);
    this.perf.update(
      dt,
      this.loop.fps,
      this.loop.frameMs,
      this.r.renderer,
      `Chunks shown ${this.chunks.meshCount()} · built ${this.chunks.builtThisFrame}`,
    );
  }

  /** An input view that reads nothing (while overlays own the controls). */
  private idleInput(): InputManager {
    this.input.mouse.x = 0;
    this.input.mouse.y = 0;
    return this.input;
  }

  private updateAudio(dt: number): void {
    const v = this.player.vehicle;
    const p = this.soundParams;
    let voice: EngineVoice = 'none';
    p.horn = false;
    p.stall = false;
    if (v instanceof Car) {
      voice = v.def.engineVoice;
      const t = v.telemetry();
      p.rpm = t.rpm;
      p.load = t.throttle;
      p.horn = v.horn;
    } else if (v instanceof Aircraft) {
      voice = v.kind === 'jet' ? 'jet' : v.kind === 'vtol' ? 'rotor' : 'prop';
      p.load = v.data.throttle;
      p.stall = v.data.stall;
    }
    if (this.player.impact > 0) {
      audio.impact(this.player.impact);
      this.player.impact = 0;
    }
    this.sound.voice = voice;
    p.speed = this.player.speed();
    p.altitude = this.player.pos.y - this.world.terrain.heightAt(this.player.pos.x, this.player.pos.z);
    this.sound.update(dt, p);
  }

  private updateHud(dt: number): void {
    const v = this.player.vehicle;
    this.statusTimer -= dt;
    if (this.statusTimer <= 0) {
      this.statusTimer = 0.5;
      const h = Math.floor(this.atmos.time);
      const m = Math.floor((this.atmos.time - h) * 60);
      const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const pos = this.player.pos;
      this.status = `${DISTRICT_NAMES[districtAt(pos.x, pos.z)]} · ${clock} · ${this.q.label} · F1 pad test · F2 quality · [ ] time`;
    }
    this.hud.setVisible(!this.freeCamOn);
    this.hud.update(this.input, this.player.mode, this.player.candidate, v, this.status);
    if (v instanceof Aircraft && !this.freeCamOn) {
      this.pickWaypoint(v);
      this.flightHud.draw(dt, v.data, this.r.camera, this.waypoint, this.waypointLabel, v.kind);
    } else this.flightHud.hide();
  }

  /** VTOL: nearest vertiport. Fixed-wing: nearest runway threshold. */
  private pickWaypoint(v: Aircraft): void {
    const p = this.player.pos;
    let best = Infinity;
    if (v.kind === 'vtol') {
      for (const vp of this.world.vertiports) {
        const d = Math.hypot(vp.x - p.x, vp.z - p.z);
        if (d < best && d > 40) {
          best = d;
          this.waypoint.set(vp.x, vp.y, vp.z);
          this.waypointLabel = vp.name;
        }
      }
      return;
    }
    for (const r of RUNWAYS) {
      for (const [z, name] of [
        [r.z1, r.name.split(' / ')[0]],
        [r.z0, r.name.split(' / ')[1]],
      ] as const) {
        const d = Math.hypot(r.x - p.x, z - p.z);
        if (d < best && d > 300) {
          best = d;
          this.waypoint.set(r.x, 2, z);
          this.waypointLabel = `RWY ${name}`;
        }
      }
    }
  }

  start(): void {
    this.loop.start();
  }
}
