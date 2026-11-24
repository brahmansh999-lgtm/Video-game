/** Missions 1–4: Arrival, Site Survey, Ribbon Run, Flight School. */
import * as THREE from 'three';
import { Aircraft } from '../vehicles/aircraft';
import {
  checkpoints,
  enterVehicle,
  landAndStop,
  lookAround,
  photograph,
  reach,
  takeoff,
  useVision,
  walk,
} from './objectives';
import type { MissionCtx, MissionDef } from './types';

const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Stars from the recorded touchdown score. */
export function touchdownStars(ctx: MissionCtx, three: number, two: number): number {
  const s = ctx.stats.touchdownScore ?? 0;
  return s >= three ? 3 : s >= two ? 2 : 1;
}

export const arrival: MissionDef = {
  id: 'arrival',
  title: '1 · Arrival',
  district: 'Maglev Ring → Flux Core',
  summary: 'Learn to walk, look around, drive and see the city through Architect Vision.',
  briefing: [
    'Welcome to Flux City. Let’s get you moving.',
    'Walk a few steps, then take a look around.',
    'Your car is parked on the street. Drive to the plaza at the heart of the Flux Core.',
    'Once there, switch on Architect Vision to read the towers’ structure.',
  ],
  starTimes: [110, 200],
  setup: (ctx) => {
    ctx.setTime(10, false);
    ctx.setWeather('clear');
    const y = ctx.world.terrain.heightAt(540, 14);
    ctx.player.placeOnFoot(540, 14, Math.PI / 2, y);
    const car = ctx.spawn({ type: 'ev', x: 545, z: -5, yaw: Math.PI / 2 });
    const carPos = (): THREE.Vector3 => car.root.position;
    return [
      walk('Walk a few steps', 6),
      lookAround('Look around with the camera'),
      enterVehicle('Get in the Volt Pod', ['car'], carPos),
      reach('Drive to the Flux Core plaza', v3(80, 0, 80), 34, { mode: 'car' }),
      useVision('Turn on Architect Vision'),
    ];
  },
};

const GARDEN_LANDMARKS = [
  'gyroid-pavilion',
  'voronoi-grove',
  'terrace-mountain',
  'forest-spire',
  'cloud-canopy',
];

export const siteSurvey: MissionDef = {
  id: 'site-survey',
  title: '2 · Site Survey',
  district: 'Canopy Gardens',
  summary: 'Photograph the five Canopy Gardens landmarks before the light goes.',
  briefing: [
    'The Gardens board wants a photographic survey of its five landmarks.',
    'Get each one in frame and in range, open photo mode and capture it.',
    'A car is parked beside you. You have six minutes.',
  ],
  timeLimit: 360,
  starTimes: [190, 280],
  unlockAfter: 'arrival',
  setup: (ctx) => {
    ctx.setTime(16.5, false);
    ctx.setWeather('clear');
    ctx.player.placeOnFoot(-880, -168, 0);
    const car = ctx.vehicles.tags.get('gardens');
    if (car) car.reset(-870, ctx.world.terrain.heightAt(-870, -150) + 1, -150, 0);
    return [photograph('Photograph the Gardens landmarks', GARDEN_LANDMARKS, 5)];
  },
};

export const ribbonRun: MissionDef = {
  id: 'ribbon-run',
  title: '3 · Ribbon Run',
  district: 'Ribbon Waterfront',
  summary: 'A street race along the coastal ribbon drive, under the Möbius Ribbon.',
  briefing: [
    'The Ribbon Drive is closed for a time trial.',
    'Hit every checkpoint along the waterfront — the road dives under the Möbius Ribbon.',
    'Your Strata GT is on the start line.',
  ],
  timeLimit: 150,
  starTimes: [72, 95],
  unlockAfter: 'site-survey',
  setup: (ctx) => {
    ctx.setTime(18.2, false);
    ctx.setWeather('clear');
    const pts = ctx.world.paths[1].pts;
    const a = pts[2];
    const b = pts[4];
    const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    const car = ctx.spawn({ type: 'coupe', x: a.x, z: a.z, yaw });
    ctx.player.placeInVehicle(car);
    const cps: THREE.Vector3[] = [];
    for (let i = 26; i < pts.length - 3; i += 26) cps.push(v3(pts[i].x, pts[i].y, pts[i].z));
    const end = pts[pts.length - 3];
    cps.push(v3(end.x, end.y, end.z));
    return [checkpoints('Race through the checkpoints', cps, 16, false, { mode: 'car' })];
  },
};

export const flightSchool: MissionDef = {
  id: 'flight-school',
  title: '4 · Flight School',
  district: 'Aeroport',
  summary: 'Take off, fly the circuit through the rings and land on runway 36L.',
  briefing: [
    'Today: a full circuit in the Kestrel.',
    'Full throttle, rotate around 28 m/s, climb out and raise the gear.',
    'Fly through the four rings, then lower gear and flaps and land on 36L.',
    'Your landing is scored on sink rate and centreline. Don’t bend the aeroplane.',
  ],
  failOnCrash: true,
  unlockAfter: 'ribbon-run',
  rate: (ctx) => touchdownStars(ctx, 70, 40),
  setup: (ctx) => {
    ctx.setTime(9.5, false);
    ctx.setWeather('clear');
    const plane = ctx.spawn({ type: 'plane', x: 1300, z: 440, yaw: 0 });
    ctx.player.placeInVehicle(plane);
    const rings = [v3(1300, 150, -800), v3(860, 170, -760), v3(860, 170, 1600), v3(1250, 120, 2250)];
    const yaws = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    return [
      takeoff('Take off and climb above 60 m', 60),
      checkpoints('Fly the circuit rings', rings, 26, true, { yaws, mode: 'air' }),
      landAndStop('Land on runway 36L and stop', v3(1300, 0, 450)),
      {
        label: 'Exit the aircraft',
        update: (c) => (c.player.vehicle instanceof Aircraft ? 'active' : 'done'),
      },
    ];
  },
};
