/** Materials and helpers shared by the car and aircraft meshes. */
import * as THREE from 'three';
import type { G } from './shapes';

/* ------------------------------------------------------------------ shared materials */
export const trimMat = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.55, metalness: 0.2 });
export const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.18, metalness: 1 });
export const plateMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.5 });
export const wheelMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.5,
  metalness: 0.35,
});
export const glassMat = new THREE.MeshStandardMaterial({
  color: 0x18232e,
  roughness: 0.05,
  metalness: 0.9,
  envMapIntensity: 1.6,
});
export const navRed = new THREE.MeshStandardMaterial({
  color: 0x300000,
  emissive: 0xff2a2a,
  emissiveIntensity: 3,
});
export const navGreen = new THREE.MeshStandardMaterial({
  color: 0x003000,
  emissive: 0x2aff5a,
  emissiveIntensity: 3,
});
export const navWhite = new THREE.MeshStandardMaterial({
  color: 0x303030,
  emissive: 0xffffff,
  emissiveIntensity: 3,
});
export const nozzleGlow = new THREE.MeshStandardMaterial({
  color: 0x220800,
  emissive: 0xff7a2a,
  emissiveIntensity: 1.2,
});

export function mesh(g: G, m: THREE.Material, cast = true): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.castShadow = cast;
  me.receiveShadow = true;
  return me;
}
