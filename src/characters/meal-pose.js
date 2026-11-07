import { Group, MathUtils, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { aimLimb } from './bone-aim.js';

const FORWARD = new Vector3(0, 0, 1);
const BITE_STARTS = [.34, 1.1, 1.86];
const SPOON_LENGTH = .13;
const smooth = MathUtils.smoothstep;

export function mealBitesAt(time) {
  return BITE_STARTS.filter(start => time >= start + .35).length;
}

function makeSpoon() {
  const spoon = new Group();
  spoon.name = 'rice-spoon';
  const material = new MeshStandardMaterial({ color: 0xe8e4db, roughness: .34, metalness: .3 });
  const shape = new SphereGeometry(1, 12, 8);
  const handle = new Mesh(shape, material);
  handle.scale.set(.009, .005, .054);
  handle.position.z = .046;
  const scoop = new Mesh(shape, material);
  scoop.scale.set(.024, .008, .032);
  scoop.position.z = .11;
  const rice = new Mesh(shape, new MeshStandardMaterial({ color: 0xfffaec, roughness: .9 }));
  rice.name = 'spoon-rice';
  rice.scale.set(.015, .012, .021);
  rice.position.set(0, .012, .111);
  spoon.add(handle, scoop, rice);
  return spoon;
}

function positionOf(group, bone) {
  return group.worldToLocal(bone.getWorldPosition(new Vector3()));
}

function moveHand(group, upper, fore, hand, target, blend) {
  const wrist = hand.getWorldPosition(new Vector3());
  const goal = group.localToWorld(target.clone());
  aimLimb(upper, fore, hand, goal.sub(wrist).multiplyScalar(blend));
  return positionOf(group, hand);
}

function mealTiming(time) {
  const blend = smooth(time, .02, .36) * (1 - smooth(time, 2.51, 2.98));
  const latest = BITE_STARTS.findLast(start => start <= time);
  const biteTime = latest === undefined ? 0 : time - latest;
  const lift = smooth(biteTime, .10, .34) * (1 - smooth(biteTime, .45, .68));
  const chews = mealBitesAt(time);
  const chewing = smooth(biteTime, .31, .39) * (1 - smooth(biteTime, .46, .65));
  return { blend, biteTime, lift, chews, chewing };
}

export function poseMeal(character, bowl) {
  const { group, bones, stateTime: time } = character;
  const { upperL, foreL, handL, upperR, foreR, handR, head } = bones || {};
  if (!head || foreL?.parent !== upperL || handL?.parent !== foreL ||
      foreR?.parent !== upperR || handR?.parent !== foreR || !handL || !handR) return false;

  const { blend, biteTime, lift, chews, chewing } = mealTiming(time);

  group.updateWorldMatrix(true, true);
  const chest = positionOf(group, upperL).lerp(positionOf(group, upperR), .5);
  head.rotateX(chewing * (.1 + Math.sin(biteTime * 40) * .034));

  const bowlGoal = chest.add(new Vector3(.02, -.15 + .064 * blend, .18));
  const bowlGrip = new Vector3(.078, .01, -.04);
  const left = moveHand(group, upperL, foreL, handL, bowlGoal.add(bowlGrip), blend);
  bowl.position.copy(left).sub(bowlGrip);
  bowl.scale.setScalar(.57);
  bowl.rotation.x = -.09 * blend;
  const rice = bowl.getObjectByName('rice');
  rice.visible = chews < BITE_STARTS.length;
  rice.scale.set(1, .4 - chews * .096, 1);

  const fromBowl = bowl.position.clone().add(new Vector3(-.006, .073, .017));
  const mouth = positionOf(group, head).add(new Vector3(0, .053, .105));
  const tip = fromBowl.lerp(mouth, lift);
  tip.y += Math.sin(lift * Math.PI) * .037;
  const wristOffset = new Vector3(-.104, -.067, .035).setLength(SPOON_LENGTH);
  const right = moveHand(group, upperR, foreR, handR, tip.clone().add(wristOffset), blend);

  if (!character.worldRiceSpoon) {
    character.worldRiceSpoon = makeSpoon();
    group.add(character.worldRiceSpoon);
  }
  const spoon = character.worldRiceSpoon;
  spoon.visible = time >= .09 && time < 2.91;
  spoon.position.copy(right);
  const direction = tip.sub(right);
  spoon.quaternion.setFromUnitVectors(FORWARD, direction.normalize());
  spoon.getObjectByName('spoon-rice').visible = biteTime > .14 && biteTime < .35;
  return true;
}

export function poseHandMeal(character, food) {
  const { group, bones, stateTime: time } = character;
  const { upperR, foreR, handR, head } = bones || {};
  const { blend, lift, chews, chewing } = mealTiming(time);
  if (head && handR && foreR?.parent === upperR && handR.parent === foreR) {
    head.rotateX(chewing * (.08 + Math.sin(time * 36) * .03));
    const chest = positionOf(group, upperR).add(new Vector3(.04, -.10, .14));
    const mouth = positionOf(group, head).add(new Vector3(-.045, .01, .10));
    const hand = moveHand(group, upperR, foreR, handR, chest.lerp(mouth, lift), blend);
    food.position.copy(hand).add(new Vector3(.02, .045, .045));
  } else {
    food.position.set(-.03, .52 + .24 * lift, .26);
  }
  food.rotation.x = -.12 - lift * .35;
  food.scale.setScalar(1 - chews * .20);
  food.visible = chews < BITE_STARTS.length;
}
