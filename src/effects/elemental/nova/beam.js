import { IcosahedronGeometry, Mesh } from 'three';
import { createBeamRingGeometry, createBeamTubeGeometry, createBoltRibbonGeometry } from './geometry.js';
import { BeamPass, createBeamMaterial } from './material.js';

const tube = createBeamTubeGeometry();
const coils = createBoltRibbonGeometry(128, 4);
const rings = createBeamRingGeometry(10);
const sphere = new IcosahedronGeometry(1, 3);

export function mountNovaBeam(root, origin, target, side, impact, owned) {
  const state = {
    uTime: { value: 0 },
    uOrigin: { value: origin }, uTarget: { value: target }, uSide: { value: side },
    uSeed: { value: Math.random() }, uProgress: { value: 0 },
    uFade: { value: 1 }, uWidthFade: { value: 1 }, uCharge: { value: 0 },
  };
  const makePass = (geometry, pass, uniforms, name) => {
    const material = createBeamMaterial(pass, uniforms);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.frustumCulled = false;
    root.add(mesh);
    owned.add(material);
    return mesh;
  };
  const column = [
    makePass(tube, BeamPass.HALO, state, 'nova-halo'),
    makePass(tube, BeamPass.SHELL, state, 'nova-sheath'),
    makePass(tube, BeamPass.CORE, state, 'nova-core'),
    makePass(coils, BeamPass.COIL, state, 'nova-gold-coils'),
    makePass(rings, BeamPass.RING, state, 'nova-shock-rings'),
  ];
  const orb = makePass(sphere, BeamPass.ORB, state, 'nova-charge');
  orb.position.copy(origin);
  const burstState = { ...state, uFade: { value: 0 }, uCharge: { value: 1 } };
  const burst = makePass(sphere, BeamPass.ORB, burstState, 'nova-impact');
  burst.position.copy(target);

  const release = impact - .14;
  const holdEnd = impact + 1.15;
  return (age) => {
    state.uTime.value = age;
    const charge = Math.min(1, age / release);
    const travel = Math.max(0, Math.min(1, (age - release) / (impact - release)));
    const collapse = Math.max(0, Math.min(1, (age - holdEnd) / .40));
    state.uProgress.value = travel * 1.09;
    state.uFade.value = 1 - collapse;
    state.uWidthFade.value = (1 - collapse) ** 2;
    state.uCharge.value = charge;
    for (const pass of column) pass.visible = travel > 0 && collapse < 1;

    orb.visible = age < impact + .10;
    orb.scale.setScalar((.10 + charge * .25) * (1 + .09 * Math.sin(age * 28)));
    const shock = Math.max(0, (age - impact) / .67);
    burst.visible = age >= impact && shock < 1;
    burst.scale.setScalar(.28 + .90 * (1 - (1 - Math.min(1, shock)) ** 2));
    burstState.uFade.value = .72 * (1 - Math.min(1, shock)) ** 2;
  };
}
