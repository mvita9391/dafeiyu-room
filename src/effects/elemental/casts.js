import * as THREE from 'three';
import { createCrystalGeometry, hash11 } from './crystal.js';
import { mountNovaBeam } from './nova/beam.js';
import { mountFrostLance, mountStormLance } from './lances.js';
import { mountGlacialCrown, CROWN_DURATION } from './crown.js';

const TAU = Math.PI * 2;
const clamp = value => THREE.MathUtils.clamp(value, 0, 1);
const up = new THREE.Vector3(0, 1, 0);
const core = new THREE.IcosahedronGeometry(1, 1);
const stone = new THREE.DodecahedronGeometry(1);
const crystal = [5, 7, 9].map(seed => createCrystalGeometry({ seed }));
const sparkSize = 32;
const sparkPixels = new Uint8Array(sparkSize * sparkSize * 4);
for (let y = 0; y < sparkSize; y++) {
  for (let x = 0; x < sparkSize; x++) {
    const i = (x + y * sparkSize) * 4;
    const r = Math.hypot((x + .5) / sparkSize * 2 - 1, (y + .5) / sparkSize * 2 - 1);
    sparkPixels.set([255, 255, 255, Math.round(255 * Math.max(0, 1 - r) ** 2)], i);
  }
}
const sparkMap = new THREE.DataTexture(sparkPixels, sparkSize, sparkSize);
sparkMap.magFilter = sparkMap.minFilter = THREE.LinearFilter;
sparkMap.needsUpdate = true;

function glow(color, opacity = .88, power = 1.65) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(power), opacity,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export function createCastAim() {
  const root = new THREE.Group();
  root.name = 'spell-aim-indicator';
  const shape = new THREE.Shape();
  shape.moveTo(-.12, 0); shape.lineTo(.12, 0); shape.lineTo(.12, .83);
  shape.lineTo(.34, .83); shape.lineTo(0, 1); shape.lineTo(-.34, .83);
  shape.lineTo(-.12, .83); shape.closePath();
  const material = glow('#97ecff', .68, 1);
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  const circle = new THREE.Mesh(new THREE.RingGeometry(.93, 1, 56), material);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 56), glow('#97ecff', .12, 1));
  for (const item of [arrow, circle, fill]) item.rotation.x = Math.PI / 2;
  root.add(arrow, circle, fill);
  root.visible = false;
  return {
    root,
    show(spell, start, end, obstructed = false) {
      const zone = spell.kind === 'zone';
      root.visible = true;
      root.position.copy(zone ? end : start);
      root.position.y += .035;
      root.rotation.y = zone ? 0 : Math.atan2(end.x - start.x, end.z - start.z);
      arrow.visible = !zone;
      arrow.scale.y = spell.range;
      circle.visible = fill.visible = zone;
      if (zone) {
        circle.scale.setScalar(spell.radius);
        fill.scale.copy(circle.scale);
      }
      material.color.set(spell.color);
      material.opacity = obstructed ? .34 : .68;
      fill.material.color.set(spell.color);
    },
  };
}

