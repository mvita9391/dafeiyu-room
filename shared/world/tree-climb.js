const APPROACH_TICKS = 4;
const CLIMB_TICKS = 15;
const HOLD_TICKS = 5;
export const TREE_CLIMB_TICKS = 2 * (APPROACH_TICKS + CLIMB_TICKS) + HOLD_TICKS;

const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

export function treeClimbPose(tree, approach, elapsed) {
  const [x, y, z] = tree.position;
  const dx = approach[0] - x, dz = approach[2] - z;
  const length = Math.hypot(dx, dz);
  const progress = Math.min(elapsed, TREE_CLIMB_TICKS - elapsed);
  const grip = ease(progress / APPROACH_TICKS);
  const height = ease((progress - APPROACH_TICKS) / CLIMB_TICKS);
  const radius = length + (.14 * tree.scale[0] + .32 - length) * grip;
  const climbing = progress >= APPROACH_TICKS && progress < APPROACH_TICKS + CLIMB_TICKS;
  return {
    position: [x + dx * radius / length, approach[1] + (y - approach[1] + 1.03 * tree.scale[1]) * height, z + dz * radius / length],
    rotation: Math.atan2(-dx, -dz),
    pose: 'tree-climbing',
    form: 'normal',
    climbMotion: climbing ? (elapsed < TREE_CLIMB_TICKS / 2 ? 1 : -1) : 0,
  };
}
