import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'uv'];

/**
 * 把一棵子树里的静态网格按 (材质, castShadow) 合桶合并，减少 draw call。
 * - 透明材质、InstancedMesh、SkinnedMesh、userData.noMerge、exclude 里的对象不参与
 * - 合并后原对象从父节点移除
 * 返回 { before, after, merged, skipped }
 */
export function mergeStatic(root, { exclude = new Set() } = {}) {
  root.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const buckets = new Map();
  const victims = [];
  let before = 0;

  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    before += 1;
    if (exclude.has(o) || o.userData.noMerge) return;
    const mat = o.material;
    if (!mat || Array.isArray(mat) || mat.transparent) return;
    if (o.geometry?.morphAttributes && Object.keys(o.geometry.morphAttributes).length) return;
    const key = `${mat.uuid}|${o.castShadow ? 1 : 0}`;
    let b = buckets.get(key);
    if (!b) { b = { mat, cast: o.castShadow, geos: [] }; buckets.set(key, b); }
    let g = o.geometry.clone();
    if (g.index) { const ng = g.toNonIndexed(); g.dispose(); g = ng; }
    // 只保留通用属性，避免 mergeGeometries 因属性不一致失败
    for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    const m = new THREE.Matrix4().multiplyMatrices(invRoot, o.matrixWorld);
    g.applyMatrix4(m);
    b.geos.push(g);
    victims.push(o);
  });

  for (const o of victims) o.parent?.remove(o);

  let merged = 0;
  for (const b of buckets.values()) {
    if (b.geos.length < 2) {
      // 单个网格没合并价值，重建回去
      const m = new THREE.Mesh(b.geos[0], b.mat);
      m.castShadow = b.cast; m.receiveShadow = true;
      root.add(m);
      merged += 1;
      continue;
    }
    const geo = mergeGeometries(b.geos, false);
    if (!geo) continue;
    b.geos.forEach((g) => g.dispose());
    const m = new THREE.Mesh(geo, b.mat);
    m.castShadow = b.cast; m.receiveShadow = true;
    root.add(m);
    merged += 1;
  }

  return { before, after: merged, merged };
}
