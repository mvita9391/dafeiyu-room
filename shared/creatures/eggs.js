// 蛋池配置：以后新增宠物只在这里加条目，不需要直接给每个玩家数据库塞宠物。
export const EGG_CATALOG_VERSION = 1;

export const EGG_CATALOG = Object.freeze({
  'starter-baize': Object.freeze({
    eggId: 'starter-baize',
    speciesId: 'baize',
    grantVersion: 1,
    initial: true,
    grantToExisting: false,
  }),
  'starter-fish': Object.freeze({
    eggId: 'starter-fish',
    speciesId: 'fish-bowl',
    grantVersion: 1,
    initial: true,
    grantToExisting: false,
  }),
});

export const EGG_CATALOG_LIST = Object.freeze(Object.values(EGG_CATALOG));

export function createEgg(entry, now = Date.now()) {
  return {
    eggId: entry.eggId,
    speciesId: entry.speciesId,
    hatched: false,
    createdAt: now,
  };
}

/** 新玩家初次打开宝箱：只发 initial 标记的蛋。 */
export function initialEggs(now = Date.now(), catalog = EGG_CATALOG_LIST) {
  return catalog.filter(entry => entry.initial).map(entry => createEgg(entry, now));
}

/**
 * 版本升级时补发：只补 grantToExisting 的新版本蛋，并保持已有蛋（含已孵化）。
 * 同一个 eggId 永远只保留一条。
 */
export function upgradeEggs(eggs, fromVersion, now = Date.now(), catalog = EGG_CATALOG_LIST) {
  const result = Array.isArray(eggs) ? eggs.slice() : [];
  const known = new Set(result.map(egg => egg.eggId));
  for (const entry of catalog) {
    if (entry.grantVersion <= fromVersion) continue;
    if (!entry.grantToExisting) continue;
    if (known.has(entry.eggId)) continue;
    result.push(createEgg(entry, now));
    known.add(entry.eggId);
  }
  return result;
}
