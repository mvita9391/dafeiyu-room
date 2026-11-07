// 大肥鱼桌面客户端主进程：启动内嵌世界服务 + 窗口 + 菜单 + 单实例 + 设置持久化。
const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, dialog, shell, screen } = require('electron');

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  resolvePort,
  buildIssuer,
  resolveDevUrl,
  resolveDataPaths,
  isUsableDataRoot,
  clampWindowBounds,
  sanitizeSettings,
} = require('./paths.cjs');

app.setName('dafeiyu');
// 允许把 userData 指到工作区/临时目录（自动化测试与便携使用）
if (process.env.DAFEIYU_USER_DATA) app.setPath('userData', path.resolve(process.env.DAFEIYU_USER_DATA));
// 仅用于自动化验证：允许外部指定 Chromium 调试端口
if (process.env.DAFEIYU_REMOTE_DEBUG_PORT) app.commandLine.appendSwitch('remote-debugging-port', String(process.env.DAFEIYU_REMOTE_DEBUG_PORT));
app.disableHardwareAcceleration = app.disableHardwareAcceleration || (() => {});

let mainWindow = null;
let tray = null;
let server = null;
let serverPort = 5200;
let serverIssuer = '';
let settings = {};
let settingsFile = '';
let closing = false;

// DAFEIYU_EMBEDDED=1 用于在未打包时验证内嵌服务（构建产物 + 现有数据目录）
const isPackaged = app.isPackaged || process.env.DAFEIYU_EMBEDDED === '1';
const debug = (...args) => { if (process.env.DAFEIYU_DEBUG === '1') console.log('[desktop]', ...args); };

// 开发时 Electron app 路径是 desktop/，游戏根目录是其父目录；
// 打包后 app 路径就是 resources/app，游戏根目录即其自身。
function resolveGameRoot() {
  if (app.isPackaged) return app.getAppPath();
  if (process.env.DAFEIYU_GAME_ROOT) return path.resolve(process.env.DAFEIYU_GAME_ROOT);
  return path.resolve(app.getAppPath(), '..');
}

function loadSettings() {
  settingsFile = path.join(app.getPath('userData'), 'settings.json');
  try {
    settings = sanitizeSettings(JSON.parse(fs.readFileSync(settingsFile, 'utf8')));
  } catch {
    settings = {};
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('保存设置失败', error);
  }
}

function showFatal(title, error) {
  const detail = error && error.stack ? error.stack : String(error);
  dialog.showErrorBox(title, detail);
}

function waitForDevServer(url, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  return (async () => {
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
        if (response.ok || response.status === 404) return true;
      } catch {
        /* 继续等 */
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    return false;
  })();
}

async function promptForDataRoot() {
  for (;;) {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['使用现有游戏目录', '新建存档', '退出'],
      defaultId: 1,
      cancelId: 2,
      title: '选择存档位置',
      message: '这是第一次启动大肥鱼桌面版，请选择存档位置。',
      detail: '如果你在网页版玩过，选择「使用现有游戏目录」并指向包含 data/game.sqlite 的项目文件夹，即可直接继承世界与本地素材（小镇、街角便利店等）。',
    });
    if (response === 2) return { quit: true };
    if (response === 1) return { dataRoot: null };
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: '选择包含 data/game.sqlite 的游戏目录',
      properties: ['openDirectory'],
    });
    const directory = picked.filePaths?.[0];
    if (!directory) continue;
    if (!isUsableDataRoot(directory, fs.existsSync)) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: '目录不可用',
        message: '没有在所选目录找到 data/game.sqlite',
        detail: '请选择之前网页版所在的项目根目录（该目录下应有 data/ 与 .cache/town-assets/）。',
        buttons: ['重新选择'],
      });
      continue;
    }
    return { dataRoot: directory };
  }
}

async function ensureFirstRunChoice() {
  const envRoot = process.env.DAFEIYU_DATA_ROOT;
  if (envRoot) {
    settings.dataRoot = path.resolve(envRoot);
    settings.firstRunDone = true;
    saveSettings();
    return;
  }
  if (settings.firstRunDone) return;
  const choice = await promptForDataRoot();
  if (choice.quit) {
    closing = true;
    app.exit(0);
    return;
  }
  settings.dataRoot = choice.dataRoot;
  settings.firstRunDone = true;
  saveSettings();
}

