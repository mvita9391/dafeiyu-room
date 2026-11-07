import * as THREE from 'three';

import { TRAINING_TARGETS, spellImpact } from '../../shared/world/combat-targets.js';
const wood = new THREE.MeshStandardMaterial({ color: 0x9c663d, roughness: .83 });
const bands = new THREE.MeshStandardMaterial({ color: 0x53473d, roughness: .89 });
const base = new THREE.MeshStandardMaterial({ color: 0x877967, roughness: .95 });

function part(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeDummy(root, x, z, index) {
  const dummy = new THREE.Group();
  dummy.name = `training-dummy-${index + 1}`;
  dummy.position.set(x, .015, z);
  const pivot = new THREE.Group();
  const material = wood.clone();
  const target = new THREE.MeshStandardMaterial({ color: 0xb55034, roughness: .8 });
  const ring = new THREE.MeshStandardMaterial({ color: 0xf6cc88, roughness: .85 });
  part(dummy, new THREE.CylinderGeometry(.33, .41, .14, 10), base, 0, .07, 0);
  part(pivot, new THREE.CylinderGeometry(.175, .25, 1.46, 9), material, 0, .84, 0);
  part(pivot, new THREE.CylinderGeometry(.181, .186, .10, 9), bands, 0, 1.49, 0);
  part(pivot, new THREE.CylinderGeometry(.24, .246, .12, 9), bands, 0, .27, 0);
  const arms = part(pivot, new THREE.CylinderGeometry(.07, .07, .86, 8), material, 0, .91, 0);
  arms.rotation.z = Math.PI / 2;
  for (const sign of [-1, 1]) {
    const plate = part(pivot, new THREE.CylinderGeometry(.24, .24, .085, 16), target, 0, 1.16, sign * .184);
    plate.rotation.x = Math.PI / 2;
    const bullseye = part(pivot, new THREE.TorusGeometry(.145, .021, 6, 18), ring, 0, 1.16, sign * .234);
    bullseye.castShadow = false;
    part(pivot, new THREE.SphereGeometry(.047, 8, 6), ring, 0, 1.16, sign * .24);
  }
  dummy.add(pivot);
  root.add(dummy);
  return {
    dummy, pivot, material, target, age: Infinity,
    position: new THREE.Vector3(x, 0, z), hitX: 0, hitZ: 0,
    volume: new THREE.Sphere(new THREE.Vector3(x, .98, z), .53),
  };
}

export function buildYardTraining(group) {
  const root = new THREE.Group();
  root.name = 'yard-training-range';
  group.add(root);
  const soil = new THREE.MeshStandardMaterial({ color: 0xad8d62, roughness: 1 });
  const pad = part(root, new THREE.BoxGeometry(5.5, .022, 1.55), soil, 9.25, .004, .81);
  pad.castShadow = false;
  const dummies = TRAINING_TARGETS.map(({ position: [x, , z] }, i) => makeDummy(root, x, z, i));
  const numbers = [];
  const intersection = new THREE.Vector3();
  const projected = new THREE.Vector3();

  function hit(entry, spell, start) {
    const { position } = entry;
    entry.age = 0;
    const distance = Math.hypot(position.x - start.x, position.z - start.z) || 1;
    entry.hitX = (position.x - start.x) / distance;
    entry.hitZ = (position.z - start.z) / distance;
    entry.material.emissive.set(spell.color);
    entry.target.emissive.set(spell.color);
    const label = document.createElement('span');
    label.className = 'training-damage';
    label.textContent = String(spell.damage);
    label.style.setProperty('--damage-color', spell.color);
    label.setAttribute('aria-hidden', 'true');
    document.body.append(label);
    numbers.push({ label, position, age: 0, offset: (numbers.length % 3 - 1) * 12 });
  }

  function reset(entry) {
    entry.age = Infinity;
    entry.pivot.rotation.set(0, 0, 0);
    entry.material.emissiveIntensity = entry.target.emissiveIntensity = 0;
  }

  return {
    aimAt(ray) {
      let nearest = null, distance = Infinity;
      for (const entry of dummies) {
        if (!ray.intersectSphere(entry.volume, intersection)) continue;
        const along = intersection.distanceToSquared(ray.origin);
        if (along < distance) { nearest = entry.position; distance = along; }
      }
      return nearest;
    },
    planHits(spell, start, end) {
      const startPosition = start.toArray(), endPosition = end.toArray();
      return dummies.flatMap(entry => {
        const at = spellImpact(spell, startPosition, endPosition, entry.position.toArray());
        return at === null ? [] : [{ at, position: entry.position, apply: () => hit(entry, spell, start) }];
      });
    },
    update(dt, camera) {
      for (const entry of dummies) {
        if (!Number.isFinite(entry.age)) continue;
        entry.age += dt;
        const t = entry.age;
        if (t >= .46) { reset(entry); continue; }
        const bend = Math.sin(t * 24) * Math.exp(-t * 8) * .34;
        entry.pivot.rotation.set(entry.hitZ * bend, 0, -entry.hitX * bend);
        const flash = Math.max(0, 1 - t / .21);
        entry.material.emissiveIntensity = flash * 1.35;
        entry.target.emissiveIntensity = flash * 2.4;
      }
      for (let i = numbers.length - 1; i >= 0; i--) {
        const item = numbers[i];
        item.age += dt;
        if (item.age >= .92) { item.label.remove(); numbers.splice(i, 1); continue; }
        projected.copy(item.position);
        projected.y += 1.65 + item.age * .92;
        projected.project(camera);
        item.label.hidden = projected.z < -1 || projected.z > 1 ||
          Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
        const x = (projected.x + 1) * innerWidth / 2 + item.offset;
        const y = (1 - projected.y) * innerHeight / 2;
        const pop = 1 + Math.sin(Math.min(item.age * 8, Math.PI)) * .35;
        item.label.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${pop})`;
        item.label.style.opacity = Math.min(1, (.92 - item.age) / .24);
      }
    },
    clear() {
      for (const item of numbers.splice(0)) item.label.remove();
      dummies.forEach(reset);
    },
  };
}
