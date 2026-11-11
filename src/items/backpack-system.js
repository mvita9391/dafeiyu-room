import * as THREE from 'three';
import { surfaceAt } from '../../shared/world/coastal.js';
import { getTemplate } from '../../shared/world/templates.js';
import { nearestFree } from '../../shared/world/navigation.js';
import { compostPositionForSnapshot } from '../../shared/world/compost.js';
import { ITEMS, ITEM_IDS, getItemDef } from '../../shared/world/items.js';
import {
  loadItemState, saveItemState, inventoryTotal, getGroundItem,
  tickCompost, getCompostStatus, markCompostNotified,
  COMPOST_DURATION_MS, BAG_SLOT_COUNT, GROUND_ITEM_CAP, ensureSlots, normalizeItemState,
} from '../../shared/items/item-store.js';

const YARD_SCENE_ID = 'yard';
const INTERACT_DISTANCE = 4.5;
const DROP_FORWARD = 1.1;

const STYLE = `
#bag-entry{position:fixed;right:max(24px,env(safe-area-inset-right));bottom:max(24px,env(safe-area-inset-bottom));z-index:36;box-shadow:0 6px 18px #3b2a1c24}
#bag-entry .bag-count{display:inline-flex;min-width:18px;height:18px;align-items:center;justify-content:center;
  padding:0 5px;border-radius:9px;background:#a8794f;color:#fff;font-size:10px;line-height:1;vertical-align:1px}
.bag-panel{width:min(440px,calc(100vw - 32px))}
.bag-summary{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#78665a;margin:2px 0 10px}
.bag-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.bag-slot{position:relative;aspect-ratio:1;min-width:0;padding:0;display:grid;place-items:center;
  border:1px solid #e3d2bc;border-radius:12px;background:#fffdf7;color:#51454a;font:inherit;cursor:grab;
  touch-action:none;transition:background .15s,border-color .15s,box-shadow .15s,transform .12s}
.bag-slot:hover{background:#fff4e4;border-color:#c9a477;transform:translateY(-1px)}
.bag-slot.selected{border-color:#b48a5f;box-shadow:0 0 0 2px #e3c9aa inset;background:#fff7e9}
.bag-slot .emoji{font-size:30px;line-height:1;filter:drop-shadow(0 2px 2px #5a3a1a22);display:grid;place-items:center}
.bag-slot .emoji svg{width:34px;height:34px}
.bag-slot.dragging{opacity:.35}
.bag-slot.drop-target{border-color:#a8794f;background:#fff0d8;box-shadow:0 0 0 2px #cba77c inset}
.bag-slot .count{position:absolute;right:6px;bottom:4px;font-size:11px;font-weight:600;color:#6a5546;
  font-variant-numeric:tabular-nums;background:#fffaf1d9;border-radius:7px;padding:0 3px;line-height:1.5}
.bag-slot.empty{background:#faf3e8;border-style:dashed;cursor:default;opacity:.65}
.bag-slot.empty:hover{background:#faf3e8;border-color:#e3d2bc;transform:none}
.bag-detail{margin-top:12px;padding:12px;border:1px solid #eadcc9;border-radius:13px;background:#fffaf1}
.bag-detail-head{display:flex;align-items:center;gap:7px;margin-bottom:6px}
.bag-detail-head .emoji{font-size:20px;display:grid;place-items:center}
.bag-detail-head .emoji svg{width:24px;height:24px}
.bag-detail-head b{font-size:14px}
.bag-detail-head em{margin-left:auto;font-style:normal;font-size:12px;color:#8a7563;font-variant-numeric:tabular-nums}
.bag-detail p{margin:0;font-size:13px;line-height:1.55;color:#6b594b}
.bag-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
.bag-actions button,.bag-compost button{padding:9px 14px;min-height:42px;border:1px solid #d6bfa5;border-radius:10px;
  background:#fff9ee;color:#5d493b;font:inherit;font-size:13px;cursor:pointer;transition:background .15s}
.bag-actions button:hover:not(:disabled),.bag-compost button:hover:not(:disabled){background:#fff0d8}
.bag-actions button.primary,.bag-compost button.primary{background:#a8794f;border-color:#a8794f;color:#fff}
.bag-actions button.primary:hover:not(:disabled),.bag-compost button.primary:hover:not(:disabled){background:#93663f}
.bag-actions button:disabled,.bag-compost button:disabled{opacity:.42;cursor:default}
.bag-empty{padding:22px 8px;text-align:center;color:#8a7563;font-size:13px;line-height:1.6}
.bag-compost{display:grid;gap:12px}
.bag-status{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #eadcc9;border-radius:13px;background:#fffaf1}
.bag-status .badge{flex:none;width:44px;height:44px;display:grid;place-items:center;border-radius:12px;background:#f2e5d3;font-size:23px}
.bag-status .grow{display:grid;gap:4px;min-width:0;flex:1}
.bag-status b{font-size:14px}
.bag-status span{font-size:12px;color:#78665a}
.bag-progress{height:9px;border-radius:99px;background:#e9dccb;overflow:hidden}
.bag-progress i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#b7c98b,#7d9b58);transition:width .4s}
.bag-compost .row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.bag-hint{margin:0;font-size:11px;line-height:1.55;color:#8a7563}
.bag-hint.warn{color:#9a5a32}
.bag-foot{margin:12px 0 0;font-size:11px;color:#8a7563;line-height:1.55}
body.bag-dragging, body.bag-dragging *{cursor:grabbing!important;user-select:none}
.bag-drag-ghost{position:fixed;z-index:100;width:54px;height:54px;display:grid;place-items:center;pointer-events:none;
  border:1px solid #c9a477;border-radius:12px;background:#fffdf7;box-shadow:0 8px 20px #3b2a1c30;
  transform:translate(-50%,-50%) rotate(-5deg);font-size:30px;opacity:.94}
.bag-drag-ghost svg{width:32px;height:32px}
@media (max-width:760px){
  #bag-entry{right:max(14px,env(safe-area-inset-right));bottom:calc(max(16px,env(safe-area-inset-bottom)) + 74px);
    padding:10px 12px;font-size:12px}
}
@media (max-width:520px){
  .bag-panel{width:calc(100vw - 20px)}
  .bag-grid{gap:6px}
  .bag-slot .emoji{font-size:25px}
  .bag-status .badge{width:40px;height:40px;font-size:21px}
}
`;

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function makeRoundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function makeLabelSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.7, 0.425, 1);
  sprite.position.set(0, 1.48, 0);
  sprite.raycast = () => {};
  function draw(text) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 250, 240, .94)';
    makeRoundRect(ctx, 8, 10, 304, 58, 16);
    ctx.fill();
    ctx.strokeStyle = '#c9ad8a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#5d493b';
    ctx.font = '600 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 160, 40);
    texture.needsUpdate = true;
  }
  draw('堆肥箱 · 空闲');
  return { sprite, draw, texture, material };
}

