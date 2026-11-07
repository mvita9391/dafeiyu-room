import { AnimationMixer, AnimationUtils, Vector3 } from 'three';
import { aimBone, aimLimb } from './bone-aim.js';

export function buildFloorSit(model, source) {
  const pose = AnimationUtils.subclip(source, 'DafeiyuFloorSit', 0, 1, 30);
  pose.duration = 1;
  const rig = model.clone();
  rig.scale.setScalar(1);
  const hips = rig.getObjectByName('Hips');
  const legs = ['Left', 'Right'].map(side =>
    ['UpLeg', 'Leg', 'Foot', 'ToeBase'].map(part => rig.getObjectByName(side + part)),
  );
  if (!hips || legs.some(leg => leg.some(bone => !bone))) return null;

  const mixer = new AnimationMixer(rig);
  mixer.clipAction(pose).play();
  mixer.update(0);
  hips.position.y -= 0.44;
  rig.updateMatrixWorld(true);
  const edits = new Map([['Hips.position', hips.position]]);
  for (const [thigh, shin, foot, toe] of legs) {
    const ankle = foot.getWorldPosition(new Vector3());
    aimLimb(thigh, shin, foot, new Vector3(0, 0.13 - ankle.y, 0));
    const sole = foot.getWorldPosition(new Vector3());
    const toeDirection = toe.getWorldPosition(new Vector3()).sub(sole);
    const flattened = toeDirection.clone();
    flattened.y = 0.025 - sole.y;
    aimBone(foot, toeDirection, flattened);
    for (const bone of [thigh, shin, foot]) edits.set(bone.name + '.quaternion', bone.quaternion);
  }
  for (const track of pose.tracks) edits.get(track.name)?.toArray(track.values);
  mixer.uncacheRoot(rig);
  return pose;
}
