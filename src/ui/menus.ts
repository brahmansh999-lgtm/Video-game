/** Main menu, pause menu, mission select, briefing card and results screen. */
import { missionRecord, save } from '../core/save';
import type { MissionResult } from '../missions/runner';
import type { MissionDef } from '../missions/types';
import { Screen, button, el } from './menu';

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(3 - n);

export interface MenuActions {
  freeRoam: () => void;
  missions: () => void;
  codex: () => void;
  settings: () => void;
  padTest: () => void;
}

export class MainMenu extends Screen {
  constructor(private readonly a: MenuActions) {
    super('menu main-menu');
  }

  render(): void {
    this.root.innerHTML = '';
    const panel = el('div', 'menu-panel');
    panel.appendChild(el('div', 'logo', 'FLUX<span>CITY</span>'));
    panel.appendChild(el('div', 'tagline', 'an architectural open world'));
    const total = Object.values(save.missions).reduce((n, m) => n + m.stars, 0);
    panel.append(
      button('Free Roam', this.a.freeRoam),
      button(`Missions <span class="dim">${total} / 24 ★</span>`, this.a.missions),
      button(`Landmark Codex <span class="dim">${save.codex.length} / 20</span>`, this.a.codex),
      button('Settings', this.a.settings),
      button('Controller test', this.a.padTest),
    );
    panel.appendChild(
      el('p', 'menu-foot', 'Keyboard + mouse or controller · A / Enter select · B / Esc back'),
    );
    this.root.appendChild(panel);
  }
}

export interface PauseActions {
  resume: () => void;
  map: () => void;
  settings: () => void;
  restart: (() => void) | null;
  quit: () => void;
}

export class PauseMenu extends Screen {
  constructor(private readonly getActions: () => PauseActions) {
    super('menu pause-menu');
  }

  render(): void {
    const a = this.getActions();
    this.onBack = a.resume;
    this.root.innerHTML = '';
    const panel = el('div', 'menu-panel');
    panel.appendChild(el('h2', '', 'Paused'));
    panel.append(
      button('Resume', a.resume),
      button('Map & Landmark Codex', a.map),
      button('Settings', a.settings),
    );
    if (a.restart) panel.appendChild(button('Restart mission', a.restart));
    panel.appendChild(button(a.restart ? 'Abandon mission' : 'Quit to main menu', a.quit));
    this.root.appendChild(panel);
  }
}

export class MissionSelect extends Screen {
  constructor(
    private readonly missions: MissionDef[],
    private readonly choose: (m: MissionDef) => void,
  ) {
    super('menu mission-select');
  }

  private unlocked(m: MissionDef): boolean {
    return !m.unlockAfter || missionRecord(m.unlockAfter).completed;
  }

  render(): void {
    this.root.innerHTML = '';
    const panel = el('div', 'menu-panel wide');
    panel.appendChild(el('h2', '', 'Missions'));
    const list = el('div', 'mission-list');
    for (const m of this.missions) {
      const rec = missionRecord(m.id);
      const open = this.unlocked(m);
      const b = button(
        `<span class="mt">${m.title}</span><span class="md">${open ? m.summary : 'Locked — complete the previous mission'}</span>` +
          `<span class="ms">${rec.completed ? `${stars(rec.stars)} · best ${fmt(rec.bestTime ?? 0)}` : open ? 'New' : '🔒'}</span>`,
        () => {
          if (open) this.choose(m);
        },
        `mission${open ? '' : ' locked'}`,
      );
      list.appendChild(b);
    }
    panel.appendChild(list);
    this.root.appendChild(panel);
  }
}

export class Briefing extends Screen {
  mission: MissionDef | null = null;

  constructor(private readonly start: (m: MissionDef) => void) {
    super('menu briefing');
  }

  render(): void {
    this.root.innerHTML = '';
    const m = this.mission;
    if (!m) return;
    const rec = missionRecord(m.id);
    const panel = el('div', 'menu-panel wide');
    panel.append(el('div', 'kicker', m.district), el('h2', '', m.title));
    const ul = el('div', 'brief-lines');
    for (const line of m.briefing) ul.appendChild(el('p', '', line));
    panel.appendChild(ul);
    const meta: string[] = [];
    if (m.timeLimit) meta.push(`Time limit ${fmt(m.timeLimit)}`);
    if (m.starTimes) meta.push(`★★★ under ${fmt(m.starTimes[0])} · ★★ under ${fmt(m.starTimes[1])}`);
    if (m.failOnCrash) meta.push('A crash fails the mission');
    if (rec.completed) meta.push(`Best ${stars(rec.stars)} · ${fmt(rec.bestTime ?? 0)}`);
    panel.appendChild(el('p', 'dim', meta.join(' · ')));
    panel.append(
      button('Start mission', () => this.start(m), 'primary'),
      button('Back', () => this.onBack?.()),
    );
    this.root.appendChild(panel);
  }
}

export interface ResultActions {
  retry: () => void;
  next: (() => void) | null;
  missions: () => void;
  freeRoam: () => void;
}

export class Results extends Screen {
  result: MissionResult | null = null;
  actions: ResultActions | null = null;

  constructor() {
    super('menu results');
  }

  render(): void {
    this.root.innerHTML = '';
    const r = this.result;
    const a = this.actions;
    if (!r || !a) return;
    const rec = missionRecord(r.def.id);
    const panel = el('div', 'menu-panel');
    panel.append(
      el('div', 'kicker', r.def.title),
      el('h2', r.success ? 'ok' : 'bad', r.success ? 'Mission complete' : 'Mission failed'),
    );
    if (r.success) {
      panel.append(
        el('div', 'big-stars', stars(r.stars)),
        el(
          'p',
          '',
          `Time ${fmt(r.time)} · Best ${fmt(rec.bestTime ?? r.time)} · Best rating ${stars(rec.stars)}`,
        ),
      );
    } else panel.appendChild(el('p', '', r.reason));
    panel.appendChild(button('Retry', a.retry, 'primary'));
    if (a.next && r.success) panel.appendChild(button('Next mission', a.next));
    panel.append(button('Mission select', a.missions), button('Free roam', a.freeRoam));
    this.onBack = a.freeRoam;
    this.root.appendChild(panel);
  }
}
