// 极简补间：给角色/相机用，避免引入依赖
export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
  outElastic: (t) => {
    const c = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
  },
};

export class Tween {
  constructor(duration, fn, { ease: e = ease.inOutCubic, delay = 0, onDone } = {}) {
    Object.assign(this, { duration, fn, e, delay, onDone, t: -delay, done: false });
  }
  update(dt) {
    if (this.done) return true;
    this.t = Math.min(this.duration, this.t + dt);
    if (this.t < 0) return false;
    const k = Math.min(1, this.t / this.duration);
    this.fn(this.e(k), k);
    if (k >= 1) { this.done = true; this.onDone?.(); }
    return this.done;
  }
}

export function tween(list, duration, fn, opts) { list.push(new Tween(duration, fn, opts)); }

export function updateTweens(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].update(dt)) list.splice(i, 1);
}

export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const rand = (a, b) => a + Math.random() * (b - a);
