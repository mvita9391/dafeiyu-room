import {nearestFree} from './navigation.js';

export const COMPOST_SCENE_ID = 'yard';
export const COMPOST_OFFSET_X = 3.0;
export const COMPOST_FALLBACK = Object.freeze([-3.1, 0, -15.9]);

/** 前端摆放、服务端交互和 MCP 导航共用同一个堆肥箱坐标。 */
export function compostPositionForSnapshot(snapshot) {
  const farm = snapshot?.entities?.find(entity => entity.type === 'yardFarm' && entity.sceneId === COMPOST_SCENE_ID);
  let point = farm?.position
    ? [farm.position[0] + COMPOST_OFFSET_X, farm.position[1] ?? 0, farm.position[2]]
    : [...COMPOST_FALLBACK];
  try {
    const free = nearestFree(snapshot, COMPOST_SCENE_ID, point);
    if (Math.hypot(free[0] - point[0], free[2] - point[2]) <= 2.2) point = free;
  } catch { /* 使用默认点 */ }
  return point;
}

export {compostPositionForSnapshot as compostPosition};
