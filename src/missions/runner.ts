/** Runs one mission: objectives in order, timer, fail states, star rating, saving and HUD tracker. */
import type * as THREE from 'three';
import { audio } from '../audio/audioEngine';
import { events } from '../core/events';
import { recordMission } from '../core/save';
import { settings } from '../core/settings';
import type { Vehicle } from '../vehicles/vehicle';
import { GateRenderer } from './gates';
import type { MissionCtx, MissionDef, Objective } from './types';

export interface MissionResult {
  def: MissionDef;
  success: boolean;
  reason: string;
  time: number;
  stars: number;
}

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class MissionRunner {
  def: MissionDef | null = null;
  private objectives: Objective[] = [];
  private index = 0;
  private readonly spawned: Vehicle[] = [];
  private readonly tracker: HTMLDivElement;
  private readonly subtitle: HTMLDivElement;
  private readonly gates: GateRenderer;
  private subtitleQueue: string[] = [];
  private subtitleTimer = 0;
  private lastTracker = '';
  private ended = false;
  onEnd: ((r: MissionResult) => void) | null = null;

  constructor(
    ui: HTMLElement,
    scene: THREE.Scene,
    private readonly ctx: MissionCtx,
  ) {
    this.tracker = document.createElement('div');
    this.tracker.className = 'tracker hidden';
    this.subtitle = document.createElement('div');
    this.subtitle.className = 'subtitle hidden';
    ui.append(this.tracker, this.subtitle);
    this.gates = new GateRenderer(scene);
    // vehicles spawned by a mission are tracked so they can be removed on teardown
    const spawn = ctx.spawn;
    ctx.spawn = (s) => {
      const v = spawn(s);
      this.spawned.push(v);
      return v;
    };
    events.on('crash', () => {
      if (!this.def) return;
      this.ctx.stats.crashes++;
      this.ctx.flags.crashed = true;
      if (this.def.failOnCrash) this.finish(false, 'Aircraft destroyed');
    });
    events.on('touchdown', ({ score, onRunway }) => {
      this.ctx.flags.lastTouchdown = { score, onRunway, time: this.ctx.elapsed };
    });
    events.on('photoTaken', ({ landmarkIds }) => {
      for (const id of landmarkIds) this.ctx.flags.photographed.add(id);
    });
    events.on('visionToggled', ({ on }) => {
      if (on) this.ctx.flags.visionUsed = true;
    });
  }

  get active(): boolean {
    return this.def !== null && !this.ended;
  }

  start(def: MissionDef): void {
    this.teardown();
    this.def = def;
    this.ended = false;
    const c = this.ctx;
    c.elapsed = 0;
    c.stats.time = 0;
    c.stats.touchdownScore = null;
    c.stats.photos = 0;
    c.stats.crashes = 0;
    c.stats.extra = 0;
    c.flags.visionUsed = false;
    c.flags.photographed.clear();
    c.flags.lastTouchdown = null;
    c.flags.crashed = false;
    this.objectives = def.setup(c);
    this.index = 0;
    this.objectives[0]?.start?.(c);
    this.subtitleQueue = settings.subtitles ? def.briefing.slice() : [];
    this.subtitleTimer = 0;
    this.tracker.classList.remove('hidden');
  }

  /** Remove mission vehicles and markers. */
  teardown(): void {
    if (this.def?.teardown) this.def.teardown(this.ctx);
    for (const v of this.spawned) {
      if (this.ctx.player.vehicle === v) this.ctx.player.exit();
      this.ctx.vehicles.remove(v);
    }
    this.spawned.length = 0;
    this.def = null;
    this.objectives = [];
    this.tracker.classList.add('hidden');
    this.subtitle.classList.add('hidden');
    this.subtitleQueue = [];
    this.lastTracker = '';
    this.gates.update(0, null);
  }

  abandon(): void {
    this.teardown();
  }

  currentMarker(): THREE.Vector3 | null {
    if (!this.active) return null;
    return this.objectives[this.index]?.marker?.() ?? null;
  }

  private finish(success: boolean, reason: string): void {
    if (this.ended || !this.def) return;
    this.ended = true;
    const def = this.def;
    const t = this.ctx.elapsed;
    let stars = 0;
    if (success) {
      if (def.rate) stars = def.rate(this.ctx);
      else if (def.starTimes) stars = t <= def.starTimes[0] ? 3 : t <= def.starTimes[1] ? 2 : 1;
      else stars = 3;
      recordMission(def.id, stars, t);
      audio.chime();
    } else audio.fail();
    this.gates.update(0, null);
    events.emit('missionEnded', { id: def.id, success });
    this.onEnd?.({ def, success, reason, time: t, stars });
  }

  /** Call every frame while playing (not while paused). */
  update(dt: number, gatesDt: number): void {
    this.updateSubtitles(dt);
    if (!this.active || !this.def) {
      this.gates.update(gatesDt, null);
      return;
    }
    const c = this.ctx;
    c.elapsed += dt;
    c.stats.time = c.elapsed;
    const lim = this.def.timeLimit;
    if (lim !== undefined && c.elapsed > lim) {
      this.finish(false, 'Out of time');
      return;
    }
    const obj = this.objectives[this.index];
    if (!obj) {
      this.finish(true, 'Complete');
      return;
    }
    const st = obj.update(c, dt);
    if (st === 'done') {
      this.index++;
      if (this.index >= this.objectives.length) {
        this.finish(true, 'Complete');
        return;
      }
      audio.blip(880, 0.12, 0.12);
      this.objectives[this.index].start?.(c);
    } else if (typeof st === 'object') {
      this.finish(false, st.fail);
      return;
    }
    const cur = this.objectives[this.index];
    this.gates.update(gatesDt, cur.gates ? cur.gates() : null);
    const prog = cur.progress ? cur.progress() : '';
    const time = lim !== undefined ? `${fmt(c.elapsed)} / ${fmt(lim)}` : fmt(c.elapsed);
    const html = `<div class="t">${this.def.title}</div><div class="o">${cur.label}${prog ? ` <b>${prog}</b>` : ''}</div><div class="c">${time} · ${this.index + 1}/${this.objectives.length}</div>`;
    if (html !== this.lastTracker) {
      this.lastTracker = html;
      this.tracker.innerHTML = html;
    }
  }

  private updateSubtitles(dt: number): void {
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) this.subtitle.classList.add('hidden');
      return;
    }
    const next = this.subtitleQueue.shift();
    if (!next) return;
    this.subtitle.textContent = next;
    this.subtitle.classList.remove('hidden');
    this.subtitleTimer = 2.2 + next.length * 0.045;
  }
}
