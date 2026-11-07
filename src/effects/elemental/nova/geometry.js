/*! From LinearAbiltyCastingThreeJS at 97f1de1. Copyright (c) 2026 mohamedachrefelouafi. MIT, see /licenses/elemental-sandbox.txt. */
import { BufferGeometry, BufferAttribute, InstancedBufferGeometry, InstancedBufferAttribute, Sphere, Vector3 } from 'three';

export function createBoltRibbonGeometry(nodes = 72, strands = 24) {
  const steps = Math.max(2, Math.round(nodes));
  const count = Math.max(1, Math.round(strands));

  const positions = new Float32Array(steps * 2 * 3);
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const o = i * 6;
    positions[o + 0] = t;
    positions[o + 1] = -1;
    positions[o + 3] = t;
    positions[o + 4] = 1;
  }

  const indices = new Uint16Array((steps - 1) * 6);
  for (let i = 0; i < steps - 1; i++) {
    const a = i * 2;
    const o = i * 6;
    indices[o + 0] = a;
    indices[o + 1] = a + 1;
    indices[o + 2] = a + 2;
    indices[o + 3] = a + 1;
    indices[o + 4] = a + 3;
    indices[o + 5] = a + 2;
  }

  const strandIndex = new Float32Array(count);
  for (let i = 0; i < count; i++) strandIndex[i] = i;

  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aStrand', new InstancedBufferAttribute(strandIndex, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.instanceCount = count;
  // The bolt is built in world space in the vertex shader, so the geometry's own
  // bounds are meaningless — cull it manually instead (the ability sets
  // `frustumCulled = false`).
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/* ---------------------------------------------------------------------- */
/* Beam                                                                    */
/* ---------------------------------------------------------------------- */

/**
 * The column a beam is drawn on — a tube in *parameter* space.
 *
 * Same trick as the bolt ribbon, one dimension richer: every vertex carries
 * `position = (t, a, 0)`, where `t` runs 0 → 1 from the muzzle to the impact
 * point and `a` runs 0 → 1 once around the barrel. There are no metres in here
 * either; `materials/BeamMaterial.js` turns that pair into a world position
 * every frame, so one tube serves a beam of any length and any profile.
 *
 * Real tube rather than the camera-facing ribbon the bolt uses, because a beam
 * this thick has to *have* a cross-section: the silhouette has to bow correctly
 * when you orbit around it, the far wall has to add through the near one, and
 * the shock rings have to be able to hug it. A ribbon can fake none of that.
 *
 * The seam column is duplicated so `a` reaches a full 1.0 instead of wrapping
 * to 0 — the angular noise in the shader would otherwise show a hard join line
 * down the length of the beam.
 *
 * @param {number} nodes samples along the column; the profile detail ceiling
 * @param {number} sides facets around the barrel (20–32 reads clean)
 */
export function createBeamTubeGeometry(nodes = 96, sides = 26) {
  const steps = Math.max(2, Math.round(nodes));
  const facets = Math.max(3, Math.round(sides));
  const columns = facets + 1;

  const positions = new Float32Array(steps * columns * 3);
  let v = 0;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    for (let j = 0; j < columns; j++) {
      positions[v++] = t;
      positions[v++] = j / facets;
      positions[v++] = 0;
    }
  }

  const indices = new Uint16Array((steps - 1) * facets * 6);
  let k = 0;
  for (let i = 0; i < steps - 1; i++) {
    for (let j = 0; j < facets; j++) {
      const a = i * columns + j;
      const b = a + columns;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = a + 1;
      indices[k++] = b;
      indices[k++] = b + 1;
      indices[k++] = a + 1;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  // Placed in world space by the vertex shader, like the bolt — its own bounds
  // mean nothing (the ability sets `frustumCulled = false`).
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * The shock discs that race down a beam — an instanced annulus, again in
 * parameter space: `position = (band, a, 0)` with `band` 0 at the inner lip and
 * 1 at the outer one, and `a` once around.
 *
 * One instance is one disc, and `aRing` is only its index — the shader spaces
 * the discs evenly along the column from it and slides them downrange, so the
 * whole train is a function of the clock rather than a queue on the CPU.
 *
 * @param {number} rings    instance capacity (the live count is `instanceCount`)
 * @param {number} segments facets around one disc
 */
export function createBeamRingGeometry(rings = 10, segments = 44) {
  const count = Math.max(1, Math.round(rings));
  const facets = Math.max(6, Math.round(segments));
  const columns = facets + 1;

  const positions = new Float32Array(2 * columns * 3);
  let v = 0;
  for (let band = 0; band < 2; band++) {
    for (let j = 0; j < columns; j++) {
      positions[v++] = band;
      positions[v++] = j / facets;
      positions[v++] = 0;
    }
  }

  const indices = new Uint16Array(facets * 6);
  let k = 0;
  for (let j = 0; j < facets; j++) {
    const a = j;
    const b = columns + j;
    indices[k++] = a;
    indices[k++] = b;
    indices[k++] = a + 1;
    indices[k++] = b;
    indices[k++] = b + 1;
    indices[k++] = a + 1;
  }

  const ringIndex = new Float32Array(count);
  for (let i = 0; i < count; i++) ringIndex[i] = i;

  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aRing', new InstancedBufferAttribute(ringIndex, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.instanceCount = count;
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}
