/**
 * One material for all four facade styles: textures are packed into a 2x2 atlas and the
 * per-vertex `aStyle` attribute selects the tile. Repeating UVs are wrapped in the shader
 * with textureGrad so mip selection stays seamless. This keeps one facade draw call per chunk.
 */
import * as THREE from 'three';
import { facadeTextures, type FacadeStyle } from './textures';

const STYLES: FacadeStyle[] = ['glass', 'white', 'dark', 'warm'];

function atlas(kind: 'map' | 'emissive'): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S * 2;
  c.height = S * 2;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  STYLES.forEach((s, i) => {
    const t = facadeTextures(s, 100 + i);
    const img = (kind === 'map' ? t.map : t.emissive).image as HTMLCanvasElement;
    // atlas row 0 = v in [0, 0.5] -> canvas bottom half (canvas y is flipped by flipY)
    const col = i % 2;
    const row = Math.floor(i / 2);
    g.drawImage(img, col * S, (1 - row) * S, S, S);
    t.map.dispose();
    t.emissive.dispose();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

const ATLAS_UV = /* glsl */ `
  vec2 atlasUv(vec2 uv, float style) {
    vec2 off = vec2(mod(style, 2.0), floor(style / 2.0 + 0.01)) * 0.5;
    return off + fract(uv) * 0.49 + 0.005;
  }
`;

export function createFacadeAtlasMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map: atlas('map'),
    emissiveMap: atlas('emissive'),
    emissive: 0xffffff,
    emissiveIntensity: 0,
    roughness: 0.25,
    metalness: 0.55,
    envMapIntensity: 1.3,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aStyle;\nvarying float vStyle;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStyle = aStyle;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vStyle;\n${ATLAS_UV}`)
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 sampledDiffuseColor = textureGrad(map, atlasUv(vMapUv, vStyle), dFdx(vMapUv) * 0.49, dFdy(vMapUv) * 0.49);
          diffuseColor *= sampledDiffuseColor;
        #endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#ifdef USE_EMISSIVEMAP
          vec4 emissiveColor = textureGrad(emissiveMap, atlasUv(vEmissiveMapUv, vStyle), dFdx(vEmissiveMapUv) * 0.49, dFdy(vEmissiveMapUv) * 0.49);
          totalEmissiveRadiance *= emissiveColor.rgb;
        #endif`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = (vStyle > 0.5 && vStyle < 1.5) || vStyle > 2.5 ? 0.55 : roughnessFactor;`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
         metalnessFactor = (vStyle > 0.5 && vStyle < 1.5) || vStyle > 2.5 ? 0.15 : metalnessFactor;`,
      );
  };
  m.customProgramCacheKey = () => 'facade-atlas';
  return m;
}
