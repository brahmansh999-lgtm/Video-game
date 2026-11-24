/** The Landmark Codex: 20 fictional landmarks and their info cards. */
import * as THREE from 'three';
import { DAM_Z, RESERVOIR_LEVEL, riverX, type District } from './layout';
import { ringPoint, STATION_ANGLES } from './structures';
import type { WorldData } from './worldData';

export interface LandmarkInfo {
  id: string;
  name: string;
  district: District;
  typology: string;
  structure: string;
  concept: string;
}

export interface Landmark extends LandmarkInfo {
  pos: THREE.Vector3;
  height: number;
  radius: number;
}

export const LANDMARK_INFO: LandmarkInfo[] = [
  {
    id: 'helix-spire',
    name: 'Helix Spire',
    district: 'core',
    typology: 'Supertall mixed-use tower',
    structure: 'Concrete core with twisting steel diagrid exoskeleton',
    concept:
      'A superellipse floor plate rotating 126° over its height so every floor gains a unique view and wind vortices are confused.',
  },
  {
    id: 'prism-exchange',
    name: 'Prism Exchange',
    district: 'core',
    typology: 'Trading hall and offices',
    structure: 'Tapered tube-in-tube frame',
    concept:
      'A near-square superellipse tapering to half its base width: stability expressed as pure geometry.',
  },
  {
    id: 'diagrid-crown',
    name: 'Diagrid Crown',
    district: 'core',
    typology: 'Hotel and observatory',
    structure: 'Full-height diagrid shell, no interior columns',
    concept: 'A sinusoidal bulge puts the widest floors at mid-height, where the city panorama is best.',
  },
  {
    id: 'twin-flux',
    name: 'Twin Flux',
    district: 'core',
    typology: 'Residential twin towers',
    structure: 'Paired cores coupled by skybridges',
    concept: 'Two towers twisting in opposite directions, choreographed like dancers around a shared plaza.',
  },
  {
    id: 'skybridge-trio',
    name: 'Skybridge Trio',
    district: 'core',
    typology: 'Research campus',
    structure: 'Three cores braced by connecting skybridges',
    concept: 'A vertical campus where the bridges are the shared labs and cafés.',
  },
  {
    id: 'mobius-ribbon',
    name: 'Möbius Ribbon',
    district: 'waterfront',
    typology: 'Cultural centre and galleries',
    structure: 'Box-girder ribbon spanning as a continuous arch',
    concept:
      'The promenade lifts off the ground, loops over the coastal drive and lands again: one continuous route.',
  },
  {
    id: 'wave-hall',
    name: 'Wave Hall',
    district: 'waterfront',
    typology: 'Covered market',
    structure: 'Thin-shell undulating canopy on corner supports',
    concept: 'A rippling roof echoing the sea, open on all sides to the breeze.',
  },
  {
    id: 'marina-lantern',
    name: 'Marina Lantern',
    district: 'waterfront',
    typology: 'Lighthouse and viewing tower',
    structure: 'Slender twisted tube',
    concept: 'A navigational beacon whose neon crown is visible from every pier.',
  },
  {
    id: 'gyroid-pavilion',
    name: 'Gyroid Pavilion',
    district: 'gardens',
    typology: 'Botanical pavilion',
    structure: 'Perforated TPMS-like shell on tree columns',
    concept: 'Minimal-surface curvature filters daylight into a dappled forest-floor light.',
  },
  {
    id: 'voronoi-grove',
    name: 'Voronoi Grove',
    district: 'gardens',
    typology: 'Conservatory',
    structure: 'Elliptical dome with Voronoi cell perforation',
    concept: 'Cells sized by structural stress: larger openings where the shell works least.',
  },
  {
    id: 'terrace-mountain',
    name: 'Terrace Mountain',
    district: 'gardens',
    typology: 'Stepped housing',
    structure: 'Stacked transfer slabs',
    concept: 'Every apartment gets a garden on the roof of the one below: a man-made hillside.',
  },
  {
    id: 'forest-spire',
    name: 'Forest Spire',
    district: 'gardens',
    typology: 'Vertical forest residential tower',
    structure: 'Cantilevered planting balconies on a tapered frame',
    concept: 'Hundreds of trees climb the façade, cooling the tower and housing birds.',
  },
  {
    id: 'cloud-canopy',
    name: 'Cloud Canopy',
    district: 'gardens',
    typology: 'Open-air amphitheatre roof',
    structure: 'Single-wave shell on four corner bearings',
    concept: 'A floating cloud of perforated concrete shading the park stage.',
  },
  {
    id: 'halo-station',
    name: 'Halo Station',
    district: 'maglev',
    typology: 'Maglev interchange',
    structure: 'Elliptical steel ring suspended over the platforms',
    concept: 'The halo marks arrival; it hovers like the trains themselves.',
  },
  {
    id: 'strand-bridge',
    name: 'Strand Bridge',
    district: 'maglev',
    typology: 'Road bridge',
    structure: 'Cable-stayed, single A-frame pylon',
    concept: 'Fan cables trace a harp of light across the river at night.',
  },
  {
    id: 'arc-bridge',
    name: 'Arc Bridge',
    district: 'maglev',
    typology: 'Road bridge',
    structure: 'Parabolic through-arch with vertical hangers',
    concept: 'The thrust line made visible: a pure compression arch.',
  },
  {
    id: 'wing-hangar',
    name: 'Wing Hangar',
    district: 'aeroport',
    typology: 'Aircraft hangar',
    structure: 'Long-span barrel vault shell with ribs',
    concept: 'A 92 m column-free span shaped like a folded wing.',
  },
  {
    id: 'beacon-tower',
    name: 'Beacon Tower',
    district: 'aeroport',
    typology: 'Air traffic control tower',
    structure: 'Flaring cantilevered tube',
    concept: 'Widening towards the top to give controllers a 360° cab.',
  },
  {
    id: 'granite-dam',
    name: 'Granite Dam',
    district: 'hills',
    typology: 'Hydro-electric gravity dam',
    structure: 'Mass concrete gravity section',
    concept: 'Holds the reservoir that feeds the river through the city.',
  },
  {
    id: 'turbine-ridge',
    name: 'Turbine Ridge',
    district: 'hills',
    typology: 'Wind farm',
    structure: 'Tapered tubular steel towers',
    concept: 'The ridge-top turbines power the maglev ring.',
  },
];

