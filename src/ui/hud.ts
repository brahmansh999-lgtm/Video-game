/** Ground HUD: interaction prompt, car speedometer and a context-sensitive controls hint. */
import type { Action } from '../input/actions';
import type { InputManager } from '../input/InputManager';
import type { PlayerMode } from '../player/playerController';
import { Car } from '../vehicles/car';
import type { Vehicle } from '../vehicles/vehicle';

function div(cls: string, parent: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  parent.appendChild(d);
  return d;
}

export class Hud {
  private readonly prompt: HTMLDivElement;
  private readonly speedo: HTMLDivElement;
  private readonly speedVal: HTMLDivElement;
  private readonly gearVal: HTMLDivElement;
  private readonly rpmFill: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private lastPrompt = '';
  private lastHint = '';
  private lastSpeed = -1;
  private lastGear = '';

  constructor(parent: HTMLElement) {
    this.prompt = div('prompt hidden', parent);
    this.speedo = div('speedo hidden', parent);
    this.speedVal = div('speed', this.speedo);
    div('unit', this.speedo).textContent = 'km/h';
    this.gearVal = div('gear', this.speedo);
    const bar = div('rpm', this.speedo);
    this.rpmFill = div('rpm-fill', bar);
    this.hint = div('hint', parent);
  }

  setVisible(on: boolean): void {
    for (const e of [this.prompt, this.speedo, this.hint]) e.style.visibility = on ? '' : 'hidden';
  }

  private setPrompt(html: string): void {
    if (html === this.lastPrompt) return;
    this.lastPrompt = html;
    this.prompt.innerHTML = html;
    this.prompt.classList.toggle('hidden', html === '');
  }

  update(
    input: InputManager,
    mode: PlayerMode,
    candidate: Vehicle | null,
    canSteal: boolean,
    vehicle: Vehicle | null,
    status: string,
  ): void {
    // prompt
    if (mode === 'foot' && candidate) this.setPrompt(`${input.glyph('enterExit')} Enter ${candidate.name}`);
    else if (mode === 'foot' && canSteal) this.setPrompt(`${input.glyph('enterExit')} Steal car`);
    else if (vehicle && mode === 'air' && vehicle.canExit())
      this.setPrompt(`${input.glyph('enterExit')} Exit aircraft`);
    else this.setPrompt('');

    // speedometer
    const car = vehicle instanceof Car ? vehicle : null;
    this.speedo.classList.toggle('hidden', !car);
    if (car) {
      const t = car.telemetry();
      const kmh = Math.round(Math.abs(t.speed) * 3.6);
      if (kmh !== this.lastSpeed) {
        this.lastSpeed = kmh;
        this.speedVal.textContent = String(kmh);
      }
      const gear = t.speed < -0.5 ? 'R' : car.def.gears.length === 1 ? 'D' : String(t.gear);
      if (gear !== this.lastGear) {
        this.lastGear = gear;
        this.gearVal.textContent = gear;
      }
      const frac =
        car.def.engineVoice === 'electric' ? Math.abs(t.speed) / car.def.gears[0] : t.rpm / car.def.redline;
      this.rpmFill.style.transform = `scaleX(${Math.min(1, Math.max(0, frac)).toFixed(3)})`;
    }

    // controls hint
    const key = `${input.device}|${mode}|${vehicle?.kind ?? ''}|${status}`;
    if (key === this.lastHint) return;
    this.lastHint = key;
    const g = (a: Action): string => input.glyph(a);
    const pad = input.device !== 'keyboard';
    const stick = (s: 'L' | 'R', kb: string): string =>
      pad ? `<span class="glyph g-pad">${s}</span>` : `<span class="glyph g-key">${kb}</span>`;
    let lines: string[];
    if (mode === 'foot') {
      lines = [
        `${stick('L', 'WASD')} move &nbsp; ${stick('R', 'Mouse')} camera`,
        `${g('sprint')} sprint &nbsp; ${g('jump')} jump &nbsp; ${g('aim')} focus`,
        `${g('enterExit')} enter vehicle &nbsp; ${g('vision')} Architect Vision`,
        `${g('map')} map &amp; codex &nbsp; ${g('photo')} photo mode &nbsp; ${g('pause')} pause`,
      ];
    } else if (mode === 'car') {
      lines = [
        `${g('accelerate')} accelerate &nbsp; ${g('brake')} brake / reverse &nbsp; ${stick('L', 'A/D')} steer`,
        `${g('handbrake')} handbrake &nbsp; ${g('horn')} horn &nbsp; ${g('lookBack')} look back`,
        `${g('enterExit')} exit &nbsp; ${g('radio')} radio &nbsp; ${g('vision')} Architect Vision &nbsp; ${g('map')} map`,
      ];
    } else {
      lines = [
        `${stick('L', 'WASD')} pitch / roll &nbsp; ${g('yawLeft')}/${g('yawRight')} rudder`,
        `${g('throttleUp')}/${g('throttleDown')} throttle &nbsp; ${g('gear')} gear &nbsp; ${g('flaps')} flaps`,
        `${vehicle?.kind === 'vtol' ? `${g('hover')} hover / cruise &nbsp; ` : ''}${pad ? `${g('throttleDown')} at idle` : g('wheelBrake')} brakes &nbsp; ${g('cameraMode')} camera &nbsp; ${g('vision')} HUD`,
      ];
    }
    lines.push(`<span class="status">${status}</span>`);
    this.hint.innerHTML = lines.join('<br>');
  }
}
