/** Fixed-step simulation (60 Hz) with interpolated rendering. */

export const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;

export interface LoopCallbacks {
  /** Called at a fixed 60 Hz rate. */
  fixed: (dt: number) => void;
  /** Called once per animation frame; alpha = interpolation factor in [0,1). */
  frame: (dt: number, alpha: number) => void;
}

export class GameLoop {
  private acc = 0;
  private last = 0;
  private running = false;
  private rafId = 0;
  /** Smoothed frame time in ms for the perf overlay. */
  frameMs = 16.7;
  fps = 60;

  constructor(private readonly cb: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.25) dt = 0.25;
      this.frameMs += (dt * 1000 - this.frameMs) * 0.05;
      this.fps = 1000 / Math.max(1, this.frameMs);
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < MAX_STEPS) {
        this.cb.fixed(FIXED_DT);
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;
      this.cb.frame(dt, this.acc / FIXED_DT);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
}
