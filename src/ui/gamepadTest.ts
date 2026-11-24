/** Gamepad test screen: live buttons, sticks (raw and after deadzone/curve), triggers and rumble. */
import type { InputManager } from '../input/InputManager';
import { padLabel } from '../input/glyphs';
import { rumble } from '../input/rumble';

export class GamepadTest {
  readonly root: HTMLDivElement;
  visible = false;
  private readonly info: HTMLDivElement;
  private readonly buttons: HTMLDivElement[] = [];
  private readonly sticks: CanvasRenderingContext2D;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'padtest hidden';
    this.root.innerHTML =
      '<h2>Controller test</h2><div class="info"></div><div class="btns"></div><canvas width="420" height="180"></canvas><p class="note">Press X / □ (or E) to test rumble · View / Share (or C) to close</p>';
    parent.appendChild(this.root);
    this.info = this.root.querySelector('.info') as HTMLDivElement;
    const grid = this.root.querySelector('.btns') as HTMLDivElement;
    for (let i = 0; i < 17; i++) {
      const b = document.createElement('div');
      b.className = 'pbtn';
      grid.appendChild(b);
      this.buttons.push(b);
    }
    const ctx = (this.root.querySelector('canvas') as HTMLCanvasElement).getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.sticks = ctx;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle('hidden', !this.visible);
  }

  update(input: InputManager): void {
    if (!this.visible) return;
    if (input.pressed('interact') || input.pressed('hover')) rumble(0.8, 0.6, 400);
    const pad = input.rawPad();
    const fam = input.device === 'playstation' ? 'playstation' : 'xbox';
    this.info.textContent = pad
      ? `${pad.id}  ·  mapping: ${pad.mapping || 'non-standard'}  ·  prompts: ${fam === 'playstation' ? 'PlayStation' : 'Xbox'}  ·  rumble: ${'vibrationActuator' in pad && pad.vibrationActuator ? 'yes' : 'no'}`
      : 'No controller detected — press any button on a connected controller.';
    for (let i = 0; i < 17; i++) {
      const v = pad?.buttons[i]?.value ?? 0;
      const pressed = pad?.buttons[i]?.pressed ?? false;
      const b = this.buttons[i];
      b.textContent = padLabel(i, fam);
      b.style.setProperty('--v', String(v));
      b.classList.toggle('on', pressed);
    }
    const c = this.sticks;
    c.clearRect(0, 0, 420, 180);
    const draw = (cx: number, rx: number, ry: number, px: number, py: number, label: string): void => {
      c.strokeStyle = '#3a4a5c';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, 90, 70, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#5c6f84';
      c.beginPath();
      c.arc(cx + rx * 70, 90 + ry * 70, 5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#31e8ff';
      c.beginPath();
      c.arc(cx + px * 70, 90 + py * 70, 8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#9fb3c8';
      c.font = '12px system-ui';
      c.fillText(label, cx - 40, 176);
    };
    const ax = pad?.axes ?? [0, 0, 0, 0];
    draw(90, ax[0] ?? 0, ax[1] ?? 0, input.move.x, -input.move.y, 'Left (raw · processed)');
    draw(330, ax[2] ?? 0, ax[3] ?? 0, input.look.x, input.look.y, 'Right (raw · processed)');
    c.fillStyle = '#31e8ff';
    c.fillRect(180, 170 - input.value('throttleDown') * 150, 20, input.value('throttleDown') * 150);
    c.fillRect(220, 170 - input.value('throttleUp') * 150, 20, input.value('throttleUp') * 150);
    c.fillStyle = '#9fb3c8';
    c.fillText('LT  RT', 182, 14);
  }
}
