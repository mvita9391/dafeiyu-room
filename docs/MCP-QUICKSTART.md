# MCP 对接手册

适用范围为当前公开版。需要 Node.js 22.13+，推荐 Node.js 24。客户端以实时 `tools/list` 的参数定义为准；新增家具后应刷新工具定义与目录。

## 1. 从地址开始连接

```bash
npm ci
npm run dev
```

打开 `http://127.0.0.1:5200/`，点击右上角「设置 → 连接智能体 → 生成连接 JSON」，复制后可直接用于支持 HTTP MCP 的客户端。使用 OAuth 的客户端也可以手动填入默认 MCP 地址：

```text
http://127.0.0.1:5200/mcp
```

将它添加到支持 **Streamable HTTP + OAuth** 的 MCP 客户端。客户端发现授权方式、打开授权页，由主人确认权限。若授权页没有主人会话，先在同一浏览器打开游戏，再返回授权页。

本机游戏页面自动进入主人会话，不再使用游戏配对码；标准 OAuth 授权码、PKCE 和同意页面仍然存在。使用 OAuth 时，MCP 地址本身不包含凭证。

开发时 5200 是入口，5201 是内部 API；不要把 5201 配成 MCP 地址。生产运行使用 `npm run build` 后 `npm start`；`npm run preview` 不是完整后端服务。

## 2. 权限与凭证

| 权限 | 用途 |
| --- | --- |
| `world:read` | 观察世界、读取目录和事件，基础必需权限 |
| `actor:control` | 取得角色租约、移动、交互和战斗任务 |
| `build:write` | 建设预览、应用与撤销 |
| `audio:play` | 可选，播放调用方已生成的音频 |

默认授权前三项，不包含音频权限。主人可以在游戏内查看或撤销授权；“已授权”不代表客户端在线。

凭证应由 OAuth 流程或主人管理接口产生。不要把令牌写进 URL、聊天、截图或 Git。刷新令牌轮换后必须保存新值；本项目 stdio 适配器会原子更新其配置文件。

## 3. 第一次调用：省略世界名

```json
{}
```

以上是 `world_enter` 的参数。省略 `worldId` 会进入当前凭证授权的默认世界。通常是 `default`，但应使用实际返回值，不猜 `main`、`home` 或角色名字。

关注返回的：

- `worldId`、`actor.actorId`、角色当前场景和需求状态；
- `rules`、`permissions` 和 `capabilities`；
- `activeActions` 与事件恢复信息。

接入后先观察，不要新建另一个“自己”。可复制的接入预设见[提示词](MCP-PROMPTS.md)。

## 4. 地图、目录与事件

| 目的 | 工具与参数 |
| --- | --- |
| 整个世界的场景、物件与连接 | `world_observe {"detail":"map"}` |
| 指定场景 | `world_observe {"sceneId":"yard","detail":"entities"}` |
| 场景可用门槽 | `world_observe {"sceneId":"yard","detail":"portals"}` |
| 家具目录 | `catalog_list {"category":"assets"}` |
| 场景模板 | `catalog_list {"category":"templates"}` |
| 户外家具 | `catalog_list {"category":"assets","sceneKind":"outdoor"}` |
| 布置建议 | `layout_suggest {"sceneId":"yard","purpose":"rest","preferences":["yardSwing"]}` |
| 最近事件 | `world_get_events {"afterCursor":0,"limit":20}` |

`yard` 仅是初始场景的示例 ID；新增场景使用观察返回的 ID。布置建议可能没有候选方案，且不会自动应用。

可选资源 URI：`world://current/rules`、`world://current/map`、`world://current/catalog`、`world://current/activity`。宿主没有资源读取入口时，使用上表普通工具即可。地图是结构化信息，不是摄像头画面；当前 MCP 没有提供截图工具。

## 5. 行动：取得控制，提交，确认结果

角色控制租约为 60 秒；不是整场活动的永久授权。主人按 WASD 会接管角色。租约失效后重新获取，不复用旧 `leaseId`、`leaseVersion`。

下面是基于已连接 SDK `client` 的示意代码；目标场景须先通过观察确认存在且可达：

