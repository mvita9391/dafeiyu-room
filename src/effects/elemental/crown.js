import * as THREE from 'three';
import { createCrystalGeometry, hash11 } from './crystal.js';
import { createCrownBladeMaterial, createCrownFieldMaterial } from './crown-material.js';
import { groundWake } from './lances.js';

export const CROWN_DURATION = 3.05;
const TAU = Math.PI * 2;
const clamp = value => THREE.MathUtils.clamp(value, 0, 1);
const up = new THREE.Vector3(0, 1, 0);
const plane = new THREE.PlaneGeometry(1, 1);
const variants = [23, 42, 61].map(seed => createCrystalGeometry({ seed, taper: .095, bend: .22 }));

export function mountGlacialCrown(root, start, end, spell, owned, mistMap) {
  const { radius, impact } = spell;
  const entryAngle = Math.atan2(start.z - end.z, start.x - end.x);
  const meshSize = (radius + .22) * 2;
  const fieldMaterial = createCrownFieldMaterial(radius, meshSize);
  const field = new THREE.Mesh(plane, fieldMaterial);
  field.name = 'crown-frozen-field';
  field.position.copy(end);
  field.position.y += .045;
  field.rotation.x = -Math.PI / 2;
  field.scale.setScalar(meshSize);
  root.add(field);
  owned.add(fieldMaterial);

  // Stop the advancing frost at the near edge, then let the field spread outward.
  const horizontal = Math.hypot(end.x - start.x, end.z - start.z);
  const wake = horizontal > radius + .16
    ? groundWake(root, start, start.clone().lerp(end, 1 - radius / horizontal), true, owned, .85)
    : null;

  const material = createCrownBladeMaterial();
  owned.add(material);
  const wallCount = Math.round(radius * 25);
  const skirtCount = Math.round(radius * 29);
  const records = Array.from({ length: wallCount + skirtCount }, (_, i) => {
    const tall = i < wallCount;
    const rowIndex = tall ? i : i - wallCount;
    const count = tall ? wallCount : skirtCount;
    const seed = hash11(i + 71.4);
    const angle = entryAngle + (rowIndex + (seed - .5) * .66) / count * TAU;
    const around = Math.acos(Math.cos(angle - entryAngle)) / Math.PI;
    const seat = radius * (tall ? .94 + seed * .11 : .76 + seed * .35);
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const p = end.clone().addScaledVector(radial, seat);
    const wave = .84 + .16 * Math.cos(angle * 3.1 + 1.8);
    const height = tall ? (.73 + seed ** 2 * 1.05) * wave : .20 + seed * .43;
    const width = tall ? .20 + seed * .15 : .17 + seed * .23;
    const lean = new THREE.Vector3(radial.x * (.25 + seed * .45), 1, radial.z * (.25 + seed * .45)).normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, lean);
    rotation.multiply(new THREE.Quaternion().setFromAxisAngle(up, seed * TAU));
    return { p, height, width, rotation, seed, at: impact + around * .34 + (tall ? 0 : .08) + seed * .052 };
  });
  const transform = new THREE.Object3D();
  const rows = variants.map((template, variant) => {
    const shards = records.filter((_, i) => i % variants.length === variant);
    const geometry = template.clone();
    const attribute = (name, values) => {
      const attr = new THREE.InstancedBufferAttribute(values, 1).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attr);
      return attr;
    };
    attribute('aSeed', Float32Array.from(shards, s => s.seed));
    const birth = attribute('aBirth', new Float32Array(shards.length));
    const grow = attribute('aGrow', new Float32Array(shards.length));
    const shatter = attribute('aShatter', new Float32Array(shards.length));
    const mesh = new THREE.InstancedMesh(geometry, material, shards.length);
    mesh.name = 'crown-ice-wall';
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(mesh);
    owned.add(geometry);
    owned.add(mesh);
    return { shards, birth, grow, shatter, mesh };
  });

  const mist = Array.from({ length: 15 }, (_, i) => {
    const angle = entryAngle + i / 15 * TAU;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const seed = hash11(i + 91.1);
    const fog = new THREE.SpriteMaterial({
      map: mistMap, color: '#badff4', transparent: true, depthWrite: false,
    });
    const sprite = new THREE.Sprite(fog);
    sprite.name = 'crown-rim-mist';
    root.add(sprite);
    owned.add(fog);
    return { sprite, radial, seed, at: impact + Math.acos(Math.cos(angle - entryAngle)) / Math.PI * .34 };
  });

  return age => {
    wake?.(age, clamp(age / impact) * 1.06);
    const thaw = clamp((age - 2.04) / .83);
    field.visible = age >= impact && thaw < 1;
    fieldMaterial.uniforms.uTime.value = age;
    fieldMaterial.uniforms.uFreeze.value = clamp((age - impact) / .22) * (1 - thaw * .93) * 1.40;
    fieldMaterial.uniforms.uFade.value = 1 - thaw;
    material.uniforms.uTime.value = age;
    for (const { shards, birth, grow, shatter, mesh } of rows) {
      shards.forEach(({ p, height, width, rotation, seed, at }, i) => {
        const elapsed = age - at;
        const emergence = clamp(elapsed / .19);
        const settle = Math.max(0, elapsed - .19);
        const lift = 1 - (1 - emergence) ** 4 + Math.sin(settle * 15) * Math.exp(-settle * 8) * .18;
        const breaking = clamp((age - 1.92 - seed * .47) / .63);
        transform.position.copy(p);
        transform.position.y -= height * breaking * .43;
        transform.quaternion.copy(rotation);
        transform.scale.set(width, height * Math.max(.0001, lift), width);
        transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix);
        grow.setX(i, clamp(elapsed / .15));
        birth.setX(i, elapsed < 0 ? 0 : .58 * (1 - clamp(elapsed / .38)));
        shatter.setX(i, breaking);
      });
      mesh.instanceMatrix.needsUpdate = birth.needsUpdate = grow.needsUpdate = shatter.needsUpdate = true;
    }
    for (const { sprite, radial, seed, at } of mist) {
      const elapsed = age - at;
      const drift = clamp(elapsed / 2.1);
      sprite.visible = elapsed > 0 && drift < 1;
      sprite.position.copy(end).addScaledVector(radial, radius * (.92 + drift * .46));
      sprite.position.y += .16 + drift * (1.15 + seed * .64);
      sprite.scale.set(1.04 + drift * .74, .80 + drift * .70, 1);
      sprite.material.opacity = (.37 + seed * .14) * Math.sin(drift * Math.PI);
    }
  };
}
