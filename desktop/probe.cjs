// Electron 主进程预检：确认内置 Node 能跑 node:sqlite（世界服务依赖它）。
// 用法：npx electron desktop/probe.cjs
const { app } = require('electron');
const path = require('node:path');

const result = {
  electron: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
  sqlite: 'not-tested',
  ok: false,
};

function finish(code) {
  const payload = JSON.stringify(result, null, 2);
  process.stdout.write(payload + '\n');
  setTimeout(() => app.exit(code), 120);
}

function parseNode(version) {
  const [major, minor] = String(version).split('.').map(Number);
  return { major, minor };
}

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE probe (value INTEGER)');
    db.prepare('INSERT INTO probe VALUES (?)').run(42);
    const row = db.prepare('SELECT value FROM probe').get();
    db.close();
    result.sqlite = row && row.value === 42 ? 'ok' : 'unexpected-result';
  } catch (error) {
    result.sqlite = 'error';
    result.error = String(error && error.message ? error.message : error);
  }
  const { major, minor } = parseNode(process.versions.node);
  result.nodeSupportsSqlite = major > 22 || (major === 22 && minor >= 13);
  result.ok = result.sqlite === 'ok' && result.nodeSupportsSqlite;
  finish(result.ok ? 0 : 1);
});
