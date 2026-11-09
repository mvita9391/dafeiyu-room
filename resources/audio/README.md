# 游戏音频

角色语音：由破晓手记提供并授权随项目公开分发；来自此前的角色演示配音，仅发布独立台词，不包含原始视频。

背景音乐按家里及院子、城市、野外、战斗切换，分别使用 `garden-theme.mp3`、`town-theme.mp3`、`wild-theme.mp3` 和 `battle-theme.mp3`。四首均为项目程序作曲，城市和野外主题另外混入用户提供的白天城镇和森林录音。样本来源登记在 `manifest.json`。

游戏音效统一从本目录加载，`manifest.json` 登记了公开构建使用的音频、校验值和新增样本的来源。魔法分别使用 `action-spell-<技能>-release.wav` 和 `action-spell-<技能>-impact.wav`；脚步和咀嚼也从此目录轮换播放。用户提供的音频保留原素材名称和来源记录，素材包未附统一许可证。

开启声音后循环播放背景音乐；静音同时停止本地音乐、角色台词和智能体音频。游戏不提供语音合成。

新增交互音效时在 `src/core/sound-dictionary.js` 登记用途、文件名和播放音量，并在本目录的 `manifest.json` 登记文件。界面统一用 `UI_SOUND.confirm`，对战敌人悬停用 `UI_SOUND.enemyHover`。

角色动作使用 `action-effort-*.wav` 的短发力声。起跳、二段跳、飞踢、出拳、原地踢腿、翻滚和滑铲分别在音效字典中登记，招式的触发帧在 `src/characters/action-sound-cues.js` 中设置。
