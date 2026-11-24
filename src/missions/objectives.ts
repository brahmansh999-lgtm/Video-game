/** Reusable objective builders used by the mission scripts. */
import * as THREE from 'three';
import { Aircraft } from '../vehicles/aircraft';
import type { VehicleKind } from '../vehicles/vehicle';
import type { Gate, MissionCtx, Objective, ObjStatus } from './types';

const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

export function reach(
  label: string,
  pos: THREE.Vector3,
  radius: number,
  opts: { mode?: 'foot' | 'car' | 'air' | 'any'; maxSpeed?: number; beacon?: boolean } = {},
): Objective {
  const g: Gate[] = opts.beacon === false ? [] : [{ pos, radius, ring: false }];
  return {
    label,
    marker: () => pos,
    gates: () => g,
    update: (ctx) => {
      const p = ctx.player.pos;
      const dh = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (dh > radius || Math.abs(p.y - pos.y) > Math.max(radius, 25)) return 'active';
      if (opts.mode && opts.mode !== 'any' && ctx.player.mode !== opts.mode) return 'active';
      if (opts.maxSpeed !== undefined && ctx.player.speed() > opts.maxSpeed) return 'active';
      return 'done';
    },
  };
}

export function walk(label: string, metres: number): Objective {
  const start = new THREE.Vector3();
  let frames = 0;
  return {
    label,
    start: () => {
      frames = 0;
    },
    update: (ctx) => {
      // sample the origin a few frames in, after the mission has placed the player
      if (frames < 3) {
        frames++;
        start.copy(ctx.player.pos);
        return 'active';
      }
      return ctx.player.pos.distanceTo(start) > metres ? 'done' : 'active';
    },
  };
}

export function lookAround(label: string): Objective {
  let acc = 0;
  let last = 0;
  let init = false;
  return {
    label,
    update: (ctx) => {
      const y = ctx.player.rig.yaw;
      if (!init) {
        last = y;
        init = true;
      }
      acc += Math.abs(y - last);
      last = y;
      return acc > Math.PI * 1.2 ? 'done' : 'active';
    },
  };
}

export function enterVehicle(
  label: string,
  kinds: VehicleKind[],
  where?: () => THREE.Vector3 | null,
): Objective {
  return {
    label,
    marker: where,
    update: (ctx) => (ctx.player.vehicle && kinds.includes(ctx.player.vehicle.kind) ? 'done' : 'active'),
  };
}

export function useVision(label: string): Objective {
  return {
    label,
    start: (ctx) => {
      ctx.flags.visionUsed = false;
    },
    update: (ctx) => (ctx.flags.visionUsed ? 'done' : 'active'),
  };
}

/** Photograph `count` of the given landmarks (photo mode capture with the landmark in frame). */
export function photograph(label: string, ids: string[], count: number): Objective {
  let n = 0;
  let ctxRef: MissionCtx | null = null;
  return {
    label,
    marker: () => {
      const c = ctxRef;
      if (!c) return null;
      let best: THREE.Vector3 | null = null;
      let bd = Infinity;
      for (const l of c.landmarks) {
        if (!ids.includes(l.id) || c.flags.photographed.has(l.id)) continue;
        const d = c.player.pos.distanceTo(l.pos);
        if (d < bd) {
          bd = d;
          best = l.pos;
        }
      }
      return best;
    },
    progress: () => `${n}/${count}`,
    start: (ctx) => {
      ctxRef = ctx;
      ctx.flags.photographed.clear();
      n = 0;
    },
    update: (ctx) => {
      n = 0;
      for (const id of ids) if (ctx.flags.photographed.has(id)) n++;
      return n >= count ? 'done' : 'active';
    },
  };
}

/** Sequential checkpoints / ring gates. */
export function checkpoints(
  label: string,
  points: THREE.Vector3[],
  radius: number,
  ring: boolean,
  opts: { yaws?: number[]; mode?: 'car' | 'air' } = {},
): Objective {
  let i = 0;
  const all: Gate[] = points.map((p, k) => ({ pos: p, radius, ring, yaw: opts.yaws?.[k] }));
  return {
    label,
    marker: () => points[Math.min(i, points.length - 1)],
    gates: () => all.slice(i, i + 2),
    progress: () => `${Math.min(i, points.length)}/${points.length}`,
    start: () => {
      i = 0;
    },
    update: (ctx): ObjStatus => {
      if (opts.mode && ctx.player.mode !== opts.mode) return 'active';
      const p = ctx.player.pos;
      const g = points[i];
      const d = ring ? p.distanceTo(g) : Math.hypot(p.x - g.x, p.z - g.z);
      if (d < radius && (ring || Math.abs(p.y - g.y) < 30)) {
        i++;
        ctx.toast(`Checkpoint ${i}/${points.length}`);
      }
      return i >= points.length ? 'done' : 'active';
    },
  };
}

export function takeoff(label: string, agl: number): Objective {
  return {
    label,
    update: (ctx) => {
      const v = ctx.player.vehicle;
      return v instanceof Aircraft && v.data.agl > agl ? 'done' : 'active';
    },
  };
}

/** Land on a runway and come to a stop. */
export function landAndStop(label: string, marker: THREE.Vector3): Objective {
  let touched = false;
  return {
    label,
    marker: () => marker,
    start: (ctx) => {
      ctx.flags.lastTouchdown = null;
      touched = false;
    },
    update: (ctx) => {
      const v = ctx.player.vehicle;
      if (!(v instanceof Aircraft)) return 'active';
      const td = ctx.flags.lastTouchdown;
      if (td && !touched) {
        touched = true;
        if (!td.onRunway) return { fail: 'Touched down off the runway' };
        ctx.stats.touchdownScore = td.score;
      }
      if (touched && v.data.onGround && v.speed() < 3) return 'done';
      return 'active';
    },
  };
}

/** Stay within maxDist of a moving target until `until` returns true. */
export function follow(
  label: string,
  target: () => THREE.Vector3,
  maxDist: number,
  until: () => boolean,
  grace = 12,
): Objective {
  let away = 0;
  return {
    label,
    marker: target,
    progress: () => (away > 0 ? `Lost! ${Math.max(0, grace - away).toFixed(0)}s` : ''),
    start: () => {
      away = 0;
    },
    update: (ctx, dt) => {
      if (until()) return 'done';
      const d = ctx.player.pos.distanceTo(target());
      away = d > maxDist ? away + dt : Math.max(0, away - dt * 2);
      return away > grace ? { fail: 'You lost the train' } : 'active';
    },
  };
}

/** Land a VTOL on a vertiport pad and come to rest. */
export function deliver(label: string, pad: THREE.Vector3): Objective {
  let hold = 0;
  return {
    label,
    marker: () => pad,
    gates: () => [{ pos: v3(pad.x, pad.y, pad.z), radius: 13, ring: false }],
    update: (ctx, dt) => {
      const v = ctx.player.vehicle;
      if (!(v instanceof Aircraft)) return 'active';
      const p = ctx.player.pos;
      const on =
        Math.hypot(p.x - pad.x, p.z - pad.z) < 12 &&
        Math.abs(p.y - pad.y) < 4 &&
        v.data.onGround &&
        v.speed() < 2;
      hold = on ? hold + dt : 0;
      return hold > 1.2 ? 'done' : 'active';
    },
  };
}

export function waitFor(
  label: string,
  cond: (ctx: MissionCtx) => boolean,
  marker?: () => THREE.Vector3 | null,
): Objective {
  return { label, marker, update: (ctx) => (cond(ctx) ? 'done' : 'active') };
}
