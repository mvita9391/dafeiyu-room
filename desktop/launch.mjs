// 跨平台启动器：绕过 npm scripts 里可能存在的 ELECTRON_RUN_AS_NODE（会让 Electron 退化成 Node）。
// 用法：node desktop/launch.mjs [app path / script] [额外参数...]
import { spawn } from 'node:child_process';
import electron from 'electron';

const args = process.argv.slice(2);
if (!args.length) args.push('.');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// 受限环境（CI / 沙箱）没有 Chromium sandbox 权限时，用 ELECTRON_DISABLE_SANDBOX=1 启动。
const finalArgs = env.ELECTRON_DISABLE_SANDBOX === '1' ? ['--no-sandbox', ...args] : args;
const child = spawn(electron, finalArgs, { stdio: 'inherit', env });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
child.on('error', (error) => {
  console.error('启动 Electron 失败：', error.message);
  process.exit(1);
});
