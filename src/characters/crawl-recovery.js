import { AnimationClip, Quaternion, Vector3 } from 'three';

const ROLL_TIME = 0.36;
const KIP_START = 0.28;
const KIP_END = 1.77;
const KIP_SPEED = 1.65;
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);
const smooth = t => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

function currentValue(model, track, fallback) {
  const dot = track.name.lastIndexOf('.');
  const node = model.getObjectByName(track.name.slice(0, dot));
  return node?.[track.name.slice(dot + 1)]?.toArray?.() ?? [...fallback];
}

export function buildCrawlRecovery(model, kipUp) {
  const duration = ROLL_TIME + (KIP_END - KIP_START) / KIP_SPEED;
  const frames = Math.ceil(duration * 60);
  const times = Array.from({ length: frames + 1 }, (_, i) => i * duration / frames);
  const tracks = kipUp.tracks.map(track => {
    const interpolant = track.createInterpolant();
    const kipStart = [...interpolant.evaluate(KIP_START)];
    const crawl = currentValue(model, track, kipStart);
    const size = track.getValueSize();
    const values = new Float32Array(times.length * size);
    const hipsRotation = track.name === 'Hips.quaternion';
    const hipsPosition = track.name === 'Hips.position';
    const quaternion = track.name.endsWith('.quaternion');
    const from = quaternion ? new Quaternion().fromArray(crawl) : null;
    const to = quaternion ? new Quaternion().fromArray(kipStart) : null;
    let side;
    if (hipsRotation) {
      // The original kip-up lies with its head at -Z. Turn its supine pose to match the crawl's +Z.
      to.premultiply(new Quaternion().setFromAxisAngle(UP, Math.PI));
      const delta = to.clone().multiply(from.clone().invert());
      const sign = Math.sign(delta.z * (delta.w < 0 ? -1 : 1)) || 1;
      side = new Quaternion().setFromAxisAngle(FORWARD, sign * Math.PI / 2).multiply(from);
    }
    const pose = quaternion ? new Quaternion() : null;
    const yaw = new Quaternion();
    const offset = new Vector3();
    times.forEach((time, frame) => {
      const index = frame * size;
      if (time < ROLL_TIME) {
        const progress = smooth(time / ROLL_TIME);
        if (hipsRotation) {
          if (progress < 0.5) pose.slerpQuaternions(from, side, progress * 2);
          else pose.slerpQuaternions(side, to, progress * 2 - 1);
          pose.toArray(values, index);
        } else if (quaternion) {
          pose.slerpQuaternions(from, to, progress).toArray(values, index);
        } else if (hipsPosition) {
          values.set([crawl[0], crawl[1] + (kipStart[1] - crawl[1]) * progress + 0.07 * Math.sin(Math.PI * progress), crawl[2]], index);
        } else {
          for (let i = 0; i < size; i++) values[index + i] = crawl[i] + (kipStart[i] - crawl[i]) * progress;
        }
        return;
      }

      const sourceTime = Math.min(KIP_END, KIP_START + (time - ROLL_TIME) * KIP_SPEED);
      const sample = interpolant.evaluate(sourceTime);
      // Keep the ground phase aligned, then unwind the orientation as the character rises.
      if (hipsRotation || hipsPosition) yaw.setFromAxisAngle(UP, Math.PI * (1 - smooth((sourceTime - 1.30) / (KIP_END - 1.30))));
      if (hipsRotation) {
        pose.fromArray(sample).premultiply(yaw).toArray(values, index);
      } else if (hipsPosition) {
        offset.set(sample[0] - kipStart[0], 0, sample[2] - kipStart[2]).applyQuaternion(yaw);
        values.set([crawl[0] + offset.x, sample[1], crawl[2] + offset.z], index);
      } else values.set(sample, index);
    });
    return new track.constructor(track.name, times, values, track.getInterpolation());
  });
  return new AnimationClip('DafeiyuCrawlRecovery', duration, tracks);
}
