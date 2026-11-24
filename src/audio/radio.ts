/** Generative in-car radio: three original synthesized stations scheduled with WebAudio. */
import type { AudioEngine } from './audioEngine';

interface Station {
  name: string;
  bpm: number;
  /** semitone offsets of the chord progression roots (from A2) */
  roots: number[];
  pattern: (step: number, root: number, play: Voice) => void;
}

type Voice = (
  semi: number,
  start: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  cutoff?: number,
) => void;

const MINOR = [0, 3, 7, 10];
const MAJOR = [0, 4, 7, 11];

const STATIONS: Station[] = [
  {
    name: 'Ambient Grid FM',
    bpm: 72,
    roots: [0, -4, 3, -2],
    pattern: (step, root, play) => {
      if (step % 16 === 0) for (const n of MINOR) play(root + n + 12, 0, 4.2, 'sine', 0.05, 900);
      if (step % 4 === 2) play(root + MINOR[((step / 4) % 4) | 0] + 36, 0, 0.6, 'triangle', 0.03, 3000);
    },
  },
  {
    name: 'Neon Pulse 101',
    bpm: 118,
    roots: [0, 5, 3, 7],
    pattern: (step, root, play) => {
      if (step % 4 === 0) play(-24, 0, 0.18, 'sine', 0.35, 200);
      if (step % 2 === 0) play(root - 12, 0, 0.2, 'sawtooth', 0.06, 700);
      play(root + MINOR[step % 4] + 24, 0, 0.12, 'square', 0.025, 2200);
    },
  },
  {
    name: 'Concrete Lo-Fi',
    bpm: 84,
    roots: [0, -3, 2, -5],
    pattern: (step, root, play) => {
      if (step % 8 === 0 || step % 8 === 5) play(-26, 0, 0.25, 'sine', 0.3, 160);
      if (step % 8 === 4) play(40, 0, 0.05, 'square', 0.02, 6000);
      if (step % 16 === 0) for (const n of MAJOR) play(root + n + 12, 0, 2.6, 'triangle', 0.035, 1200);
    },
  },
];

export class Radio {
  station = -1;
  private timer = 0;
  private nextTime = 0;
  private step = 0;

  constructor(private readonly a: AudioEngine) {}

  get name(): string {
    return this.station < 0 ? 'Radio off' : STATIONS[this.station].name;
  }

  cycle(): string {
    this.station = this.station + 1 >= STATIONS.length ? -1 : this.station + 1;
    this.step = 0;
    if (this.a.ctx) this.nextTime = this.a.ctx.currentTime + 0.1;
    if (this.station >= 0 && !this.timer) this.timer = window.setInterval(() => this.schedule(), 80);
    if (this.station < 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
    return this.name;
  }

  private schedule(): void {
    const ctx = this.a.ctx;
    if (!ctx || this.station < 0) return;
    const st = STATIONS[this.station];
    const stepDur = 60 / st.bpm / 4;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.25) {
      const root = st.roots[Math.floor(this.step / 16) % st.roots.length];
      const at = this.nextTime;
      st.pattern(this.step, root, (semi, start, dur, type, vol, cutoff) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = cutoff ?? 2000;
        o.type = type;
        o.frequency.value = 110 * Math.pow(2, semi / 12);
        const t0 = at + start;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02 + dur * 0.1, 0.4));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(f).connect(g).connect(this.a.music);
        o.start(t0);
        o.stop(t0 + dur + 0.05);
      });
      this.step++;
      this.nextTime += stepDur;
    }
  }
}
