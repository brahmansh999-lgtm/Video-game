/**
 * Controller-first menu framework: every screen is a DOM panel whose focusable items are
 * navigated spatially with D-pad / left stick / arrows; A/Enter activates, B/Esc goes back,
 * left/right adjusts sliders, toggles and choice items. Mouse works too.
 */
import type { InputManager } from '../input/InputManager';
import { audio } from '../audio/audioEngine';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  html = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export interface Adjustable {
  /** -1 / +1 adjustments from left/right */
  adjust?: (dir: number) => void;
}

export type Focusable = HTMLElement & Adjustable;

export abstract class Screen {
  readonly root: HTMLDivElement;
  protected focusIndex = 0;
  onBack: (() => void) | null = null;
  /** Navigate with D-pad / arrows only (sticks and WASD stay free for the camera). */
  strictNav = false;

  constructor(cls: string) {
    this.root = el('div', `screen ${cls}`);
  }

  /** Rebuild DOM content. */
  abstract render(): void;

  items(): Focusable[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>('[data-focus]')).filter(
      (e) => e.offsetParent !== null && !e.hasAttribute('disabled'),
    ) as Focusable[];
  }

  focus(i: number): void {
    const items = this.items();
    if (!items.length) return;
    this.focusIndex = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((e, k) => e.classList.toggle('focused', k === this.focusIndex));
    items[this.focusIndex].scrollIntoView({ block: 'nearest' });
  }

  show(parent: HTMLElement): void {
    this.render();
    parent.appendChild(this.root);
    this.root.addEventListener('mousemove', this.onMouse);
    this.focus(0);
  }

  hide(): void {
    this.root.removeEventListener('mousemove', this.onMouse);
    this.root.remove();
  }

  private onMouse = (e: MouseEvent): void => {
    const t = (e.target as HTMLElement).closest('[data-focus]');
    if (!t) return;
    const i = this.items().indexOf(t as Focusable);
    if (i >= 0 && i !== this.focusIndex) this.focus(i);
  };

  /** Spatial navigation: pick the nearest item in the pressed direction. */
  private move(dir: 0 | 1 | 2 | 3): void {
    const items = this.items();
    const cur = items[this.focusIndex];
    if (!cur) return this.focus(0);
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best = -1;
    let bestScore = Infinity;
    items.forEach((e, i) => {
      if (i === this.focusIndex) return;
      const b = e.getBoundingClientRect();
      const dx = b.left + b.width / 2 - ax;
      const dy = b.top + b.height / 2 - ay;
      const ok = dir === 0 ? dy < -4 : dir === 1 ? dy > 4 : dir === 2 ? dx < -4 : dx > 4;
      if (!ok) return;
      const main = dir < 2 ? Math.abs(dy) : Math.abs(dx);
      const cross = dir < 2 ? Math.abs(dx) : Math.abs(dy);
      const score = main + cross * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) {
      this.focus(best);
      audio.blip(700, 0.03, 0.06);
    } else if (dir < 2) {
      // wrap vertically
      this.focus(dir === 0 ? items.length - 1 : 0);
    }
  }

  /** Per-frame input. Returns true if the screen consumed input. */
  update(input: InputManager): void {
    const items = this.items();
    if (this.focusIndex >= items.length) this.focus(items.length - 1);
    const cur = items[this.focusIndex];
    for (const d of [0, 1, 2, 3] as const) {
      if (!input.nav(d, this.strictNav)) continue;
      if ((d === 2 || d === 3) && cur?.adjust) {
        cur.adjust(d === 2 ? -1 : 1);
        audio.blip(560, 0.03, 0.06);
      } else this.move(d);
    }
    if (input.pressed('uiConfirm') && cur) {
      audio.blip(990, 0.05, 0.08);
      cur.click();
    }
    if (input.pressed('uiBack') && this.onBack) {
      audio.blip(440, 0.05, 0.08);
      this.onBack();
    }
    this.extraInput(input);
  }

  protected extraInput(_input: InputManager): void {
    /* optional per-screen input */
  }
}

/** Helpers to build standard widgets. */
export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `btn ${cls}`, label);
  b.dataset.focus = '';
  b.onclick = onClick;
  return b;
}

export function slider(
  label: string,
  get: () => number,
  set: (v: number) => void,
  min: number,
  max: number,
  step: number,
  fmt: (v: number) => string = (v) => v.toFixed(2),
): HTMLDivElement {
  const row = el('div', 'row slider') as HTMLDivElement & Adjustable;
  row.dataset.focus = '';
  const val = el('span', 'val');
  const bar = el('div', 'bar');
  const fill = el('div', 'fill');
  bar.appendChild(fill);
  const refresh = (): void => {
    const v = get();
    val.textContent = fmt(v);
    fill.style.width = `${((v - min) / (max - min)) * 100}%`;
  };
  row.append(el('span', 'label', label), bar, val);
  row.adjust = (dir: number) => {
    set(Math.min(max, Math.max(min, Math.round((get() + dir * step) / step) * step)));
    refresh();
  };
  bar.onclick = (e: MouseEvent) => {
    const r = bar.getBoundingClientRect();
    const t = (e.clientX - r.left) / r.width;
    set(Math.round((min + t * (max - min)) / step) * step);
    refresh();
  };
  refresh();
  return row;
}

export function toggle(label: string, get: () => boolean, set: (v: boolean) => void): HTMLDivElement {
  const row = el('div', 'row toggle') as HTMLDivElement & Adjustable;
  row.dataset.focus = '';
  const val = el('span', 'val');
  const refresh = (): void => {
    val.textContent = get() ? 'ON' : 'OFF';
    row.classList.toggle('on', get());
  };
  row.append(el('span', 'label', label), val);
  row.onclick = () => {
    set(!get());
    refresh();
  };
  row.adjust = () => row.click();
  refresh();
  return row;
}

export function choice<T extends string>(
  label: string,
  options: T[],
  get: () => T,
  set: (v: T) => void,
  names?: Record<string, string>,
): HTMLDivElement {
  const row = el('div', 'row choice') as HTMLDivElement & Adjustable;
  row.dataset.focus = '';
  const val = el('span', 'val');
  const refresh = (): void => {
    val.textContent = `‹ ${names?.[get()] ?? get()} ›`;
  };
  row.append(el('span', 'label', label), val);
  row.adjust = (dir: number) => {
    const i = options.indexOf(get());
    set(options[(i + dir + options.length) % options.length]);
    refresh();
  };
  row.onclick = () => row.adjust?.(1);
  refresh();
  return row;
}
