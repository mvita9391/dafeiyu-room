import { AnimationMixer, AnimationUtils, QuaternionKeyframeTrack, Vector3 } from 'three';
import { aimLimb } from './bone-aim.js';

export function buildTreeClimbClip(model, idle, bones) {
  const clip = AnimationUtils.subclip(idle, 'DafeiyuTreeClimb', 0, 1, 30);
  clip.duration = 1;
  const rig = model.clone();
  rig.scale.setScalar(1);
  const find = bone => bone && rig.getObjectByName(bone.name);
  const limbs = ['L', 'R'].flatMap((side, index) => [
    { upper: find(bones['upper' + side]), lower: find(bones['fore' + side]), end: find(bones['hand' + side]), sign: 1 - index * 2, arm: true },
    { upper: find(bones['thigh' + side]), lower: find(bones['shin' + side]), end: rig.getObjectByName(index ? 'RightFoot' : 'LeftFoot') || rig.getObjectByName('Foot_' + side), sign: index * 2 - 1 },
  ]);
  if (limbs.some(({ upper, lower, end }) => !upper || !lower || !end)) return null;

  const mixer = new AnimationMixer(rig);
  mixer.clipAction(clip).play();
  mixer.update(0);
  rig.updateMatrixWorld(true);
  const rest = new Map(limbs.flatMap(({ upper, lower }) => [[upper, upper.quaternion.clone()], [lower, lower.quaternion.clone()]]));
  const values = new Map([...rest.keys()].map(bone => [bone, []]));
  const times = Array.from({ length: 25 }, (_, i) => i / 24);
  const origin = new Vector3(), joint = new Vector3(), endPoint = new Vector3(), goal = new Vector3();
  for (const time of times) {
    for (const [bone, pose] of rest) bone.quaternion.copy(pose);
    rig.updateMatrixWorld(true);
    for (const { upper, lower, end, sign, arm } of limbs) {
      upper.getWorldPosition(origin);
      lower.getWorldPosition(joint);
      end.getWorldPosition(endPoint);
      const reach = origin.distanceTo(joint) + joint.distanceTo(endPoint);
      const phase = time * Math.PI * 2 + (sign < 0 ? Math.PI : 0);
      const lift = Math.sin(phase);
      const reachOut = Math.max(0, Math.cos(phase));
      goal.copy(origin).add(new Vector3(
        Math.sign(origin.x) * reach * (arm ? -0.13 : 0.08),
        reach * (arm ? 0.24 + 0.38 * lift : -0.73 + 0.22 * lift),
        reach * (arm ? 0.76 - 0.13 * reachOut : 0.45 - 0.13 * reachOut),
      ));
      aimLimb(upper, lower, end, goal.sub(endPoint));
    }
    for (const [bone, samples] of values) samples.push(...bone.quaternion.toArray());
  }
  mixer.uncacheRoot(rig);
  const joints = new Map([...values].map(([bone, samples]) => [bone.name + '.quaternion', new QuaternionKeyframeTrack(bone.name + '.quaternion', times, samples)]));
  clip.tracks = [...clip.tracks.filter(track => !joints.has(track.name)), ...joints.values()];
  return clip;
}
