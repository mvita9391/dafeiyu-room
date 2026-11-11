import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultPetState, normalizePetState, loadPetState, savePetState,
  getPet, selectPet, setPetMode, toggleBattle, petPet, evolvePet, ensurePetSeeds,
  followingPets, standbyPetsInScene, petBattlePet, setPetHome,
  buildServerImport, serverPetsToLocal,
  PET_BOND_MAX, PET_BOND_HOURLY_CAP, PET_STORAGE_KEY,
} from '../src/pets/pet-store.js';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), map };
};
const SEEDS = [
  { id: 'pet-baize', modelId: 'baize', name: '白泽', defaultMode: 'follow' },
  { id: 'pet-fish-bowl', modelId: 'fish-bowl', name: '缸盆小鱼', defaultMode: 'standby' },
];

test('初始存档不带宠物，由模型配置补齐', () => {
  const state = createDefaultPetState();
  assert.equal(state.pets.length, 0);
  ensurePetSeeds(state, SEEDS, 1000);
  assert.deepEqual(state.pets.map(pet => pet.modelId), ['baize', 'fish-bowl']);
  assert.deepEqual(state.pets.map(pet => pet.mode), ['follow', 'standby']);
  assert.equal(state.selectedPetId, 'pet-baize');
  // 重复补齐不会重复添加
  ensurePetSeeds(state, SEEDS, 2000);
  assert.equal(state.pets.length, 2);
});

test('跟随与家园待命互斥，待命会记录花园位置', () => {
  const state = createDefaultPetState();
  ensurePetSeeds(state, SEEDS, 1000);
  setPetMode(state, 'pet-baize', 'standby', { sceneId: 'yard', position: [1, 0, 2] });
  assert.equal(getPet(state, 'pet-baize').mode, 'standby');
  assert.deepEqual(getPet(state, 'pet-baize').homePosition, [1, 0, 2]);
  setPetMode(state, 'pet-baize', 'follow');
  assert.equal(getPet(state, 'pet-baize').mode, 'follow');
  setPetMode(state, 'pet-baize', null);
  assert.equal(getPet(state, 'pet-baize').mode, null);
});

test('跟随和出战各只能保留一只宠物', () => {
  const state = createDefaultPetState();
  ensurePetSeeds(state, SEEDS, 1000);
  setPetMode(state, 'pet-fish-bowl', 'follow');
  assert.equal(getPet(state, 'pet-fish-bowl').mode, 'follow');
  assert.equal(getPet(state, 'pet-baize').mode, 'standby');
  assert.deepEqual(followingPets(state).map(pet => pet.id), ['pet-fish-bowl']);
  toggleBattle(state, 'pet-fish-bowl');
  toggleBattle(state, 'pet-baize');
  assert.equal(getPet(state, 'pet-fish-bowl').battle, false);
  assert.equal(getPet(state, 'pet-baize').battle, true);
  assert.equal(petBattlePet(state).id, 'pet-baize');
  assert.equal(state.pets.filter(pet => pet.battle).length, 1);
});

test('旧存档里多只跟随/出战会收敛为一只', () => {
  const state = normalizePetState({
    version: 3,
    pets: [
      { id: 'a', name: 'A', modelId: 'baize', mode: 'follow', battle: true },
      { id: 'b', name: 'B', modelId: 'fish-bowl', mode: 'follow', battle: true },
    ],
  }, 1000);
  assert.equal(getPet(state, 'a').mode, 'follow');
  assert.equal(getPet(state, 'b').mode, 'standby');
  assert.equal(getPet(state, 'a').battle, true);
  assert.equal(getPet(state, 'b').battle, false);
});

test('战斗勾选独立于跟随/待命，出战宠物取第一只勾选', () => {
  const state = createDefaultPetState();
  ensurePetSeeds(state, SEEDS, 1000);
  toggleBattle(state, 'pet-fish-bowl');
  assert.equal(petBattlePet(state).name, '缸盆小鱼');
  toggleBattle(state, 'pet-fish-bowl');
  assert.equal(petBattlePet(state), null);
});

test('抚摸 +1 羁绊，一小时最多 10 点', () => {
  const state = createDefaultPetState();
  ensurePetSeeds(state, SEEDS, 1000);
  let now = 1000;
  for (let i = 0; i < PET_BOND_HOURLY_CAP; i += 1) {
    assert.equal(petPet(state, 'pet-baize', now).ok, true);
    now += 1000;
  }
  assert.equal(getPet(state, 'pet-baize').bond, 10);
  assert.equal(petPet(state, 'pet-baize', now).reason, 'hourly-cap');
  assert.equal(petPet(state, 'pet-baize', now + 60 * 60 * 1000 + 1).ok, true);
  assert.equal(getPet(state, 'pet-baize').bond, 11);
});

