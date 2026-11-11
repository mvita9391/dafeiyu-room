import * as THREE from 'three';
import { PET_MODELS, PET_MODEL_BY_ID, loadPetModelAsset, createPetModel } from './pet-models.js';
import { surfaceAt } from '../../shared/world/coastal.js';
import { getTemplate } from '../../shared/world/templates.js';
import { nearestFree, segmentWalkable } from '../../shared/world/navigation.js';
import { FOODS } from '../../shared/world/foods.js';
import {
  PET_BOND_MAX, PET_BOND_HOURLY_CAP,
  loadPetState, savePetState, getPet, selectPet, setPetMode, toggleBattle,
  petPet, evolvePet, petBattlePet, followingPets,
  buildServerImport, serverPetsToLocal, PET_MIGRATED_KEY,
} from './pet-store.js';
import {deriveStats} from '../../shared/creatures/stats.js';
import {getSpecies} from '../../shared/creatures/species.js';
import {PET_SKILLS} from '../../shared/creatures/skills.js';

const HOME_SCENE_ID = 'yard';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// 待命宠物待在院子花园里的固定位置（院子出生点在 [1,0,1] 附近）
const HOME_SPOTS = [[3.2, 0, -1.2], [-1.4, 0, -2.0], [1.0, 0, 3.4]];
const LANES = [{ back: 1.05, side: -0.6 }, { back: 1.35, side: 0.6 }, { back: 1.75, side: 0 }];
const FOOD_EMOJI = { rice: '🍚', hamburger: '🍔', pizza: '🍕', croissant: '🥐', apple: '🍎', strawberry: '🍓' };
const FOOD_COLORS = { rice: 0xfff7e8, hamburger: 0xc98a4b, pizza: 0xe0a34a, croissant: 0xd9a35f, apple: 0xd94f4f, strawberry: 0xe45b6b };
const STYLE = `
#pet-entry{position:relative}
#pet-entry .pet-count{font-size:11px;opacity:.6}
.pet-panel{width:min(430px,calc(100vw - 32px))}
.pet-tabs{display:flex;gap:6px;margin:8px 0 12px}
.pet-tabs button{flex:1;padding:8px 10px;border:1px solid #d9c9b6;border-radius:10px;background:#fff9ee;color:#51454a;font:inherit;cursor:pointer}
.pet-tabs button.active{background:#e8d6bd;border-color:#b48a5f;font-weight:600}
.pet-list{display:grid;gap:10px;max-height:min(52vh,520px);overflow:auto;padding-right:2px}
.pet-card{border:1px solid #e3d2bc;border-radius:14px;padding:10px 12px;background:#fffdf7}
.pet-card.selected{border-color:#b48a5f;box-shadow:0 0 0 2px #d9bfa2 inset}
.pet-card header{display:flex;align-items:center;gap:8px;justify-content:space-between}
.pet-card header b{font-size:15px}
.pet-card header em{font-style:normal;font-size:11px;color:#8a7563}
.pet-bond{margin:8px 0 6px}
.pet-bond .pet-bond-top{display:flex;justify-content:space-between;font-size:12px;color:#78665a}
.pet-bond i{display:block;height:8px;border-radius:99px;background:#efe0cf;overflow:hidden;margin-top:4px}
.pet-bond i em{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#ffb26b,#ff7f9b)}
.pet-meta{margin:7px 0 2px;font-size:11px;color:#8a7563;font-variant-numeric:tabular-nums}
.pet-skills{margin-bottom:2px;font-size:11px;color:#8a7563;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pet-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:9px 0}
.pet-mode{display:flex;border:1px solid #d6bfa5;border-radius:10px;overflow:hidden;background:#fff9ee}
.pet-mode button{border:0;background:transparent;color:#5d493b;font:inherit;font-size:12px;line-height:1;
  padding:0 11px;min-height:38px;cursor:pointer;transition:background .15s,color .15s}
.pet-mode button:hover:not(.active){background:#fff0d8}
.pet-mode button.active{background:#a8794f;color:#fff;font-weight:600}
.pet-battle{border:1px solid #d6bfa5;border-radius:10px;background:#fff9ee;color:#5d493b;font:inherit;font-size:12px;
  padding:0 11px;min-height:38px;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
.pet-battle:hover:not(.active){background:#fff0d8}
.pet-battle.active{background:#8b4d37;border-color:#8b4d37;color:#fff;font-weight:600}
.pet-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}
.pet-actions button{padding:6px 12px;border:1px solid #d6bfa5;border-radius:10px;background:#fff9ee;color:#5d493b;font:inherit;font-size:13px;cursor:pointer}
.pet-actions button:disabled{opacity:.45;cursor:default}
.pet-actions button.primary{background:#a8794f;border-color:#a8794f;color:#fff}
.pet-food-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.pet-food-grid button{display:grid;justify-items:center;gap:4px;padding:10px 6px;border:1px solid #e3d2bc;border-radius:12px;background:#fffdf7;color:#51454a;font:inherit;cursor:pointer}
.pet-food-grid button:hover{background:#fff1d9;border-color:#b79065}
.pet-food-grid .emoji{font-size:26px;line-height:1}
.pet-foot{margin:12px 0 0;font-size:11px;color:#8a7563}
.pet-empty{color:#78665a;font-size:13px;padding:12px 0;text-align:center}

`;

function circularLerp(from, to, t) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}

