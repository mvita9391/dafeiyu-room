import { AnimationMixer, AnimationUtils, LoopOnce, Vector3 } from 'three';
import { aimLimb } from './bone-aim.js';

export const BOXING_STEPS = [
  { name: 'DafeiyuLeftJab', speed: 1.8, fade: 0.08 },
  { name: 'DafeiyuRightCross', speed: 1.7, fade: 0.08 },
  { name: 'DafeiyuLeftHook', speed: 1.55, fade: 0.08 },
];

function mirrorTrack(track) {
  track.name = track.name.replace(/^(Left|Right)/, side => side === 'Left' ? 'Right' : 'Left');
  const size = track.getValueSize();
  for (let i = 0; i < track.values.length; i += size) {
    if (track.name.endsWith('.position')) track.values[i] *= -1;
    else if (track.name.endsWith('.quaternion')) {
      track.values[i + 1] *= -1;
      track.values[i + 2] *= -1;
    }
  }
}

function makeHook(model, jab) {
  const hook = jab.clone();
  hook.name = BOXING_STEPS[2].name;
  const rig = model.clone();
  rig.scale.setScalar(1);
  const arm = rig.getObjectByName('LeftArm');
  const elbow = rig.getObjectByName('LeftForeArm');
  const hand = rig.getObjectByName('LeftHand');
  const armTrack = hook.tracks.find(track => track.name === 'LeftArm.quaternion');
  const elbowTrack = hook.tracks.find(track => track.name === 'LeftForeArm.quaternion');
  if (!arm || !elbow || !hand || !armTrack || !elbowTrack) return null;

  const mixer = new AnimationMixer(rig);
  const sample = mixer.clipAction(jab).setLoop(LoopOnce, 1);
  sample.clampWhenFinished = true;
  sample.play();
  for (let i = 0; i < armTrack.times.length; i++) {
    const time = armTrack.times[i];
    const windup = Math.max(0, 1 - Math.abs(time - 0.23) / 0.17);
    const sweep = Math.max(0, 1 - Math.abs(time - 0.48) / 0.24);
    if (!windup && !sweep) continue;
    mixer.setTime(time);
    rig.updateMatrixWorld(true);
    aimLimb(arm, elbow, hand, new Vector3(0.11 * windup - 0.19 * sweep, 0.03 * sweep, -0.09 * sweep));
    arm.quaternion.toArray(armTrack.values, i * 4);
    elbow.quaternion.toArray(elbowTrack.values, i * 4);
  }
  mixer.uncacheRoot(rig);
  return hook;
}

export function buildBoxingClips(model, source) {
  const jab = AnimationUtils.subclip(source, BOXING_STEPS[0].name, 0, 30, 30);
  // Keep punches planted. The original panel preview still has its own movement.
  const hips = jab.tracks.find(track => track.name === 'Hips.position');
  if (hips) {
    const [x,,z] = hips.values;
    for (let i = 0; i < hips.values.length; i += 3) {
      hips.values[i] = x;
      hips.values[i + 2] = z;
    }
  }
  const cross = jab.clone();
  cross.name = BOXING_STEPS[1].name;
  cross.tracks.forEach(mirrorTrack);
  const hook = makeHook(model, jab);
  return hook ? [jab, cross, hook] : [];
}
