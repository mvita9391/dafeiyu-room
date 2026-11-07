// 桌面壳用到的纯路径/窗口计算，方便 Node 单测（不引入 electron 依赖）。
const path = require('node:path');

const GAME_PORT = 5200;
const DEFAULT_WINDOW = { width: 1280, height: 900 };
const MIN_WINDOW = { width: 900, height: 600 };

function resolvePort(env = process.env) {
  const raw = Number(env?.DAFEIYU_PORT);
  return Number.isSafeInteger(raw) && raw > 0 && raw < 65536 ? raw : GAME_PORT;
}

function buildIssuer(port = GAME_PORT) {
  return `http://127.0.0.1:${port}`;
}

function resolveDevUrl(env = process.env) {
  return env?.DAFEIYU_DEV_URL || buildIssuer(GAME_PORT);
}

/**
 * 数据目录：优先用现有游戏目录（data/game.sqlite + .cache/town-assets），
 * 否则用 Electron userData（新存档）。
 */
function resolveDataPaths({ userData, dataRoot = null } = {}) {
  if (!userData) throw Error('userData is required');
  if (dataRoot) {
    return {
      mode: 'existing',
      dataRoot,
      databasePath: path.join(dataRoot, 'data', 'game.sqlite'),
      localAssetDir: path.join(dataRoot, '.cache', 'town-assets'),
    };
  }
  return {
    mode: 'fresh',
    dataRoot: null,
    databasePath: path.join(userData, 'game.sqlite'),
    localAssetDir: path.join(userData, 'town-assets'),
  };
}

function isUsableDataRoot(directory, existsSync) {
  if (!directory) return false;
  return Boolean(existsSync(path.join(directory, 'data', 'game.sqlite')));
}

function clampWindowBounds(bounds = {}, workArea = {}) {
  const area = {
    x: Number(workArea.x) || 0,
    y: Number(workArea.y) || 0,
    width: Number(workArea.width) || 1440,
    height: Number(workArea.height) || 900,
  };
  const width = Math.max(MIN_WINDOW.width, Math.min(Number(bounds.width) || DEFAULT_WINDOW.width, area.width));
  const height = Math.max(MIN_WINDOW.height, Math.min(Number(bounds.height) || DEFAULT_WINDOW.height, area.height));
  const rawX = Number.isFinite(bounds.x) ? bounds.x : area.x + Math.round((area.width - width) / 2);
  const rawY = Number.isFinite(bounds.y) ? bounds.y : area.y + Math.round((area.height - height) / 2);
  // 完全跑到屏幕外的窗口拉回可用区域
  const x = Math.min(Math.max(rawX, area.x - width + 80), area.x + area.width - 80);
  const y = Math.min(Math.max(rawY, area.y - 40), area.y + area.height - 120);
  return { x, y, width, height, maximized: Boolean(bounds.maximized) };
}

function sanitizeSettings(raw = {}) {
  const out = {};
  if (raw && typeof raw === 'object') {
    if (raw.windowBounds && typeof raw.windowBounds === 'object') out.windowBounds = raw.windowBounds;
    if (typeof raw.dataRoot === 'string' && raw.dataRoot.trim()) out.dataRoot = path.resolve(raw.dataRoot.trim());
    if (raw.firstRunDone === true) out.firstRunDone = true;
  }
  return out;
}

module.exports = {
  GAME_PORT,
  DEFAULT_WINDOW,
  MIN_WINDOW,
  resolvePort,
  buildIssuer,
  resolveDevUrl,
  resolveDataPaths,
  isUsableDataRoot,
  clampWindowBounds,
  sanitizeSettings,
};
