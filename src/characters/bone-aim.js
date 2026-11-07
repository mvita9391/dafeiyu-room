import { Quaternion, Vector3 } from 'three';

export function aimBone(bone, from, to) {
  const parent = bone.parent.getWorldQuaternion(new Quaternion());
  const turn = new Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
  bone.quaternion.premultiply(parent.clone().invert().multiply(turn).multiply(parent)).normalize();
  bone.updateWorldMatrix(false, true);
}

export function aimLimb(upper, forearm, hand, offset) {
  const shoulder = upper.getWorldPosition(new Vector3());
  const elbow = forearm.getWorldPosition(new Vector3());
  const wrist = hand.getWorldPosition(new Vector3());
  const upperLength = shoulder.distanceTo(elbow);
  const forearmLength = elbow.distanceTo(wrist);
  const target = wrist.clone().add(offset).sub(shoulder);
  const distance = Math.max(Math.abs(upperLength - forearmLength) + 0.001, Math.min(target.length(), upperLength + forearmLength - 0.001));
  const forward = target.normalize();
  const bend = elbow.clone().sub(shoulder);
  bend.addScaledVector(forward, -bend.dot(forward)).normalize();
  const reach = (upperLength ** 2 - forearmLength ** 2 + distance ** 2) / (2 * distance);
  const raisedElbow = shoulder.clone().addScaledVector(forward, reach)
    .addScaledVector(bend, Math.sqrt(Math.max(0, upperLength ** 2 - reach ** 2)));
  const newWrist = shoulder.clone().addScaledVector(forward, distance);
  aimBone(upper, elbow.sub(shoulder), raisedElbow.sub(shoulder));
  const actualElbow = forearm.getWorldPosition(new Vector3());
  aimBone(forearm, hand.getWorldPosition(new Vector3()).sub(actualElbow), newWrist.sub(actualElbow));
}
