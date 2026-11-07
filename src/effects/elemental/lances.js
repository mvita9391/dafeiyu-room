import * as THREE from 'three';
import { createCrystalGeometry, hash11 } from './crystal.js';
import { createIceMaterial } from './ice-material.js';
import { createBoltRibbonGeometry } from './nova/geometry.js';
import { BoltPass, createLightningMaterial } from './lightning-material.js';
import { createStormShellMaterial } from './storm-shell.js';
import { noiseGLSL } from './noise.js';

const TAU = Math.PI * 2;
const clamp = value => THREE.MathUtils.clamp(value, 0, 1);
const crystals = [5, 7, 9].map(seed => createCrystalGeometry({ seed, taper: .16, bend: .27 }));
const ribbons = createBoltRibbonGeometry(72, 9);
const hemisphere = new THREE.SphereGeometry(1, 38, 22, 0, TAU, 0, Math.PI / 2);
const groundPlane = new THREE.PlaneGeometry(1, 1);

export function groundWake(root, start, end, ice, owned, width = ice ? 2.6 : 1.75) {
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uAge: { value: 0 }, uFront: { value: 0 }, uLength: { value: length } },
    defines: ice ? { FROST_WAKE: 1 } : {},
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uAge, uFront, uLength;
      ${noiseGLSL}
      void main() {
        float x = vUv.x * 2.0 - 1.0;
        float t = vUv.y;
        vec3 p = vec3(x * 4.7, t * uLength * 3.5, 2.7);
        float noise = snoise(p);
        float width = mix(.19, .85, pow(t, .8)) + noise * .13;
        float mask = (1.0 - smoothstep(width * .65, width, abs(x))) * smoothstep(0.0, .09, t);
        mask *= 1.0 - smoothstep(uFront - .06, uFront + .02, t);
        mask *= 1.0 - smoothstep(1.15, 1.96, uAge);
        #ifdef FROST_WAKE
          float frost = smoothstep(.37, .76, ridged(p * 2.4, 4));
          vec3 color = mix(vec3(.15, .49, .71), vec3(.80, .96, 1.0), frost);
          float alpha = mask * (.34 + frost * .6);
        #else
          float crack = smoothstep(.64, .87, ridged(p * vec3(1.6, .72, 1.0), 4));
          float glow = crack * (.66 + .34 * sin(uAge * 22.0 + t * 38.0));
          vec3 color = mix(vec3(.022, .036, .075), vec3(.31, .83, 2.4), glow);
          float alpha = mask * (.27 + glow * .69);
        #endif
        if (alpha < .007) discard;
        gl_FragColor = vec4(color, alpha);
      }`,
  });
  const mesh = new THREE.Mesh(groundPlane, material);
  mesh.name = ice ? 'frost-ground-rime' : 'storm-ground-arcs';
  mesh.position.copy(start).lerp(end, .5);
  mesh.position.y += .045;
  mesh.rotation.order = 'YXZ';
  mesh.rotation.set(-Math.PI / 2, Math.atan2(end.x - start.x, end.z - start.z) + Math.PI, 0);
  mesh.scale.set(width, length, 1);
  root.add(mesh);
  owned.add(material);
  return (age, front) => {
    material.uniforms.uAge.value = age;
    material.uniforms.uFront.value = front;
  };
}

export function mountFrostLance(root, start, end, side, impact, owned, mistMap) {
  const lineLength = Math.hypot(end.x - start.x, end.z - start.z);
  const count = Math.min(76, Math.max(21, Math.ceil(lineLength * 10)));
  const rise = [];
  for (let i = 0; i < count; i++) {
    const t = (i + .5) / count;
    const seed = hash11(i + 12.5);
    const p = start.clone().lerp(end, t).addScaledVector(side, (seed - .5) * (.34 + t * 1.56));
    const blade = i % 3 === 0;
    rise.push({ p, t, seed, height: (.19 + 2.05 * t ** 2.15) * (blade ? .74 + seed * .50 : .19 + seed * .50),
      width: (.25 + .27 * t) * (.59 + hash11(i + 18) * .8) });
  }
  for (let i = 0; i < 13; i++) {
    const a = i / 13 * TAU;
    const seed = hash11(i + 133);
    const p = end.clone().add(new THREE.Vector3(Math.cos(a) * (.23 + seed * .49), 0, Math.sin(a) * (.23 + seed * .49)));
    rise.push({ p, t: 1, seed, height: .78 + seed ** 1.1 * 1.97, width: .23 + seed * .25 });
  }

  const material = createIceMaterial();
  owned.add(material);
  const matrix = new THREE.Object3D();
  const fields = crystals.map((template, index) => {
    const blades = rise.filter((_, i) => i % crystals.length === index);
    const geo = template.clone();
    const seeds = new THREE.InstancedBufferAttribute(Float32Array.from(blades, b => b.seed), 1);
    const birth = new THREE.InstancedBufferAttribute(new Float32Array(blades.length), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSeed', seeds);
    geo.setAttribute('aBirth', birth);
    const mesh = new THREE.InstancedMesh(geo, material, blades.length);
    mesh.name = 'frost-eruption';
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(mesh);
    owned.add(geo);
    owned.add(mesh);
    return { blades, birth, mesh };
  });
  const wake = groundWake(root, start, end, true, owned);

  const mist = Array.from({ length: 15 }, (_, i) => {
    const t = (i + 1) / 15;
    const seed = hash11(i + 29);
    const p = start.clone().lerp(end, t).addScaledVector(side, (seed - .5) * 1.3);
    const fog = new THREE.SpriteMaterial({
      color: '#b6e6fb', map: mistMap, transparent: true, depthWrite: false, opacity: 0,
    });
    const sprite = new THREE.Sprite(fog);
    root.add(sprite);
    owned.add(fog);
    return { sprite, fog, p, t, seed };
  });

  return (age) => {
    material.userData.uniforms.uTime.value = age;
    wake(age, clamp(age / impact) * 1.05);
    for (const { blades, birth, mesh } of fields) {
      blades.forEach(({ p, t, seed, height, width }, i) => {
        const ageOfBlade = age - t * impact - seed * .043;
        const emerge = clamp(ageOfBlade / .19);
        const lift = 1 - (1 - emerge) ** 3;
        const settle = Math.sin(emerge * Math.PI) * .22;
        const sink = 1 - clamp((age - 1.32 - t * .23) / .43);
        const visible = Math.max(.0001, (lift + settle) * sink);
        matrix.position.copy(p);
        matrix.rotation.set((seed - .5) * .67, seed * TAU, (seed - .42) * .63);
        matrix.scale.set(width * visible, height * visible, width * visible);
        matrix.updateMatrix();
        mesh.setMatrixAt(i, matrix.matrix);
        birth.setX(i, ageOfBlade >= 0 ? .48 * (1 - clamp(ageOfBlade / .36)) : 0);
      });
      mesh.instanceMatrix.needsUpdate = birth.needsUpdate = true;
    }
    for (const { sprite, fog, p, t, seed } of mist) {
      const phase = clamp((age - t * impact) / 1.45);
      sprite.visible = phase > 0 && phase < 1;
      sprite.position.copy(p).addScaledVector(side, (seed - .5) * 1.4 * phase);
      sprite.position.y += .16 + phase * (.24 + t * .61);
      sprite.scale.set((.85 + t * .73) * (1 + phase), (.52 + t * .48) * (1 + phase), 1);
      fog.opacity = Math.sin(phase * Math.PI) * (.36 + t * .25);
    }
  };
}

export function mountStormLance(root, origin, start, end, side, impact, owned) {
  const tip = end.clone();
  tip.y += .20;
  const state = {
    uTime: { value: 0 }, uOrigin: { value: origin }, uTarget: { value: tip },
    uSide: { value: side }, uSeed: { value: Math.random() },
    uProgress: { value: 0 }, uFade: { value: 1 },
  };
  const passes = [BoltPass.GLOW, BoltPass.CORE].map(pass => {
    const material = createLightningMaterial(pass, state);
    const mesh = new THREE.Mesh(ribbons, material);
    mesh.name = pass === BoltPass.CORE ? 'storm-filaments' : 'storm-halo';
    mesh.frustumCulled = false;
    root.add(mesh);
    owned.add(material);
    return mesh;
  });
  const impactMaterial = createStormShellMaterial();
  const dome = new THREE.Mesh(hemisphere, impactMaterial);
  dome.name = 'storm-ionized-dome';
  dome.position.copy(end);
  dome.position.y += .04;
  root.add(dome);
  owned.add(impactMaterial);
  const wake = groundWake(root, start, end, false, owned);

  return (age) => {
    const progress = clamp(age / impact) * 1.08;
    const fade = 1 - clamp((age - .28) / .31);
    state.uTime.value = age;
    state.uProgress.value = progress;
    state.uFade.value = fade;
    for (const pass of passes) pass.visible = age > 0 && fade > 0;
    wake(age, progress);

    const shock = clamp((age - impact) / .72);
    dome.visible = age >= impact && shock < 1;
    const radius = .28 + 1.38 * (1 - (1 - shock) ** 2);
    dome.scale.set(radius, radius * .88, radius);
    impactMaterial.uniforms.uAge.value = shock;
    impactMaterial.uniforms.uTime.value = age;
  };
}
