const SEATED_POSES = new Set(['seated', 'sleeping']);
// 停止移动后人物转回移动前朝向的速度（越大越快）
const RETURN_RATE = 12;

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const lerpAngle = (a, b, t) => a + angleDiff(b, a) * t;

/**
 * 第三人称朝向与输入（镜头参考，人物朝移动方向）：
 * - 镜头 yaw 只由鼠标拖动改变，不和人物朝向互相锁死
 * - WASD 相对镜头移动；移动时人物面向移动方向（A 朝左、D 朝右、S 转身朝后）
 * - 松开移动后，人物平滑转回移动前的朝向（镜头保持不变）
 * - 未移动时，右键拖动只转镜头
 * - 就座/睡觉/切换场景：采用服务端朝向
 */
export function createThirdPersonFacingState(facing = 0) {
  return { facing, idleFacing: facing, lastSceneId: null, moving: false, returning: false };
}

/**
 * 每帧解析人物朝向。返回的 yaw 原样带回，调用方不需要（也不应该）用它回写镜头。
 * rotation 始终有值：调用方写入 visual.rotation 即可让 presentActor 渲染。
 */
export function resolveThirdPersonFacing(state, { yaw, moving = false, moveAngle = null, pose = null, sceneId = null, serverRotation = null, dt = 0 } = {}) {
  const sceneChanged = sceneId !== null && state.lastSceneId !== null && sceneId !== state.lastSceneId;
  if (Number.isFinite(serverRotation) && (sceneChanged || (SEATED_POSES.has(pose) && !moving))) {
    state.facing = serverRotation;
    state.idleFacing = serverRotation;
    state.returning = false;
  }
  if (moving && Number.isFinite(moveAngle)) {
    if (!state.moving) state.idleFacing = state.facing;
    state.facing = moveAngle;
    state.moving = true;
    state.returning = false;
  } else {
    if (state.moving) { state.moving = false; state.returning = true; }
    if (state.returning) {
      const target = Number.isFinite(state.idleFacing) ? state.idleFacing : yaw;
      state.facing = lerpAngle(state.facing, target, Math.min(1, Math.max(0, Number(dt) || 0) * RETURN_RATE));
      if (Math.abs(angleDiff(state.facing, target)) < 0.02) {
        state.facing = target;
        state.returning = false;
      }
    }
  }
  if (sceneId !== null) state.lastSceneId = sceneId;
  return { yaw, facing: state.facing, rotation: state.facing };
}

/**
 * 第三人称移动轴：W/S 前后，A/D 屏幕左右；“左右键同时按住”等效 W。
 */
export function thirdPersonMoveAxis({ forward = false, backward = false, left = false, right = false, bothButtons = false } = {}) {
  return {
    x: (right ? 1 : 0) - (left ? 1 : 0),
    z: bothButtons ? -1 : (backward ? 1 : 0) - (forward ? 1 : 0),
  };
}

/**
 * 第三人称移动方向：相对镜头。W/S 沿镜头前后，A/D 沿屏幕左右。
 * 相机在角色背后，屏幕右侧 = -cos(yaw), sin(yaw)。
 */
export function thirdPersonMoveDirection(yaw, x, z) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = -Math.cos(yaw), rz = Math.sin(yaw);
  return { dx: fx * (-z) + rx * x, dz: fz * (-z) + rz * x };
}

/** 移动方向对应的世界朝向（供渲染层设置人物 rotation）。 */
export function thirdPersonMoveFacing(yaw, x, z) {
  const move = thirdPersonMoveDirection(yaw, x, z);
  return Math.atan2(move.dx, move.dz);
}
