// 宠物便便时间属于宠物领域：只负责“在哪个场景、该不该拉、该拉几次”。
// 世界/物品层负责生成地面便便，客户端只负责显示。
export const PET_POOP_MIN_MS = 240_000;
export const PET_POOP_MAX_MS = 480_000;
export const PET_POOP_OFFLINE_CAP = 2;

export function randomPoopDelay(random = Math.random) {
  return PET_POOP_MIN_MS + random() * (PET_POOP_MAX_MS - PET_POOP_MIN_MS);
}

/** 宠物当前所在场景：战斗中没有；跟随跟随玩家；其他按家园场景。 */
export function resolvePetScene(pet, roster, actor) {
  if (actor?.battle) return null;
  if (roster?.followPetId === pet.petId) return actor?.sceneId ?? pet.homeSceneId ?? 'yard';
  return pet.homeSceneId ?? 'yard';
}

function resetSchedule(pet, sceneId, now, random) {
  pet.poopSceneId = sceneId;
  pet.lastPoopAt = now;
  pet.nextPoopAt = now + randomPoopDelay(random);
}

/**
 * 只结算目标场景里的宠物。
 * 场景变化时重置计时（离开场景暂停、回来重新计时），避免在卧室待很久后回院子连续补拉。
 * 返回 [{pet, count}]；调用方负责在场景里放便便。
 */
export function settlePetPoops({
  pets, roster, actor, sceneId, now = Date.now(), random = Math.random, maxOffline = PET_POOP_OFFLINE_CAP,
  poopScenes = ['yard'],
} = {}) {
  const spawned = [];
  for (const pet of pets ?? []) {
    const scene = resolvePetScene(pet, roster, actor);
    if (pet.poopSceneId !== scene) {
      if (scene === null) {
        pet.poopSceneId = null;
        pet.lastPoopAt = null;
        pet.nextPoopAt = null;
      } else {
        resetSchedule(pet, scene, now, random);
      }
      continue;
    }
    if (scene !== sceneId) continue;
    if (!poopScenes.includes(sceneId)) continue;
    if (!Number.isFinite(pet.lastPoopAt) || !Number.isFinite(pet.nextPoopAt)) {
      resetSchedule(pet, scene, now, random);
      continue;
    }
    if (now < pet.nextPoopAt) continue;
    const missed = Math.floor((now - pet.nextPoopAt) / PET_POOP_MIN_MS) + 1;
    const count = Math.max(1, Math.min(Math.floor(maxOffline), missed));
    pet.lastPoopAt = now;
    pet.nextPoopAt = now + randomPoopDelay(random);
    spawned.push({pet, count});
  }
  return spawned;
}
