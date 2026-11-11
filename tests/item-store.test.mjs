import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultItemState, normalizeItemState, loadItemState, saveItemState,
  inventoryTotal, addItem, removeItem, addGroundItem, removeGroundItem, getGroundItem,
  tickCompost, getCompostStatus, startCompost, collectCompost, markCompostNotified,
  ITEM_STORAGE_KEY, GROUND_ITEM_CAP, COMPOST_DURATION_MS, BAG_SLOT_COUNT, ensureSlots, moveItemSlot,
} from '../shared/items/item-store.js';
import { ITEMS } from '../shared/world/items.js';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), map };
};

test('物品定义包含便便与肥料，便便可堆肥可丢地面', () => {
  assert.equal(ITEMS.poop.name, '便便');
  assert.equal(ITEMS.poop.placeable, true);
  assert.equal(ITEMS.poop.compostInput, true);
  assert.equal(ITEMS.fertilizer.name, '肥料');
  assert.equal(ITEMS.fertilizer.placeable, false);
});

test('背包默认状态、增加与移除', () => {
  const state = createDefaultItemState();
  assert.equal(inventoryTotal(state), 0);
  assert.equal(addItem(state, 'poop', 3), 3);
  assert.equal(state.inventory.poop, 3);
  assert.equal(addItem(state, 'poop', 1000), 96);
  assert.equal(state.inventory.poop, 99);
  assert.equal(removeItem(state, 'poop', 4), 4);
  assert.equal(state.inventory.poop, 95);
  assert.equal(removeItem(state, 'poop', 999), 95);
  assert.equal(state.inventory.poop, 0);
});

test('地面物品上限与增删', () => {
  const state = createDefaultItemState();
  const first = addGroundItem(state, { type: 'poop', position: [1, 0, 2], now: 1000 });
  assert.equal(first.ok, true);
  assert.equal(state.groundItems.length, 1);
  assert.equal(getGroundItem(state, first.item.id).position[0], 1);
  assert.equal(removeGroundItem(state, first.item.id).id, first.item.id);
  assert.equal(state.groundItems.length, 0);
  for (let i = 0; i < GROUND_ITEM_CAP; i += 1) {
    const result = addGroundItem(state, { type: 'poop', position: [i, 0, 0], now: 2000 + i });
    assert.equal(result.ok, true);
  }
  const full = addGroundItem(state, { type: 'poop', position: [99, 0, 99], now: 3000 });
  assert.equal(full.ok, false);
  assert.equal(full.reason, 'ground-full');
  assert.equal(addGroundItem(state, { type: 'fertilizer', position: [1, 0, 1] }).ok, false);
  assert.equal(addGroundItem(state, { type: 'poop', position: [1, 2] }).ok, false);
});

test('堆肥：放入便便、倒计时、提前收取失败、到点收取肥料', () => {
  const state = createDefaultItemState();
  addItem(state, 'poop', 2);
  const now = 10_000;
  assert.equal(startCompost(state, now).ok, true);
  assert.equal(state.inventory.poop, 1);
  assert.equal(state.compost.status, 'processing');
  assert.equal(getCompostStatus(state, now + 1000).status, 'processing');
  assert.equal(startCompost(state, now + 2000).reason, 'busy');
  assert.equal(collectCompost(state, now + COMPOST_DURATION_MS - 1).reason, 'not-ready');
  assert.equal(tickCompost(state, now + COMPOST_DURATION_MS).becameReady, true);
  assert.equal(state.compost.status, 'ready');
  assert.equal(collectCompost(state, now + COMPOST_DURATION_MS + 1).ok, true);
  assert.equal(state.inventory.fertilizer, 1);
  assert.equal(state.compost.status, 'empty');
  assert.equal(state.inventory.poop, 1);
});

