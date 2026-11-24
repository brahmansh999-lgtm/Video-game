/** Screen stack (main menu, pause, missions, settings, results) and mission lifecycle. */
import type { QualityName } from './core/settings';
import type { InputManager } from './input/InputManager';
import { MISSIONS } from './missions/index';
import type { MissionResult, MissionRunner } from './missions/runner';
import type { MissionDef } from './missions/types';
import type { Screen } from './ui/menu';
import { Briefing, MainMenu, MissionSelect, PauseMenu, Results } from './ui/menus';
import { RemapMenu, SettingsMenu } from './ui/settingsMenu';

export interface FlowHost {
  ui: HTMLElement;
  input: InputManager;
  runner: MissionRunner;
  /** Free roam from the plaza (fresh) or continue where the player is. */
  freeRoam: (fresh: boolean) => void;
  resume: () => void;
  openMap: (codex: boolean) => void;
  togglePadTest: () => void;
  applyQuality: (q: QualityName) => void;
  /** Called when a screen opens over gameplay (release pointer lock etc.). */
  onMenuOpen: () => void;
}

export class GameFlow {
  private readonly stack: Screen[] = [];
  private readonly main: MainMenu;
  private readonly pause: PauseMenu;
  private readonly select: MissionSelect;
  private readonly briefing: Briefing;
  private readonly results: Results;
  private readonly settingsMenu: SettingsMenu;
  private readonly remap: RemapMenu;
  /** True when the main menu is the base of the stack (attract mode). */
  inMainMenu = true;

  constructor(private readonly h: FlowHost) {
    this.main = new MainMenu({
      freeRoam: () => {
        this.clear();
        this.inMainMenu = false;
        h.freeRoam(true);
      },
      missions: () => this.push(this.select),
      codex: () => {
        this.clear();
        this.inMainMenu = false;
        h.freeRoam(true);
        h.openMap(true);
      },
      settings: () => this.push(this.settingsMenu),
      padTest: () => h.togglePadTest(),
    });
    this.pause = new PauseMenu(() => ({
      resume: () => this.closeAll(),
      map: () => {
        this.clear();
        h.openMap(false);
      },
      settings: () => this.push(this.settingsMenu),
      restart: h.runner.active && h.runner.def ? () => this.startMission(h.runner.def as MissionDef) : null,
      quit: () => {
        if (h.runner.active) {
          h.runner.abandon();
          this.closeAll();
        } else this.openMain();
      },
    }));
    this.select = new MissionSelect(MISSIONS, (m) => {
      this.briefing.mission = m;
      this.push(this.briefing);
    });
    this.briefing = new Briefing((m) => this.startMission(m));
    this.results = new Results();
    this.settingsMenu = new SettingsMenu(
      (q) => h.applyQuality(q),
      () => this.push(this.remap),
    );
    this.remap = new RemapMenu(h.input);
    for (const s of [this.select, this.briefing, this.settingsMenu, this.remap]) s.onBack = () => this.pop();
    h.runner.onEnd = (r) => this.showResults(r);
  }

  get open(): boolean {
    return this.stack.length > 0;
  }

  private push(s: Screen): void {
    this.stack[this.stack.length - 1]?.hide();
    this.stack.push(s);
    s.show(this.h.ui);
    this.h.onMenuOpen();
  }

  private pop(): void {
    const s = this.stack.pop();
    s?.hide();
    const top = this.stack[this.stack.length - 1];
    if (top) top.show(this.h.ui);
    else this.h.resume();
  }

  private clear(): void {
    while (this.stack.length) this.stack.pop()?.hide();
  }

  closeAll(): void {
    this.clear();
    this.h.resume();
  }

  openMain(): void {
    this.h.runner.abandon();
    this.clear();
    this.inMainMenu = true;
    this.push(this.main);
  }

  openPause(): void {
    if (this.open) return;
    this.push(this.pause);
  }

  openMissions(): void {
    this.push(this.select);
  }

  private startMission(m: MissionDef): void {
    this.clear();
    this.inMainMenu = false;
    this.h.freeRoam(false);
    this.h.runner.start(m);
  }

  private showResults(r: MissionResult): void {
    const i = MISSIONS.indexOf(r.def);
    const next = MISSIONS[i + 1];
    this.results.result = r;
    this.results.actions = {
      retry: () => this.startMission(r.def),
      next: next
        ? () => {
            this.clear();
            this.briefing.mission = next;
            this.push(this.briefing);
          }
        : null,
      missions: () => {
        this.h.runner.abandon();
        this.clear();
        this.push(this.select);
      },
      freeRoam: () => {
        this.h.runner.abandon();
        this.closeAll();
      },
    };
    this.clear();
    this.push(this.results);
  }

  update(input: InputManager): void {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    top.update(input);
    if (top === this.pause && input.pressed('pause') && this.stack[this.stack.length - 1] === this.pause)
      this.closeAll();
  }
}
