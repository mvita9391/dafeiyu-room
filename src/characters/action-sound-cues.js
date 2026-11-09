// Source clip times in seconds. Cues follow the mixer, including faster combos.
const SLIDE_CUES = [[0, 'slide'], [0, 'slide-effort']];
export const ACTION_SOUND_CUES = {
  HumanSpForwardJump: [[0.80, 'jump-effort']],
  HumanSpRunningJump: [[0, 'jump-effort']],
  HumanSpBigJump: [[0.46, 'double-jump-effort']],
  HumanSpKicking: [[0.78, 'kick'], [0.78, 'kick-effort']],
  HumanSpKicking2: [[0.59, 'kick'], [0.59, 'kick-effort']],
  HumanSpStandingMeleeKick: [[0.49, 'kick'], [0.49, 'kick-effort']],
  HumanSpMartelo: [[0.39, 'kick'], [0.39, 'kick-effort']],
  HumanSpLegSweep: [[1.27, 'kick'], [1.27, 'kick-effort']],
  HumanSpFlyingKick: [[0.24, 'kick-whoosh'], [0.24, 'flying-kick-effort'], [0.96, 'land']],
  DafeiyuLeftJab: [[0.34, 'punch-whoosh'], [0.34, 'punch-effort']],
  DafeiyuRightCross: [[0.34, 'punch-whoosh'], [0.34, 'punch-effort']],
  DafeiyuLeftHook: [[0.36, 'punch-finish'], [0.36, 'punch-effort']],
  HumanSpQuickRollToRun: [[0, 'roll-effort']],
  HumanSpRunningSlide: SLIDE_CUES,
  Slide: SLIDE_CUES,
};
