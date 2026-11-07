# Three.js 开发 Skills

开发大肥鱼时使用 [Majid Manzarpour 的 Three.js Game Skills](https://github.com/majidmanzarpour/threejs-game-skills)。这套 MIT 许可的 skill 为开发智能体提供玩法、渲染、模型和测试工作流。运行游戏只需要安装项目的 npm 依赖。

## 安装

在 Codex 环境中执行上游提供的安装命令：

```bash
npx skills add majidmanzarpour/threejs-game-skills --skill '*' -a codex -g -y
```

使用项目级 DSH 环境时，将上游 `skills/` 下的九个 skill 目录放在本项目的 `.dsh/skills/`，保留每个目录中的 `SKILL.md`、参考文档和脚本。安装完成后开启新会话，开发时可以先让智能体用 `threejs-game-director`，再按任务调用对应专项。

| Skill | 用途 |
| --- | --- |
| `threejs-game-director` | 总入口，按任务选择专项和验收范围 |
| `threejs-gameplay-systems` | 输入、镜头、动作、碰撞和玩法 |
| `threejs-aaa-graphics-builder` | 灯光、材质、粒子与渲染预算 |
| `threejs-game-ui-designer` | HUD、菜单、设置和响应式界面 |
| `threejs-3d-generator` | 生成、绑定和处理 3D 模型及动画 |
| `threejs-image-generator` | 生成概念图、贴图、图标和界面素材 |
| `threejs-audio-generator` | 生成和处理音效、配乐及语音 |
| `threejs-debug-profiler` | 排查渲染、动画与性能问题 |
| `threejs-qa-release` | 游戏验收、截图、构建和发布检查 |

使用外部素材生成服务时，按需在本机配置 `TRIPO_API_KEY`、`GEMINI_API_KEY` 或 `ELEVENLABS_API_KEY`。已有资源、程序化素材和本地测试可直接使用。Skill 副本和凭证留在本机。
