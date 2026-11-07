# Electron 桌面版

公开仓库包含 `desktop/` 下的桌面壳源码。运行时由 npm 安装。以下命令在游戏仓库根目录执行。

## 开发启动

先用 Node.js 22.13 或更新版本执行 `npm ci`。建议用 Node.js 24。

```bash
# 终端 1，启动网页和游戏服务
npm run dev

# 终端 2，打开 Electron 窗口
npm run desktop:dev
```

开发窗口加载 `http://127.0.0.1:5200/`，使用同一份游戏服务。游戏服务已运行时只需打开桌面窗口。可用 `npm run desktop:probe` 验证 Electron 内置的 SQLite 是否可用。

## 打包

| 命令 | 产物 |
| --- | --- |
| `npm run desktop:pack` | 当前平台的解包目录，适合先验证 |
| `npm run desktop:dist:mac` | macOS DMG 与 ZIP |
| `npm run desktop:dist:win` | Windows NSIS 安装包与便携版 |

打包命令会先构建游戏，产物写到 `desktop/release/`。当前默认打包未配置签名。请在目标平台验证运行和安装。

## 存档与后台运行

- 开发模式使用游戏服务的存档，默认是项目根目录的 `data/game.sqlite`。
- 打包版启动内嵌游戏服务，默认端口为 5200。若开发服务正在占用该端口，先停掉开发服务。
- 打包版首次启动可新建存档，或选择已有游戏目录来复用存档和本机素材。之后可在游戏菜单切换数据目录。
- 关闭窗口后可从系统托盘唤醒，后台暂停画面渲染。使用「退出」才会停止桌面进程及其内嵌服务。
