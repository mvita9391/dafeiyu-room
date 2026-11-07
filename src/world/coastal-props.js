import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clay } from "../core/materials.js";
import { P } from "../core/palette.js";
export function makeCoastalBench() {
  const g = new THREE.Group(),
    mat = clay(P.woodWarm).clone();
  const box = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(0.025, h / 4, d / 4)),
      mat,
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
  };
  for (const z of [-0.24, 0, 0.24]) box(2, 0.1, 0.2, 0, 0.48, z);
  for (const y of [0.7, 0.91]) box(2, 0.17, 0.09, 0, y, -0.3);
  for (const x of [-0.78, 0.78]) {
    box(0.09, 0.6, 0.09, x, 0.67, -0.3);
    box(0.13, 0.08, 0.65, x, 0.72, 0);
  }
  for (const x of [-0.75, 0.75])
    for (const z of [-0.2, 0.2]) box(0.09, 0.43, 0.09, x, 0.22, z);
  return g;
}
export function makeCoastalLantern() {
  const g = new THREE.Group(),
    stone = new THREE.MeshStandardMaterial({ color: 0xddc6a0 }),
    glow = new THREE.MeshStandardMaterial({
      color: 0xffe8ac,
      emissive: 0xffd58c,
      emissiveIntensity: 0.5,
    });
  for (const [w, h, d, y, mat] of [
    [0.7, 0.12, 0.7, 0.06, stone],
    [0.16, 1, 0.16, 0.6, stone],
    [0.5, 0.45, 0.5, 1.3, glow],
    [0.7, 0.1, 0.7, 1.58, stone],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.y = y;
    g.add(m);
  }
  return g;
}
