/** Merges keyboard/mouse and the Gamepad API (standard mapping) into one action map. */
import { events } from '../core/events';
import { settings, saveSettings, type Bindings } from '../core/settings';
import { ACTIONS, PAD, defaultBindings, type Action } from './actions';
import { detectFamily, glyphHtml, type DeviceKind } from './glyphs';
import { setRumblePad } from './rumble';

const N = ACTIONS.length;
const INDEX = new Map<Action, number>(ACTIONS.map((a, i) => [a, i]));
const UI_DIRS: Action[] = ['uiUp', 'uiDown', 'uiLeft', 'uiRight'];

export interface Stick {
  x: number;
  y: number;
}

type CaptureFn = (kind: 'key' | 'pad', code: string | number) => void;

export class InputManager {
  readonly bindings: Bindings;
  device: DeviceKind = 'keyboard';
  padConnected = false;

  private keysDown = new Set<string>();
  private keysPressed = new Set<string>();
  private down = new Uint8Array(N);
  private prevDown = new Uint8Array(N);
  private val = new Float32Array(N);
  private padButtons = new Float32Array(17);
  private padPrev = new Float32Array(17);
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;
  private padIndex = -1;
  private capture: CaptureFn | null = null;
  private repeatTimer = new Float32Array(4);
  private navPulse = new Uint8Array(4);

  /** Left stick / WASD, y positive = forward/up. */
  readonly move: Stick = { x: 0, y: 0 };
  /** Right stick, radial deadzone applied, y positive = down (screen). */
  readonly look: Stick = { x: 0, y: 0 };
  /** Mouse delta this frame in pixels (pointer lock). */
  readonly mouse: Stick = { x: 0, y: 0 };
  wheelDelta = 0;
  pointerLocked = false;
  perfToggled = false;

