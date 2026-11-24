/** Mission data model. Each mission = config + a small script returning objectives. */
import type * as THREE from 'three';
import type { PlayerController } from '../player/playerController';
import type { Atmosphere } from '../render/sky';
import type { Weather, WeatherType } from '../render/weather';
import type { Vehicle } from '../vehicles/vehicle';
import type { SpawnSpec, VehicleManager } from '../vehicles/vehicleManager';
import type { Landmark } from '../world/landmarks';
import type { Maglev } from '../world/life/maglev';
import type { WorldData } from '../world/worldData';

export type ObjStatus = 'active' | 'done' | { fail: string };

export interface Gate {
  pos: THREE.Vector3;
  radius: number;
  /** yaw of the ring plane normal; undefined = cylinder beacon */
  yaw?: number;
  ring: boolean;
}

export interface Objective {
  label: string;
  /** Where to go (minimap, flight HUD waypoint, 3D beacon). */
  marker?: () => THREE.Vector3 | null;
  gates?: () => Gate[];
  progress?: () => string;
  start?: (ctx: MissionCtx) => void;
  update: (ctx: MissionCtx, dt: number) => ObjStatus;
}

export interface MissionStats {
  time: number;
  touchdownScore: number | null;
  photos: number;
  crashes: number;
  extra: number;
}

export interface MissionCtx {
  player: PlayerController;
  vehicles: VehicleManager;
  world: WorldData;
  landmarks: Landmark[];
  maglev: Maglev;
  atmos: Atmosphere;
  weather: Weather;
  stats: MissionStats;
  /** counters updated by game events */
  flags: {
    visionUsed: boolean;
    photographed: Set<string>;
    lastTouchdown: { score: number; onRunway: boolean; time: number } | null;
    crashed: boolean;
  };
  elapsed: number;
  spawn: (s: SpawnSpec) => Vehicle;
  setTime: (hours: number, frozen?: boolean) => void;
  setWeather: (w: WeatherType) => void;
  toast: (t: string) => void;
}

export interface MissionDef {
  id: string;
  title: string;
  district: string;
  summary: string;
  /** Briefing lines (shown as subtitles and on the briefing card). */
  briefing: string[];
  /** Seconds; undefined = no limit. */
  timeLimit?: number;
  /** Lower times are better; [3-star, 2-star] thresholds in seconds. */
  starTimes?: [number, number];
  unlockAfter?: string;
  /** If true, a crash fails the mission instead of respawning. */
  failOnCrash?: boolean;
  setup: (ctx: MissionCtx) => Objective[];
  /** Optional custom star rating (1..3). */
  rate?: (ctx: MissionCtx) => number;
  teardown?: (ctx: MissionCtx) => void;
}
