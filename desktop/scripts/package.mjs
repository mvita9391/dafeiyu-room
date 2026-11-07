// 兼容从 desktop/ 调用打包命令。先在游戏根目录构建，再运行 electron-builder。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gameRoot = path.resolve(desktopRoot, '..');
const builder = path.join(
  gameRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
);

const flags = [];
for (const flag of ['--dir', '--mac', '--win', '--x64', '--arm64']) {
  if (process.argv.includes(flag)) flags.push(flag);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
  cwd: gameRoot,
  stdio: 'inherit',
  env,
});
if (build.status !== 0) process.exit(build.status ?? 1);

const result = spawnSync(
  builder,
  ['--config', path.join('desktop', 'electron-builder.yml'), ...flags],
  { cwd: gameRoot, stdio: 'inherit', env }
);
process.exit(result.status ?? 0);
