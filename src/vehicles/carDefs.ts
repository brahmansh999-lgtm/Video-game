/** The three drivable car classes. */

export type CarClass = 'ev' | 'coupe' | 'offroad';

export interface CarDef {
  id: CarClass;
  name: string;
  mass: number;
  /** chassis half extents */
  hx: number;
  hy: number;
  hz: number;
  wheelRadius: number;
  wheelX: number;
  wheelZ: number;
  suspensionRest: number;
  suspensionStiffness: number;
  frictionSlip: number;
  /** Peak drive force (N) summed over driven wheels. */
  driveForce: number;
  brakeForce: number;
  /** Top speed per gear (m/s). EV has a single gear. */
  gears: number[];
  redline: number;
  idle: number;
  maxSteer: number;
  allWheelDrive: boolean;
  paint: number;
  engineVoice: 'electric' | 'v6' | 'diesel';
}

export const CARS: Record<CarClass, CarDef> = {
  ev: {
    id: 'ev',
    name: 'Volt Pod (city EV)',
    mass: 1250,
    hx: 0.9,
    hy: 0.42,
    hz: 1.95,
    wheelRadius: 0.33,
    wheelX: 0.78,
    wheelZ: 1.28,
    suspensionRest: 0.32,
    suspensionStiffness: 34,
    frictionSlip: 2.4,
    driveForce: 7800,
    brakeForce: 55,
    gears: [44],
    redline: 9000,
    idle: 0,
    maxSteer: 0.6,
    allWheelDrive: false,
    paint: 0xe8e8e8,
    engineVoice: 'electric',
  },
  coupe: {
    id: 'coupe',
    name: 'Strata GT (sports coupé)',
    mass: 1380,
    hx: 0.98,
    hy: 0.36,
    hz: 2.25,
    wheelRadius: 0.35,
    wheelX: 0.85,
    wheelZ: 1.45,
    suspensionRest: 0.26,
    suspensionStiffness: 46,
    frictionSlip: 3.1,
    driveForce: 13500,
    brakeForce: 80,
    gears: [17, 28, 39, 50, 61, 74],
    redline: 7800,
    idle: 900,
    maxSteer: 0.55,
    allWheelDrive: false,
    paint: 0xc8302a,
    engineVoice: 'v6',
  },
  offroad: {
    id: 'offroad',
    name: 'Ridge Runner (off-road)',
    mass: 1900,
    hx: 1.05,
    hy: 0.6,
    hz: 2.2,
    wheelRadius: 0.48,
    wheelX: 0.92,
    wheelZ: 1.42,
    suspensionRest: 0.5,
    suspensionStiffness: 26,
    frictionSlip: 2.7,
    driveForce: 12000,
    brakeForce: 70,
    gears: [12, 21, 31, 41, 52],
    redline: 5200,
    idle: 750,
    maxSteer: 0.62,
    allWheelDrive: true,
    paint: 0x3f6b3a,
    engineVoice: 'diesel',
  },
};
