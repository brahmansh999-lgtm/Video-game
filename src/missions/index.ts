/** Mission list in unlock order. */
import { arrival, flightSchool, ribbonRun, siteSurvey } from './missionsA';
import { inspection, maglevChase, nightDelivery, stormFinale } from './missionsB';
import type { MissionDef } from './types';

export const MISSIONS: MissionDef[] = [
  arrival,
  siteSurvey,
  ribbonRun,
  flightSchool,
  inspection,
  maglevChase,
  nightDelivery,
  stormFinale,
];
