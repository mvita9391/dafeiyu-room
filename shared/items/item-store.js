import { ITEMS, ITEM_IDS, getItemDef } from '../../shared/world/items.js';

export const ITEM_STORAGE_KEY = 'dafeiyu.items.v1';
export const ITEM_VERSION = 1;
export const BAG_SLOT_COUNT = 12;
export const GROUND_ITEM_CAP = 20;
export const COMPOST_DURATION_MS = 120_000;
export const COMPOST_OUTPUT = Object.freeze({ type: 'fertilizer', count: 1 });

const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);
const clampCount = (value, max) => Math.max(0, Math.min(max, Math.trunc(Number(value) || 0)));

function makeGroundId(type, now) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `ground-${type}-${Number(now).toString(36)}-${suffix}`;
}

export function createDefaultItemState() {
  return {
    version: ITEM_VERSION,
    inventory: Object.fromEntries(ITEM_IDS.map(id => [id, 0])),
    slots: Array.from({ length: BAG_SLOT_COUNT }, () => null),
    groundItems: [],
    legacyImported: false,
    compost: {
      status: 'empty',
      startedAt: null,
      readyAt: null,
      notified: false,
      outputType: COMPOST_OUTPUT.type,
      outputCount: COMPOST_OUTPUT.count,
    },
  };
}

function normalizeGroundItem(raw, index, now) {
  if (!raw || typeof raw !== 'object') return null;
  const def = getItemDef(raw.type);
  if (!def || !def.placeable) return null;
  if (!Array.isArray(raw.position) || raw.position.length < 3 || !raw.position.every(isFiniteNumber)) return null;
  const sceneId = typeof raw.sceneId === 'string' && raw.sceneId ? raw.sceneId : 'yard';
  const id = typeof raw.id === 'string' && raw.id ? raw.id : makeGroundId(raw.type, now + index);
  return {
    id,
    type: raw.type,
    sceneId,
    position: raw.position.slice(0, 3).map(value => Math.round(value * 1000) / 1000),
    createdAt: isFiniteNumber(raw.createdAt) ? raw.createdAt : now,
  };
}

export function ensureSlots(state) {
  const total = Math.max(BAG_SLOT_COUNT, ITEM_IDS.length);
  if (!Array.isArray(state.slots)) state.slots = [];
  const present = new Set();
  const slots = [];
  for (let index = 0; index < total; index += 1) {
    const id = state.slots[index];
    if (typeof id === 'string' && ITEM_IDS.includes(id) && (state.inventory[id] ?? 0) > 0 && !present.has(id)) {
      slots.push(id);
      present.add(id);
    } else {
      slots.push(null);
    }
  }
  for (const id of ITEM_IDS) {
    if ((state.inventory[id] ?? 0) <= 0 || present.has(id)) continue;
    const index = slots.indexOf(null);
    if (index >= 0) { slots[index] = id; present.add(id); }
  }
  state.slots = slots;
  return state.slots;
}

function removeSlot(state, id) {
  if (!Array.isArray(state.slots)) return;
  state.slots = state.slots.map(slot => (slot === id ? null : slot));
}

export function moveItemSlot(state, from, to) {
  if (!Array.isArray(state.slots)) ensureSlots(state);
  const length = state.slots.length;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= length || to >= length || from === to) return false;
  const moved = state.slots[from];
  if (!moved) return false;
  state.slots[from] = state.slots[to];
  state.slots[to] = moved;
  return true;
}

export function normalizeItemState(raw, now = Date.now()) {
  const state = createDefaultItemState();
  if (!raw || typeof raw !== 'object') return state;
  const inventory = raw.inventory && typeof raw.inventory === 'object' ? raw.inventory : {};
  for (const id of ITEM_IDS) state.inventory[id] = clampCount(inventory[id], ITEMS[id].stackMax);
  if (Array.isArray(raw.slots)) {
    const total = Math.max(BAG_SLOT_COUNT, ITEM_IDS.length);
    const seen = new Set();
    state.slots = Array.from({ length: total }, (_, index) => {
      const id = raw.slots[index];
      if (typeof id !== 'string' || !ITEM_IDS.includes(id) || (state.inventory[id] ?? 0) <= 0 || seen.has(id)) return null;
      seen.add(id);
      return id;
    });
  }
  ensureSlots(state);
  if (Array.isArray(raw.groundItems)) {
    const seen = new Set();
    for (let index = 0; index < raw.groundItems.length && state.groundItems.length < GROUND_ITEM_CAP; index += 1) {
      const item = normalizeGroundItem(raw.groundItems[index], index, now);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      state.groundItems.push(item);
    }
  }
  state.legacyImported = raw.legacyImported === true;
  const compost = raw.compost && typeof raw.compost === 'object' ? raw.compost : {};
  const startedAt = isFiniteNumber(compost.startedAt) ? compost.startedAt : null;
  const readyAt = isFiniteNumber(compost.readyAt) ? compost.readyAt : null;
  if (compost.status === 'processing' && startedAt !== null && readyAt !== null) {
    state.compost.status = readyAt <= now ? 'ready' : 'processing';
    state.compost.startedAt = startedAt;
    state.compost.readyAt = readyAt;
    state.compost.notified = Boolean(compost.notified);
  } else if (compost.status === 'ready' && readyAt !== null) {
    state.compost.status = 'ready';
    state.compost.startedAt = startedAt;
    state.compost.readyAt = readyAt;
    state.compost.notified = Boolean(compost.notified);
  }
  return state;
}