```js
async function call(name, args = {}) {
  const response = await client.callTool({name, arguments: args});
  if (response.isError) throw new Error(JSON.stringify(response.structuredContent));
  return response.structuredContent;
}
const entered = await call('world_enter');
const actorId = entered.actor.actorId;
const lease = await call('actor_take_control', {
  actorId, requestId: crypto.randomUUID()
});
const move = await call('actor_move', {
  actorId, leaseId: lease.leaseId, leaseVersion: lease.leaseVersion,
  requestId: crypto.randomUUID(), target: {sceneId: 'yard'}
});
const status = await call('action_get', {actionId: move.actionId});
```

`actor_move` 的字段是 **`target`**，不是 `destination`。按坐标移动时使用 `target: {sceneId, position: [x, 0, z]}`，地面是 X/Z，Y 为竖直方向，单位米。

查询 `action_get` 直到 `completed`、`failed` 或 `cancelled`；可以约 0.5–1 秒检查一次，根据动作长度调整。一次查询仍是运行中，不代表失败。不要用 `world_get_events` 高频轮询走路进度，也不要未查终态就宣称成功。

交互使用同一份有效租约：

```js
await call('actor_interact', {
  actorId, leaseId: lease.leaseId, leaseVersion: lease.leaseVersion,
  requestId: crypto.randomUUID(), verb: 'sit', targetId: observedChairId
});
```

`observedChairId` 是从观察结果得到的实体 ID，不能用家具类型名代替。支持的动词为 `sit`、`sleep`、`swim`、`slide`、`eat`，物件必须在其目录 `actions` 中支持相应动词。吃白饭可省略 `targetId`，在当前位置进行；不要指定电脑桌等不支持吃饭的物件。

坐下完成后仍可保持坐姿；`completed` 表示坐下已完成，不代表立刻站起来。需要离开时移动或发起其他动作。释放控制会取消未完成动作，准备保持坐姿时先确认坐下完成。

每项新操作生成新的 `requestId`；同一项操作网络重试时保持原 `requestId` 和参数，避免重复执行。`action_cancel` 使用 `actionId` 与新的 `requestId`；不要用它取消一个已经结束的旧动作来期待影响当前动作。

## 6. 建设与场景连接

建设使用批准目录里的模型，不能凭一句描述生成新的模型文件。

1. `catalog_list` 查模板、家具、占地、交互点及适用场景。
2. `world_observe` 查当前布局、通道与 `layoutRevision`。
3. 可用 `layout_suggest` 得到候选 `ops`，再自行选择。
4. `build_preview {requestId, baseRevision, ops}` 预览。
5. 检查返回结果，再 `build_apply {requestId, planId}` 应用。
6. 必要时用应用返回的 `changeId` 调用 `build_undo`。已有后续依赖时可能不能撤销。

支持的 `ops`：

| 操作 | 主要字段 |
| --- | --- |
| `scene.create` | `ref`、`templateId`、`name`，可选 `style` |
| `portal.link` | `from: {sceneId, slotId}`、`to: {sceneId, slotId}` |
| `entity.add` | `ref`、`sceneId`、`type`、`position`、`rotation`、`scale` |
| `entity.transform` | `entityId`、`position`、`rotation`、`scale` |
| `entity.remove` | `entityId` |

同一批 `ops` 可以用新建场景的 `ref` 引用它。新建家具始终提供 `[x,y,z]` 位置、弧度旋转和三轴正数缩放；实际可用范围由目录与预览校验决定，不能只按参数类型上限猜。

目前模板：`cozy_room_v1`、`courtyard_v1`。连接场景必须查询可用门槽，用两端各自的槽位创建通道。不能占用已有门槽、堵住落点或通路。新场景接通现有世界后才可正常走进去。

固化规则：

- 室内以 45° 为中心，用户可拖动左右各 8° 的轻微水平晃动，等距俯角和相对高度固定；户外只允许水平旋转。
- 默认最多 8 个场景，每场景 100 件物件，一次建设最多 20 项操作。
- 九块农田及保护区不可移动或侵占，出生点、门口和通路须保留。
- 预览方案有效期 5 分钟；布局版本变化时重新观察与预览。
- 普通用户编辑同样遵循保护与版本规则，AI 没有绕过规则的接口。

刷新网页会看到已应用的改造。改造保存在运行数据库，初始发布配置不随之改变，详见[存档说明](WORLD-SAVES.md)。

## 7. 需求数值的真实含义

| 字段 | 含义 | 当前行为 |
| --- | --- | --- |
| `hunger` | 饥饿，越高越饿 | UI 饱食显示为 `100 - hunger` |
| `energy` | 精力，越高越充足 | 当前为 0 也不禁止移动、减速或导致死亡 |
| `happiness` | 心情，越高越开心 | 部分互动可恢复 |