export function spawnElementalCast(spell, start, end, hits = [], hand, playSound) {
  const root = new THREE.Group();
  root.name = `elemental-${spell.id}`;
  const updates = [];
  const owned = new Set();
  const color = spell.color;
  const distance = start.distanceTo(end);
  const forward = new THREE.Vector3().subVectors(end, start).setY(0).normalize();
  const side = new THREE.Vector3(forward.z, 0, -forward.x);
  const onLine = t => start.clone().lerp(end, t);
  const height = (p, y) => p.clone().addScaledVector(up, y);
  const launch = hand ?? height(start, .95);

  function mesh(geometry, material, p, ownGeometry = false) {
    const object = new THREE.Mesh(geometry, material);
    object.position.copy(p);
    root.add(object);
    owned.add(material);
    if (ownGeometry) owned.add(geometry);
    return object;
  }

  function ring(p, delay, radius, tint = color) {
    const material = glow(tint, .85);
    const object = mesh(new THREE.RingGeometry(.90, 1, 56), material, height(p, .04), true);
    object.rotation.x = -Math.PI / 2;
    updates.push(t => {
      const k = clamp((t - delay) / .62);
      object.visible = t >= delay && k < 1;
      object.scale.setScalar(radius * (.18 + .82 * (1 - (1 - k) ** 2)));
      material.opacity = .85 * (1 - k);
    });
  }

  function flare(p, delay, size, tint = color) {
    const material = new THREE.SpriteMaterial({
      map: sparkMap, color: new THREE.Color(tint).multiplyScalar(3.6),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(p);
    root.add(sprite);
    owned.add(material);
    updates.push(t => {
      const k = clamp((t - delay) / .40);
      sprite.visible = t >= delay && k < 1;
      sprite.scale.setScalar(size * (.46 + 1.5 * k ** .55));
      material.opacity = (1 - k) ** 2;
    });
  }

  function particles(p, delay, amount, spread, tint = color) {
    const positions = new Float32Array(amount * 3);
    const velocity = Array.from({ length: amount }, (_, i) => {
      const angle = hash11(i + .4) * TAU;
      const speed = spread * (.35 + hash11(i + 9.2));
      return [Math.cos(angle) * speed, .8 + hash11(i + 18) * 2.4, Math.sin(angle) * speed];
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: new THREE.Color(tint).multiplyScalar(2.8), map: sparkMap, size: .14, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const object = new THREE.Points(geometry, material);
    object.position.copy(height(p, .08));
    object.frustumCulled = false;
    root.add(object); owned.add(material); owned.add(geometry);
    updates.push(t => {
      const age = t - delay;
      object.visible = age >= 0 && age < .95;
      if (!object.visible) return;
      for (let i = 0; i < amount; i++) {
        const [x, y, z] = velocity[i];
        positions[i * 3] = age * x;
        positions[i * 3 + 1] = Math.max(.015, age * y - 2.6 * age * age);
        positions[i * 3 + 2] = age * z;
      }
      geometry.attributes.position.needsUpdate = true;
      material.opacity = (1 - age / .95) ** 1.5;
    });
  }

  function pillars(items, rocky = false) {
    const material = new THREE.MeshStandardMaterial({
      color: rocky ? '#80654e' : color, emissive: rocky ? '#623323' : '#328ab8',
      emissiveIntensity: rocky ? .18 : .62, roughness: rocky ? .94 : .25,
    });
    owned.add(material);
    const dummy = new THREE.Object3D();
    const geometries = rocky ? [stone] : crystal;
    geometries.forEach((geometry, variant) => {
      const subset = items.filter((_, i) => i % geometries.length === variant);
      const instances = new THREE.InstancedMesh(geometry, material, subset.length);
      instances.frustumCulled = false;
      root.add(instances);
      owned.add(instances);
      updates.push(t => {
        subset.forEach(({ p, delay, size, width, angle }, i) => {
          const rise = 1 - (1 - clamp((t - delay) / .26)) ** 3;
          const fall = 1 - clamp((t - 1.05 - delay) / .50);
          const amount = Math.max(.0001, rise * fall);
          dummy.position.copy(p);
          if (rocky) dummy.position.y += size * amount * .48;
          dummy.rotation.set(.15, angle, -.26);
          dummy.scale.set(width * amount, size * amount * (rocky ? .55 : 1), width * amount);
          dummy.updateMatrix();
          instances.setMatrixAt(i, dummy.matrix);
        });
        instances.instanceMatrix.needsUpdate = true;
      });
    });
  }

  function streak(points, tint, width, delay, span, flicker = false) {
    const path = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const material = glow(tint);
    const object = mesh(new THREE.TubeGeometry(path, points.length * 3, width, 5), material, new THREE.Vector3(), true);
    updates.push(t => {
      const age = t - delay;
      object.visible = age >= 0 && age < span;
      material.opacity = Math.min(1, Math.max(0, age) * 28) * (1 - clamp(age / span)) ** .6;
      if (flicker) material.opacity *= .52 + .48 * Math.abs(Math.sin(age * 85 + width * 90));
    });
  }

  switch (spell.id) {
    case 'frost': {
      updates.push(mountFrostLance(root, start, end, side, spell.impact, owned, sparkMap));
      for (const t of [.22, .46, .68, .88]) {
        particles(onLine(t), t * spell.impact, 20, .65 + t * .52, '#d4f5ff');
      }
      ring(end, spell.impact, 1.55, '#bef4ff');
      particles(end, spell.impact, 76, 2.4, '#d4f5ff');
      break;
    }
    case 'rift': {
      const count = Math.max(14, Math.ceil(distance * 7));
      const items = Array.from({ length: count }, (_, i) => {
        const t = (i + 1) / count;
        const p = onLine(t).addScaledVector(side, (hash11(i + 4) - .5) * (.28 + t * .9));
        return { p, delay: t * spell.impact, size: (.32 + t ** 2 * 1.38) * (.45 + hash11(i + 1.3)),
          width: .53 * (.55 + hash11(i + 8)), angle: hash11(i + 12) * TAU };
      });
      pillars(items, true);
      ring(end, .32, 1.35);
      particles(end, .32, 60, 2.3);
      break;
    }
    case 'storm': {
      updates.push(mountStormLance(root, launch, start, end, side, spell.impact, owned));
      for (const t of [.25, .51, .78]) {
        particles(onLine(t), t * spell.impact, 14, .72, '#6ccaff');
      }
      ring(end, spell.impact, 2.4, '#def7ff');
      particles(end, spell.impact, 68, 2.8, '#8cd7ff');
      break;
    }
    case 'beam': {
      updates.push(mountNovaBeam(root, launch, height(end, .65), side, spell.impact, owned));
      ring(end, spell.impact, 2.1, '#b6eeff');
      ring(end, spell.impact + .16, 2.65, '#83d8ff');
      for (const t of [.22, .45, .68, .90]) {
        particles(onLine(t), .28 + t * .14, 20, 1.15, '#6ccfff');
      }
      particles(end, spell.impact, 62, 2.5, '#bcefff');
      break;
    }
    case 'meteor': {
      const impact = spell.impact;
      const rock = mesh(stone, new THREE.MeshStandardMaterial({
        color: '#593127', emissive: '#f9551c', emissiveIntensity: .74, roughness: .9,
      }), start);
      const embers = Array.from({ length: 9 }, () => mesh(core, glow('#ff793f', .55), start));
      const fragments = Array.from({ length: 12 }, (_, i) => {
        const angle = i / 12 * TAU;
        const speed = spell.radius * (1.3 + hash11(i + .9) * 1.8);
        return {
          mesh: mesh(stone, rock.material, end),
          velocity: new THREE.Vector3(Math.cos(angle) * speed, 2 + hash11(i + 3) * 3.3, Math.sin(angle) * speed),
          size: .11 + hash11(i + 7) * .20,
        };
      });
      const fly = k => launch.clone().lerp(end, k).addScaledVector(up, 3.1 * Math.sin(k * Math.PI));
      updates.push(t => {
        const age = t / impact;
        rock.visible = age < 1;
        rock.position.copy(fly(clamp(age)));
        rock.rotation.set(t * 4, t * 3, t * 5);
        rock.scale.setScalar(.43 + .25 * clamp(age));
        embers.forEach((ember, i) => {
          const k = age - (i + 1) * .04;
          ember.visible = k > 0 && age < 1.1;
          ember.position.copy(fly(clamp(k)));
          ember.scale.setScalar(.39 * (1 - i / 10));
        });
        const flight = t - impact;
        for (const fragment of fragments) {
          fragment.mesh.visible = flight >= 0 && flight < .8;
          if (!fragment.mesh.visible) continue;
          fragment.mesh.position.copy(end).addScaledVector(fragment.velocity, flight);
          fragment.mesh.position.y = Math.max(end.y + .06, fragment.mesh.position.y - 5 * flight ** 2);
          fragment.mesh.rotation.set(flight * 11, flight * 9, fragment.velocity.z);
          fragment.mesh.scale.setScalar(fragment.size * (1 - clamp((flight - .48) / .32)));
        }
      });
      ring(end, impact, spell.radius * 1.55);
      ring(end, impact + .10, spell.radius * 1.85, '#ffc18a');
      particles(end, impact, 100, spell.radius * 2.9);
      break;
    }
    case 'snare': {
      const rim = Array.from({ length: 25 }, (_, i) => {
        const a = i / 24 * TAU, r = spell.radius * (.96 + .09 * hash11(i + 2));
        return height(end, .07 + hash11(i + 8) * .28).add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      });
      streak(rim, color, .037, .14, 1.3, true);
      for (let j = 0; j < 4; j++) {
        const spiral = Array.from({ length: 12 }, (_, i) => {
          const t = i / 11, a = j * TAU / 4 + t * 5, r = spell.radius * (1 - t * .91);
          return height(end, t * 2.65).add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        });
        streak(spiral, j % 2 ? color : '#e7dfff', .023, .18 + j * .04, 1.2, true);
      }
      ring(end, .1, spell.radius);
      particles(end, .28, 46, spell.radius * .82);
      break;
    }
    case 'crown': {
      updates.push(mountGlacialCrown(root, start, end, spell, owned, sparkMap));
      ring(end, spell.impact, spell.radius, '#dcf7ff');
      for (let i = 0; i < 6; i++) {
        const angle = i * TAU / 6;
        const rim = end.clone().add(new THREE.Vector3(Math.cos(angle) * spell.radius, 0, Math.sin(angle) * spell.radius));
        particles(rim, spell.impact + i * .047, 11, 1.05, '#ddfaff');
        particles(height(rim, .55), 1.98 + i * .065, 8, .85, '#b0eaff');
      }
      break;
    }
    case 'bloom': {
      const petals = Array.from({ length: 11 }, (_, i) => {
        const angle = i / 11 * TAU;
        const petal = mesh(core, glow(i % 2 ? '#a2ed9a' : '#ddffa0', .7), end);
        petal.rotation.y = angle;
        return { angle, petal };
      });
      for (let j = 0; j < 5; j++) {
        const vine = Array.from({ length: 10 }, (_, i) => {
          const t = i / 9, a = j * TAU / 5 + t * 2.8, r = spell.radius * (.7 - t * .61);
          return height(end, t * 1.05).add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        });
        streak(vine, '#75d18b', .046, .12 + .06 * j, 1.6);
      }
      updates.push(t => {
        const open = clamp((t - .26) / .48) * (1 - clamp((t - 1.35) / .55));
        petals.forEach(({ angle, petal }) => {
          petal.visible = open > 0;
          const spread = spell.radius * .37 * open;
          petal.position.set(end.x + Math.sin(angle) * spread, end.y + .38 + .68 * open, end.z + Math.cos(angle) * spread);
          petal.scale.set(.12 * open, .13 * open, .35 * open);
        });
      });
      ring(end, .14, spell.radius);
      particles(end, .58, 52, spell.radius);
      break;
    }
  }

  flare(launch, 0, spell.id === 'beam' ? 1.9 : 1.25);
  flare(height(end, .48), spell.impact, spell.id === 'meteor' ? 3.4 : 2.1);
  for (const hit of hits) {
    flare(height(hit.position, 1.14), hit.at, 1.35, '#fff3cf');
    particles(height(hit.position, .94), hit.at, 18, 1.15);
  }
  let age = 0;
  const pendingHits = [...hits].sort((a, b) => a.at - b.at);
  let nextHit = 0;
  let playedSpell = false;
  let lastHitSound = -Infinity;
  const soundTime = spell.id === 'beam' ? spell.impact - .14 : spell.impact;
  const update = dt => {
    age += dt;
    updates.forEach(step => step(age));
    if (!playedSpell && age >= soundTime) {
      playedSpell = true;
      playSound?.(`spell-${spell.id}`);
    }
    while (nextHit < pendingHits.length && pendingHits[nextHit].at <= age) {
      pendingHits[nextHit++].apply();
      if (age - lastHitSound >= .11) {
        playSound?.('spell-wood');
        lastHitSound = age;
      }
    }
    return age < (spell.id === 'crown' ? CROWN_DURATION : 2.05);
  };
  playSound?.('spell-cast');
  update(0);
  return { root, update, dispose() { root.removeFromParent(); for (const resource of owned) resource.dispose(); } };
}
