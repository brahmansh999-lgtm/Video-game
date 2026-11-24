/** Landmark Codex: 20 info cards, unlocked by photographing each landmark in range. */
import { save } from '../core/save';
import { DISTRICT_COLORS, DISTRICT_NAMES } from '../world/layout';
import type { Landmark } from '../world/landmarks';
import { Screen, el } from './menu';

export class CodexScreen extends Screen {
  private selected = 0;

  constructor(private readonly landmarks: Landmark[]) {
    super('codex');
  }

  render(): void {
    this.root.innerHTML = '';
    const found = this.landmarks.filter((l) => save.codex.includes(l.id)).length;
    this.root.appendChild(el('div', 'codex-count', `${found} / ${this.landmarks.length} discovered`));
    const wrap = el('div', 'codex-wrap');
    const grid = el('div', 'codex-grid');
    const detail = el('div', 'codex-detail');
    this.landmarks.forEach((l, i) => {
      const known = save.codex.includes(l.id);
      const card = el('button', `codex-card${known ? ' known' : ''}`);
      card.dataset.focus = '';
      card.style.setProperty('--c', DISTRICT_COLORS[l.district]);
      card.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${known ? l.name : '???'}</span><span class="d">${DISTRICT_NAMES[l.district]}</span>`;
      const showDetail = (): void => {
        this.selected = i;
        this.fill(detail, l, known);
      };
      card.addEventListener('focusin', showDetail);
      card.addEventListener('mouseenter', showDetail);
      card.onclick = showDetail;
      grid.appendChild(card);
    });
    wrap.append(grid, detail);
    this.root.appendChild(wrap);
    this.fill(detail, this.landmarks[this.selected], save.codex.includes(this.landmarks[this.selected].id));
  }

  override focus(i: number): void {
    super.focus(i);
    const l = this.landmarks[this.focusIndex];
    const detail = this.root.querySelector('.codex-detail') as HTMLDivElement | null;
    if (l && detail) this.fill(detail, l, save.codex.includes(l.id));
  }

  private fill(detail: HTMLDivElement, l: Landmark, known: boolean): void {
    if (!known) {
      detail.innerHTML = `<h3>Undiscovered</h3><p class="dim">${DISTRICT_NAMES[l.district]}</p><p>Get within ${Math.round(250 + l.radius * 1.5)} m of this landmark and photograph it in photo mode to unlock its card.</p>`;
      return;
    }
    detail.innerHTML = `<h3>${l.name}</h3><p class="dim">${DISTRICT_NAMES[l.district]} · ${Math.round(l.height)} m</p>
      <dl><dt>Typology</dt><dd>${l.typology}</dd><dt>Structure</dt><dd>${l.structure}</dd><dt>Concept</dt><dd>${l.concept}</dd></dl>`;
  }
}