需求范围为 0–100。正常服务运行时，饥饿约每分钟增加 1.2，精力约每分钟减少 0.6；这是时间消耗，不代表每走一步额外扣同样的值。

一轮吃白饭约 3 秒，降低约 12 点饥饿，不恢复精力；一次睡觉约 10 秒，恢复约 15 点精力。实际结果还会受到时间消耗、数值上下限和动作是否完成的影响，以 `action_get` 和最新观察为准。服务长间隔恢复时，需求按代码设置的上限补算，不补演不存在的移动。

这些数值用于决策，不要求智能体每次向主人播报。低数值不代表角色“快死了”。

## 8. 重连与事件恢复

关闭网页时，后端仍能推进已接受的有限动作；服务停止或电脑休眠时不会持续移动。重新连接先 `world_enter {}`，查看 `activeActions` 和事件恢复信息。

`world_get_events` 读取不会推进消费游标。处理过返回事件后，用 `world_ack_events {requestId, cursor}` 显式确认，不能猜一个未读取的游标。

若 `snapshotResetRequired`，先处理 `recoverySnapshot`，再用返回的 `recoveryToken`、`recoveryCursor` 进行恢复确认。按返回字段操作，不把历史缺口直接跳过。授权主体各自持有事件消费状态，令牌续期不创建新角色。

持续自主活动的调度、跨聊天回合的进度和预算属于宿主职责；游戏没有替宿主无限唤醒模型的功能。

## 9. 常见错误

| 返回 | 含义与处理 |
| --- | --- |
| HTTP 401 / `UNAUTHORIZED` | 检查凭证、过期、撤销或操作权限；连接层 401 不带可用世界列表 |
| `WORLD_SELECTION_INVALID` | 凭证有效但世界选择不匹配；用 `world_enter {}` 或返回的 `availableWorldIds`，不因此重签授权 |
| `WORLD_NOT_FOUND` | 已授权的目标世界实际不存在；检查服务端世界数据，不猜别的名称 |
| `INVALID_ARGUMENTS` | 参数不符合工具定义；按实时 schema 修正，不自己编字段 |
| `LEASE_BUSY` / `LEASE_INVALID` | 控制权被占、过期或被接管；观察后按需重新取得 |
| `ACTOR_BUSY` | 上个动作未结束，先查询或明确取消 |
| `ACTION_UNSUPPORTED` | 该物件不支持这个动词；查目录，吃饭可不指定物件 |
| `DESTINATION_BLOCKED` / `PATH_NOT_FOUND` | 目标或路线受阻；换可走落点，不尝试穿墙坐标 |
| `REVISION_CONFLICT` / `PLAN_EXPIRED` | 重新观察版本并预览，不能盲目重复应用 |
| `SCENE_EDIT_LOCKED` | 主人正在编辑，等待或告知冲突 |
| `PROTECTED_AREA` / `PORTAL_SLOT_UNAVAILABLE` | 保护或通道规则不满足，修改方案 |

## 10. stdio 客户端

默认优先使用 HTTP + OAuth。仅支持 stdio 的宿主可以启动本项目适配器：

```bash
npm run mcp:stdio -- --config /secure/world-mcp.json
```

文件示例，以下值都是占位，须由真实授权结果填充：

```json
{
  "endpoint": "http://127.0.0.1:5200/mcp",
  "accessToken": "REPLACE_WITH_AUTHORIZED_ACCESS_TOKEN",
  "refreshToken": "REPLACE_WITH_AUTHORIZED_REFRESH_TOKEN",
  "clientId": "REPLACE_WITH_REGISTERED_CLIENT_ID"
}
```

配置文件必须为当前用户所有的普通文件，权限 `0600`；不支持软链接。令牌由标准 OAuth 流程取得，或由主人通过已登录同源的 `POST /api/auth/grants` 签发，后者还需要主人 CSRF 校验。不要通过复制网页 cookie 给智能体来代替授权。

有匹配的 `refreshToken` 与 `clientId` 时，适配器可续期并保存轮换结果；只有访问令牌时，过期后不能自动续期。退出适配器不会停止游戏服务。本项目不提供 DSH 安装器，不擅自修改宿主配置。

## 11. 可选音频与远程部署

