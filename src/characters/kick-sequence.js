import { KICK_SPEED, KICK_STEPS } from '../../shared/world/maneuvers.js';
const KICK_FADE = 0.08;
export const FLYING_KICK = { name: 'HumanSpFlyingKick', end: 1.33, speed: KICK_SPEED, fade: KICK_FADE };

export class ActionSequence {
  constructor(play, steps) {
    this.play = play;
    this.steps = steps;
    this.next = 0;
    this.buffered = false;
    this.active = false;
  }

  press() {
    if (this.active) {
      this.buffered = true;
      return true;
    }
    return this.playNext();
  }

  finish() {
    if (!this.active || !this.buffered) return false;
    this.buffered = false;
    return this.playNext();
  }

  cancel() {
    this.active = false;
    this.buffered = false;
  }

  playNext() {
    const { name, ...timing } = this.steps[this.next];
    if (!this.play(name, timing)) return false;
    this.next = (this.next + 1) % this.steps.length;
    this.active = true;
    return true;
  }
}

export class KickSequence extends ActionSequence {
  constructor(play) {
    super(play, KICK_STEPS.map(step => ({ fade: KICK_FADE, ...step })));
  }
}
