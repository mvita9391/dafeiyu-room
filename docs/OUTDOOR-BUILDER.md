# 野外搭建工具

地图用 1 米格子描述，每个格子是一根实心地形柱。高度以 0.16 米为单位，石阶可以用半格踏面。当前森林用这套工具生成。渲染、地面高度和树干碰撞均来自同一份地图。

```sh
node scripts/outdoor-build.mjs inspect
node scripts/outdoor-build.mjs inspect my-map.json
node scripts/outdoor-build.mjs compile my-map.json > compiled-map.json
```

默认读取 `shared/world/forest-layout.js`。外部 JSON 可用同样的 `version`、`bounds` 和 `ops` 结构。操作按顺序执行。矩形坐标为整数，右边界和远边界不包含在选区内。

| 操作 | 参数 |
| --- | --- |
| `height` | `rect`、`level`。统一设置选区的高度。 |
| `paint` | `rect`、`material`。材质可选 `grass`、`meadow`、`dirt`、`paver`、`rock`。 |
| `stairs` | `rect`、`from`、`to`、`direction`。沿指定方向排踏面。每半格最多一级。 |
| `place` | `x`、`z`、`prop`、可选 `size`。放置树、高草、花或石头，对应 `tree`、`tallGrass`、`flowers`、`stone`。 |
| `scatter` | `rect`、`prop`，可选 `seed`、`density`、`spacing`、`avoid`。按固定种子批量放置，`avoid` 指定应避开的材质。 |
| `erase` | `rect`、可选 `prop`。擦除选区内的植被或石头。 |

编译输出可直接交给地形渲染器，碰撞使用合并后的高度面。开发时先用 `inspect` 校验选区和台阶，再在 Electron 里走通入口、石阶和观景台。将来做玩家编辑器时，画笔可以生成同一套操作。当前格式是一层可走表面的地形模型。

材质按顶面、岩壁和台阶分开处理。贴图按世界尺寸重复，表面色调按坐标变化，网格只生成露在外面的面。设计参考了公开的方块材质和网格生成文档。[Minecraft 方块材质变体](https://learn.microsoft.com/en-us/minecraft/creator/documents/variationsblocktexture?view=minecraft-bedrock-stable) · [Luanti 方块绘制类型](https://api.luanti.org/nodes/) · [Voxel Tools 遮挡面剔除](https://voxel-tools.readthedocs.io/en/latest/api/VoxelMesherBlocky/)
