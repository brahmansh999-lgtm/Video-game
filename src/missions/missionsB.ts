/** Missions 5–8: Structural Inspection, Maglev Chase, Night Delivery, Storm Finale. */
import * as THREE from 'three';
import { Aircraft } from '../vehicles/aircraft';
import { RING_RADIUS } from '../world/planContext';
import { STATION_ANGLES, ringPoint } from '../world/structures';
import { touchdownStars } from './missionsA';
import { checkpoints, deliver, follow, landAndStop, reach, takeoff } from './objectives';
import type { Vehicle } from '../vehicles/vehicle';
import type { MissionCtx, MissionDef } from './types';

/** Reuse the VTOL parked on vertiport i, reset onto its pad. */
function padTaxi(ctx: MissionCtx, i: number, yaw: number): Vehicle {
  const vp = ctx.world.vertiports[i];
  const v = ctx.vehicles.tags.get(`vp-${i}`) ?? ctx.spawn({ type: 'vtol', x: vp.x, z: vp.z, y: vp.y, yaw });
  v.reset(vp.x, vp.y, vp.z, yaw);
  return v;
}

const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Temporarily remove the taxis parked on the given vertiports (restored by restorePads). */
function clearPads(ctx: MissionCtx, idx: number[]): void {
  for (const i of idx) {
    const v = ctx.vehicles.tags.get(`vp-${i}`);
    if (v && ctx.player.vehicle !== v) ctx.vehicles.remove(v);
  }
}

function restorePads(ctx: MissionCtx): void {
  ctx.world.vertiports.forEach((vp, i) => {
    if (ctx.vehicles.tags.get(`vp-${i}`)) return;
    const v = ctx.vehicles.spawn({ type: 'vtol', x: vp.x, z: vp.z, y: vp.y, yaw: i * 0.7, tag: `vp-${i}` });
    ctx.player.hookImpact(v);
  });
}

export const inspection: MissionDef = {
  id: 'inspection',
  title: '5 · Structural Inspection',
  district: 'Flux Core',
  summary: 'Thread the VTOL through inspection gates between the towers and under the skybridges.',
  briefing: [
    'The skybridges are due their annual inspection.',
    'Lift off in hover, convert to cruise or stay slow — your call.',
    'Fly through every gate: under the skybridges and between the Twin Flux towers.',
    'Then bring the air taxi back to the Core Plaza vertiport.',
  ],
  timeLimit: 480,
  starTimes: [170, 260],
  unlockAfter: 'flight-school',
  setup: (ctx) => {
    ctx.setTime(11, false);
    ctx.setWeather('clear');
    const vp = ctx.world.vertiports[0];
    ctx.player.placeInVehicle(padTaxi(ctx, 0, 0));
    // gates under the nearest core skybridges, plus one between the Twin Flux towers
    const cands = ctx.world.skybridges
      .map((s) => {
        const mx = (s.ax + s.bx) / 2;
        const mz = (s.az + s.bz) / 2;
        return {
          p: v3(mx, Math.max(30, s.y - 12), mz),
          yaw: Math.atan2(s.bx - s.ax, s.bz - s.az) + Math.PI / 2,
        };
      })
      .filter((g) => Math.hypot(g.p.x, g.p.z) < 560)
      .sort((a, b) => Math.hypot(a.p.x - vp.x, a.p.z - vp.z) - Math.hypot(b.p.x - vp.x, b.p.z - vp.z))
      .slice(0, 4);
    cands.push({ p: v3(240, 110, 240), yaw: Math.atan2(1, 1) + Math.PI / 2 });
    // order as a nearest-neighbour tour from the vertiport
    const tour: typeof cands = [];
    let cur = v3(vp.x, vp.y, vp.z);
    while (cands.length) {
      let bi = 0;
      for (let i = 1; i < cands.length; i++)
        if (cands[i].p.distanceTo(cur) < cands[bi].p.distanceTo(cur)) bi = i;
      const g = cands.splice(bi, 1)[0];
      tour.push(g);
      cur = g.p;
    }
    return [
      takeoff('Lift off', 8),
      checkpoints(
        'Fly through the inspection gates',
        tour.map((g) => g.p),
        11,
        true,
        { yaws: tour.map((g) => g.yaw), mode: 'air' },
      ),
      deliver('Land back on the Core Plaza pad', v3(vp.x, vp.y, vp.z)),
    ];
  },
};

const trainPos = new THREE.Vector3();

