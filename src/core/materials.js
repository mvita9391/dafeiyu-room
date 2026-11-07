import * as THREE from 'three';
import { P } from './palette.js';

const cache = new Map();

/** 哑光黏土质感（主要材质） */
export function clay(color, o = {}) {
  const key = 'clay' + color + JSON.stringify(o);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: o.roughness ?? 0.82,
    metalness: o.metalness ?? 0.0,
    envMapIntensity: o.env ?? 0.55,
    flatShading: !!o.flat,
    ...o.extra,
  });
  cache.set(key, m);
  return m;
}

/** 布艺：更粗糙、轻微 bump 感 */
export function fabric(color, o = {}) {
  return clay(color, { roughness: 0.95, env: 0.35, ...o });
}

/** 自发光（灯罩、屏幕、窗外天空） */
export function glow(color, intensity = 1, o = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: o.roughness ?? 0.6,
    metalness: 0,
    toneMapped: o.toneMapped ?? true,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
  });
}

/** 玻璃 */
export function glass(color = 0xd8efff, opacity = 0.16) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity,
    transmission: 0.0,
    envMapIntensity: 1.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

export const M = {
  wall: () => clay(P.wall, { roughness: 0.96, env: 0.28 }),
  wallShade: () => clay(P.wallShade, { roughness: 0.97, env: 0.24 }),
  trim: () => clay(P.trim, { roughness: 0.75 }),
  plinth: () => clay(P.plinth, { roughness: 0.8 }),
  plinthDark: () => clay(P.plinthDark, { roughness: 0.85 }),
  wood: () => clay(P.woodWarm, { roughness: 0.78 }),
  woodDark: () => clay(P.woodDark, { roughness: 0.8 }),
  woodLight: () => clay(P.woodLight, { roughness: 0.76 }),
  metal: () => clay(P.metal, { roughness: 0.38, metalness: 0.75, env: 1.0 }),
  leaf: () => clay(P.leaf, { roughness: 0.72 }),
  leafDark: () => clay(P.leafDark, { roughness: 0.75 }),
  pot: () => clay(P.pot, { roughness: 0.86 }),
  fabric: (c) => fabric(c),
  paper: () => clay(P.paper, { roughness: 0.95, env: 0.2 }),
};

export function disposeCache() { cache.forEach((m) => m.dispose()); cache.clear(); }