test('羁绊满后可以进化，进化后不再加羁绊', () => {
  const state = createDefaultPetState();
  ensurePetSeeds(state, SEEDS, 1000);
  const pet = getPet(state, 'pet-baize');
  pet.bond = PET_BOND_MAX - 1;
  assert.equal(petPet(state, 'pet-baize', 1000).ok, true);
  assert.equal(pet.bond, PET_BOND_MAX);
  assert.equal(pet.readyToEvolve, true);
  assert.equal(evolvePet(state, 'pet-baize', 1001).ok, true);
  assert.equal(pet.evolved, true);
  assert.equal(petPet(state, 'pet-baize', 1002).reason, 'max');
});

test('未满羁绊不能进化', () => {
  const state = createDefaultPetState();
  ensurePetSeeds(state, SEEDS, 1000);
  assert.equal(evolvePet(state, 'pet-baize', 1000).reason, 'not-ready');
});

test('跟随/待命筛选与出战宠物', () => {
  const state = createDefaultPetState();
  ensurePetSeeds(state, SEEDS, 1000);
  assert.deepEqual(followingPets(state).map(pet => pet.id), ['pet-baize']);
  assert.deepEqual(standbyPetsInScene(state, 'yard').map(pet => pet.id), ['pet-fish-bowl']);
  setPetHome(state, 'pet-baize', { sceneId: 'yard', position: [2, 0, 2] });
  assert.deepEqual(getPet(state, 'pet-baize').homePosition, [2, 0, 2]);
});

test('localStorage 读写与容错', () => {
  const storage = memoryStorage();
  const state = createDefaultPetState();
  ensurePetSeeds(state, SEEDS, 1000);
  selectPet(state, 'pet-fish-bowl');
  savePetState(storage, state);
  const loaded = loadPetState(storage, 3000);
  assert.equal(loaded.selectedPetId, 'pet-fish-bowl');
  assert.equal(loaded.pets.length, 2);
  storage.map.set(PET_STORAGE_KEY, '{broken');
  assert.equal(loadPetState(storage, 4000).pets.length, 0);
});

test('规范化会修复越界字段，旧版本存档回落到空状态', () => {
  const state = normalizePetState({
    version: 3,
    pets: [{ id: 'x', name: '', modelId: 'fish-bowl', bond: 999, mode: 'weird', bondWindowPoints: 99, homePosition: [1, 2] }],
  }, 5000);
  assert.equal(state.pets.length, 1);
  assert.equal(state.pets[0].modelId, 'fish-bowl');
  assert.equal(state.pets[0].bond, PET_BOND_MAX);
  assert.equal(state.pets[0].mode, null);
  assert.equal(state.pets[0].bondWindowPoints, PET_BOND_HOURLY_CAP);
  assert.equal(state.pets[0].homePosition, null);
  assert.equal(normalizePetState({ version: 2, pets: [{ id: 'pet-1', name: '白泽' }] }, 6000).pets.length, 0);
});

test('本地宠物可生成服务端迁移载荷并还原为展示缓存', () => {
  const state = createDefaultPetState();
  ensurePetSeeds(state, SEEDS, 1000);
  setPetMode(state, 'pet-fish-bowl', 'follow');
  toggleBattle(state, 'pet-fish-bowl');
  const payload = buildServerImport(state);
  assert.equal(payload.localVersion, 3);
  assert.equal(payload.followPetId, 'pet-fish-bowl');
  assert.equal(payload.battlePetId, 'pet-fish-bowl');
  assert.ok(payload.pets.every(pet => pet.speciesId && pet.petId));
  const owner = {
    instances: {
      'pet-baize': { petId: 'pet-baize', speciesId: 'baize', nickname: '白泽', level: 2, bond: 20, evolved: false, homeSceneId: 'yard', homePosition: null, learnedSkills: ['frost'], skillLoadout: ['frost'] },
      'fish': { petId: 'fish', speciesId: 'fish-bowl', nickname: '小鱼', level: 1, bond: 5, evolved: false, homeSceneId: 'yard', homePosition: [1, 0, 2], learnedSkills: ['tackle'], skillLoadout: ['tackle'] },
    },
    roster: { followPetId: 'fish', battlePetId: 'pet-baize' },
  };
  const local = serverPetsToLocal(owner);
  assert.equal(local.selectedPetId, 'fish');
  assert.equal(local.pets.find(pet => pet.id === 'fish').mode, 'follow');
  assert.equal(local.pets.find(pet => pet.id === 'pet-baize').battle, true);
  assert.ok(local.pets.find(pet => pet.id === 'fish').stats.maxHp > 0);
  assert.deepEqual(local.pets.find(pet => pet.id === 'fish').skillNames, ['撞击']);
});
