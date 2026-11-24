/** Mission progress and codex discoveries, persisted to localStorage. */

export interface MissionRecord {
  completed: boolean;
  stars: number;
  bestTime: number | null;
}

export interface SaveData {
  missions: Record<string, MissionRecord>;
  codex: string[];
  photos: number;
}

const KEY = 'fluxcity.save.v1';

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SaveData>;
      return { missions: p.missions ?? {}, codex: p.codex ?? [], photos: p.photos ?? 0 };
    }
  } catch {
    /* corrupted or unavailable storage: start fresh */
  }
  return { missions: {}, codex: [], photos: 0 };
}

export const save: SaveData = load();

export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* ignore */
  }
}

export function missionRecord(id: string): MissionRecord {
  return save.missions[id] ?? { completed: false, stars: 0, bestTime: null };
}

export function recordMission(id: string, stars: number, time: number): void {
  const prev = missionRecord(id);
  save.missions[id] = {
    completed: true,
    stars: Math.max(prev.stars, stars),
    bestTime: prev.bestTime === null ? time : Math.min(prev.bestTime, time),
  };
  persist();
}

export function discover(id: string): boolean {
  if (save.codex.includes(id)) return false;
  save.codex.push(id);
  persist();
  return true;
}

export function resetProgress(): void {
  save.missions = {};
  save.codex = [];
  save.photos = 0;
  persist();
}