  constructor(private readonly target: HTMLElement) {
    this.bindings = settings.bindings ?? defaultBindings();
    const defs = defaultBindings();
    for (const a of ACTIONS) {
      if (!this.bindings.keys[a]) this.bindings.keys[a] = defs.keys[a] ?? [];
      if (!this.bindings.pad[a]) this.bindings.pad[a] = defs.pad[a] ?? [];
    }
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keysDown.clear());
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.target;
    });
    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      this.padIndex = e.gamepad.index;
      this.padConnected = true;
      events.emit('toast', { text: 'Controller connected' });
      this.setDevice(detectFamily(e.gamepad.id));
    });
    window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
      if (e.gamepad.index === this.padIndex) {
        this.padIndex = -1;
        this.padConnected = false;
        setRumblePad(null);
        events.emit('toast', { text: 'Controller disconnected' });
        this.setDevice('keyboard');
      }
    });
  }

  requestPointerLock(): void {
    if (document.pointerLockElement === this.target) return;
    const req = this.target.requestPointerLock as (() => Promise<void> | void) | undefined;
    try {
      const r = req?.call(this.target);
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
    } catch {
      /* not allowed right now */
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  captureNext(fn: CaptureFn): void {
    this.capture = fn;
  }

  cancelCapture(): void {
    this.capture = null;
  }

  private setDevice(kind: DeviceKind): void {
    if (this.device === kind) return;
    this.device = kind;
    events.emit('deviceChanged', { kind });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.capture) {
      e.preventDefault();
      const fn = this.capture;
      this.capture = null;
      fn('key', e.code);
      return;
    }
    if (
      e.code === 'Tab' ||
      e.code === 'Space' ||
      e.code === 'F3' ||
      e.code === 'F1' ||
      e.code === 'F2' ||
      e.code.startsWith('Arrow')
    )
      e.preventDefault();
    if (!e.repeat) this.keysPressed.add(e.code);
    this.keysDown.add(e.code);
    this.setDevice('keyboard');
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    const code = `Mouse${e.button}`;
    if (this.capture && e.button !== 0) {
      const fn = this.capture;
      this.capture = null;
      fn('key', code);
      return;
    }
    this.keysPressed.add(code);
    this.keysDown.add(code);
    this.setDevice('keyboard');
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.keysDown.delete(`Mouse${e.button}`);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) this.setDevice('keyboard');
  };

  private pollPad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    if (this.padIndex >= 0) pad = pads[this.padIndex] ?? null;
    if (!pad) {
      for (const p of pads) {
        if (p && p.connected) {
          pad = p;
          this.padIndex = p.index;
          if (!this.padConnected) {
            this.padConnected = true;
            events.emit('toast', { text: 'Controller connected' });
          }
          break;
        }
      }
    }
    return pad;
  }

  private stick(x: number, y: number, out: Stick, curve: number): void {
    const dz = settings.deadzone;
    const mag = Math.hypot(x, y);
    if (mag < dz) {
      out.x = 0;
      out.y = 0;
      return;
    }
    const scaled = Math.pow(Math.min(1, (mag - dz) / (1 - dz)), curve);
    out.x = (x / mag) * scaled;
    out.y = (y / mag) * scaled;
  }

  /** Call once per frame before reading actions. */
  update(dt: number): void {
    this.prevDown.set(this.down);
    this.padPrev.set(this.padButtons);
    this.padButtons.fill(0);
    const pad = this.pollPad();
    setRumblePad(pad);
    let padActive = false;
    let lx = 0;
    let ly = 0;
    let rx = 0;
    let ry = 0;
    if (pad) {
      for (let i = 0; i < 17 && i < pad.buttons.length; i++) {
        const b = pad.buttons[i];
        this.padButtons[i] = b.value > 0 ? b.value : b.pressed ? 1 : 0;
        if (this.padButtons[i] > 0.5) padActive = true;
      }
      lx = pad.axes[0] ?? 0;
      ly = pad.axes[1] ?? 0;
      rx = pad.axes[2] ?? 0;
      ry = pad.axes[3] ?? 0;
      if (Math.hypot(lx, ly) > 0.5 || Math.hypot(rx, ry) > 0.5) padActive = true;
      if (padActive) this.setDevice(detectFamily(pad.id));
      if (this.capture) {
        for (let i = 0; i < 17; i++) {
          if (this.padButtons[i] > 0.5 && this.padPrev[i] <= 0.5) {
            const fn = this.capture;
            this.capture = null;
            fn('pad', i);
            break;
          }
        }
      }
    }

    for (let i = 0; i < N; i++) {
      const a = ACTIONS[i];
      let v = 0;
      for (const k of this.bindings.keys[a]) {
        if (this.keysDown.has(k) || this.keysPressed.has(k)) v = 1;
      }
      for (const b of this.bindings.pad[a]) v = Math.max(v, this.padButtons[b] ?? 0);
      this.val[i] = v;
      this.down[i] = v > 0.35 ? 1 : 0;
    }

    this.stick(lx, ly, this.move, 1);
    this.move.y = -this.move.y;
    this.stick(rx, ry, this.look, settings.responseCurve);
    const kx = this.value('moveRight') - this.value('moveLeft');
    const ky = this.value('moveForward') - this.value('moveBack');
    if (kx !== 0 || ky !== 0) {
      const m = Math.max(1, Math.hypot(kx, ky));
      this.move.x = kx / m;
      this.move.y = ky / m;
    }

    this.mouse.x = this.mouseDX;
    this.mouse.y = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = this.wheel;
    this.wheel = 0;

    this.perfToggled =
      this.pressed('perf') ||
      (this.padButtons[PAD.L3] > 0.5 &&
        this.padButtons[PAD.R3] > 0.5 &&
        (this.padPrev[PAD.L3] <= 0.5 || this.padPrev[PAD.R3] <= 0.5));

    // UI navigation with auto-repeat (D-pad, arrows or left stick).
    for (let d = 0; d < 4; d++) {
      let held = this.isDown(UI_DIRS[d]);
      if (!held && pad) {
        const sx = lx;
        const sy = ly;
        held = d === 0 ? sy < -0.6 : d === 1 ? sy > 0.6 : d === 2 ? sx < -0.6 : sx > 0.6;
      }
      this.navPulse[d] = 0;
      if (!held) {
        this.repeatTimer[d] = 0;
        continue;
      }
      if (this.repeatTimer[d] === 0) this.navPulse[d] = 1;
      this.repeatTimer[d] += dt;
      if (this.repeatTimer[d] > 0.42) {
        this.navPulse[d] = 1;
        this.repeatTimer[d] = 0.42 - 0.11;
      }
      if (this.repeatTimer[d] === 0) this.repeatTimer[d] = 0.0001;
    }
    this.keysPressed.clear();
  }

  isDown(a: Action): boolean {
    return this.down[INDEX.get(a) ?? 0] === 1;
  }

  pressed(a: Action): boolean {
    const i = INDEX.get(a) ?? 0;
    return this.down[i] === 1 && this.prevDown[i] === 0;
  }

  released(a: Action): boolean {
    const i = INDEX.get(a) ?? 0;
    return this.down[i] === 0 && this.prevDown[i] === 1;
  }

  /** Analog value 0..1 (triggers are analog, keys are 0/1). */
  value(a: Action): number {
    return this.val[INDEX.get(a) ?? 0];
  }

  /** UI navigation pulse: 0 up, 1 down, 2 left, 3 right. */
  nav(dir: 0 | 1 | 2 | 3): boolean {
    return this.navPulse[dir] === 1;
  }

  padButton(i: number): number {
    return this.padButtons[i];
  }

  /** Glyph HTML for an action using the last used device. */
  glyph(a: Action): string {
    return glyphHtml(this.device, this.bindings.keys[a]?.[0], this.bindings.pad[a]?.[0]);
  }

  setBinding(a: Action, kind: 'key' | 'pad', code: string | number): void {
    if (kind === 'key') this.bindings.keys[a] = [String(code)];
    else this.bindings.pad[a] = [Number(code)];
    settings.bindings = this.bindings;
    saveSettings();
  }

  resetBindings(): void {
    const d = defaultBindings();
    Object.assign(this.bindings.keys, d.keys);
    Object.assign(this.bindings.pad, d.pad);
    settings.bindings = null;
    saveSettings();
  }

  /** Snapshot of raw pad state for the gamepad test screen. */
  rawPad(): Gamepad | null {
    return this.pollPad();
  }
}
