# MCP 兼容与边界

整理日期：2026-11-04。依赖版本以 `package-lock.json` 为准：MCP SDK 1.32.2、Zod 3.25.76；Node.js 最低 22.13，推荐 24。

## 已覆盖的验证

| 能力 | 可复查的证据 |
| --- | --- |
| Streamable HTTP 工具发现与调用 | [SDK 契约测试](../tests/mcp-contract.test.mjs) |
| OAuth 发现、动态注册、PKCE、主人同意与令牌轮换 | [SDK 契约测试](../tests/mcp-contract.test.mjs)、[权限测试](../tests/world-auth.test.mjs) |
| stdio 适配器与凭证刷新保存 | [SDK 契约测试](../tests/mcp-contract.test.mjs) |
| 世界名选错、授权默认世界及不泄露其他世界 | [世界选择测试](../tests/mcp-world-selection.test.mjs) |
| 建设、通道、往返、互动、断开后执行、重启恢复与撤权 | `npm run self-check`，使用临时数据库和真实 SDK |
| 玩家本地预测、延迟确认与松键 | [玩家输入测试](../tests/player-input.test.mjs) |
| 新家具建造与秋千座面联动 | [户外家具测试](../tests/outdoor-furniture.test.mjs) |

具体宿主是否正确开放工具、是否缓存旧定义、是否持久保存刷新令牌，需要在那个宿主中验收。项目的自检不会替第三方宿主完成安装与预设调整。

## 客户端需要具备什么

优先支持 Streamable HTTP 和标准 OAuth。如果只有 stdio，可使用项目内适配器。动作以 `actionId` 查询，不依赖 MCP Tasks 或旧 SSE 接口。

新增家具、更新参数说明后，让客户端重新连接或刷新 `tools/list` 和 `catalog_list`；保留旧 schema 的模型可能不知道新类型。不要因此删除存档或重新签发仍然有效的授权。

资源读取是可选能力：没有 `resources/read` 也能通过 `world_observe`、`catalog_list`、`world_get_events` 获取世界信息。

MCP 没有给出游戏画面截图、直接图生 3D、任意代码执行、任意模型上传、街道生成或 NPC 剧情系统。目录中的模型是游戏已经实现的批准物件。

## 同机与跨机

默认仅监听 loopback。同机客户端使用 `http://127.0.0.1:5200/mcp`；远程设备或容器里的 `127.0.0.1` 不会自动指向游戏电脑。

远程部署需要：

- HTTPS origin 与正确的 `WORLD_PUBLIC_URL`；不支持将应用挂在任意子路径。
- 反向代理正确转发页面、`/api`、`/mcp`、`/oauth`、`/.well-known`，并保留所需请求头。
- 客户端实际回调与网络连通验收。
- 可用的远程主人身份认证方案。当前本机自动主人会话不会开放给 HTTPS 远程访问，远程登录不是现成的开箱即用功能。

不要公开挂载 `data/` 或凭证目录，不要直接暴露内部 5201 来绕过入口。游戏地址不是授权令牌。

## 连续活动与声音

世界运行时可以推进已接受的有限动作；模型是否再次运行、跨回合续跑和活动预算属于宿主。QQ 回复成功并不能证明宿主还在继续世界任务。

音频只播放调用方提供的已有内容，需额外权限和网页开启声音。播放回执不能证明用户听见。没有录音、ASR、TTS 或本地语音模型随游戏安装。

本项目测试不保证所有客户端版本、远程网络、真机移动端或声音设备的表现。对外汇报时应区分已验证、推测和未实现能力。