test('没有便便不能堆肥，背包满不能收肥料', () => {
  const state = createDefaultItemState();
  assert.equal(startCompost(state, 1000).reason, 'no-poop');
  addItem(state, 'poop', 1);
  startCompost(state, 2000);
  state.compost.status = 'ready';
  state.inventory.fertilizer = ITEMS.fertilizer.stackMax;
  assert.equal(collectCompost(state, 2000 + COMPOST_DURATION_MS).reason, 'inventory-full');
  assert.equal(state.compost.status, 'ready');
});

test('离线/刷新时按时间戳恢复堆肥状态', () => {
  const state = createDefaultItemState();
  addItem(state, 'poop', 1);
  const now = 5000;
  startCompost(state, now);
  const saved = JSON.parse(JSON.stringify(state));
  const loaded = normalizeItemState(saved, now + COMPOST_DURATION_MS + 50);
  assert.equal(loaded.compost.status, 'ready');
  assert.equal(getCompostStatus(loaded, now + COMPOST_DURATION_MS + 50).status, 'ready');
  const early = normalizeItemState(saved, now + 1000);
  assert.equal(early.compost.status, 'processing');
});

test('规范化会修复损坏/越界数据', () => {
  const state = normalizeItemState({
    version: 1,
    inventory: { poop: -3, fertilizer: 9999, unknown: 4 },
    groundItems: [
      { id: 'a', type: 'poop', position: [1, 0, 2], sceneId: 'yard' },
      { id: 'b', type: 'poop', position: [1, 2] },
      { id: 'c', type: 'unknown', position: [0, 0, 0] },
    ],
    compost: { status: 'processing', startedAt: 1000, readyAt: 2000, notified: 1 },
  }, 3000);
  assert.equal(state.inventory.poop, 0);
  assert.equal(state.inventory.fertilizer, 99);
  assert.equal(state.inventory.unknown, undefined);
  assert.equal(state.groundItems.length, 1);
  assert.equal(state.compost.status, 'ready');
  assert.equal(state.compost.notified, true);
  assert.equal(normalizeItemState(null, 5000).groundItems.length, 0);
});

test('localStorage 读写容错与通知标记', () => {
  const storage = memoryStorage();
  const state = createDefaultItemState();
  addItem(state, 'fertilizer', 2);
  saveItemState(storage, state);
  assert.equal(loadItemState(storage, 1000).inventory.fertilizer, 2);
  storage.map.set(ITEM_STORAGE_KEY, '{broken');
  assert.equal(loadItemState(storage, 1000).inventory.fertilizer, 0);
  markCompostNotified(state);
  assert.equal(state.compost.notified, true);
});

test('背包格子可持久化、移动和清理', () => {
  const state = createDefaultItemState();
  assert.equal(state.slots.length, BAG_SLOT_COUNT);
  addItem(state, 'poop', 1);
  addItem(state, 'fertilizer', 2);
  assert.equal(state.slots[0], 'poop');
  assert.equal(state.slots[1], 'fertilizer');
  assert.equal(moveItemSlot(state, 0, 5), true);
  assert.equal(state.slots[5], 'poop');
  assert.equal(state.slots[0], null);
  assert.equal(moveItemSlot(state, 5, 6), true);
  assert.equal(state.slots[6], 'poop');
  removeItem(state, 'poop', 1);
  assert.equal(state.slots.includes('poop'), false);
  const normalized = normalizeItemState({ version: 1, inventory: { poop: 1, fertilizer: 1 }, slots: [null, 'fertilizer', 'poop'] }, 1000);
  assert.equal(normalized.slots[1], 'fertilizer');
  assert.equal(normalized.slots[2], 'poop');
  assert.equal(normalized.slots.filter(Boolean).length, 2);
});

test('直接改库存时 ensureSlots 会补格子', () => {
  const state = createDefaultItemState();
  state.inventory.poop = 3;
  ensureSlots(state);
  assert.equal(state.slots.filter(Boolean).length, 1);
  assert.equal(state.slots[0], 'poop');
});