export const maglevChase: MissionDef = {
  id: 'maglev-chase',
  title: '6 · Maglev Chase',
  district: 'Maglev Ring',
  summary: 'A runaway train is skipping every station. Chase it by car, then by air, to its terminus.',
  briefing: [
    'Control has lost a ring train — it is running every station.',
    'Stay with it by car until we can get you airborne.',
    'Then take the air taxi and shadow it all the way to the terminus.',
  ],
  timeLimit: 420,
  starTimes: [150, 210],
  unlockAfter: 'inspection',
  teardown: (ctx) => ctx.maglev.reset(),
  setup: (ctx) => {
    ctx.setTime(14, false);
    ctx.setWeather('overcast');
    ctx.maglev.reset();
    ctx.maglev.makeRunaway(0, 2, 1);
    const train = ctx.maglev.trains[0];
    const pos = (): THREE.Vector3 => ctx.maglev.position(0, trainPos);
    const car = ctx.spawn({ type: 'coupe', x: 966, z: 30, yaw: Math.PI });
    ctx.player.placeInVehicle(car);
    let taxi: Vehicle | null = null;
    const terminus = ringPoint(STATION_ANGLES[2], RING_RADIUS);
    terminus.y = 18;
    return [
      follow('Chase the runaway train by car', pos, 360, () => train.s > 720, 14),
      {
        label: 'Switch to the air taxi',
        start: (c) => {
          const p = c.player.pos;
          const n = c.world.roads.nodes[c.world.roads.nearestNode(p.x, p.z, true)];
          taxi = c.spawn({ type: 'vtol', x: n.x + 6, z: n.z + 6, yaw: 0 });
          c.toast('Air taxi waiting at the nearest junction');
        },
        marker: () => (taxi ? taxi.root.position : null),
        update: (c) => (c.player.vehicle !== null && c.player.vehicle === taxi ? 'done' : 'active'),
      },
      follow('Shadow the train from the air', pos, 650, () => train.stopped, 22),
      reach('Reach the terminus: Gardens Halo', terminus, 90, { mode: 'air' }),
    ];
  },
};

export const nightDelivery: MissionDef = {
  id: 'night-delivery',
  title: '7 · Night Delivery',
  district: 'Citywide',
  summary: 'Deliver an architectural model to three rooftop vertiports, at night, in the rain.',
  briefing: [
    'A client needs the scale model at three sites tonight.',
    'Land on each rooftop pad and hold still for a moment to hand it over.',
    'It’s raining. Watch your hover height and use the neon pad rings.',
  ],
  timeLimit: 660,
  starTimes: [300, 430],
  unlockAfter: 'maglev-chase',
  teardown: (ctx) => restorePads(ctx),
  setup: (ctx) => {
    clearPads(ctx, [3, 0, 1]);
    ctx.setTime(22, true);
    ctx.setWeather('rain');
    const vps = ctx.world.vertiports;
    ctx.player.placeInVehicle(padTaxi(ctx, 5, Math.PI / 2));
    const pad = (i: number): THREE.Vector3 => v3(vps[i].x, vps[i].y, vps[i].z);
    return [
      deliver(`Deliver to ${vps[3].name}`, pad(3)),
      deliver(`Deliver to ${vps[0].name}`, pad(0)),
      deliver(`Deliver to ${vps[1].name}`, pad(1)),
    ];
  },
};

export const stormFinale: MissionDef = {
  id: 'storm-finale',
  title: '8 · Storm Finale',
  district: 'All districts',
  summary: 'A jet course across every district in a storm, finishing with a crosswind landing.',
  briefing: [
    'The storm is here and so is the final exam.',
    'Take the Arrowline off 36L and fly the course over every district.',
    'Expect gusts and a strong crosswind on final. Land on 36L and stop.',
  ],
  failOnCrash: true,
  timeLimit: 900,
  unlockAfter: 'night-delivery',
  rate: (ctx) => Math.min(touchdownStars(ctx, 60, 30), ctx.stats.time < 420 ? 3 : 2),
  setup: (ctx) => {
    ctx.setTime(17.5, false);
    ctx.setWeather('storm');
    const jet = ctx.spawn({ type: 'jet', x: 1300, z: 440, yaw: 0 });
    ctx.player.placeInVehicle(jet);
    const course = [
      v3(1300, 260, -1150),
      v3(300, 360, -1650),
      v3(-1250, 260, -300),
      v3(-500, 220, 1150),
      v3(0, 580, 0),
      v3(700, 320, 420),
      v3(1300, 220, 2200),
    ];
    const yaws = course.map((p, i) => {
      const q = i === 0 ? v3(1300, 0, 440) : course[i - 1];
      return Math.atan2(-(p.x - q.x), -(p.z - q.z));
    });
    return [
      takeoff('Take off from 36L', 60),
      checkpoints('Fly the storm course', course, 45, true, { yaws, mode: 'air' }),
      landAndStop('Land on 36L in the crosswind and stop', v3(1300, 0, 450)),
      { label: 'Exit the jet', update: (c) => (c.player.vehicle instanceof Aircraft ? 'active' : 'done') },
    ];
  },
};