export function mountPetSystem({
  scene, canvas,
  getCamera, getSnapshot, getSceneId, getPlayer,
  isEditing = () => false,
  isFirstPerson = () => false,
  isBattle = () => false,
  onMessage = () => {},
  localSound = null,
  fx = null,
  getActor = () => null,
  dispatchPet = null,
  isConnected = () => false,
} = {}) {
  const storage = (() => { try { return globalThis.localStorage; } catch { return null; } })();
  let state = loadPetState(storage);
  const avatars = new Map();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tmp = new THREE.Vector3();
  const assets = new Map();
  let ready = false;
  let food = null;
  let pointerDown = null;
  let serverReady = false;
  let migrationPending = false;
  let migrationAttempted = false;
  let bootstrapAttempted = false;
  let appliedServerPets = null;
  let lastPositionSync = 0;
  const lastPublishedPositions = new Map();
  let lastPoopSettleScene = null;
  let lastPoopSettleAt = 0;

  if (!document.getElementById('pet-system-style')) {
    const style = document.createElement('style');
    style.id = 'pet-system-style';
    style.textContent = STYLE;
    document.head.append(style);
  }

  const entry = document.createElement('button');
  entry.type = 'button';
  entry.id = 'pet-entry';
  entry.className = 'toolbar-action';
  entry.innerHTML = '<span aria-hidden="true">🐾</span> 宠物 <span class="pet-count"></span>';
  document.getElementById('actions')?.prepend(entry);

  const dialog = document.createElement('dialog');
  dialog.id = 'pet-panel';
  dialog.className = 'settings-dialog pet-panel';
  dialog.setAttribute('aria-labelledby', 'pet-panel-title');
  dialog.innerHTML = `<div class="settings-card">
    <header class="settings-header"><h2 id="pet-panel-title">宠物栏</h2><button class="settings-close" type="button" aria-label="关闭宠物栏">×</button></header>
    <div class="pet-tabs" role="tablist">
      <button type="button" data-tab="pets" class="active" role="tab" aria-selected="true">宠物</button>
      <button type="button" data-tab="food" role="tab" aria-selected="false">食物</button>
    </div>
    <div class="pet-body"></div>
    <p class="pet-foot">点击宠物头可以抚摸（每小时最多 +10），满 100 可进化；跟随和出战各只能有一只。</p>
  </div>`;
  document.body.append(dialog);
  const body = dialog.querySelector('.pet-body');
  const tabs = dialog.querySelector('.pet-tabs');
  const closeButton = dialog.querySelector('.settings-close');
  let activeTab = 'pets';

  function save() {
    savePetState(storage, state);
    updateEntryCount();
  }

  function updateEntryCount() {
    const count = entry.querySelector('.pet-count');
    if (count) count.textContent = String(state.pets.length);
  }

  function selectedPet() {
    return getPet(state, state.selectedPetId) ?? state.pets[0] ?? null;
  }

  function currentActorId() {
    return getActor?.()?.actorId ?? getSnapshot()?.actors?.[0]?.actorId ?? null;
  }

  function applyRosterToLocal(roster, changedPet = null) {
    if (!roster) return;
    for (const pet of state.pets) {
      pet.mode = roster.followPetId === pet.id ? 'follow' : 'standby';
      pet.battle = roster.battlePetId === pet.id;
    }
    if (changedPet?.homeSceneId) changedPet.pet.homeSceneId = changedPet.homeSceneId;
    if (changedPet?.homePosition) changedPet.pet.homePosition = changedPet.homePosition;
  }

  function reconcileServerPets(next) {
    const known = new Set(next.pets.map(pet => pet.id));
    state.pets = next.pets;
    state.selectedPetId = next.selectedPetId;
    for (const pet of state.pets) {
      let avatar = avatars.get(pet.id);
      if (!avatar) avatar = createAvatar(pet);
      if (avatar) applyPetLook(avatar, pet);
    }
    for (const [id, avatar] of [...avatars]) {
      if (known.has(id)) continue;
      scene.remove(avatar.root);
      avatar.root.traverse(node => {
        if (!node.isMesh) return;
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach(material => material.dispose?.());
        else node.material?.dispose?.();
      });
      avatars.delete(id);
    }
    savePetState(storage, state);
    updateEntryCount();
    if (dialog.open) render();
  }

  function syncServerPets(snapshot) {
    if (!dispatchPet) return;
    const actorId = currentActorId();
    if (!actorId) return;
    const owner = snapshot?.pets?.owners?.[actorId];
    if (owner && (Object.keys(owner.instances ?? {}).length || Array.isArray(owner.eggs))) {
      if (owner === appliedServerPets) return;
      appliedServerPets = owner;
      const next = serverPetsToLocal(owner);
      if (next) {
        serverReady = true;
        migrationPending = false;
        migrationAttempted = true;
        reconcileServerPets(next);
        try { storage?.setItem(PET_MIGRATED_KEY, '1'); } catch { /* ignore */ }
      }
      // 老世界已存在宠物但没有 eggs 字段：补一次初始化；有宠物的旧档不会拿到新蛋。
      if (!Array.isArray(owner.eggs) && !migrationPending && !bootstrapAttempted) {
        migrationPending = true;
        bootstrapAttempted = true;
        void dispatchPet('pet.bootstrap', { actorId })
          .then(() => { migrationPending = false; })
          .catch(error => { migrationPending = false; onMessage(`宠物宝箱初始化失败：${error.message}`); });
      }
      return;
    }
    if (serverReady || migrationPending || migrationAttempted || !isConnected()) return;
    const payload = buildServerImport(state);
    migrationPending = true;
    migrationAttempted = true;
    if (!payload.pets.length) {
      // 新玩家：建立空名册和两只初始蛋，不自动发宠物。
      void dispatchPet('pet.bootstrap', { actorId })
        .then(() => { migrationPending = false; })
        .catch(error => { migrationPending = false; onMessage(`宠物宝箱初始化失败：${error.message}`); });
      return;
    }
    void dispatchPet('pet.import', { actorId, ...payload })
      .then(() => { migrationPending = false; })
      .catch(error => {
        migrationPending = false;
        onMessage(`宠物数据迁移失败：${error.message}`);
      });
  }

  async function petCommand(kind, payload) {
    if (!dispatchPet || !serverReady) {
      onMessage(dispatchPet ? '宠物数据还在同步，稍等一下' : '连接世界后才能操作宠物');
      return null;
    }
    const actorId = currentActorId();
    if (!actorId) return null;
    try {
      return await dispatchPet(kind, { actorId, ...payload });
    } catch (error) {
      onMessage(`宠物操作失败：${error.message}`);
      return null;
    }
  }

  function petStatsFor(pet) {
    return pet.stats ?? deriveStats(pet.modelId ?? pet.species ?? 'baize', pet.level ?? 1, pet.bond ?? 0, pet.evolved);
  }

  function petSkillNames(pet) {
    if (Array.isArray(pet.skillNames) && pet.skillNames.length) return pet.skillNames;
    const loadout = pet.skillLoadout ?? getSpecies(pet.modelId ?? pet.species ?? 'baize').defaultLoadout;
    return loadout.map(id => PET_SKILLS[id]?.name).filter(Boolean);
  }

  async function petById(id) {
    const pet = getPet(state, id);
    if (!pet) return;
    const avatar = avatars.get(id);
    if (!avatar || !avatar.root.visible) {
      onMessage(`${pet.name} 现在不在你身边`);
      return;
    }
    // 点击头部触发的专属反应动作（由模型配置的 pet 动作槽定义）。
    avatar.petting = 2.3;
    if (avatar.model?.chain) avatar.model.chain('pet');
    if (dispatchPet) {
      if (!serverReady) { onMessage('宠物数据还在同步，稍等一下'); return; }
      const result = await petCommand('pet.pet', { petId: id });
      if (!result) return;
      if (!result.ok) {
        if (result.reason === 'hourly-cap') onMessage(`这一小时已经摸满 ${PET_BOND_HOURLY_CAP} 点了，等会儿再陪${pet.name}玩吧`);
        else if (result.reason === 'max') onMessage(`${pet.name} 的羁绊已经满了${pet.evolved ? '，正在陪着你' : '，可以进化了'}`);
        else onMessage('现在摸不到它');
        save();
        render();
        return;
      }
      pet.bond = result.bond;
      pet.evolved = result.evolved;
      pet.readyToEvolve = Boolean(result.readyToEvolve);
      avatar.bounce = 1;
      if (fx) fx.hearts(avatar.root.position.clone().add(new THREE.Vector3(0, 0.72, 0)), 6);
      save();
      if (pet.readyToEvolve) onMessage(`抚摸${pet.name}：羁绊 +${result.gain}（${pet.bond}/${PET_BOND_MAX}）· 可以进化了！`);
      else onMessage(`抚摸${pet.name}：羁绊 +${result.gain}（${pet.bond}/${PET_BOND_MAX}）`);
      render();
      return;
    }
    const result = petPet(state, id, Date.now());
    if (!result.ok) {
      if (result.reason === 'hourly-cap') onMessage(`这一小时已经摸满 ${PET_BOND_HOURLY_CAP} 点了，等会儿再陪${pet.name}玩吧`);
      else if (result.reason === 'max') onMessage(`${pet.name} 的羁绊已经满了${pet.evolved ? '，正在陪着你' : '，可以进化了'}`);
      else onMessage('现在摸不到它');
      save();
      render();
      return;
    }
    avatar.bounce = 1;
    if (fx) fx.hearts(avatar.root.position.clone().add(new THREE.Vector3(0, 0.72, 0)), 6);
    save();
    if (result.readyToEvolve) onMessage(`抚摸${pet.name}：羁绊 +${result.gain}（${pet.bond}/${PET_BOND_MAX}）· 可以进化了！`);
    else onMessage(`抚摸${pet.name}：羁绊 +${result.gain}（${pet.bond}/${PET_BOND_MAX}）`);
    render();
  }

  async function evolve(id) {
    const pet = getPet(state, id);
    if (!pet) return;
    if (dispatchPet) {
      const result = await petCommand('pet.evolve', { petId: id });
      if (!result) return;
      if (!result.ok) { onMessage(`${pet.name} 的羁绊还没满`); return; }
      pet.evolved = true;
      pet.readyToEvolve = false;
    } else {
      const result = evolvePet(state, id, Date.now());
      if (!result.ok) { onMessage(`${pet.name} 的羁绊还没满`); return; }
    }
    const avatar = avatars.get(id);
    if (avatar) {
      avatar.baseScale = 1.16;
      applyPetLook(avatar, pet);
      if (fx) fx.burst(avatar.root.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 14);
    }
    save();
    onMessage(`${pet.name} 进化了！`);
    render();
  }

  function yardHomePosition(petId) {
    const index = Math.max(0, state.pets.findIndex(candidate => candidate.id === petId));
    const spot = HOME_SPOTS[index % HOME_SPOTS.length];
    let [x, y, z] = spot;
    const snapshot = getSnapshot();
    try {
      const yard = snapshot?.scenes?.find(entry => entry.sceneId === HOME_SCENE_ID);
      const template = yard ? getTemplate(yard.templateId) : null;
      const free = nearestFree(snapshot, HOME_SCENE_ID, [x, y, z]);
      x = free[0]; z = free[2];
      y = groundAt(template, x, z, y);
    } catch { /* 用默认点 */ }
    return [x, y, z];
  }

  async function setMode(id, mode) {
    const pet = getPet(state, id);
    if (!pet) return;
    const demoted = mode === 'follow'
      ? state.pets.filter(candidate => candidate.id !== id && candidate.mode === 'follow').map(candidate => candidate.name)
      : [];
    if (dispatchPet) {
      if (!serverReady) { onMessage('宠物数据还在同步，稍等一下'); return; }
      const payload = { petId: id, mode };
      if (mode === 'standby') {
        payload.homeSceneId = HOME_SCENE_ID;
        payload.homePosition = yardHomePosition(id);
      }
      const result = await petCommand('pet.setMode', payload);
      if (!result?.roster) return;
      applyRosterToLocal(result.roster, { pet, ...result });
      if (mode === 'standby') {
        const avatar = avatars.get(id);
        if (avatar) { avatar.sceneId = HOME_SCENE_ID; avatar.ai = null; }
      }
    } else if (mode === 'standby') {
      // 离线回退：沿用旧的本地逻辑。
      setPetMode(state, id, 'standby', { sceneId: HOME_SCENE_ID, position: yardHomePosition(id) });
      const avatar = avatars.get(id);
      if (avatar) { avatar.sceneId = HOME_SCENE_ID; avatar.ai = null; }
    } else {
      setPetMode(state, id, mode);
    }
    save();
    render();
    const label = mode === 'follow' ? '开始跟随你' : mode === 'standby' ? '留在家园待命' : '自由活动';
    const demotedHint = demoted.length ? `；${demoted.join('、')}回家园待命` : '';
    onMessage(`${pet.name} ${label}${demotedHint}`);
  }

  async function setBattle(id) {
    const pet = getPet(state, id);
    if (!pet) return;
    if (dispatchPet) {
      if (!serverReady) { onMessage('宠物数据还在同步，稍等一下'); return; }
      const wasBattling = pet.battle;
      const result = await petCommand('pet.setBattle', { petId: wasBattling ? null : id });
      if (!result?.roster) return;
      for (const candidate of state.pets) candidate.battle = result.roster.battlePetId === candidate.id;
      save();
      render();
      onMessage(`${pet.name} ${wasBattling ? '取消出战' : '出战'}`);
      return;
    }
    toggleBattle(state, id);
    save();
    render();
    onMessage(`${pet.name} ${pet.battle ? '出战' : '取消出战'}`);
  }

  function placeFood(foodId) {
    if (!FOODS[foodId]) return;
    if (!ready) { onMessage('宠物们还在赶来的路上，稍等一下'); return; }
    if (food) { onMessage('地上已经有一份食物了，先让宠物吃完'); return; }
    const snapshot = getSnapshot();
    const sceneId = getSceneId();
    const player = getPlayer();
    const heading = player.heading ?? 0;
    const template = (() => {
      try { return getTemplate(snapshot.scenes.find(entry => entry.sceneId === sceneId).templateId); } catch { return null; }
    })();
    let x = player.position.x + Math.sin(heading) * 1.05;
    let z = player.position.z + Math.cos(heading) * 1.05;
    let y = player.position.y;
    try {
      const free = nearestFree(snapshot, sceneId, [x, y, z]);
      x = free[0]; z = free[2];
    } catch { /* 保持原位 */ }
    if (template) {
      try { y = surfaceAt(template, x, z)?.height ?? y; } catch { /* 保持原位 */ }
    }
    const candidates = state.pets.filter(pet => {
      const avatar = avatars.get(pet.id);
      return avatar && avatar.root.visible;
    });
    if (!candidates.length) { onMessage('附近没有宠物，先让一只宠物跟随或留在家园待命'); return; }
    const mesh = createFoodMesh(foodId);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    // 不绑定宠物：同一场景里谁先跑到，谁吃这一份。
    food = { foodId, mesh, position: new THREE.Vector3(x, y, z), createdAt: performance.now() };
    dialog.close();
    onMessage('闻到香味了，宠物们谁先跑到谁吃');
  }

  function createFoodMesh(foodId) {
    const group = new THREE.Group();
    group.name = `pet-food-${foodId}`;
    const ceramic = new THREE.MeshStandardMaterial({ color: 0xeaf3ff, roughness: 0.42 });
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.06, 20), ceramic);
    bowl.position.y = 0.03;
    group.add(bowl);
    const foodMaterial = new THREE.MeshStandardMaterial({ color: FOOD_COLORS[foodId] ?? 0xfff0d0, roughness: 0.85 });
    const foodMesh = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 12), foodMaterial);
    foodMesh.scale.y = 0.55;
    foodMesh.position.y = 0.095;
    group.add(foodMesh);
    if (foodId === 'hamburger') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe0b06b, roughness: 0.8 }));
      bun.position.y = 0.14;
      group.add(bun);
    }
    group.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    return group;
  }

  function removeFood() {
    if (!food) return;
    scene.remove(food.mesh);
    food = null;
  }

  function applyPetLook(avatar, pet) {
    avatar.baseScale = pet.evolved ? 1.16 : 1.0;
    avatar.root.scale.setScalar(avatar.baseScale);
    if (pet.evolved && !avatar.tinted) {
      avatar.root.traverse(node => {
        if (!node.isMesh || !node.material) return;
        const tint = material => {
          const cloned = material.clone();
          if (cloned.emissive) { cloned.emissive = new THREE.Color(0x7fb0ff); cloned.emissiveIntensity = 0.28; }
          return cloned;
        };
        node.material = Array.isArray(node.material) ? node.material.map(tint) : tint(node.material);
      });
      avatar.tinted = true;
    }
  }

  function createAvatar(pet) {
    const config = PET_MODEL_BY_ID[pet.modelId];
    const asset = assets.get(pet.modelId);
    if (!config || !asset) return null;
    const model = createPetModel(asset, config);
    const avatar = { petId: pet.id, model, root: model.root, sceneId: null, baseScale: 1, bounce: 0, eating: 0, tinted: false };
    model.root.name = `pet-avatar-${pet.id}`;
    model.root.visible = false;
    scene.add(model.root);
    applyPetLook(avatar, pet);
    avatars.set(pet.id, avatar);
    return avatar;
  }

  async function load() {
    const loaded = await Promise.all(PET_MODELS.map(async config => {
      try {
        return [config.modelId, await loadPetModelAsset(config)];
      } catch (error) {
        console.warn('宠物模型加载失败', config.id, error);
        return null;
      }
    }));
    for (const entry of loaded) if (entry) assets.set(entry[0], entry[1]);
    if (!assets.size) { onMessage('宠物模型加载失败，稍后再试'); return; }
    // 新玩家不预置宠物；宠物从院子大树下的宝箱蛋里领取。
    // 旧 localStorage 有宠物时仍保留，用于首次迁移到服务端。
    ready = true;
    for (const pet of state.pets) createAvatar(pet);
    save();
    updateEntryCount();
  }

  function groundAt(template, x, z, fallbackY) {
    if (!template) return fallbackY;
    try { return surfaceAt(template, x, z)?.height ?? fallbackY; } catch { return fallbackY; }
  }

  function offsetTarget(player, heading, lane) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    return { x: player.x - fx * lane.back + rx * lane.side, z: player.z - fz * lane.back + rz * lane.side };
  }

  function placeBehind(avatar, pet, ctx) {
    const lane = LANES[state.pets.findIndex(candidate => candidate.id === pet.id) % LANES.length];
    const point = offsetTarget(ctx.player, ctx.heading, lane);
    let x = point.x, y = ctx.player.y, z = point.z;
    try {
      const free = nearestFree(ctx.snapshot, ctx.sceneId, [x, y, z]);
      x = free[0]; z = free[2];
    } catch { /* 用玩家附近 */ }
    y = groundAt(ctx.template, x, z, y);
    avatar.root.position.set(x, y, z);
    avatar.root.rotation.y = ctx.heading;
    avatar.sceneId = ctx.sceneId;
  }

  function moveAvatar(avatar, target, speed, ctx, dt) {
    const dx = target.x - avatar.root.position.x;
    const dz = target.z - avatar.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.07) return { stepped: 0, reached: true, blocked: false };
    const step = Math.min(distance, dt * speed);
    const x = avatar.root.position.x + (dx / distance) * step;
    const z = avatar.root.position.z + (dz / distance) * step;
    const y = groundAt(ctx.template, x, z, avatar.root.position.y);
    try {
      if (ctx.snapshot && !segmentWalkable(ctx.snapshot, ctx.sceneId, avatar.root.position.toArray(), [x, y, z])) {
        return { stepped: 0, reached: false, blocked: true };
      }
    } catch { /* 没有导航数据时放行 */ }
    avatar.root.position.set(x, y, z);
    const desired = Math.atan2(dx, dz);
    avatar.root.rotation.y = circularLerp(avatar.root.rotation.y, desired, Math.min(1, dt * 12));
    return { stepped: speed, reached: distance <= step + 0.02, blocked: false };
  }

  function randomHomePoint(pet, ctx, radius) {
    const home = pet.homePosition;
    if (!home) return null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 0.7 + Math.random() * radius;
      let x = home[0] + Math.cos(angle) * distance;
      let z = home[2] + Math.sin(angle) * distance;
      try {
        const free = nearestFree(ctx.snapshot, HOME_SCENE_ID, [x, home[1], z]);
        x = free[0]; z = free[2];
      } catch { /* 保持原点 */ }
      if (Math.hypot(x - home[0], z - home[2]) > radius + 1.6) continue;
      return { x, y: groundAt(ctx.template, x, z, home[1]), z };
    }
    return null;
  }

  function resetHomeAI(avatar) {
    avatar.ai = { timer: 0.6 + Math.random() * 1.6, target: null, sprint: false };
  }

  function playRandomAction(avatar) {
    if (Math.random() < 0.55) avatar.model.chain('yardIdle');
    else avatar.model.once('attack');
  }

  // 家园待命的宠物：在花园小范围闲逛，随机动作链/攻击动作，偶尔加速跑一段。
  function updateHomeAI(pet, avatar, dt, ctx) {
    if (!avatar.ai) resetHomeAI(avatar);
    const ai = avatar.ai;
    if (avatar.model.busy) {
      avatar.model.update(dt);
      return;
    }
    ai.timer -= dt;
    if (!ai.target && ai.timer <= 0) {
      const roll = Math.random();
      if (roll < 0.3) {
        ai.timer = 2 + Math.random() * 3;
        avatar.model.loop('idle');
        avatar.model.update(dt);
        return;
      }
      if (roll < 0.55) {
        playRandomAction(avatar);
        ai.timer = 1.8 + Math.random() * 2;
        avatar.model.update(dt);
        return;
      }
      const sprint = roll > 0.72;
      const target = randomHomePoint(pet, ctx, sprint ? 3.4 : 2.0);
      if (!target) { ai.timer = 1; return; }
      ai.target = target;
      ai.sprint = sprint;
      ai.timer = 2.2 + Math.random() * 2.6;
    }
    if (ai.target) {
      const speed = ai.sprint ? 4.2 : 1.35;
      const result = moveAvatar(avatar, ai.target, speed, ctx, dt);
      const slot = ai.sprint ? 'runFast' : 'walk';
      avatar.model.loop(slot, THREE.MathUtils.clamp(speed / (ai.sprint ? 5.5 : 1.7), 0.5, 1.6));
      if (result.reached || result.blocked || ai.timer <= 0) {
        ai.target = null;
        ai.sprint = false;
        ai.timer = 1.2 + Math.random() * 2.5;
        avatar.model.loop('idle');
      }
    } else {
      avatar.model.loop('idle');
      if (ctx.player.distanceTo(avatar.root.position) < 4) {
        const desired = Math.atan2(ctx.player.x - avatar.root.position.x, ctx.player.z - avatar.root.position.z);
        avatar.root.rotation.y = circularLerp(avatar.root.rotation.y, desired, Math.min(1, dt * 4));
      }
    }
    avatar.model.update(dt);
  }

  function updateAvatar(pet, avatar, dt, ctx) {
    const follow = pet.mode === 'follow';
    const standby = pet.mode === 'standby';
    const visible = follow || (standby && ctx.sceneId === HOME_SCENE_ID);
    if (!visible) { avatar.root.visible = false; avatar.eating = 0; return; }
    if (standby && (pet.homeSceneId !== HOME_SCENE_ID || !Array.isArray(pet.homePosition))) {
      pet.homeSceneId = HOME_SCENE_ID;
      pet.homePosition = yardHomePosition(pet.id);
      resetHomeAI(avatar);
      save();
    }
    if (!avatar.root.visible && !follow) {
      avatar.root.position.fromArray(pet.homePosition);
      avatar.root.rotation.y = ctx.heading;
      resetHomeAI(avatar);
    }
    avatar.root.visible = true;
    if (avatar.eating > 0) {
      avatar.eating -= dt;
      avatar.model.loop('idle');
      avatar.model.update(dt);
      if (avatar.eating <= 0) finishEating(pet, avatar);
      return;
    }
    if (avatar.petting > 0) {
      avatar.petting -= dt;
      avatar.model.update(dt);
      return;
    }
    // 有食物：同一场景里所有宠物都去抢；谁先进入范围谁锁定这一份。
    if (food && (!food.claimedBy || food.claimedBy === pet.id)) {
      const distance = Math.hypot(food.position.x - avatar.root.position.x, food.position.z - avatar.root.position.z);
      if (distance < 0.55) {
        if (!food.claimedBy) food.claimedBy = pet.id;
        avatar.eating = 0.85;
        avatar.model.loop('idle');
        avatar.model.update(dt);
        return;
      }
      const result = moveAvatar(avatar, { x: food.position.x, y: food.position.y, z: food.position.z }, 2.6, ctx, dt);
      avatar.model.loop(result.stepped > 0.05 ? 'walk' : 'idle');
      avatar.model.update(dt);
      return;
    }
    if (follow) {
      // 玩家冲刺速度是 5.64m/s。宠物的跟随上限要高于玩家，否则一按 Shift 就会被甩开。
      if (avatar.sceneId !== ctx.sceneId || avatar.root.position.distanceTo(ctx.player) > 9) placeBehind(avatar, pet, ctx);
      const lane = LANES[state.pets.findIndex(candidate => candidate.id === pet.id) % LANES.length];
      const target = offsetTarget(ctx.player, ctx.heading, lane);
      const distance = Math.hypot(target.x - avatar.root.position.x, target.z - avatar.root.position.z);
      const maxSpeed = distance > 3.4 ? 8.0 : distance > 1.5 ? 6.4 : 4.2;
      const speed = Math.min(distance * 6 + 0.4, maxSpeed);
      const result = moveAvatar(avatar, target, speed, ctx, dt);
      if (result.blocked && distance > 2.2) {
        avatar.followBlocked = (avatar.followBlocked ?? 0) + dt;
        if (avatar.followBlocked > 1.2) {
          placeBehind(avatar, pet, ctx);
          avatar.followBlocked = 0;
        }
      } else {
        avatar.followBlocked = 0;
      }
      if (result.stepped > 0.05) {
        const slot = speed > 3.8 ? 'runFast' : speed > 1.2 ? 'runSlow' : 'walk';
        const nominal = speed > 3.8 ? 5.6 : speed > 1.2 ? 2.8 : 1.7;
        avatar.model.loop(slot, THREE.MathUtils.clamp(speed / nominal, 0.5, 1.8));
      } else {
        avatar.model.loop('idle');
      }
      avatar.model.update(dt);
    } else {
      updateHomeAI(pet, avatar, dt, ctx);
    }
    if (avatar.bounce > 0) {
      avatar.bounce = Math.max(0, avatar.bounce - dt * 3.2);
      avatar.root.scale.setScalar(avatar.baseScale * (1 + avatar.bounce * 0.09));
    }
  }

  function finishEating(pet, avatar) {
    if (!food) return;
    const foodId = food.foodId;
    const position = food.mesh.position.clone();
    scene.remove(food.mesh);
    food = null;
    if (localSound) localSound.playAction?.('meal-soft');
    if (fx) fx.hearts(position.clone().add(new THREE.Vector3(0, 0.5, 0)), 5);
    avatar.model.loop('idle');
    resetHomeAI(avatar);
    onMessage(`${pet.name} 吃完了，心情不错`);
    if (dispatchPet && serverReady) {
      void petCommand('pet.feed', {petId: pet.id, foodId}).then(result => {
        if (!result || result.satiety === undefined) return;
        pet.satiety = result.satiety;
        if (dialog.open) render();
      }).catch(() => {});
    }
  }

  function requestPoopSettlement(sceneId, force = false) {
    if (!state.pets.length || !serverReady || !dispatchPet || !isConnected()) return;
    const actor = getActor?.();
    if (!actor?.actorId) return;
    const now = Date.now();
    if (!force && sceneId === lastPoopSettleScene && now - lastPoopSettleAt < 20_000) return;
    lastPoopSettleScene = sceneId;
    lastPoopSettleAt = now;
    void dispatchPet('pet.settlePoops', {actorId: actor.actorId, sceneId}).catch(() => {});
  }

  function update(dt, snapshot, visual, playerPosition) {
    if (!ready || !snapshot) return;
    syncServerPets(snapshot);
    const sceneId = getSceneId();
    const player = getPlayer();
    const sceneEntry = snapshot.scenes?.find(entry => entry.sceneId === sceneId);
    let template = null;
    try { template = sceneEntry ? getTemplate(sceneEntry.templateId) : null; } catch { template = null; }
    const ctx = { sceneId, snapshot, player: playerPosition ?? player.position, heading: player.heading ?? 0, template };
    for (const pet of state.pets) {
      let avatar = avatars.get(pet.id);
      if (!avatar) avatar = createAvatar(pet);
      if (avatar) updateAvatar(pet, avatar, dt, ctx);
    }
    requestPoopSettlement(sceneId, sceneId !== lastPoopSettleScene);
    if (food && performance.now() - food.createdAt > 15000) {
      onMessage('宠物没来得及吃，食物先收起来了');
      removeFood();
    }
    if (serverReady && dispatchPet && isConnected() && performance.now() - lastPositionSync > 1500) {
      lastPositionSync = performance.now();
      const actor = getActor?.();
      const positions = state.pets
        .map(pet => {
          const avatar = avatars.get(pet.id);
          if (!avatar?.root.visible) return null;
          return {petId: pet.id, sceneId, position: avatar.root.position.toArray()};
        })
        .filter(Boolean);
      // 静止的宠物不上报：避免同一坐标反复写世界快照和命令回执。
      const changed = positions.some(({petId, sceneId: petScene, position}) => {
        const previous = lastPublishedPositions.get(petId);
        if (!previous || previous.sceneId !== petScene) return true;
        return Math.hypot(position[0] - previous.position[0], position[2] - previous.position[2]) > 0.08;
      });
      if (changed && actor?.actorId && positions.length) {
        const payload = positions;
        void dispatchPet('pet.syncPositions', {actorId: actor.actorId, positions: payload}, {refresh: false})
          .then(() => { for (const entry of payload) lastPublishedPositions.set(entry.petId, entry); })
          .catch(() => { lastPositionSync = 0; });
      }
    }
  }

  function render() {
    const pet = selectedPet();
    updateEntryCount();
    if (activeTab === 'pets') {
      if (!state.pets.length) {
        body.innerHTML = `<p class="pet-empty">还没有宠物。去院子的大树下打开宝箱领取宠物蛋。</p>`;
        return;
      }
      body.innerHTML = `<div class="pet-list">${state.pets.map(candidate => {
        const bound = candidate.bond;
        const evolvedText = candidate.evolved ? '已进化' : candidate.readyToEvolve ? '可进化' : '';
        return `<article class="pet-card${candidate.id === pet?.id ? ' selected' : ''}" data-pet-id="${candidate.id}">
          <header><b>${escapeHtml(candidate.name)}</b><em>${evolvedText}</em></header>
          <div class="pet-bond">
            <div class="pet-bond-top"><span>羁绊</span><span>${bound}/${PET_BOND_MAX} · 本小时 +${candidate.bondWindowPoints}/${PET_BOND_HOURLY_CAP}</span></div>
            <i><em style="width:${Math.round((bound / PET_BOND_MAX) * 100)}%"></em></i>
          </div>
          <div class="pet-meta">Lv.${candidate.level ?? 1} · HP ${petStatsFor(candidate).maxHp} · 攻击 ${petStatsFor(candidate).attack} · 速度 ${petStatsFor(candidate).speed} · 饱食 ${candidate.satiety ?? 80}/100</div>
          <div class="pet-skills">技能 ${petSkillNames(candidate).join(' / ') || '—'}</div>
          <div class="pet-status">
            <div class="pet-mode" role="group" aria-label="宠物状态">
              <button type="button" data-mode="follow" class="${candidate.mode === 'follow' ? 'active' : ''}" aria-pressed="${candidate.mode === 'follow'}">跟随</button>
              <button type="button" data-mode="standby" class="${candidate.mode === 'standby' ? 'active' : ''}" aria-pressed="${candidate.mode === 'standby'}">家园待命</button>
            </div>
            <button type="button" class="pet-battle${candidate.battle ? ' active' : ''}" data-mode="battle" aria-pressed="${candidate.battle}">⚔ 出战</button>
          </div>
          <div class="pet-actions">
            <button type="button" data-action="evolve" class="primary" ${candidate.readyToEvolve ? '' : 'disabled'}>进化</button>
          </div>
        </article>`;
      }).join('')}</div>`;
    } else {
      body.innerHTML = `<div class="pet-food-grid">${Object.entries(FOODS).map(([foodId, foodDef]) =>
        `<button type="button" data-food-id="${foodId}"><span class="emoji">${FOOD_EMOJI[foodId] ?? '🍽️'}</span><span>${foodDef.label}</span></button>`
      ).join('')}</div>`;
    }
  }

  function open(tab = 'pets') {
    activeTab = tab;
    tabs.querySelectorAll('button').forEach(button => {
      const active = button.dataset.tab === activeTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    render();
    if (!dialog.open) dialog.showModal();
  }

  tabs.addEventListener('click', event => {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    activeTab = button.dataset.tab;
    open(activeTab);
  });
  body.addEventListener('click', event => {
    const card = event.target.closest('[data-pet-id]');
    const modeButton = event.target.closest('button[data-mode]');
    const actionButton = event.target.closest('button[data-action]');
    if (modeButton && card) {
      const pet = getPet(state, card.dataset.petId);
      if (!pet) return;
      const role = modeButton.dataset.mode;
      if (role === 'battle') { void setBattle(pet.id); return; }
      if (pet.mode !== role) void setMode(pet.id, role);
      return;
    }
    if (card) {
      selectPet(state, card.dataset.petId);
      save();
    }
    if (actionButton && card) {
      const id = card.dataset.petId;
      if (actionButton.dataset.action === 'evolve') void evolve(id);
      return;
    }
    const foodButton = event.target.closest('button[data-food-id]');
    if (foodButton) { placeFood(foodButton.dataset.foodId); }
  });
  entry.addEventListener('click', () => open('pets'));
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', event => event.stopPropagation());

  function raycastPet(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const camera = getCamera?.();
    if (!camera) return null;
    raycaster.setFromCamera(ndc, camera);
    const roots = [...avatars.values()].filter(avatar => avatar.root.visible).map(avatar => avatar.root);
    if (!roots.length) return null;
    const hits = raycaster.intersectObjects(roots, true);
    if (!hits.length) return null;
    let node = hits[0].object;
    while (node && !roots.includes(node)) node = node.parent;
    if (!node) return null;
    const player = getPlayer();
    if (node.position.distanceTo(player.position) > 4.5) return null;
    for (const [id, avatar] of avatars) {
      if (avatar.root !== node) continue;
      const bounds = new THREE.Box3().setFromObject(avatar.root);
      const height = Math.max(0.001, bounds.max.y - bounds.min.y);
      const head = (hits[0].point.y - bounds.min.y) / height >= 0.55;
      return { id, head };
    }
    return null;
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button === 0) pointerDown = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', event => {
    if (event.button !== 0 || !pointerDown) return;
    const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    pointerDown = null;
    if (moved > 8 || isEditing() || isFirstPerson() || isBattle()) return;
    const target = raycastPet(event.clientX, event.clientY);
    if (!target) return;
    if (!target.head) { onMessage('摸摸宠物的头才能增加羁绊'); return; }
    petById(target.id);
  });

  updateEntryCount();
  return {
    load,
    update,
    open,
    hasFollowers: () => ready && followingPets(state).length > 0,
    hasFollowingPets: () => followingPets(state).length > 0,
    getBattlePet: () => petBattlePet(state),
    isReady: () => ready,
    _debug: () => [...avatars.entries()].map(([id, avatar]) => {
      const bounds = new THREE.Box3().setFromObject(avatar.root);
      return {
        id,
        visible: avatar.root.visible,
        pos: avatar.root.position.toArray().map((value) => +value.toFixed(2)),
        height: +(bounds.max.y - bounds.min.y).toFixed(2),
        petting: +(avatar.petting ?? 0).toFixed(2),
        clip: avatar.model?.currentClip ?? null,
        ai: avatar.ai ? { target: avatar.ai.target, sprint: avatar.ai.sprint, timer: +avatar.ai.timer.toFixed(2), busy: avatar.model.busy, clip: avatar.model.currentClip } : null,
      };
    }),
    placeFood,
    _settlePoops: () => { requestPoopSettlement(getSceneId(), true); return true; },
    _forcePoop: () => { requestPoopSettlement(getSceneId(), true); return true; },
    _state: () => state,
  };
}
