# MCP 高级动作接口

默认的 MCP 工具列表仅开放到点执行和自动攻击这两种战斗任务。智能体通过 `actor_run_sequence` 提交动作顺序，通过 `actor_attack_target` 指定目标。游戏负责跑位、选择技能和瞄准。

`actor_maneuver` 和 `actor_jump` 的实现保留。默认的 HTTP 和 stdio MCP 客户端无法发现或直接调用它们，`world_enter` 也只发布默认工具和序列可用的招式。

确实需要精细控制时，在要启用的服务入口用 `buildServer({ mcpAdvancedActions: true, ... })`。这是服务级开关。重新启动服务并刷新客户端工具列表后，两个工具和技能槽说明会一起出现。现有角色行动授权仍适用。如果以后只给个别智能体开放，需要在服务端加按授权区分的控制。

## 启用后的调用方法

`actor_jump` 使用控制租约，支持原地或1.6米以内落点；用 `action_get` 等待终态，水中不能起跳。

取得角色租约后，用 `actor_maneuver` 提交一次招式。和移动一样，传入 `actorId`、`leaseId`、`leaseVersion` 和唯一的 `requestId`，然后用返回的 `actionId` 调用 `action_get` 或 `action_cancel`。

| `maneuver` | 动作 |
| --- | --- |
| `flyingKick` | 飞踢最多 1 米，可加 `gait: "sprint"` 提高到 2 米 |
| `roll` | 翻滚最多 4 米 |
| `slide` | 沿朝向滑铲，最多 0.9 秒 |
| `boxingCombo` | 原地三连拳 |
| `doubleJump` | 原地起跳，在第一跳最高点附近再跳一次，第二段播放「大跳跃」 |
| `dance` | 从 G 键的舞蹈池随机抽取并完整播放一支 |
| `kickCombo` | 原地依次打完 Q 键的五个踢腿动作 |
| `spell` | 施放技能栏 1–8 号魔法，必填 `slot` |

可用 `heading` 指定朝向（弧度，0 为 +Z，π/2 为 +X），省略时沿角色当前朝向。招式需要角色位于地面，移动招式遇阻会停止位移，完成结果会带 `blocked`。主人移动可以接管角色。主人页面在停止输入或动作结束 10 秒后让出控制权。玩滑梯仍使用 `actor_interact` 的 `slide`。

`world_enter` 的 `capabilities.spellSlots` 会列出当前技能栏。1 寒冰长枪、2 雷霆之矛、3 熔火陨星、4 新星光束、5 电弧陷阱、6 冰晶王冠、7 大地裂击、8 自然绽放。指定 `groundPosition: [X, Z]` 时，直线技能会沿目标方向施放到固定射程，遇墙缩短。范围技能会把落点限制在射程内。省略地面目标时沿 `heading` 施放，或沿角色当前朝向。施法带原有的飞盘动画、特效和音效，打中院子木桩时会显示伤害数字。出手前可以取消，出手后开始计算技能冷却。

例如，调用 `actor_maneuver` 向地面坐标 `[10, 3.1]` 施放熔火陨星。

```json
{
  "actorId": "whale",
  "leaseId": "your-lease-id",
  "leaseVersion": 1,
  "requestId": "cast-meteor-1",
  "maneuver": "spell",
  "slot": 3,
  "groundPosition": [10, 3.1]
}
```
