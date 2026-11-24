/** WebAudio context, mixer buses and synthesized one-shot sounds. */
import { settings } from '../core/settings';

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  ambience!: GainNode;
  noise!: AudioBuffer;
  brown!: AudioBuffer;
  private unlocked = false;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(this.master);
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.ambience = ctx.createGain();
    this.sfx.connect(comp);
    this.music.connect(comp);
    this.ambience.connect(comp);
    this.noise = this.makeNoise(false);
    this.brown = this.makeNoise(true);
    this.applyVolumes();
    this.unlocked = true;
    void ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = settings.masterVolume;
    this.music.gain.value = settings.musicVolume * 0.6;
  }

  private makeNoise(brown: boolean): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  /** Looping noise source routed through a filter into a gain; returns the gain and filter. */
  noiseLoop(
    bus: GainNode,
    type: BiquadFilterType,
    freq: number,
    brown = false,
  ): { gain: GainNode; filter: BiquadFilterNode } {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(bus);
    src.start();
    return { gain, filter };
  }

  blip(freq = 880, dur = 0.06, vol = 0.15, type: OscillatorType = 'sine'): void {
    if (!this.ready) return;
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  chime(): void {
    this.blip(660, 0.12, 0.12);
    setTimeout(() => this.blip(990, 0.2, 0.12), 90);
  }

  fail(): void {
    this.blip(220, 0.25, 0.15, 'triangle');
    setTimeout(() => this.blip(160, 0.35, 0.15, 'triangle'), 160);
  }

  burst(vol: number, dur: number, cutoff: number, bus?: GainNode): void {
    if (!this.ready) return;
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src
      .connect(f)
      .connect(g)
      .connect(bus ?? this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  impact(strength: number): void {
    this.burst(0.25 + strength * 0.6, 0.15 + strength * 0.35, 600 + strength * 1800);
  }

  thunder(distance: number): void {
    if (!this.ready) return;
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400 - distance * 250;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const v = 0.9 - distance * 0.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.08 + distance * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3 + distance * 2);
    src.connect(f).connect(g).connect(this.ambience);
    src.start(t, Math.random());
    src.stop(t + 6);
  }

  shutter(): void {
    this.burst(0.3, 0.05, 6000);
    setTimeout(() => this.burst(0.2, 0.04, 4000), 70);
  }
}

export const audio = new AudioEngine();