function makeCompostModel() {
  const root = new THREE.Group();
  root.name = 'yard-compost-bin';
  root.userData.interact = 'compost';
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.88, metalness: 0.02 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x653f24, roughness: 0.92 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x3f2a1c, roughness: 1 });
  const add = (geometry, material, position, rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // 底部垫土
  add(box(1.2, 0.1, 1.1), soil, [0, 0.05, 0]);
  // 四根木柱
  for (const x of [-0.56, 0.56]) for (const z of [-0.5, 0.5]) add(box(0.1, 0.82, 0.1), woodDark, [x, 0.44, z]);
  // 三面木板，正面留出可见的堆肥口
  add(box(1.14, 0.5, 0.08), wood, [0, 0.32, -0.51]);
  add(box(0.08, 0.5, 0.95), wood, [-0.55, 0.32, 0]);
  add(box(0.08, 0.5, 0.95), wood, [0.55, 0.32, 0]);
  add(box(1.02, 0.12, 0.76), soil, [0, 0.5, 0]);
  // 顶部盖板微微掀开
  const lid = add(box(1.22, 0.08, 1.02), wood, [0, 0.83, 0.03], [-0.16, 0, 0]);
  lid.position.z = 0.05;
  // 前面的小踏板
  add(box(1.0, 0.08, 0.18), woodDark, [0, 0.12, 0.58]);
  // 状态灯
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x9c9c85, emissive: 0x3f3f2e, emissiveIntensity: 0.35, roughness: 0.4 }));
  light.position.set(0.46, 0.92, 0.42);
  root.add(light);
  // 小木牌
  const post = add(box(0.07, 0.52, 0.07), woodDark, [-0.68, 0.26, 0.45]);
  const sign = add(box(0.52, 0.24, 0.06), wood, [-0.68, 0.58, 0.45]);
  sign.rotation.z = -0.04;
  const label = makeLabelSprite();
  root.add(label.sprite);
  root.traverse(node => { if (node.isMesh) node.frustumCulled = false; });
  return { root, light, label };
}

let stinkTexture = null;

function makeStinkTexture() {
  if (stinkTexture) return stinkTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#8fbf56';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = '#c6ea91';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(23, 57);
  ctx.bezierCurveTo(10, 47, 42, 40, 28, 30);
  ctx.bezierCurveTo(16, 21, 43, 17, 33, 7);
  ctx.stroke();
  ctx.strokeStyle = '#9aca63';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(43, 54);
  ctx.bezierCurveTo(55, 45, 38, 35, 49, 25);
  ctx.bezierCurveTo(57, 18, 47, 12, 52, 5);
  ctx.stroke();
  stinkTexture = new THREE.CanvasTexture(canvas);
  stinkTexture.colorSpace = THREE.SRGBColorSpace;
  return stinkTexture;
}

function makeFly() {
  const fly = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 5),
    new THREE.MeshStandardMaterial({ color: 0x201a16, roughness: 0.7 }));
  body.castShadow = true;
  body.raycast = () => {};
  fly.add(body);
  const wingMaterial = new THREE.MeshBasicMaterial({
    color: 0xd9e6cf, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false,
  });
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.022), wingMaterial);
    wing.position.set(side * 0.018, 0.012, -0.004);
    wing.rotation.y = side * 0.35;
    wing.raycast = () => {};
    fly.add(wing);
    wings.push(wing);
  }
  return { group: fly, wings };
}

