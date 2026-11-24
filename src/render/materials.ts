/** Shared material library. Few materials = few state changes and easy vision swaps. */
import * as THREE from 'three';
import { createFacadeAtlasMaterial } from './facadeAtlas';
import {
  blueprintTexture,
  detailTexture,
  grassTexture,
  pavingTexture,
  perforationTexture,
  roadTexture,
  runwayTexture,
} from './textures';

const std = (p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial(p);

export class Materials {
  readonly facade: THREE.MeshStandardMaterial;
  readonly solid = std({ vertexColors: true, roughness: 0.75 });
  readonly treeMat = std({ vertexColors: true, roughness: 0.9, flatShading: true });
  readonly slab = std({ color: 0xeeeeea, roughness: 0.7, metalness: 0.0 });
  readonly concrete = std({ color: 0xb9b6ae, roughness: 0.85 });
  readonly metal = std({ color: 0xd9dde2, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide });
  readonly darkMetal = std({ color: 0x3a3f46, roughness: 0.45, metalness: 0.7 });
  readonly neonCyan = std({ color: 0x0b1a20, emissive: 0x31e8ff, emissiveIntensity: 0.4 });
  readonly neonMagenta = std({ color: 0x200b1a, emissive: 0xff3fb4, emissiveIntensity: 0.4 });
  readonly neonAmber = std({ color: 0x201608, emissive: 0xffaa33, emissiveIntensity: 0.4 });
  readonly road: THREE.MeshStandardMaterial;
  readonly intersection = std({ color: 0x2e3034, roughness: 0.9 });
  readonly paving: THREE.MeshStandardMaterial;
  readonly grass: THREE.MeshStandardMaterial;
  readonly terrain: THREE.MeshStandardMaterial;
  readonly runway: THREE.MeshStandardMaterial;
  readonly shell: THREE.MeshStandardMaterial;
  readonly greenRoof = std({ color: 0x4f7a32, roughness: 0.95 });
  readonly foliage = std({ color: 0x3f7a2c, roughness: 0.9, flatShading: true });
  readonly trunk = std({ color: 0x5a4632, roughness: 0.95 });
  readonly windowDark = std({ color: 0x0f1820, roughness: 0.1, metalness: 0.8 });
  readonly tire = std({ color: 0x151515, roughness: 0.9 });
  readonly chrome = std({ color: 0xffffff, roughness: 0.15, metalness: 1 });
  readonly lightLamp = std({ color: 0x222222, emissive: 0xfff1d0, emissiveIntensity: 0.2 });
  readonly redLight = std({ color: 0x200000, emissive: 0xff2020, emissiveIntensity: 1.5 });
  readonly skin = std({ color: 0xc89a7a, roughness: 0.8 });
  readonly cloth: THREE.MeshStandardMaterial[];
  readonly paints: THREE.MeshStandardMaterial[];
  readonly gate = std({
    color: 0x072030,
    emissive: 0x30ffd0,
    emissiveIntensity: 1.6,
    transparent: true,
    opacity: 0.85,
  });
  readonly marker = std({
    color: 0x101010,
    emissive: 0xffc23a,
    emissiveIntensity: 2,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });

  // Architect Vision materials
  readonly visionFacade: THREE.MeshStandardMaterial;
  readonly visionStructure = std({ color: 0x000000, emissive: 0xff8a2a, emissiveIntensity: 1.4 });
  readonly visionGhost = std({
    color: 0x0c1c2c,
    emissive: 0x1d4a70,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.55,
  });

  private readonly visionMap = new Map<THREE.Material, THREE.Material>();
  private readonly nightMats: THREE.MeshStandardMaterial[];

  constructor() {
    this.facade = createFacadeAtlasMaterial();
    this.road = std({ map: roadTexture(), roughness: 0.85 });
    const pav = pavingTexture();
    this.paving = std({ map: pav, roughness: 0.8 });
    const grass = grassTexture();
    this.grass = std({ map: grass, roughness: 0.95 });
    this.terrain = std({ map: detailTexture(), vertexColors: true, roughness: 0.95 });
    this.runway = std({ map: runwayTexture(), roughness: 0.85 });
    this.shell = std({
      color: 0xf4f1ea,
      roughness: 0.5,
      alphaMap: perforationTexture(21),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    const bp = blueprintTexture();
    this.visionFacade = std({
      map: bp,
      emissiveMap: bp,
      emissive: 0x6fc7ff,
      emissiveIntensity: 0.5,
      roughness: 1,
    });
    this.cloth = [0x2d5b8a, 0xa8402e, 0x2f2f33, 0xd7c49e, 0x3f7f5a, 0x7a3f8a, 0xe6e6e6].map((c) =>
      std({ color: c, roughness: 0.85 }),
    );
    this.paints = [0xe8e8e8, 0x1b1d22, 0xc8302a, 0x2d6bd6, 0xf2b21b, 0x2a9d8f, 0x8a8f99].map((c) =>
      std({ color: c, roughness: 0.3, metalness: 0.6 }),
    );

    this.visionMap.set(this.facade, this.visionFacade);
    for (const m of [this.metal, this.darkMetal]) this.visionMap.set(m, this.visionStructure);
    for (const m of [this.solid, this.slab, this.concrete, this.shell, this.greenRoof])
      this.visionMap.set(m, this.visionGhost);
    this.nightMats = [this.facade];
  }

  visionFor(m: THREE.Material): THREE.Material | undefined {
    return this.visionMap.get(m);
  }

  /** night: 0 = full day, 1 = full night. */
  setNight(night: number): void {
    for (const m of this.nightMats) m.emissiveIntensity = night * 1.5;
    const neon = 0.15 + night * 3.2;
    this.neonCyan.emissiveIntensity = neon;
    this.neonMagenta.emissiveIntensity = neon;
    this.neonAmber.emissiveIntensity = neon;
    this.lightLamp.emissiveIntensity = 0.1 + night * 4;
  }

  /** wet: 0 = dry, 1 = soaked. */
  setWet(wet: number): void {
    this.road.roughness = 0.85 - wet * 0.6;
    this.road.color.setScalar(1 - wet * 0.35);
    this.intersection.roughness = 0.9 - wet * 0.6;
    this.paving.roughness = 0.8 - wet * 0.5;
    this.runway.roughness = 0.85 - wet * 0.55;
  }
}
