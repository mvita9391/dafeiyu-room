import {PLAYER_SPEED} from './movement.js';

export const GAITS = ['walk', 'sprint'];
export const SEQUENCE_MANEUVERS = ['flyingKick', 'roll', 'slide', 'boxingCombo', 'doubleJump', 'dance', 'kickCombo'];
export const MANEUVERS = [...SEQUENCE_MANEUVERS, 'spell'];

export const KICK_SPEED = 1.8;
// Times are in source seconds. Keep the strike and foot landing, trim the idle recovery.
export const KICK_STEPS = [
  { name: 'HumanSpKicking', end: 1.72 },
  { name: 'HumanSpKicking2', end: 1.47 },
  { name: 'HumanSpStandingMeleeKick', end: 1.4 },
  { name: 'HumanSpMartelo', end: 1.3 },
  { name: 'HumanSpLegSweep', start: 0.23, end: 2.12 },
].map(step => ({ speed: KICK_SPEED, ...step }));

export const DANCE_CLIPS = [
  {name: 'HumanSpDancingTwerk', end: 15.2, speed: 1},
  {name: 'HumanSpHipHopDancing', end: 4.466666666666667, speed: 1},
];
export const SPELL_THROW = {name: 'HumanSpFrisbeeThrow', start: .88, release: 1.30, end: 1.92, speed: 2.25};
export const SPELL_RELEASE_SECONDS = (SPELL_THROW.release - SPELL_THROW.start) / SPELL_THROW.speed;

const BOXING_CLIPS = [
  {name: 'DafeiyuLeftJab', end: .96, speed: 1.8},
  {name: 'DafeiyuRightCross', end: .96, speed: 1.7},
  {name: 'DafeiyuLeftHook', end: .96, speed: 1.55},
];

export function maneuverSpec(name, gait, clip) {
  switch (name) {
    case 'flyingKick':
      return {clips: [{name: 'HumanSpFlyingKick', end: 1.12, speed: 1.8}], speedScale: gait === 'sprint' ? 2 : 1, distance: gait === 'sprint' ? 2 : 1};
    case 'roll':
      return {clips: [{name: 'HumanSpQuickRollToRun', end: 1.34, speed: 1.8}], speedScale: 2, distance: 4};
    case 'slide':
      return {clips: [{name: 'Slide', end: 1.27, speed: 1.27 / .9}], speedScale: 2, distance: PLAYER_SPEED * 2 * .9};
    case 'kickCombo':
      return {clips: KICK_STEPS, speedScale: 0, distance: 0};
    case 'dance':
      return {clips: DANCE_CLIPS.filter(dance => dance.name === clip), speedScale: 0, distance: 0};
    case 'spell':
      return {clips: [SPELL_THROW], speedScale: 0, distance: 0};
    case 'boxingCombo':
      return {clips: BOXING_CLIPS, speedScale: 0, distance: 0};
  }
}

export const clipDuration = clip => (clip.end - (clip.start ?? 0)) / clip.speed;
export const maneuverDuration = spec => spec.clips.reduce((seconds, clip) => seconds + clipDuration(clip), 0);