function makeStinkFx(group) {
  const texture = makeStinkTexture();
  const wisps = [];
  for (let index = 0; index < 3; index += 1) {
    const material = new THREE.SpriteMaterial({
      map: texture, transparent: true, opacity: 0, depthWrite: false, color: 0xd7f0ae,
    });
    const sprite = new THREE.Sprite(material);
    sprite.raycast = () => {};
    sprite.scale.set(0.17, 0.17, 1);
    sprite.position.set((Math.random() - 0.5) * 0.24, 0.22, (Math.random() - 0.5) * 0.18);
    group.add(sprite);
    wisps.push({
      sprite,
      phase: index / 3 + Math.random() * 0.14,
      speed: 0.26 + Math.random() * 0.12,
      baseX: (Math.random() - 0.5) * 0.18,
      baseZ: (Math.random() - 0.5) * 0.14,
      wobble: 0.55 + Math.random() * 0.5,
    });
  }
  const flies = [];
  for (let index = 0; index < 2; index += 1) {
    const fly = makeFly();
    group.add(fly.group);
    flies.push({
      ...fly,
      phase: Math.random() * Math.PI * 2,
      speed: 1.7 + Math.random() * 0.8,
      radius: 0.17 + Math.random() * 0.09,
      height: 0.28 + index * 0.09,
    });
  }
  group.userData.stink = { wisps, flies };
}

function animatePoop(mesh, time) {
  const stink = mesh.userData.stink;
  if (!stink) return;
  for (const wisp of stink.wisps) {
    const progress = (time * wisp.speed + wisp.phase) % 1;
    const y = 0.18 + progress * 0.72;
    wisp.sprite.position.set(
      wisp.baseX + Math.sin(time * wisp.wobble + wisp.phase * 9) * (0.025 + progress * 0.08),
      y,
      wisp.baseZ + Math.cos(time * wisp.wobble * 0.8 + wisp.phase * 7) * 0.035,
    );
    const fade = Math.sin(progress * Math.PI);
    wisp.sprite.material.opacity = 0.08 + fade * 0.62;
    const scale = 0.14 + progress * 0.16;
    wisp.sprite.scale.set(scale, scale * 1.32, 1);
  }
  for (const fly of stink.flies) {
    const angle = time * fly.speed + fly.phase;
    fly.group.position.set(
      Math.cos(angle) * fly.radius + Math.sin(angle * 2.3) * 0.035,
      fly.height + Math.sin(angle * 2.7) * 0.045,
      Math.sin(angle) * fly.radius * 0.8,
    );
    fly.group.rotation.y = angle * 1.4;
    fly.group.rotation.z = Math.sin(angle * 4) * 0.18;
    const flap = 0.35 + Math.abs(Math.sin(time * 28 + fly.phase)) * 0.75;
    fly.wings[0].rotation.z = flap;
    fly.wings[1].rotation.z = -flap;
  }
}

function makePoopModel(itemId) {
  const group = new THREE.Group();
  group.name = `ground-${itemId}`;
  group.userData.itemId = itemId;
  group.userData.interact = 'poop';
  const material = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.94 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4b301d, roughness: 1 });
  const lumps = [
    { p: [0, 0.09, 0], s: [0.22, 0.12, 0.2] },
    { p: [0.1, 0.16, 0.02], s: [0.15, 0.13, 0.14] },
    { p: [-0.08, 0.14, -0.03], s: [0.13, 0.1, 0.13] },
  ];
  lumps.forEach((lump, index) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), index === 1 ? dark : material);
    mesh.position.set(...lump.p);
    mesh.scale.set(...lump.s);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 8), dark);
  top.position.set(0.02, 0.27, 0.02);
  top.rotation.z = 0.25;
  top.castShadow = true;
  group.add(top);
  group.rotation.y = Math.random() * Math.PI * 2;
  group.scale.setScalar(1.2);
  makeStinkFx(group);
  return group;
}

