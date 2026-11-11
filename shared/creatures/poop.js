// 宠物便便时间属于宠物领域：只负责“在哪个场景、该不该拉、该拉几次”。
// 世界/物品层负责生成地面便便，客户端只负责显示。
export const PET_POOP_SPEEDS = Object.freeze({
 slow: Object.freeze({id: 'slow', label: '慢', duration: '8小时', intervalMs: 8 * 60 * 60 * 1000}),
 normal: Object.freeze({id: 'normal', label: '中', duration: '2小时', intervalMs: 2 * 60 * 60 * 1000}),
 fast: Object.freeze({id: 'fast', label: '快', duration: '10分钟', intervalMs: 10 * 60 * 1000}),
});
export const PET_POOP_DEFAULT_SPEED = 'normal';
export const PET_POOP_OFFLINE_CAP = 2;

export function petPoopSpeed(pet) {
  const speed = pet?.poopSpeed;
  return Object.hasOwn(PET_POOP_SPEEDS, speed) ? speed : PET_POOP_DEFAULT_SPEED;
}

export function petPoopInterval(pet) {
  return PET_POOP_SPEEDS[petPoopSpeed(pet)].intervalMs;
}

/** 宠物当前所在场景：战斗中没有；跟随跟随玩家；其他按家园场景。 */
export function resolvePetScene(pet, roster, actor) {
  if (actor?.battle) return null;
  if (roster?.followPetId === pet.petId) return actor?.sceneId ?? pet.homeSceneId ?? 'yard';
  return pet.homeSceneId ?? 'yard';
}

function resetSchedule(pet, sceneId, now) {
  pet.poopSceneId = sceneId;
  pet.lastPoopAt = now;
  pet.nextPoopAt = now + petPoopInterval(pet);
}

/**
 * 只结算目标场景里的宠物。
 * 场景变化时重置计时（离开场景暂停、回来重新计时），避免在卧室待很久后回院子连续补拉。
 * 返回 [{pet, count}]；调用方负责在场景里放便便。
 */
export function settlePetPoops({
  pets, roster, actor, sceneId, now = Date.now(), maxOffline = PET_POOP_OFFLINE_CAP,
  poopScenes = ['yard'],
} = {}) {
  const spawned = [];
  for (const pet of pets ?? []) {
    // 旧存档没有速度字段：补默认中档，并从现在开始重排，避免第一次仍按旧排程排便。
    if (!Object.hasOwn(PET_POOP_SPEEDS, pet.poopSpeed)) {
      pet.poopSpeed = PET_POOP_DEFAULT_SPEED;
      if (Number.isFinite(pet.lastPoopAt) || Number.isFinite(pet.nextPoopAt)) {
        pet.lastPoopAt = now;
        pet.nextPoopAt = now + petPoopInterval(pet);
      }
    }
    const scene = resolvePetScene(pet, roster, actor);
    if (pet.poopSceneId !== scene) {
      if (scene === null) {
        pet.poopSceneId = null;
        pet.lastPoopAt = null;
        pet.nextPoopAt = null;
      } else {
        resetSchedule(pet, scene, now);
      }
      continue;
    }
    if (scene !== sceneId) continue;
    if (!poopScenes.includes(sceneId)) continue;
    if (!Number.isFinite(pet.lastPoopAt) || !Number.isFinite(pet.nextPoopAt)) {
      resetSchedule(pet, scene, now);
      continue;
    }
    if (now < pet.nextPoopAt) continue;
    const interval = petPoopInterval(pet);
    const missed = Math.floor((now - pet.nextPoopAt) / interval) + 1;
    const count = Math.max(1, Math.min(Math.floor(maxOffline), missed));
    pet.lastPoopAt = now;
    pet.nextPoopAt = now + interval;
    spawned.push({pet, count});
  }
  return spawned;
}