async function startServer() {
  const paths = resolveDataPaths({ userData: app.getPath('userData'), dataRoot: settings.dataRoot || null });
  const entry = pathToFileURL(path.join(resolveGameRoot(), 'server', 'app.js')).href;
  const { buildServer } = await import(entry);
  const instance = await buildServer({
    serveStatic: true,
    worldMode: true,
    databasePath: paths.databasePath,
    localAssetDir: paths.localAssetDir,
    logger: false,
    auth: { localAccess: true, issuer: serverIssuer },
  });
  await instance.listen({ host: '127.0.0.1', port: serverPort });
  server = instance;
}

async function startServerWithRetry() {
  for (;;) {
    try {
      await startServer();
      return true;
    } catch (error) {
      if (error && error.code === 'EADDRINUSE') {
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: `端口 ${serverPort} 被占用`,
          message: `无法在 127.0.0.1:${serverPort} 启动世界服务。`,
          detail: '可能还开着网页版（npm run dev / npm start）或另一份客户端。关闭占用程序后点「重试」，或退出。',
          buttons: ['重试', '退出'],
          defaultId: 0,
          cancelId: 1,
        });
        if (response === 0) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          continue;
        }
        return false;
      }
      throw error;
    }
  }
}

function windowBoundsFromSettings() {
  const display = screen.getPrimaryDisplay();
  return clampWindowBounds(settings.windowBounds, display.workArea);
}

function rememberWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) {
    settings.windowBounds = { ...(settings.windowBounds || {}), maximized: true };
  } else {
    const bounds = mainWindow.getNormalBounds();
    settings.windowBounds = { ...bounds, maximized: false };
  }
  saveSettings();
}

function publishRenderState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('dafeiyu:render-suspended', !mainWindow.isVisible() || mainWindow.isMinimized());
}

function wakeWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  publishRenderState();
}

function ensureTray() {
  if (tray) return;
  const pixels = [
    '..................', '..................', '..................',
    '..##..##..........', '...####...........', '....##............',
    '....##..#######...', '....############..', '...##############.',
    '...###########.##.', '..###############.', '..###############.',
    '...#############..', '.....#########....', '..................',
    '..................', '..................', '..................',
  ];
  const bitmap = Buffer.alloc(18 * 18 * 4);
  for (const [y, row] of pixels.entries()) {
    for (const [x, pixel] of [...row].entries()) {
      if (pixel === '.') continue;
      const offset = (y * 18 + x) * 4;
      if (process.platform !== 'darwin') bitmap.set([232, 151, 71], offset);
      bitmap[offset + 3] = 255;
    }
  }
  const icon = nativeImage.createFromBitmap(bitmap, { width: 18, height: 18 });
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('大肥鱼 · 点击唤醒');
  const menu = Menu.buildFromTemplate([
    { label: '唤醒大肥鱼', click: wakeWindow },
    { label: '退出大肥鱼', click: () => app.quit() },
  ]);
  tray.on('click', wakeWindow);
  tray.on('right-click', () => tray.popUpContextMenu(menu));
}

ipcMain.on('dafeiyu:request-render-state', event => {
  if (event.sender === mainWindow?.webContents && event.senderFrame === event.sender.mainFrame) publishRenderState();
});

