// 家园宠物状态：本地迁移/缓存纯函数；权威数据由服务端世界快照管理。
import {deriveStats} from '../../shared/creatures/stats.js';
import {PET_SKILLS as SKILLS} from '../../shared/creatures/skills.js';
export const PET_STORAGE_KEY = 'dafeiyu.pets.v3';
export const PET_MIGRATED_KEY = 'dafeiyu.pets.migrated.v3';
export const PET_BOND_MAX = 100;
export const PET_BOND_HOURLY_CAP = 10;
export const PET_BOND_GAIN = 1;
export const PET_MODES = ['follow', 'standby'];
const HOUR_MS = 60 * 60 * 1000;

function createPet(id, name, now, mode = null, modelId = 'baize') {
  return {
    id,
    name,
    species: modelId,
    modelId,
    bond: 0,
    evolved: false,
    readyToEvolve: false,
    mode,
    battle: false,
    homeSceneId: 'yard',
    homePosition: null,
    bondWindowStart: now,
    bondWindowPoints: 0,
    createdAt: now,
    evolvedAt: null,
  };
}

// 宠物来自模型配置（见 pet-models.js）；初始存档本身不带宠物，由 ensurePetSeeds 填充。
export function createDefaultPetState() {
  return { version: 3, selectedPetId: null, pets: [] };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// 跟随和出战各只能有一只：优先保留列表中第一只，其余跟随自动回到家园待命。
function enforcePetExclusivity(pets) {
  let followed = false;
  let battling = false;
  for (const pet of pets) {
    if (pet.mode === 'follow') {
      if (followed) pet.mode = 'standby';
      else followed = true;
    }
    if (pet.battle) {
      if (battling) pet.battle = false;
      else battling = true;
    }
  }
}

export function normalizePetState(raw, now = Date.now()) {
  if (!raw || raw.version !== 3 || !Array.isArray(raw.pets)) return createDefaultPetState();
  const seen = new Set();
  const pets = [];
  for (const pet of raw.pets) {
    if (!pet || typeof pet.id !== 'string' || !pet.id || seen.has(pet.id)) continue;
    seen.add(pet.id);
    const bond = clamp(Number.isFinite(pet.bond) ? pet.bond : 0, 0, PET_BOND_MAX);
    pets.push({
      id: pet.id,
      name: typeof pet.name === 'string' && pet.name ? pet.name.slice(0, 24) : '白泽',
      species: typeof pet.species === 'string' && pet.species ? pet.species : 'baize',
      modelId: typeof pet.modelId === 'string' && pet.modelId ? pet.modelId : 'baize',
      bond,
      evolved: Boolean(pet.evolved),
      readyToEvolve: Boolean(pet.readyToEvolve) || (bond >= PET_BOND_MAX && !pet.evolved),
      mode: PET_MODES.includes(pet.mode) ? pet.mode : null,
      poopSpeed: ['slow','normal','fast'].includes(pet.poopSpeed) ? pet.poopSpeed : 'normal',
      poopSceneId: typeof pet.poopSceneId === 'string' ? pet.poopSceneId : null,
      lastPoopAt: Number.isFinite(pet.lastPoopAt) ? pet.lastPoopAt : null,
      nextPoopAt: Number.isFinite(pet.nextPoopAt) ? pet.nextPoopAt : null,
      battle: Boolean(pet.battle),
      homeSceneId: typeof pet.homeSceneId === 'string' && pet.homeSceneId ? pet.homeSceneId : 'yard',
      homePosition: Array.isArray(pet.homePosition) && pet.homePosition.length === 3 && pet.homePosition.every(Number.isFinite)
        ? pet.homePosition.slice(0, 3)
        : null,
      bondWindowStart: Number.isFinite(pet.bondWindowStart) ? pet.bondWindowStart : now,
      bondWindowPoints: clamp(Number.isFinite(pet.bondWindowPoints) ? pet.bondWindowPoints : 0, 0, PET_BOND_HOURLY_CAP),
      createdAt: Number.isFinite(pet.createdAt) ? pet.createdAt : now,
      evolvedAt: Number.isFinite(pet.evolvedAt) ? pet.evolvedAt : null,
    });
  }
  if (!pets.length) return createDefaultPetState(now);
  enforcePetExclusivity(pets);
  return {
    version: 3,
    selectedPetId: pets.some(pet => pet.id === raw.selectedPetId) ? raw.selectedPetId : pets[0].id,
    pets,
  };
}

export function loadPetState(storage, now = Date.now()) {
  try {
    return normalizePetState(JSON.parse(storage?.getItem(PET_STORAGE_KEY) ?? 'null'), now);
  } catch {
    return createDefaultPetState(now);
  }
}

export function savePetState(storage, state) {
  try {
    storage?.setItem(PET_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式/配额满时不阻塞游戏。
  }
}


/** 旧本地宠物 → 服务端 pet.import 载荷。 */
export function buildServerImport(state) {
  const pets = state.pets.map(pet => ({
    petId: pet.id,
    speciesId: pet.modelId || pet.species || 'baize',
    nickname: pet.name,
    level: pet.level ?? 1,
    exp: pet.exp ?? 0,
    bond: pet.bond ?? 0,
    evolved: Boolean(pet.evolved),
    learnedSkills: pet.learnedSkills ?? undefined,
    skillLoadout: pet.skillLoadout ?? undefined,
    homeSceneId: pet.homeSceneId || 'yard',
    homePosition: pet.homePosition ?? undefined,
    bondWindowStart: pet.bondWindowStart,
    bondWindowPoints: pet.bondWindowPoints,
  }));
  return {
    localVersion: 3,
    pets,
    followPetId: state.pets.find(pet => pet.mode === 'follow')?.id ?? null,
    battlePetId: state.pets.find(pet => pet.battle)?.id ?? null,
  };
}

/** 服务端 owner bucket → 客户端渲染结构（只做展示缓存，不作为权威）。 */
export function serverPetsToLocal(owner) {
  if (!owner?.instances) return null;
  const instances = Object.values(owner.instances);
  if (!instances.length) return { version: 3, selectedPetId: null, pets: [] };
  const followPetId = owner.roster?.followPetId ?? null;
  const battlePetId = owner.roster?.battlePetId ?? null;
  const pets = instances.map(pet => {
    const stats = deriveStats(pet.speciesId, pet.level, pet.bond, pet.evolved);
    return {
      id: pet.petId,
      name: pet.nickname,
      species: pet.speciesId,
      modelId: pet.speciesId,
      level: pet.level,
      exp: pet.exp,
      bond: pet.bond,
      satiety: Number.isFinite(pet.satiety) ? pet.satiety : 80,
      poopSpeed: ['slow','normal','fast'].includes(pet.poopSpeed) ? pet.poopSpeed : 'normal',
      poopSceneId: typeof pet.poopSceneId === 'string' ? pet.poopSceneId : null,
      lastPoopAt: Number.isFinite(pet.lastPoopAt) ? pet.lastPoopAt : null,
      nextPoopAt: Number.isFinite(pet.nextPoopAt) ? pet.nextPoopAt : null,
      lastSceneId: pet.lastSceneId ?? null,
      lastPosition: pet.lastPosition ?? null,
      bondWindowStart: pet.bondWindowStart,
      bondWindowPoints: pet.bondWindowPoints ?? 0,
      evolved: pet.evolved,
      readyToEvolve: pet.bond >= PET_BOND_MAX && !pet.evolved,
      mode: followPetId === pet.petId ? 'follow' : 'standby',
      battle: battlePetId === pet.petId,
      learnedSkills: pet.learnedSkills,
      skillLoadout: pet.skillLoadout,
      stats,
      skillNames: (pet.skillLoadout ?? []).map(id => SKILLS[id]?.name).filter(Boolean),
      homeSceneId: pet.homeSceneId,
      homePosition: pet.homePosition,
      createdAt: pet.createdAt,
    };
  });
  return {
    version: 3,
    selectedPetId: followPetId ?? pets[0]?.id ?? null,
    pets,
  };
}

export function getPet(state, petId) {
  return state.pets.find(pet => pet.id === petId) ?? null;
}

export function selectPet(state, petId) {
  if (getPet(state, petId)) state.selectedPetId = petId;
  return state;
}

/** 按模型配置补齐宠物对象；模型配置数量决定宠物栏内容，不再依赖手动领养。 */
export function ensurePetSeeds(state, seeds = [], now = Date.now()) {
  const known = new Set(seeds.map(seed => seed.modelId));
  state.pets = state.pets.filter(pet => known.has(pet.modelId));
  for (const seed of seeds) {
    if (state.pets.some(pet => pet.modelId === seed.modelId)) continue;
    const pet = createPet(seed.id || `pet-${seed.modelId}`, seed.name || seed.modelId, now, seed.defaultMode ?? null, seed.modelId);
    if (seed.homeSceneId) pet.homeSceneId = seed.homeSceneId;
    state.pets.push(pet);
  }
  enforcePetExclusivity(state.pets);
  if (!state.pets.some(pet => pet.id === state.selectedPetId)) state.selectedPetId = state.pets[0]?.id ?? null;
  return state;
}

export function setPetMode(state, petId, mode, { sceneId = null, position = null } = {}) {
  if (mode !== null && !PET_MODES.includes(mode)) throw Error('INVALID_PET_MODE');
  const pet = getPet(state, petId);
  if (!pet) return state;
  pet.mode = mode;
  if (mode === 'follow') {
    for (const other of state.pets) {
      if (other.id !== pet.id && other.mode === 'follow') other.mode = 'standby';
    }
  }
  if (mode === 'standby') {
    if (sceneId) pet.homeSceneId = sceneId;
    if (Array.isArray(position) && position.length === 3 && position.every(Number.isFinite)) pet.homePosition = position.slice(0, 3);
  }
  return state;
}

export function toggleBattle(state, petId) {
  const pet = getPet(state, petId);
  if (!pet) return state;
  pet.battle = !pet.battle;
  if (pet.battle) {
    for (const other of state.pets) if (other.id !== pet.id) other.battle = false;
  }
  return state;
}

function refreshBondWindow(pet, now) {
  if (!Number.isFinite(pet.bondWindowStart) || now - pet.bondWindowStart >= HOUR_MS) {
    pet.bondWindowStart = now;
    pet.bondWindowPoints = 0;
  }
}

export function petPet(state, petId, now = Date.now()) {
  const pet = getPet(state, petId);
  if (!pet) return { ok: false, reason: 'not-found' };
  if (pet.evolved || pet.bond >= PET_BOND_MAX) {
    return { ok: false, reason: 'max', bond: pet.bond };
  }
  refreshBondWindow(pet, now);
  if (pet.bondWindowPoints >= PET_BOND_HOURLY_CAP) {
    return { ok: false, reason: 'hourly-cap', bond: pet.bond, hourUsed: pet.bondWindowPoints };
  }
  const gain = Math.min(PET_BOND_GAIN, PET_BOND_HOURLY_CAP - pet.bondWindowPoints, PET_BOND_MAX - pet.bond);
  pet.bond = clamp(pet.bond + gain, 0, PET_BOND_MAX);
  pet.bondWindowPoints += gain;
  pet.readyToEvolve = pet.bond >= PET_BOND_MAX && !pet.evolved;
  return { ok: true, gain, bond: pet.bond, hourUsed: pet.bondWindowPoints, readyToEvolve: pet.readyToEvolve };
}

export function evolvePet(state, petId, now = Date.now()) {
  const pet = getPet(state, petId);
  if (!pet || pet.evolved || pet.bond < PET_BOND_MAX) return { ok: false, reason: 'not-ready' };
  pet.evolved = true;
  pet.evolvedAt = now;
  pet.readyToEvolve = false;
  return { ok: true, pet };
}

export function followingPets(state) {
  return state.pets.filter(pet => pet.mode === 'follow');
}

export function standbyPetsInScene(state, sceneId) {
  return state.pets.filter(pet => pet.mode !== 'follow' && pet.homeSceneId === sceneId);
}

export function setPetHome(state, petId, { sceneId, position }) {
  const pet = getPet(state, petId);
  if (!pet) return state;
  if (sceneId) pet.homeSceneId = sceneId;
  if (Array.isArray(position) && position.length === 3 && position.every(Number.isFinite)) pet.homePosition = position.slice(0, 3);
  return state;
}

export function petBattlePet(state) {
  const pet = state.pets.find(candidate => candidate.battle);
  return pet ? { id: pet.id, name: pet.name, evolved: pet.evolved } : null;
}
