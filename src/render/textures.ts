/** Procedurally generated canvas textures. */
import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function tex(c: HTMLCanvasElement, srgb: boolean, aniso = 8): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

export type FacadeStyle = 'glass' | 'white' | 'dark' | 'warm';

interface FacadeSpec {
  glass: string;
  glassAlt: string;
  mullion: string;
  slab: string;
  /** Fraction of a cell occupied by solid spandrel/fin. */
  solid: number;
  fins: boolean;
}

const FACADES: Record<FacadeStyle, FacadeSpec> = {
  glass: {
    glass: '#3d6e86',
    glassAlt: '#5a8da6',
    mullion: '#c9d6de',
    slab: '#e8edf0',
    solid: 0.18,
    fins: false,
  },
  white: {
    glass: '#30475a',
    glassAlt: '#3e5a70',
    mullion: '#f2f2ee',
    slab: '#fbfbf7',
    solid: 0.42,
    fins: true,
  },
  dark: {
    glass: '#1b2530',
    glassAlt: '#26323f',
    mullion: '#c8a96a',
    slab: '#2b2b2b',
    solid: 0.2,
    fins: false,
  },
  warm: {
    glass: '#2e3d44',
    glassAlt: '#3a4c55',
    mullion: '#c77d4a',
    slab: '#d9c6ad',
    solid: 0.35,
    fins: true,
  },
};

/**
 * Facade texture tile = 8 panels wide x 8 floors high.
 * UV convention: u = perimeter metres / 24, v = height metres / 28.8.
 */
export function facadeTextures(
  style: FacadeStyle,
  seed: number,
): { map: THREE.Texture; emissive: THREE.Texture } {
  const S = 512;
  const cells = 8;
  const cw = S / cells;
  const [c, g] = canvas(S, S);
  const [ec, eg] = canvas(S, S);
  const spec = FACADES[style];
  const rnd = mulberry32(seed);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, S, S);
  for (let fy = 0; fy < cells; fy++) {
    for (let fx = 0; fx < cells; fx++) {
      const x = fx * cw;
      const y = fy * cw;
      const solidH = cw * spec.solid;
      g.fillStyle = rnd() > 0.7 ? spec.glassAlt : spec.glass;
      g.fillRect(x, y, cw, cw);
      const grad = g.createLinearGradient(x, y, x + cw, y + cw);
      grad.addColorStop(0, 'rgba(255,255,255,0.10)');
      grad.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = grad;
      g.fillRect(x, y, cw, cw);
      g.fillStyle = spec.slab;
      g.fillRect(x, y + cw - solidH, cw, solidH);
      g.fillStyle = spec.mullion;
      g.fillRect(x, y, 3, cw);
      g.fillRect(x + cw / 2 - 1, y, 2, cw - solidH);
      if (spec.fins) g.fillRect(x + cw - 7, y, 5, cw);
      const lit = rnd();
      if (lit > 0.45) {
        const warm = rnd() > 0.35;
        const k = 0.55 + rnd() * 0.45;
        eg.fillStyle = warm
          ? `rgb(${Math.floor(255 * k)},${Math.floor(196 * k)},${Math.floor(120 * k)})`
          : `rgb(${Math.floor(170 * k)},${Math.floor(215 * k)},${Math.floor(255 * k)})`;
        eg.fillRect(x + 4, y + 3, cw - 8, cw - solidH - 5);
        eg.fillStyle = 'rgba(0,0,0,0.6)';
        eg.fillRect(x + cw / 2 - 1, y, 2, cw - solidH);
      }
    }
  }
  return { map: tex(c, true), emissive: tex(ec, true) };
}

/** Road: u across the full width (0..1), v along length (1 tile = 16 m). Four lanes. */
export function roadTexture(): THREE.Texture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#2d2f33';
  g.fillRect(0, 0, 256, 256);
  const rnd = mulberry32(7);
  for (let i = 0; i < 3000; i++) {
    const v = 40 + Math.floor(rnd() * 25);
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  g.fillStyle = '#d8d8d8';
  g.fillRect(6, 0, 3, 256);
  g.fillRect(247, 0, 3, 256);
  g.fillStyle = '#e0b84a';
  g.fillRect(124, 0, 3, 256);
  g.fillRect(129, 0, 3, 256);
  g.fillStyle = '#d8d8d8';
  for (const x of [66, 189]) for (let y = 0; y < 256; y += 64) g.fillRect(x, y, 3, 34);
  return tex(c, true, 8);
}