export function resolveLandmarks(world: WorldData, turbineCentroid: THREE.Vector3): Landmark[] {
  return LANDMARK_INFO.map((info) => {
    const owned = world.buildings.filter((b) => b.landmark === info.id);
    if (owned.length) {
      const pos = new THREE.Vector3();
      let h = 0;
      let r = 0;
      for (const b of owned) {
        pos.add(new THREE.Vector3(b.x, b.y, b.z));
        h = Math.max(h, b.height);
        r = Math.max(r, b.radius);
      }
      pos.divideScalar(owned.length);
      return { ...info, pos, height: h, radius: r + (owned.length > 1 ? 40 : 0) };
    }
    const br = world.bridges.find((b) => b.landmark === info.id);
    if (br)
      return {
        ...info,
        pos: new THREE.Vector3((br.x0 + br.x1) / 2, br.y, br.z),
        height: 78,
        radius: (br.x1 - br.x0) / 2,
      };
    if (info.id === 'halo-station') {
      const p = ringPoint(STATION_ANGLES[3]);
      return { ...info, pos: new THREE.Vector3(p.x, 0, p.z), height: 38, radius: 66 };
    }
    if (info.id === 'granite-dam') {
      return {
        ...info,
        pos: new THREE.Vector3(riverX(DAM_Z), 0, DAM_Z),
        height: RESERVOIR_LEVEL + 11,
        radius: 105,
      };
    }
    return { ...info, pos: turbineCentroid.clone(), height: 120, radius: 300 };
  });
}
