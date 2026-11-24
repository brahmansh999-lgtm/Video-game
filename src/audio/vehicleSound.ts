/** Continuous synthesized sounds: engines, wind, rain, city ambience, horn and stall warning. */
import type { AudioEngine } from './audioEngine';

export type EngineVoice = 'none' | 'electric' | 'v6' | 'diesel' | 'prop' | 'jet' | 'rotor';

export class VehicleSound {
  private ready = false;
  private oscA!: OscillatorNode;
  private oscB!: OscillatorNode;
  private engFilter!: BiquadFilterNode;
  private engGain!: GainNode;
  private whine!: OscillatorNode;
  private whineGain!: GainNode;
  private jet!: { gain: GainNode; filter: BiquadFilterNode };
  private wind!: { gain: GainNode; filter: BiquadFilterNode };
  private rain!: { gain: GainNode; filter: BiquadFilterNode };
  private city!: { gain: GainNode; filter: BiquadFilterNode };
  private hornA!: OscillatorNode;
  private hornGain!: GainNode;
  private stallOsc!: OscillatorNode;
  private stallGain!: GainNode;
  private stallPhase = 0;
  voice: EngineVoice = 'none';

  constructor(private readonly a: AudioEngine) {}

  private init(): void {
    const ctx = this.a.ctx as AudioContext;
    this.oscA = ctx.createOscillator();
    this.oscB = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB.type = 'square';
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.Q.value = 2;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.5;
    this.oscA.connect(this.engFilter);
    this.oscB.connect(bGain).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.a.sfx);
    this.whine = ctx.createOscillator();
    this.whine.type = 'sine';
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain).connect(this.a.sfx);
    this.jet = this.a.noiseLoop(this.a.sfx, 'bandpass', 800);
    this.wind = this.a.noiseLoop(this.a.ambience, 'bandpass', 500);
    this.rain = this.a.noiseLoop(this.a.ambience, 'highpass', 2500);
    this.city = this.a.noiseLoop(this.a.ambience, 'lowpass', 260, true);
    this.hornA = ctx.createOscillator();
    this.hornA.type = 'square';
    this.hornA.frequency.value = 415;
    const hornB = ctx.createOscillator();
    hornB.type = 'square';
    hornB.frequency.value = 523;
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 1800;
    this.hornA.connect(hf);
    hornB.connect(hf);
    hf.connect(this.hornGain).connect(this.a.sfx);
    this.stallOsc = ctx.createOscillator();
    this.stallOsc.type = 'square';
    this.stallOsc.frequency.value = 620;
    this.stallGain = ctx.createGain();
    this.stallGain.gain.value = 0;
    this.stallOsc.connect(this.stallGain).connect(this.a.sfx);
    for (const o of [this.oscA, this.oscB, this.whine, this.hornA, hornB, this.stallOsc]) o.start();
    this.ready = true;
  }

  /**
   * rpm: engine rpm (car) or 0..1 throttle-derived for aircraft; load 0..1; speed m/s.
   */
  update(
    dt: number,
    p: {
      rpm: number;
      load: number;
      speed: number;
      horn: boolean;
      stall: boolean;
      rain: number;
      cityLevel: number;
      altitude: number;
    },
  ): void {
    if (!this.a.ready) return;
    if (!this.ready) this.init();
    const t = (this.a.ctx as AudioContext).currentTime;
    const tc = 0.05;
    const v = this.voice;
    let engVol = 0;
    let whineVol = 0;
    let jetVol = 0;
    if (v === 'v6' || v === 'diesel') {
      const cyl = v === 'v6' ? 3 : 2;
      const f = Math.max(20, (p.rpm / 60) * cyl);
      this.oscA.frequency.setTargetAtTime(f, t, tc);
      this.oscB.frequency.setTargetAtTime(f * 0.5, t, tc);
      this.engFilter.frequency.setTargetAtTime(300 + p.load * 1400 + p.rpm * 0.15, t, tc);
      engVol = 0.08 + p.load * 0.12;
    } else if (v === 'electric') {
      this.whine.frequency.setTargetAtTime(180 + p.speed * 38, t, tc);
      whineVol = 0.015 + p.load * 0.045;
      this.oscA.frequency.setTargetAtTime(40 + p.speed * 3, t, tc);
      this.oscB.frequency.setTargetAtTime(20, t, tc);
      this.engFilter.frequency.setTargetAtTime(200, t, tc);
      engVol = 0.02 * p.load;
    } else if (v === 'prop' || v === 'rotor') {
      const f = v === 'prop' ? 28 + p.load * 70 : 18 + p.load * 26;
      this.oscA.frequency.setTargetAtTime(f, t, tc);
      this.oscB.frequency.setTargetAtTime(f * 2.01, t, tc);
      this.engFilter.frequency.setTargetAtTime(500 + p.load * 1500, t, tc);
      engVol = 0.06 + p.load * 0.12;
      jetVol = v === 'rotor' ? 0.04 + p.load * 0.08 : 0;
      this.jet.filter.frequency.setTargetAtTime(400, t, tc);
    } else if (v === 'jet') {
      this.whine.frequency.setTargetAtTime(900 + p.load * 1700, t, tc);
      whineVol = 0.02 + p.load * 0.03;
      this.jet.filter.frequency.setTargetAtTime(500 + p.load * 1500, t, tc);
      jetVol = 0.08 + p.load * 0.25;
    }
    this.engGain.gain.setTargetAtTime(engVol, t, 0.08);
    this.whineGain.gain.setTargetAtTime(whineVol, t, 0.08);
    this.jet.gain.gain.setTargetAtTime(jetVol, t, 0.1);
    const wind = Math.min(1, (p.speed * p.speed) / 6000);
    this.wind.gain.gain.setTargetAtTime(0.02 + wind * 0.35, t, 0.2);
    this.wind.filter.frequency.setTargetAtTime(300 + wind * 1200, t, 0.2);
    this.rain.gain.gain.setTargetAtTime(p.rain * 0.12, t, 0.5);
    this.city.gain.gain.setTargetAtTime(p.cityLevel * Math.max(0, 1 - p.altitude / 300) * 0.25, t, 0.5);
    this.hornGain.gain.setTargetAtTime(p.horn ? 0.1 : 0, t, 0.02);
    this.stallPhase += dt;
    const beep = p.stall && this.stallPhase % 0.4 < 0.22;
    this.stallGain.gain.setTargetAtTime(beep ? 0.07 : 0, t, 0.01);
  }
}