function createWindow(url) {
  const bounds = windowBoundsFromSettings();
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: '大肥鱼的小世界',
    backgroundColor: '#1b1626',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  if (bounds.maximized) mainWindow.maximize();

  let boundsTimer = null;
  const scheduleRememberBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(rememberWindowBounds, 600);
  };
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    rememberWindowBounds();
  });
  mainWindow.on('resize', scheduleRememberBounds);
  mainWindow.on('move', scheduleRememberBounds);
  for (const event of ['show', 'hide', 'minimize', 'restore']) mainWindow.on(event, publishRenderState);
  mainWindow.on('close', event => {
    clearTimeout(boundsTimer);
    rememberWindowBounds();
    if (closing) return;
    try {
      ensureTray();
    } catch (error) {
      console.error('无法创建后台唤醒入口', error);
      return;
    }
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, target) => {
    try {
      if (new URL(target).origin !== new URL(url).origin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    dialog
      .showMessageBox({
        type: 'error',
        title: '渲染进程异常退出',
        message: `渲染进程退出（${details.reason}）`,
        buttons: ['重新加载', '退出'],
      })
      .then(({ response }) => {
        if (response === 0 && mainWindow) mainWindow.reload();
        else app.quit();
      });
  });
  mainWindow.loadURL(url);
  if (process.env.DAFEIYU_DEVTOOLS === '1') {
    mainWindow.webContents.once('did-finish-load', () => mainWindow.webContents.openDevTools({ mode: 'detach' }));
  }
  return mainWindow;
}

function relaunchWithSettings() {
  saveSettings();
  app.relaunch();
  app.quit();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: '关于 大肥鱼' },
              { type: 'separator' },
              { label: '打开数据目录', click: () => shell.openPath(app.getPath('userData')) },
              { type: 'separator' },
              { label: '隐藏', accelerator: 'Command+H', click: () => mainWindow?.hide() },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '全部显示' },
              { type: 'separator' },
              { role: 'quit', label: '退出' },
            ],
          },
        ]
      : []),
    {
      label: '游戏',
      submenu: [
        { label: '全屏切换', accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11', click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) },
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { label: '关闭窗口并在后台运行', accelerator: 'CmdOrCtrl+W', click: () => mainWindow?.close() },
        { type: 'separator' },
        {
          label: '切换存档目录…',
          click: async () => {
            const picked = await dialog.showOpenDialog(mainWindow, {
              title: '选择包含 data/game.sqlite 的游戏目录（保存后自动重启）',
              properties: ['openDirectory'],
            });
            const directory = picked.filePaths?.[0];
            if (!directory) return;
            if (!isUsableDataRoot(directory, fs.existsSync)) {
              dialog.showMessageBox(mainWindow, { type: 'error', message: '该目录没有 data/game.sqlite' });
              return;
            }
            settings.dataRoot = path.resolve(directory);
            relaunchWithSettings();
          },
        },
        {
          label: '改用新存档…',
          click: () => {
            settings.dataRoot = null;
            relaunchWithSettings();
          },
        },
        { label: '打开数据目录', click: () => shell.openPath(app.getPath('userData')) },
        ...(isPackaged && process.env.DAFEIYU_DEVTOOLS !== '1' ? [] : [{ type: 'separator' }, { role: 'toggleDevTools', label: '开发者工具' }]),
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function bootstrap() {
  debug('bootstrap start', { isPackaged, exe: process.execPath });
  loadSettings();
  serverPort = resolvePort(process.env);
  serverIssuer = buildIssuer(serverPort);
  buildMenu();

  if (!isPackaged) {
    const url = resolveDevUrl(process.env);
    const ready = await waitForDevServer(url);
    if (!ready) {
      await dialog.showMessageBox({
        type: 'error',
        title: '开发服务器未启动',
        message: `无法连接 ${url}`,
        detail: '请先在项目目录运行 npm run dev（会同时启动 Vite 5200 与 API 5201），然后重新运行 npm run desktop:dev。',
        buttons: ['退出'],
      });
      app.exit(1);
      return;
    }
    createWindow(url);
    return;
  }

  debug('settings', settings, { userData: app.getPath('userData'), appPath: app.getAppPath(), gameRoot: resolveGameRoot() });
  await ensureFirstRunChoice();
  debug('first run resolved', settings);
  if (closing) return;
  const started = await startServerWithRetry();
  debug('server started', started);
  if (!started) {
    closing = true;
    app.exit(1);
    return;
  }
  createWindow(serverIssuer);
  debug('window created');
}

app.on('second-instance', wakeWindow);
app.on('activate', wakeWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', async (event) => {
  rememberWindowBounds();
  if (closing) return;
  closing = true;
  if (!server) return;
  event.preventDefault();
  try {
    await server.close();
  } catch (error) {
    console.error('关闭世界服务失败', error);
  }
  server = null;
  app.quit();
});

process.on('uncaughtException', (error) => showFatal('主进程异常', error));
process.on('unhandledRejection', (error) => showFatal('主进程异常', error));

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(bootstrap).catch((error) => {
    console.error('[desktop] bootstrap failed', error);
    showFatal('启动失败', error);
    app.exit(1);
  });
}
