import test from 'node:test';
import assert from 'node:assert/strict';
import paths from '../paths.cjs';

const { resolvePort, buildIssuer, resolveDevUrl, resolveDataPaths, isUsableDataRoot, clampWindowBounds, sanitizeSettings } = paths;

test('desktop: port and issuer come from env with 5200 defaults', () => {
  assert.equal(resolvePort({}), 5200);
  assert.equal(resolvePort({ DAFEIYU_PORT: '5310' }), 5310);
  assert.equal(resolvePort({ DAFEIYU_PORT: 'not-a-port' }), 5200);
  assert.equal(resolvePort({ DAFEIYU_PORT: '0' }), 5200);
  assert.equal(buildIssuer(), 'http://127.0.0.1:5200');
  assert.equal(buildIssuer(5310), 'http://127.0.0.1:5310');
  assert.equal(resolveDevUrl({}), 'http://127.0.0.1:5200');
  assert.equal(resolveDevUrl({ DAFEIYU_DEV_URL: 'http://127.0.0.1:5199' }), 'http://127.0.0.1:5199');
});

test('desktop: data paths reuse an existing game root or fall back to userData', () => {
  const existing = resolveDataPaths({ userData: '/tmp/userData', dataRoot: '/games/dafeiyu' });
  assert.equal(existing.mode, 'existing');
  assert.equal(existing.databasePath, '/games/dafeiyu/data/game.sqlite');
  assert.equal(existing.localAssetDir, '/games/dafeiyu/.cache/town-assets');
  const fresh = resolveDataPaths({ userData: '/tmp/userData' });
  assert.equal(fresh.mode, 'fresh');
  assert.equal(fresh.databasePath, '/tmp/userData/game.sqlite');
  assert.equal(fresh.localAssetDir, '/tmp/userData/town-assets');
  assert.throws(() => resolveDataPaths({}), /userData/);
});

test('desktop: a usable game root must contain data/game.sqlite', () => {
  const existingRoot = '/games/dafeiyu';
  const exists = (file) => file === '/games/dafeiyu/data/game.sqlite';
  assert.equal(isUsableDataRoot(existingRoot, exists), true);
  assert.equal(isUsableDataRoot('/games/empty', exists), false);
  assert.equal(isUsableDataRoot('', exists), false);
});

test('desktop: window bounds are clamped into the screen and keep a minimum size', () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 };
  const normal = clampWindowBounds({ x: 100, y: 80, width: 1280, height: 800 }, area);
  assert.deepEqual({ ...normal, maximized: undefined }, { x: 100, y: 80, width: 1280, height: 800, maximized: undefined });
  assert.equal(normal.maximized, false);

  const tiny = clampWindowBounds({ x: 0, y: 0, width: 200, height: 100 }, area);
  assert.ok(tiny.width >= 900 && tiny.height >= 600);

  const offscreen = clampWindowBounds({ x: 9999, y: 9999, width: 1280, height: 800 }, area);
  assert.ok(offscreen.x < 1440 && offscreen.y < 900);

  const huge = clampWindowBounds({ x: 0, y: 0, width: 5000, height: 4000 }, area);
  assert.equal(huge.width, 1440);
  assert.equal(huge.height, 900);

  const defaulted = clampWindowBounds({}, area);
  assert.deepEqual({ width: defaulted.width, height: defaulted.height }, { width: 1280, height: 900 });
});

test('desktop: settings are sanitized before use', () => {
  assert.deepEqual(sanitizeSettings(null), {});
  assert.deepEqual(sanitizeSettings({ windowBounds: { x: 1 }, dataRoot: '  /games/x  ', firstRunDone: true }), {
    windowBounds: { x: 1 },
    dataRoot: '/games/x',
    firstRunDone: true,
  });
  assert.deepEqual(sanitizeSettings({ dataRoot: '   ' }), {});
});