export function mountBackpackSystem({
  scene, canvas,
  getCamera, getSnapshot, getSceneId, getPlayer,
  isEditing = () => false,
  isFirstPerson = () => false,
  isBattle = () => false,
  getActor = () => null,
  dispatchItems = null,
  isConnected = () => false,
  onMessage = () => {},
  localSound = null,
  fx = null,
} = {}) {
  const storage = (() => { try { return globalThis.localStorage; } catch { return null; } })();
  let state = loadItemState(storage, Date.now());
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundLayer = new THREE.Group();
  groundLayer.name = 'yard-ground-items';
  groundLayer.visible = false;
  scene.add(groundLayer);
  const meshes = new Map();
  let compost = null;
  let pointerDown = null;
  let hoverThrottle = 0;
  let selectedItemId = 'poop';
  let selectedEmpty = false;
  let panelTimer = null;
  let lastLabelKey = '';
  let lastCompostTick = 0;
  let itemTime = 0;
  let appliedServerItems = null;
  let migrationGround = null;
  let migrationOwner = null;
  let compostPositionKey = '';
  let drag = null;
  let dragGhost = null;
  let suppressClickUntil = 0;

  if (!document.getElementById('backpack-style')) {
    const style = document.createElement('style');
    style.id = 'backpack-style';
    style.textContent = STYLE;
    document.head.append(style);
  }

  const entry = document.createElement('button');
  entry.type = 'button';
  entry.id = 'bag-entry';
  entry.className = 'toolbar-action';
  entry.innerHTML = '<span aria-hidden="true">🎒</span> 背包 <span class="bag-count"></span>';
  document.body.append(entry);

  const dialog = document.createElement('dialog');
  dialog.id = 'bag-panel';
  dialog.className = 'settings-dialog bag-panel';
  dialog.setAttribute('aria-labelledby', 'bag-panel-title');
  dialog.innerHTML = `<div class="settings-card">
    <header class="settings-header"><h2 id="bag-panel-title">背包</h2><button class="settings-close" type="button" aria-label="关闭背包">×</button></header>
    <div class="bag-body"></div>
  </div>`;
  document.body.append(dialog);
  const body = dialog.querySelector('.bag-body');

  const compostDialog = document.createElement('dialog');
  compostDialog.id = 'compost-panel';
  compostDialog.className = 'settings-dialog compost-panel';
  compostDialog.setAttribute('aria-labelledby', 'compost-panel-title');
  compostDialog.innerHTML = `<div class="settings-card">
    <header class="settings-header"><h2 id="compost-panel-title">堆肥箱</h2><button class="settings-close" type="button" aria-label="关闭堆肥箱">×</button></header>
    <div class="compost-body"></div>
    <p class="bag-foot">便便会在约 2 分钟后变成肥料。肥料先存进背包，等种地系统接入后使用。</p>
  </div>`;
  document.body.append(compostDialog);
  const compostBody = compostDialog.querySelector('.compost-body');

  function totalItems() { return inventoryTotal(state); }

  function updateBadge() {
    const count = entry.querySelector('.bag-count');
    if (count) count.textContent = String(totalItems());
  }

  function actorId() {
    return getActor?.()?.actorId ?? getSnapshot()?.actors?.[0]?.actorId ?? null;
  }

  let importAttempted = false;
  let importBlocked = false;

  function importItems() {
    const id = actorId();
    if (!dispatchItems || !isConnected() || !id || importAttempted) return;
    importAttempted = true;
    void dispatchItems('item.import', {actorId: id, state}, {refresh: true})
      .catch(error => {
        importAttempted = false;
        if (error.message === 'LEGACY_GROUND_FULL') {
          importBlocked = true;
          onMessage('地面物品满了，先捡走几件再迁移旧背包');
        }
      });
  }

  function effectiveItemState() {
    return migrationGround && migrationOwner ? migrationOwner : state;
  }

  function visibleGroundItems() {
    return migrationGround ?? state.groundItems;
  }

  function visibleInventory() {
    return effectiveItemState().inventory;
  }

  function syncServerItems() {
    const id = actorId();
    if (!id) return;
    const owner = getSnapshot()?.items?.owners?.[id];
    if (owner && owner.legacyImported === true) {
      migrationGround = null;
      migrationOwner = null;
      if (owner === appliedServerItems) return;
      appliedServerItems = owner;
      state = normalizeItemState(owner, Date.now());
      saveItemState(storage, state);
      syncGroundMeshes();
      updateBadge();
      if (compost) updateCompostVisual(true);
      if (dialog.open) render();
      if (compostDialog.open) renderCompost();
      return;
    }
    // 服务端可能已经先生成了便便；在迁移完成前不要把本地旧背包写掉。
    // 但必须把服务端地面物品显示出来，否则玩家无法按提示清出空间。
    const ownerChanged = owner !== migrationOwner;
    migrationGround = owner && Array.isArray(owner.groundItems) ? owner.groundItems : null;
    migrationOwner = owner ?? null;
    if (ownerChanged) {
      syncGroundMeshes();
      if (compost) updateCompostVisual(true);
      if (compostDialog.open) renderCompost();
    }
    if (importBlocked) {
      const serverIds = new Set(migrationGround.map(item => item.id));
      const incoming = state.groundItems.filter(item => !serverIds.has(item.id)).length;
      if (migrationGround.length + incoming > GROUND_ITEM_CAP) return;
      importBlocked = false;
      importAttempted = false;
    }
    importItems();
  }

  function save() {
    saveItemState(storage, state);
    updateBadge();
  }

  function refreshCompostTimer() {
    if (panelTimer) { clearInterval(panelTimer); panelTimer = null; }
    if (!compostDialog.open) return;
    panelTimer = setInterval(() => {
      if (compostDialog.open) refreshCompostLive();
    }, 500);
  }

  function nearCompost() {
    if (!compost || getSceneId() !== YARD_SCENE_ID) return false;
    const player = getPlayer();
    return Math.hypot(compost.root.position.x - player.position.x, compost.root.position.z - player.position.z) <= INTERACT_DISTANCE;
  }

  function occupiedItemIds() {
    return ITEM_IDS.filter(id => (state.inventory[id] ?? 0) > 0);
  }

  function itemIconHtml(def) {
    return def.icon ?? `<span aria-hidden="true">${def.emoji}</span>`;
  }

  function renderItems() {
    ensureSlots(state);
    const occupied = state.slots.filter(Boolean);
    if (!selectedEmpty && (!selectedItemId || !occupied.includes(selectedItemId))) {
      selectedItemId = occupied[0] ?? null;
      if (!selectedItemId) selectedEmpty = true;
    }
    const slots = state.slots;
    const selected = selectedEmpty ? null : (selectedItemId ? ITEMS[selectedItemId] : null);
    const count = selected ? state.inventory[selected.id] ?? 0 : 0;
    body.innerHTML = `
      <div class="bag-grid" role="list" aria-label="背包格子">
        ${slots.map((id, index) => {
          if (!id) return `<button type="button" class="bag-slot empty" data-slot-index="${index}" role="listitem" aria-label="空格子"></button>`;
          const def = ITEMS[id];
          const owned = state.inventory[id] ?? 0;
          return `<button type="button" class="bag-slot${id === selectedItemId ? ' selected' : ''}" data-slot-index="${index}" data-bag-item="${id}" role="listitem" aria-label="${def.name} ${owned} 个，拖出背包可丢弃">
            <span class="emoji">${itemIconHtml(def)}</span>
            <span class="count">×${owned}</span>
          </button>`;
        }).join('')}
      </div>
      ${selected ? `<div class="bag-detail" title="${selected.description} 拖出背包可丢弃">
        <div class="bag-detail-head"><span class="emoji">${itemIconHtml(selected)}</span><b>${selected.name}</b><em>×${count}</em></div>
      </div>` : ''}
    `;
  }

  function refreshCompostLive() {
    if (!compostDialog.open) return;
    const root = compostBody.querySelector('.bag-compost');
    if (!root) return;
    const effective = effectiveItemState();
    const live = getCompostStatus(effective, Date.now());
    const near = nearCompost();
    const count = effective.inventory.poop ?? 0;
    const badge = root.querySelector('.bag-status .badge');
    const copy = root.querySelector('.compost-copy');
    const bar = root.querySelector('.bag-progress');
    const fill = bar?.querySelector('i');
    const hint = root.querySelector('.bag-hint');
    const deposit = root.querySelector('[data-bag-action="deposit"]');
    const collect = root.querySelector('[data-bag-action="collect"]');
    if (badge) badge.textContent = live.status === 'processing' ? '⏳' : live.status === 'ready' ? '🌿' : '🪵';
    if (copy) copy.textContent = live.status === 'processing'
      ? `堆肥中 · 还剩 ${formatRemaining(live.remainingMs)}`
      : live.status === 'ready'
        ? '肥料可以收了'
        : '空闲 · 放入便便开始堆肥';
    const progress = Math.round((live.status === 'ready' ? 1 : live.progress ?? 0) * 100);
    if (bar) bar.setAttribute('aria-valuenow', String(progress));
    if (fill) fill.style.width = `${progress}%`;
    if (hint) {
      hint.textContent = near
        ? `背包里有 ${count} 份便便。堆肥约需 ${Math.round(COMPOST_DURATION_MS / 60000)} 分钟。`
        : '走到院子农田边的堆肥箱旁再操作。';
      hint.classList.toggle('warn', !near);
    }
    if (deposit) deposit.disabled = !near || live.status !== 'empty' || count <= 0;
    if (collect) collect.disabled = !near || live.status !== 'ready' || (effective.inventory.fertilizer ?? 0) >= ITEMS.fertilizer.stackMax;
  }

  function renderCompost() {
    if (!compost) ensureCompost();
    const now = Date.now();
    const effective = effectiveItemState();
    const live = getCompostStatus(effective, now);
    const near = nearCompost();
    const count = effective.inventory.poop ?? 0;
    const statusCopy = live.status === 'processing'
      ? `堆肥中 · 还剩 ${formatRemaining(live.remainingMs)}`
      : live.status === 'ready'
        ? '肥料可以收了'
        : '空闲 · 放入便便开始堆肥';
    const badge = live.status === 'processing' ? '⏳' : live.status === 'ready' ? '🌿' : '🪵';
    const progress = Math.round((live.status === 'ready' ? 1 : live.progress ?? 0) * 100);
    const depositDisabled = !near || live.status !== 'empty' || count <= 0;
    const collectDisabled = !near || live.status !== 'ready' || (effective.inventory.fertilizer ?? 0) >= ITEMS.fertilizer.stackMax;
    compostBody.innerHTML = `
      <div class="bag-compost">
        <div class="bag-status">
          <span class="badge" aria-hidden="true">${badge}</span>
          <span class="grow"><b>堆肥箱</b><span class="compost-copy">${statusCopy}</span></span>
        </div>
        <div class="bag-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><i style="width:${progress}%"></i></div>
        <p class="bag-hint${near ? '' : ' warn'}">${near ? `背包里有 ${count} 份便便。堆肥约需 ${Math.round(COMPOST_DURATION_MS / 60000)} 分钟。` : '走到院子农田边的堆肥箱旁再操作。'}</p>
        <div class="row">
          <button type="button" data-bag-action="deposit" ${depositDisabled ? 'disabled' : ''}>放入 1 份便便</button>
          <button type="button" data-bag-action="collect" class="primary" ${collectDisabled ? 'disabled' : ''}>收取肥料</button>
        </div>
      </div>
    `;
    refreshCompostLive();
  }

  function render() {
    renderItems();
  }

  function open() {
    selectedItemId = null;
    selectedEmpty = true;
    render();
    if (!dialog.open) dialog.showModal();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function openCompost() {
    if (compostDialog.open) return;
    ensureCompost();
    renderCompost();
    compostDialog.showModal();
    refreshCompostTimer();
  }

  function closeCompost() {
    if (compostDialog.open) compostDialog.close();
    if (panelTimer) { clearInterval(panelTimer); panelTimer = null; }
  }

  function groundSpot() {
    const player = getPlayer();
    const heading = player.heading ?? 0;
    const snapshot = getSnapshot();
    const sceneId = getSceneId();
    let x = player.position.x + Math.sin(heading) * DROP_FORWARD;
    let z = player.position.z + Math.cos(heading) * DROP_FORWARD;
    let y = player.position.y;
    try {
      const free = nearestFree(snapshot, sceneId, [x, y, z]);
      x = free[0]; z = free[2];
      if (Number.isFinite(free[1])) y = free[1];
    } catch { /* 用玩家前方 */ }
    try {
      const entry = snapshot.scenes?.find(scene => scene.sceneId === sceneId);
      const template = entry ? getTemplate(entry.templateId) : null;
      y = surfaceAt(template, x, z)?.height ?? y;
    } catch { /* 保持玩家高度 */ }
    return [x, y, z];
  }

  function createGroundMesh(item) {
    let mesh = meshes.get(item.id);
    if (mesh) return mesh;
    mesh = makePoopModel(item.id);
    mesh.position.fromArray(item.position);
    groundLayer.add(mesh);
    meshes.set(item.id, mesh);
    return mesh;
  }

  function removeGroundMesh(id) {
    const mesh = meshes.get(id);
    if (!mesh) return;
    groundLayer.remove(mesh);
    mesh.traverse(node => {
      if (node.isMesh || node.isSprite || node.isPoints) {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach(material => material.dispose?.());
        else node.material?.dispose?.();
      }
    });
    meshes.delete(id);
  }

  function syncGroundMeshes() {
    const items = visibleGroundItems();
    const wanted = new Set(items.map(item => item.id));
    for (const item of items) if (!meshes.has(item.id)) createGroundMesh(item);
    for (const id of [...meshes.keys()]) if (!wanted.has(id)) removeGroundMesh(id);
  }

  function spawnPoop(position, { sceneId = YARD_SCENE_ID, silent = false } = {}) {
    const point = Array.isArray(position) ? position : [position?.x, position?.y, position?.z];
    if (!point.every(Number.isFinite)) return false;
    const id = actorId();
    if (!dispatchItems || !isConnected() || !id) return false;
    void dispatchItems('item.poop', {actorId: id, sceneId, position: point}).catch(error => {
      if (!silent) onMessage(error.message === 'GROUND_FULL' ? '院子里便便太多了，先捡一些' : '便便生成失败');
    });
    return true;
  }

  async function pickupItem(id) {
    const item = visibleGroundItems().find(entry => entry.id === id) ?? getGroundItem(state, id);
    if (!item) return;
    const def = getItemDef(item.type);
    if (!def) return;
    if ((visibleInventory()[item.type] ?? 0) >= def.stackMax) { onMessage(`背包里的${def.name}已经满了`); return; }
    const owner = actorId();
    if (!dispatchItems || !isConnected() || !owner) { onMessage('连接世界后才能捡东西'); return; }
    try {
      await dispatchItems('item.pickup', {actorId: owner, itemId: id});
      localSound?.playAction?.('ui-confirm');
      if (fx) fx.burst(new THREE.Vector3().fromArray(item.position).add(new THREE.Vector3(0, 0.3, 0)), 5);
      onMessage(`捏着鼻子捡起${def.name} ×1`);
    } catch (error) {
      onMessage(error.message === 'INVENTORY_FULL' ? `背包里的${def.name}已经满了` : '捡不起来，靠近一点再试');
    }
  }

  function groundPointFromClient(clientX, clientY) {
    const camera = getCamera?.();
    if (!camera) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const player = getPlayer();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(player.position.y ?? 0));
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, point)) return null;
    let x = point.x;
    let z = point.z;
    let y = player.position.y;
    const snapshot = getSnapshot();
    const sceneId = getSceneId();
    try {
      const free = nearestFree(snapshot, sceneId, [x, y, z]);
      x = free[0]; z = free[2];
      if (Number.isFinite(free[1])) y = free[1];
    } catch { /* 保留指针落点 */ }
    try {
      const entry = snapshot.scenes?.find(scene => scene.sceneId === sceneId);
      const template = entry ? getTemplate(entry.templateId) : null;
      y = surfaceAt(template, x, z)?.height ?? y;
    } catch { /* 保持玩家高度 */ }
    return [x, y, z];
  }

  async function dropItemToGround(id, clientX, clientY) {
    const def = ITEMS[id];
    if (!def) return false;
    if (!def.placeable) { onMessage(`${def.name}不能丢到地上`); return false; }
    if ((state.inventory[id] ?? 0) <= 0) { onMessage(`背包里没有${def.name}了`); return false; }
    if (getSceneId() !== YARD_SCENE_ID) { onMessage('回到院子才能把东西丢到地上'); return false; }
    const owner = actorId();
    if (!dispatchItems || !isConnected() || !owner) { onMessage('连接世界后才能丢东西'); return false; }
    const position = groundPointFromClient(clientX, clientY) ?? groundSpot();
    try {
      await dispatchItems('item.drop', {actorId: owner, type: id, sceneId: YARD_SCENE_ID, position});
      close();
      localSound?.playAction?.('ui-confirm');
      onMessage(`${def.name}丢在院子里了`);
      return true;
    } catch (error) {
      onMessage(error.message === 'GROUND_FULL' ? '地上东西太多了，先捡一些吧' : '这里放不下，换个地方试试');
      return false;
    }
  }

  function itemGhost(def) {
    const ghost = document.createElement('div');
    ghost.className = 'bag-drag-ghost';
    ghost.innerHTML = itemIconHtml(def);
    document.body.append(ghost);
    return ghost;
  }

  function clearDropTargets() {
    for (const node of body.querySelectorAll('.bag-slot.drop-target, .bag-slot.dragging')) {
      node.classList.remove('drop-target', 'dragging');
    }
  }

  function slotAtPoint(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    const slot = element?.closest?.('[data-slot-index]');
    return slot && dialog.contains(slot) ? slot : null;
  }

  async function depositCompost() {
    if (!nearCompost()) { onMessage('走到院子农田边的堆肥箱旁再操作'); return; }
    const owner = actorId();
    if (!dispatchItems || !isConnected() || !owner) { onMessage('连接世界后才能堆肥'); return; }
    try {
      await dispatchItems('item.compost', {actorId: owner});
      localSound?.playAction?.('ui-confirm');
      onMessage('便便放进堆肥箱了，等一会儿就能收肥料');
    } catch (error) {
      const code = error.message;
      onMessage(code === 'NO_POOP' ? '背包里还没有便便' : code === 'COMPOST_BUSY' ? '堆肥箱还在工作，等它完成再放' : '靠近农田边的堆肥箱再试');
    }
  }

  async function collectFertilizer() {
    if (!nearCompost()) { onMessage('走到院子农田边的堆肥箱旁再操作'); return; }
    const owner = actorId();
    if (!dispatchItems || !isConnected() || !owner) { onMessage('连接世界后才能收肥料'); return; }
    try {
      const result = await dispatchItems('item.collect', {actorId: owner});
      localSound?.playAction?.('ui-confirm');
      if (fx && compost) fx.burst(compost.root.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 8);
      onMessage(`收成了 ${result?.count ?? 1} 份肥料`);
    } catch (error) {
      const code = error.message;
      onMessage(code === 'INVENTORY_FULL' ? '背包里的肥料已经满了' : code === 'COMPOST_NOT_READY' ? '肥料还没好，再等一会儿' : '靠近农田边的堆肥箱再试');
    }
  }

  async function moveSlot(from, to) {
    const owner = actorId();
    if (!dispatchItems || !isConnected() || !owner) return;
    try {
      await dispatchItems('item.moveSlot', {actorId: owner, from, to});
      selectedEmpty = false;
      selectedItemId = state.slots?.[to] ?? selectedItemId;
    } catch { /* 保持原样 */ }
  }

  function ensureCompost() {
    const snapshot = getSnapshot();
    if (!snapshot) return;
    const yard = snapshot.scenes?.find(scene => scene.sceneId === YARD_SCENE_ID);
    if (!yard) return;
    const farm = snapshot.entities?.find(entity => entity.type === 'yardFarm' && entity.sceneId === YARD_SCENE_ID);
    const positionKey = `${yard.templateId}:${snapshot.layoutRevision ?? snapshot.topologyRevision ?? 0}:${farm?.position?.join(',') ?? 'fallback'}`;
    if (compost && positionKey === compostPositionKey) return;
    const point = compostPositionForSnapshot(snapshot);
    let template = null;
    try { template = getTemplate(yard.templateId); } catch { template = null; }
    const y = surfaceAt(template, point[0], point[2])?.height ?? point[1] ?? 0;
    if (compost) {
      compost.root.position.set(point[0], y, point[2]);
      compostPositionKey = positionKey;
      updateCompostVisual(true);
      return;
    }
    const built = makeCompostModel();
    built.root.position.set(point[0], y, point[2]);
    built.root.rotation.y = -Math.PI / 2;
    built.root.visible = getSceneId() === YARD_SCENE_ID;
    scene.add(built.root);
    compost = built;
    compostPositionKey = positionKey;
    updateCompostVisual(true);
  }

  function updateCompostVisual(force = false) {
    if (!compost) return;
    const live = getCompostStatus(effectiveItemState(), Date.now());
    const key = live.status === 'processing' ? `processing-${Math.ceil(live.remainingMs / 1000)}` : live.status;
    if (!force && key === lastLabelKey) return;
    lastLabelKey = key;
    if (live.status === 'processing') {
      compost.label.draw(`堆肥中 ${formatRemaining(live.remainingMs)}`);
      compost.light.material.color.setHex(0xd4a94c);
      compost.light.material.emissive.setHex(0x8a6518);
    } else if (live.status === 'ready') {
      compost.label.draw('肥料可以收了');
      compost.light.material.color.setHex(0x8fc76c);
      compost.light.material.emissive.setHex(0x3f7f26);
    } else {
      compost.label.draw('堆肥箱 · 空闲');
      compost.light.material.color.setHex(0x9c9c85);
      compost.light.material.emissive.setHex(0x3f3f2e);
    }
  }

  function tick(now) {
    ensureCompost();
    const effective = effectiveItemState();
    if (effective === state) {
      const wasReady = state.compost.status === 'ready';
      const result = tickCompost(state, now);
      if (result.becameReady && !state.compost.notified) {
        markCompostNotified(state);
        save();
        onMessage('堆肥好了，去院子农田边收肥料吧');
      } else if (wasReady && state.compost.status === 'ready') {
        // 保持状态；通知只发一次。
      }
    }
    if (now - lastCompostTick > 500) {
      lastCompostTick = now;
      updateCompostVisual();
      if (compostDialog.open) refreshCompostLive();
    }
  }

  function raycastTarget(clientX, clientY) {
    if (getSceneId() !== YARD_SCENE_ID) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, getCamera());
    const hits = raycaster.intersectObjects([groundLayer, ...(compost ? [compost.root] : [])], true);
    const player = getPlayer().position;
    for (const hit of hits) {
      let node = hit.object;
      while (node && !node.userData?.interact) node = node.parent;
      if (!node) continue;
      const worldPosition = node.getWorldPosition(new THREE.Vector3());
      if (Math.hypot(worldPosition.x - player.x, worldPosition.z - player.z) > INTERACT_DISTANCE) return { tooFar: true };
      if (node.userData.interact === 'poop' && node.userData.itemId) return { kind: 'poop', itemId: node.userData.itemId };
      if (node.userData.interact === 'compost') return { kind: 'compost' };
    }
    return null;
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button === 0) pointerDown = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointermove', event => {
    if (isEditing() || isFirstPerson() || isBattle() || dialog.open) return;
    const now = performance.now();
    if (now - hoverThrottle < 90) return;
    hoverThrottle = now;
    const target = raycastTarget(event.clientX, event.clientY);
    canvas.style.cursor = target && !target.tooFar ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => { canvas.style.cursor = ''; });
  canvas.addEventListener('pointerup', event => {
    if (event.button !== 0 || !pointerDown) return;
    const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    pointerDown = null;
    if (moved > 8 || isEditing() || isFirstPerson() || isBattle()) return;
    const target = raycastTarget(event.clientX, event.clientY);
    if (!target) return;
    if (target.tooFar) { onMessage('离得太远了，走近一点再操作'); return; }
    if (target.kind === 'poop') pickupItem(target.itemId);
    else if (target.kind === 'compost') openCompost();
  });

  entry.addEventListener('click', open);
  body.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const slot = event.target.closest('[data-slot-index]');
    if (!slot?.dataset.bagItem) return;
    drag = {
      id: slot.dataset.bagItem,
      from: Number(slot.dataset.slotIndex),
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    slot.setPointerCapture?.(event.pointerId);
  });
  window.addEventListener('pointermove', event => {
    if (!drag) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved) {
      if (distance < 6) return;
      drag.moved = true;
      dragGhost = itemGhost(ITEMS[drag.id]);
      document.body.classList.add('bag-dragging');
      body.querySelector(`[data-slot-index="${drag.from}"]`)?.classList.add('dragging');
    }
    dragGhost.style.left = `${event.clientX}px`;
    dragGhost.style.top = `${event.clientY}px`;
    for (const node of body.querySelectorAll('.bag-slot.drop-target')) node.classList.remove('drop-target');
    slotAtPoint(event.clientX, event.clientY)?.classList.add('drop-target');
  });
  function finishDrag(event) {
    if (!drag) return;
    const current = drag;
    drag = null;
    dragGhost?.remove();
    dragGhost = null;
    document.body.classList.remove('bag-dragging');
    clearDropTargets();
    if (!current.moved) return;
    suppressClickUntil = performance.now() + 320;
    const target = slotAtPoint(event.clientX, event.clientY);
    if (target) {
      const to = Number(target.dataset.slotIndex);
      void moveSlot(current.from, to);
      return;
    }
    const rect = dialog.getBoundingClientRect();
    const insidePanel = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!insidePanel) dropItemToGround(current.id, event.clientX, event.clientY);
  }
  window.addEventListener('pointerup', finishDrag);
  window.addEventListener('pointercancel', event => {
    if (!drag) return;
    drag = null;
    dragGhost?.remove();
    dragGhost = null;
    document.body.classList.remove('bag-dragging');
    clearDropTargets();
  });
  body.addEventListener('click', event => {
    if (performance.now() < suppressClickUntil) return;
    const slot = event.target.closest('[data-slot-index]');
    if (!slot) return;
    if (!slot.dataset.bagItem) {
      selectedEmpty = true;
      selectedItemId = null;
      render();
      return;
    }
    selectedEmpty = false;
    selectedItemId = slot.dataset.bagItem;
    render();
  });
  compostBody.addEventListener('click', event => {
    const action = event.target.closest('[data-bag-action]')?.dataset.bagAction;
    if (action === 'deposit') depositCompost();
    else if (action === 'collect') collectFertilizer();
  });
  dialog.querySelector('.settings-close').addEventListener('click', close);
  compostDialog.querySelector('.settings-close').addEventListener('click', closeCompost);
  compostDialog.addEventListener('close', () => { if (panelTimer) { clearInterval(panelTimer); panelTimer = null; } });
  compostDialog.addEventListener('cancel', () => { if (panelTimer) { clearInterval(panelTimer); panelTimer = null; } });

  // 恢复上次保存在院子里的地面物品。
  syncGroundMeshes();
  updateBadge();

  return {
    update(dt) {
      const yard = getSceneId() === YARD_SCENE_ID;
      groundLayer.visible = yard;
      if (compost) compost.root.visible = yard;
      syncServerItems();
      itemTime += dt;
      for (const mesh of meshes.values()) animatePoop(mesh, itemTime);
      ensureCompost();
      tick(Date.now());
    },
    spawnPoop,
    open,
    openCompost,
    _debug: () => ({
      inventory: { ...state.inventory },
      ground: visibleGroundItems().map(item => ({ id: item.id, type: item.type, position: item.position })),
      groundMeshes: [...meshes.keys()],
      compost: compost ? {
        position: compost.root.position.toArray().map(value => +value.toFixed(2)),
        status: getCompostStatus(effectiveItemState(), Date.now()).status,
        remainingMs: getCompostStatus(effectiveItemState(), Date.now()).remainingMs,
      } : null,
      nearCompost: nearCompost(),
      importAttempted, importBlocked,
    }),
    _state: () => state,
    _spawnPoop: position => spawnPoop(position),
    _advanceCompost: ms => {
      if (state.compost.status !== 'processing') return false;
      const amount = Number(ms);
      if (!Number.isFinite(amount) || amount <= 0) return false;
      state.compost.readyAt -= amount;
      tick(Date.now());
      save();
      return true;
    },
  };
}
