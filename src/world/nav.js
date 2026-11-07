import { clamp } from '../core/anim.js';

/** 圆 vs 一组 AABB：把 pos 推到最近的外侧（原地修改） */
export function resolveCircle(pos, r, boxes) {
  if (!boxes || !boxes.length) return pos;
  for (const b of boxes) {
    const cx = clamp(pos.x, b.x0, b.x1);
    const cz = clamp(pos.z, b.z0, b.z1);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * r;
      pos.z = cz + (dz / d) * r;
    } else {
      // 圆心在盒内：从最近的面推出去
      const dl = pos.x - b.x0, dr = b.x1 - pos.x, dt = pos.z - b.z0, db = b.z1 - pos.z;
      const m = Math.min(dl, dr, dt, db);
      if (m === dl) pos.x = b.x0 - r;
      else if (m === dr) pos.x = b.x1 + r;
      else if (m === dt) pos.z = b.z0 - r;
      else pos.z = b.z1 + r;
    }
  }
  return pos;
}

/** 点是否在任一盒内 */
export function insideAny(x, z, boxes) {
  for (const b of boxes) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return true;
  return false;
}

/** 把目标点从盒子内部推到最近的盒边外（用于点击移动） */
export function pushOutside(target, r, boxes) {
  if (!boxes || !boxes.length) return target;
  for (let pass = 0; pass < 3; pass++) {
    let hit = false;
    for (const b of boxes) {
      if (target.x > b.x0 && target.x < b.x1 && target.z > b.z0 && target.z < b.z1) {
        const dl = target.x - b.x0, dr = b.x1 - target.x, dt = target.z - b.z0, db = b.z1 - target.z;
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) target.x = b.x0 - r * 1.2;
        else if (m === dr) target.x = b.x1 + r * 1.2;
        else if (m === dt) target.z = b.z0 - r * 1.2;
        else target.z = b.z1 + r * 1.2;
        hit = true;
      }
    }
    if (!hit) break;
  }
  return target;
}