export function pavingTexture(): THREE.Texture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#9a9a96';
  g.fillRect(0, 0, 256, 256);
  const rnd = mulberry32(3);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = 140 + Math.floor(rnd() * 30);
      g.fillStyle = `rgb(${v},${v},${v - 4})`;
      g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
    }
  }
  return tex(c, true);
}

export function grassTexture(): THREE.Texture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#5d7a3a';
  g.fillRect(0, 0, 256, 256);
  const rnd = mulberry32(11);
  for (let i = 0; i < 9000; i++) {
    const r = 70 + rnd() * 50;
    g.fillStyle = `rgba(${r * 0.8},${r * 1.25},${r * 0.55},0.55)`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 2 + rnd() * 3);
  }
  return tex(c, true);
}

/** Tileable water normal map generated from a sum of periodic waves. */
export function waterNormals(): THREE.Texture {
  const S = 256;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  const waves: [number, number, number, number][] = [];
  const rnd = mulberry32(5);
  for (let i = 0; i < 14; i++) {
    waves.push([Math.floor(rnd() * 7) - 3 || 1, Math.floor(rnd() * 7) - 3 || 2, rnd() * 6.28, 0.3 + rnd()]);
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let dx = 0;
      let dy = 0;
      for (const [kx, ky, ph, a] of waves) {
        const p = ((kx * x + ky * y) / S) * Math.PI * 2 + ph;
        const cs = Math.cos(p) * a;
        dx += cs * kx;
        dy += cs * ky;
      }
      const n = new THREE.Vector3(-dx * 0.08, -dy * 0.08, 1).normalize();
      const o = (y * S + x) * 4;
      img.data[o] = (n.x * 0.5 + 0.5) * 255;
      img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}

/** Blueprint style texture for Architect Vision (same UV convention as facades). */
export function blueprintTexture(): THREE.Texture {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#0a2742';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(120,200,255,0.35)';
  g.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    g.beginPath();
    g.moveTo(i * 32, 0);
    g.lineTo(i * 32, S);
    g.stroke();
  }
  g.strokeStyle = 'rgba(220,245,255,0.95)';
  g.lineWidth = 3;
  for (let i = 0; i <= 8; i++) {
    g.beginPath();
    g.moveTo(0, i * 32 + 1);
    g.lineTo(S, i * 32 + 1);
    g.stroke();
  }
  return tex(c, true);
}

export function runwayTexture(): THREE.Texture {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#34363a';
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#e8e8e8';
  g.fillRect(4, 0, 4, 512);
  g.fillRect(248, 0, 4, 512);
  for (let y = 0; y < 512; y += 128) g.fillRect(126, y, 4, 70);
  return tex(c, true);
}

/** Soft round sprite used for lights, particles and stars. */
export function glowSprite(): THREE.Texture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Voronoi-like perforation alpha pattern for canopy shells. */
export function perforationTexture(seed: number): THREE.Texture {
  const S = 256;
  const [c, g] = canvas(S, S);
  const rnd = mulberry32(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i < 40; i++) pts.push([rnd() * S, rnd() * S]);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let d1 = 1e9;
      let d2 = 1e9;
      for (const [px, py] of pts) {
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const dx = x - px - ox * S;
            const dy = y - py - oy * S;
            const d = dx * dx + dy * dy;
            if (d < d1) {
              d2 = d1;
              d1 = d;
            } else if (d < d2) d2 = d;
          }
        }
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const o = (y * S + x) * 4;
      const v = edge < 5 ? 255 : 0;
      img.data[o] = 255;
      img.data[o + 1] = 255;
      img.data[o + 2] = 255;
      img.data[o + 3] = v;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}

/** Neutral grey detail noise, tinted by terrain vertex colours. */
export function detailTexture(): THREE.Texture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#c8c8c8';
  g.fillRect(0, 0, 256, 256);
  const rnd = mulberry32(13);
  for (let i = 0; i < 12000; i++) {
    const v = 150 + Math.floor(rnd() * 105);
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  return tex(c, true);
}
