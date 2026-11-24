/** Quality presets: scale shadows, post FX, draw distance and density. */
import type { QualityName } from '../core/settings';

export interface QualityPreset {
  name: QualityName;
  label: string;
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  shadowRange: number;
  post: boolean;
  bloom: boolean;
  smaa: boolean;
  godRays: boolean;
  waterReflections: boolean;
  /** Radius (m) within which chunks are kept loaded. */
  drawDistance: number;
  /** LOD switch distances for chunk detail levels 1 and 2. */
  lod1: number;
  lod2: number;
  /** 0..1 multiplier for traffic, pedestrians and foliage counts. */
  density: number;
  clouds: boolean;
}

export const PRESETS: Record<QualityName, QualityPreset> = {
  low: {
    name: 'low',
    label: 'Low',
    maxPixelRatio: 0.85,
    shadows: false,
    shadowMapSize: 512,
    shadowRange: 60,
    post: false,
    bloom: false,
    smaa: false,
    godRays: false,
    waterReflections: false,
    drawDistance: 1000,
    lod1: 260,
    lod2: 520,
    density: 0.4,
    clouds: false,
  },
  medium: {
    name: 'medium',
    label: 'Medium',
    maxPixelRatio: 1,
    shadows: true,
    shadowMapSize: 1024,
    shadowRange: 90,
    post: true,
    bloom: true,
    smaa: true,
    godRays: false,
    waterReflections: false,
    drawDistance: 1500,
    lod1: 340,
    lod2: 700,
    density: 0.7,
    clouds: true,
  },
  high: {
    name: 'high',
    label: 'High',
    maxPixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 2048,
    shadowRange: 120,
    post: true,
    bloom: true,
    smaa: true,
    godRays: false,
    waterReflections: true,
    drawDistance: 2100,
    lod1: 420,
    lod2: 900,
    density: 1,
    clouds: true,
  },
  ultra: {
    name: 'ultra',
    label: 'Ultra',
    maxPixelRatio: 1.75,
    shadows: true,
    shadowMapSize: 4096,
    shadowRange: 160,
    post: true,
    bloom: true,
    smaa: true,
    godRays: true,
    waterReflections: true,
    drawDistance: 2800,
    lod1: 560,
    lod2: 1200,
    density: 1,
    clouds: true,
  },
};