音频仅播放调用方已经生成的 MP3、WAV 或 OGG，需 `audio:play` 单独授权。游戏静音时，可在「设置」里点击「开启声音」。`audio_play` 接收 `audioBase64`、`mimeType` 和 `requestId`，最多 4 MiB、60 秒；不接受 URL 或本机文件路径。

用 `audio_get_status {playbackId}` 查回执，`audio_stop {requestId, playbackId}` 停止。网页 `started`/`finished` 及 `delivered_not_heard` 不能证明人听见。音频只在内存短暂保存，不进入世界存档。没有录音、ASR、TTS 或本地语音模型。

`127.0.0.1` 仅指客户端所在机器。同机地址不能直接给另一台机器或远程容器使用。远程部署需 HTTPS、反向代理、正确的 `WORLD_PUBLIC_URL` 及额外的主人身份认证方案；当前远程主人登录尚未开箱即用。不要通过暴露内部端口或删除授权检查来解决。详见[兼容边界](MCP-COMPATIBILITY.md)。

## 本地作者小镇与海滩

有用户自带本地素材时，可安装 `town-demo`（模板 `local_author_town_v1`）与 `beach-demo`。公开初始世界仅有四个免费场景，不包含私有素材或作者布局。旧手建海边经用户明确迁移后不会自动恢复。

- 先 `world_observe` 获取实际场景、模板及地标。Town 地标包括 square、shops、bridge、upper、coast、pier；支持 `actor_move` 的 `target: {sceneId:"town-demo", landmarkId:"bridge"}`，或 `groundPosition:[x,z]` 自动解析真实高度。
- 普通场景100物件，本地Town按模板 `maxEntities:1000` 校验；213个模型在目录中，实例专用隐藏类型只用于保留/编辑原摆设。
- Town 全774原网格逐步加载并完整保留，不随镜头距离隐藏细节；离开场景再释放。服务器导航不依赖加载进度。
- 原地形、桥面和阶梯固定。原摆设可编辑，预览自动按共享地面吸附。陆地/水面切换、桥侧限制与浏览器操作一致。

### 角色控制

`actor_move` 可选 `gait: "sprint"`。默认 `walk`，支持目标坐标、地标和跨场景寻路。主人移动可以接管角色，停手或动作完成 10 秒后让出控制权。

默认开放到点执行和自动攻击。直接招式、跳跃和指定落点施法留作[高级动作接口](MCP-ADVANCED-ACTIONS.md)。

### 使用授权密钥连接

在游戏设置的「连接智能体」面板里，填写接入的 agent 名称后点击「生成连接 JSON」。主机会同时签发一条有效期 30 天的授权和密钥。点击「复制连接 JSON」可获得含 `url` 和 `headers` 的单个 HTTP MCP 连接配置，无需客户端先走 OAuth。已有授权也可以点「生成密钥」后复制连接 JSON，或单独复制密钥到客户端的 Bearer Token 或 API Key 栏。HTTP 客户端使用 `Authorization: Bearer <密钥>`。地址保持原来的 `/mcp`。有效授权的「查看 JSON」可以再次展开和复制，旧版仅保存哈希的密钥需要更换一次。

密钥继承该授权的权限和到期时间。更换密钥会立即使旧密钥失效，撤销授权会使该授权下的密钥和 OAuth 凭证一起失效。

### 让游戏自己跑位和瞄准

下面两种任务使用同一套角色租约，返回的 `actionId` 可用 `action_get` 查询或用 `action_cancel` 取消。主人移动也可以接管。

- `actor_run_sequence` 接收 `target: { "sceneId": "yard", "groundPosition": [10, 6.1] }` 和 `maneuvers: ["roll", "doubleJump"]`。游戏先冲刺到指定位置，再依次执行招式。结果列出已经做完的动作。
- 先用 `world_observe` 查看 `combatTargets`，再用 `actor_attack_target` 提交 `targetId`，例如 `yard-dummy-2`。游戏自己找可达站位并瞄准，默认轮换射程内且冷却结束的魔法。也可传 `spell: "frost"` 指定寒冰长枪，其他技能名见 `world_enter.capabilities.attackSpells`。指定技能时，游戏会为该技能找站位并等待冷却。默认命中一次就结束，显式传 `continuous: true` 才会持续攻击，直到取消或租约结束。结果包含命中数、总伤害和最后一次命中。当前可攻击目标是院子里的三个训练木桩。