export function loadItemState(storage, now = Date.now()) {
  try {
    const raw = storage?.getItem(ITEM_STORAGE_KEY);
    return raw ? normalizeItemState(JSON.parse(raw), now) : createDefaultItemState();
  } catch {
    return createDefaultItemState();
  }
}

export function saveItemState(storage, state) {
  try { storage?.setItem(ITEM_STORAGE_KEY, JSON.stringify(state)); } catch { /* 本地存储不可用时保持内存状态 */ }
}

export function inventoryTotal(state) {
  return ITEM_IDS.reduce((total, id) => total + (state.inventory[id] ?? 0), 0);
}

export function addItem(state, id, count = 1) {
  const def = getItemDef(id);
  if (!def) return 0;
  const current = state.inventory[id] ?? 0;
  const next = Math.min(def.stackMax, current + Math.max(0, Math.trunc(count)));
  const added = next - current;
  state.inventory[id] = next;
  if (added > 0 && next > 0) ensureSlots(state);
  return added;
}

export function removeItem(state, id, count = 1) {
  const current = state.inventory[id] ?? 0;
  const removed = Math.min(current, Math.max(0, Math.trunc(count)));
  state.inventory[id] = current - removed;
  if (state.inventory[id] <= 0) removeSlot(state, id);
  return removed;
}

export function addGroundItem(state, { type, sceneId = 'yard', position, now = Date.now() } = {}) {
  const def = getItemDef(type);
  if (!def || !def.placeable) return { ok: false, reason: 'not-placeable' };
  if (!Array.isArray(position) || position.length < 3 || !position.every(isFiniteNumber)) return { ok: false, reason: 'bad-position' };
  if (state.groundItems.length >= GROUND_ITEM_CAP) return { ok: false, reason: 'ground-full' };
  const item = {
    id: makeGroundId(type, now),
    type,
    sceneId,
    position: position.slice(0, 3).map(value => Math.round(value * 1000) / 1000),
    createdAt: now,
  };
  state.groundItems.push(item);
  return { ok: true, item };
}

export function removeGroundItem(state, id) {
  const index = state.groundItems.findIndex(item => item.id === id);
  if (index < 0) return null;
  return state.groundItems.splice(index, 1)[0];
}

export function getGroundItem(state, id) {
  return state.groundItems.find(item => item.id === id) ?? null;
}

export function tickCompost(state, now = Date.now()) {
  const compost = state.compost;
  if (compost.status === 'processing' && compost.readyAt !== null && compost.readyAt <= now) {
    compost.status = 'ready';
    return { becameReady: true };
  }
  return { becameReady: false };
}

export function getCompostStatus(state, now = Date.now()) {
  const compost = state.compost;
  if (compost.status === 'processing' && compost.readyAt !== null) {
    const remaining = Math.max(0, compost.readyAt - now);
    if (remaining <= 0) return { status: 'ready', remainingMs: 0 };
    return {
      status: 'processing',
      remainingMs: remaining,
      progress: Math.max(0, Math.min(1, (now - (compost.startedAt ?? now)) / COMPOST_DURATION_MS)),
    };
  }
  return { status: compost.status, remainingMs: 0, progress: compost.status === 'ready' ? 1 : 0 };
}

export function startCompost(state, now = Date.now()) {
  if (state.compost.status !== 'empty') return { ok: false, reason: 'busy' };
  if ((state.inventory.poop ?? 0) <= 0) return { ok: false, reason: 'no-poop' };
  removeItem(state, 'poop', 1);
  state.compost = {
    status: 'processing',
    startedAt: now,
    readyAt: now + COMPOST_DURATION_MS,
    notified: false,
    outputType: COMPOST_OUTPUT.type,
    outputCount: COMPOST_OUTPUT.count,
  };
  return { ok: true, readyAt: state.compost.readyAt };
}

export function collectCompost(state, now = Date.now()) {
  const status = getCompostStatus(state, now);
  if (status.status !== 'ready') return { ok: false, reason: status.status === 'processing' ? 'not-ready' : 'empty' };
  const output = ITEMS[state.compost.outputType] ? state.compost.outputType : COMPOST_OUTPUT.type;
  const count = state.compost.outputCount || COMPOST_OUTPUT.count;
  const def = ITEMS[output];
  if (!def) return { ok: false, reason: 'bad-output' };
  if ((state.inventory[output] ?? 0) >= def.stackMax) return { ok: false, reason: 'inventory-full' };
  addItem(state, output, count);
  state.compost = {
    status: 'empty',
    startedAt: null,
    readyAt: null,
    notified: false,
    outputType: COMPOST_OUTPUT.type,
    outputCount: COMPOST_OUTPUT.count,
  };
  return { ok: true, type: output, count };
}

export function markCompostNotified(state) {
  state.compost.notified = true;
}
