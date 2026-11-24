/** Aircraft parameters (SI units, body frame: x right, y up, forward = -z). */

export type AircraftKind = 'plane' | 'jet' | 'vtol';

export interface GearLeg {
  x: number;
  y: number;
  z: number;
  /** suspension length (m) */
  len: number;
  steer: boolean;
}

export interface AircraftDef {
  kind: AircraftKind;
  name: string;
  mass: number;
  /** principal inertia about body x (pitch), y (yaw), z (roll) */
  inertia: [number, number, number];
  /** fuselage collider half extents */
  hull: [number, number, number];
  S: number;
  b: number;
  c: number;
  CL0: number;
  CLa: number;
  alphaStall: number;
  CD0: number;
  e: number;
  flapCL: number[];
  flapCD: number[];
  gearCD: number;
  maxThrust: number;
  /** prop thrust falls to zero at this speed; 0 = jet (ram rise) */
  propVmax: number;
  Cm0: number;
  Cma: number;
  Cmq: number;
  Cmde: number;
  Cla: number;
  Clp: number;
  Clb: number;
  Cnb: number;
  Cnr: number;
  Cndr: number;
  CYb: number;
  gear: GearLeg[];
  rotateSpeed: number;
  paint: number;
}

export const AIRCRAFT: Record<AircraftKind, AircraftDef> = {
  plane: {
    kind: 'plane',
    name: 'Kestrel S2 (light sports plane)',
    mass: 950,
    inertia: [1600, 2600, 1200],
    hull: [0.6, 0.6, 3.6],
    S: 16,
    b: 11,
    c: 1.5,
    CL0: 0.42,
    CLa: 5.0,
    alphaStall: 0.27,
    CD0: 0.027,
    e: 0.8,
    flapCL: [0, 0.35, 0.7],
    flapCD: [0, 0.012, 0.045],
    gearCD: 0.012,
    maxThrust: 3600,
    propVmax: 95,
    Cm0: 0.08,
    Cma: -0.9,
    Cmq: -14,
    Cmde: 0.55,
    Cla: 0.085,
    Clp: -0.5,
    Clb: -0.07,
    Cnb: 0.09,
    Cnr: -0.14,
    Cndr: 0.06,
    CYb: -0.7,
    gear: [
      { x: 0, y: -0.55, z: -2.6, len: 0.75, steer: true },
      { x: 1.1, y: -0.55, z: 0.55, len: 0.75, steer: false },
      { x: -1.1, y: -0.55, z: 0.55, len: 0.75, steer: false },
    ],
    rotateSpeed: 28,
    paint: 0xf2b21b,
  },
  jet: {
    kind: 'jet',
    name: 'Arrowline J7 (jet)',
    mass: 8200,
    inertia: [52000, 80000, 16000],
    hull: [0.95, 0.9, 7.6],
    S: 38,
    b: 10.4,
    c: 4.2,
    CL0: 0.15,
    CLa: 3.6,
    alphaStall: 0.36,
    CD0: 0.021,
    e: 0.75,
    flapCL: [0, 0.25, 0.5],
    flapCD: [0, 0.01, 0.035],
    gearCD: 0.015,
    maxThrust: 78000,
    propVmax: 0,
    Cm0: 0.04,
    Cma: -0.55,
    Cmq: -10,
    Cmde: 0.42,
    Cla: 0.07,
    Clp: -0.35,
    Clb: -0.05,
    Cnb: 0.11,
    Cnr: -0.16,
    Cndr: 0.05,
    CYb: -0.8,
    gear: [
      { x: 0, y: -0.85, z: -5.0, len: 1.15, steer: true },
      { x: 1.4, y: -0.85, z: 1.6, len: 1.15, steer: false },
      { x: -1.4, y: -0.85, z: 1.6, len: 1.15, steer: false },
    ],
    rotateSpeed: 72,
    paint: 0x8a8f99,
  },
  vtol: {
    kind: 'vtol',
    name: 'Skyway Q4 (VTOL air taxi)',
    mass: 2100,
    inertia: [5200, 7600, 4200],
    hull: [1.15, 1.0, 3.4],
    S: 13,
    b: 8.4,
    c: 1.5,
    CL0: 0.35,
    CLa: 4.4,
    alphaStall: 0.25,
    CD0: 0.045,
    e: 0.75,
    flapCL: [0, 0.3, 0.6],
    flapCD: [0, 0.012, 0.04],
    gearCD: 0.01,
    maxThrust: 31000,
    propVmax: 120,
    Cm0: 0.06,
    Cma: -0.8,
    Cmq: -14,
    Cmde: 0.5,
    Cla: 0.08,
    Clp: -0.5,
    Clb: -0.06,
    Cnb: 0.1,
    Cnr: -0.16,
    Cndr: 0.06,
    CYb: -0.8,
    gear: [
      { x: 1.0, y: -0.95, z: -1.5, len: 0.55, steer: false },
      { x: -1.0, y: -0.95, z: -1.5, len: 0.55, steer: false },
      { x: 1.0, y: -0.95, z: 1.8, len: 0.55, steer: false },
      { x: -1.0, y: -0.95, z: 1.8, len: 0.55, steer: false },
    ],
    rotateSpeed: 30,
    paint: 0x2a9d8f,
  },
};
