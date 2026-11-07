import { surfaceAt, COASTAL_LOW_OBSTACLES } from "./coastal.js";
import { waterPose } from "./water.js";
import { segmentWalkable } from "./navigation.js";
import { getTemplate } from "./templates.js";
export const PLAYER_SPEED = 2.82;
export const CRAWL_SPEED_SCALE = 0.35;
export const JUMP_SPEED = 5.4;
export const JUMP_GRAVITY = 18;
const BOXING_SPEED_SCALE = 0.75;

export function inputSpeedScale({ crawl, boxing, sprint }) {
  if (crawl) return CRAWL_SPEED_SCALE;
  if (boxing) return BOXING_SPEED_SCALE;
  return sprint ? 2 : 1;
}
// Identical deterministic integration on the browser and authoritative server.
export function advancePlayer(
  snapshot,
  actor,
  direction,
  dtMs,
  jump = false,
  speedScale = 1,
) {
  const [x, z] = direction,
    length = Math.hypot(x, z),
    dt = Math.max(0, Math.min(50, dtMs)) / 1000;
  const start = actor.position,
    position = [...start];
  const collisionAir = (actor.airHeight || 0) + (actor.supportHeight || 0);
  let rotation = actor.rotation || 0;
  if (length && dt) {
    const distance = PLAYER_SPEED * dt * Math.max(0, Math.min(2, speedScale)),
      dx = (x / length) * distance,
      dz = (z / length) * distance;
    const scene = snapshot.scenes.find((s) => s.sceneId === actor.sceneId);
    position[1] =
      surfaceAt(getTemplate(scene.templateId), position[0], position[2])
        ?.height ?? position[1];
    const goal = [position[0] + dx, position[1], position[2] + dz];
    if (
      segmentWalkable(snapshot, actor.sceneId, position, goal, collisionAir)
    ) {
      goal[1] =
        surfaceAt(getTemplate(scene.templateId), goal[0], goal[2])?.height ??
        goal[1];
      position.splice(0, 3, ...goal);
    } else
      for (const axis of [0, 2]) {
        const slide = [...position];
        slide[axis] += axis === 0 ? dx : dz;
        if (
          segmentWalkable(
            snapshot,
            actor.sceneId,
            position,
            slide,
            collisionAir,
          )
        ) {
          slide[1] =
            surfaceAt(getTemplate(scene.templateId), slide[0], slide[2])
              ?.height ?? slide[1];
          position.splice(0, 3, ...slide);
        }
      }
    if (Math.hypot(position[0] - start[0], position[2] - start[2]) > 1e-9)
      rotation = Math.atan2(position[0] - start[0], position[2] - start[2]);
  }
  const speed = dt
    ? Math.hypot(position[0] - start[0], position[2] - start[2]) / dt
    : 0;
  let verticalVelocity = actor.verticalVelocity || 0,
    grounded = actor.grounded !== false,
    air = actor.airHeight || 0;
  let jumpStage = grounded ? 0 : (actor.jumpStage ?? 1);
  if (dt && jump && !actor.jumpHeld && actor.form !== "swim" &&
      (grounded || jumpStage === 1)) {
    verticalVelocity = JUMP_SPEED;
    jumpStage = grounded ? 1 : 2;
    grounded = false;
  }
  if (!grounded) {
    air += verticalVelocity * dt - JUMP_GRAVITY * dt * dt / 2;
    verticalVelocity -= JUMP_GRAVITY * dt;
    if (air <= 1e-8) {
      air = 0;
      grounded = true;
      verticalVelocity = 0;
    }
  }
  let supportHeight = 0;
  const sceneTemplate = getTemplate(
    snapshot.scenes.find((s) => s.sceneId === actor.sceneId).templateId,
  );
  if (sceneTemplate.templateId === "coastal_town_v1") {
    const rock = COASTAL_LOW_OBSTACLES.find(
      (r) =>
        position[0] > r.x0 - 0.18 &&
        position[0] < r.x1 + 0.18 &&
        position[2] > r.z0 - 0.18 &&
        position[2] < r.z1 + 0.18,
    );
    if (rock && air <= rock.height) {
      grounded = true;
      verticalVelocity = 0;
      air = 0;
      supportHeight = rock.height + 0.021;
    }
    position[1] =
      (surfaceAt(sceneTemplate, position[0], position[2])?.height ??
        position[1]) + supportHeight;
  }

  const next = {
    ...actor,
    position,
    rotation,
    speed,
    moving: speed > 0.001,
    grounded,
    verticalVelocity,
    airHeight: air,
    jumpStage: grounded ? 0 : jumpStage,
    jumpHeld: jump,
    supportHeight,
  };
  return {
    ...next,
    ...waterPose(snapshot, next),
    ...(!grounded ? { pose: "jumping" } : {}),
  };
}

export function simulateJump(snapshot, actor, end) {
  const distance = Math.hypot(
    end[0] - actor.position[0],
    end[2] - actor.position[2],
  );
  if (distance > 1.6) throw Error("JUMP_TARGET_INVALID");
  const direction = distance
      ? [
          (end[0] - actor.position[0]) / distance,
          (end[2] - actor.position[2]) / distance,
        ]
      : [0, 0],
    speedScale = distance / (PLAYER_SPEED * 0.6);
  let state = { ...actor, position: [...actor.position] };
  const frames = [];
  for (let i = 0; i < 16; i++) {
    const remaining = Math.hypot(
      end[0] - state.position[0],
      end[2] - state.position[2],
    );
    state = advancePlayer(
      snapshot,
      state,
      direction,
      50,
      i === 0,
      Math.min(speedScale, remaining / (PLAYER_SPEED * 0.05)),
    );
    frames.push(state);
    if (i >= 11 && remaining < 0.001 && state.grounded) break;
  }
  if (
    Math.hypot(state.position[0] - end[0], state.position[2] - end[2]) >
      0.001 ||
    !state.grounded ||
    !segmentWalkable(snapshot, actor.sceneId, state.position, state.position)
  )
    throw Error("JUMP_TARGET_INVALID");
  return { frames, direction, speedScale };
}
