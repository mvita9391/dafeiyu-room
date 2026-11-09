import { surfaceAt, COASTAL_LOW_OBSTACLES } from "./coastal.js";
import { poolAt, waterAt, waterPose } from "./water.js";
import { segmentWalkable, yardSupportAt } from "./navigation.js";
import { getTemplate } from "./templates.js";
export const PLAYER_SPEED = 2.82;
export const CRAWL_SPEED_SCALE = 0.35;
export const JUMP_SPEED = 5.4;
export const JUMP_GRAVITY = 18;
const FOREST_SECOND_JUMP_SPEED = 6.4;
const BOXING_SPEED_SCALE = 0.75;

export function canStartJump(snapshot, actor) {
  const scene = snapshot.scenes.find((s) => s.sceneId === actor.sceneId);
  return actor.grounded !== false &&
    (actor.form !== "swim" || Boolean(poolAt(snapshot, actor.sceneId, actor.position)) ||
      (scene?.templateId === "forest_v1" && surfaceAt(getTemplate(scene.templateId), actor.position[0], actor.position[2])?.kind === "water"));
}

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
  dive,
) {
  const [x, z] = direction,
    length = Math.hypot(x, z),
    dt = Math.max(0, Math.min(50, dtMs)) / 1000;
  const start = actor.position,
    position = [...start];
  const scene = snapshot.scenes.find((s) => s.sceneId === actor.sceneId);
  const sceneTemplate = getTemplate(scene.templateId);
  const forest = sceneTemplate.templateId === "forest_v1";
  const yard = sceneTemplate.templateId === "courtyard_v1";
  const collisionAir = (actor.airHeight || 0) + (actor.supportHeight || 0);
  let verticalVelocity = actor.verticalVelocity || 0,
    grounded = actor.grounded !== false,
    air = actor.airHeight || 0;
  let jumpStage = grounded ? 0 : (actor.jumpStage ?? 1);
  if (dt && jump && !actor.jumpHeld &&
      (grounded ? canStartJump(snapshot, actor) : actor.form !== "swim" && jumpStage === 1)) {
    verticalVelocity = forest && !grounded ? FOREST_SECOND_JUMP_SPEED : JUMP_SPEED;
    jumpStage = grounded ? 1 : 2;
    grounded = false;
  }
  const startAir = air;
  if (!grounded) {
    air += verticalVelocity * dt - JUMP_GRAVITY * dt * dt / 2;
    verticalVelocity -= JUMP_GRAVITY * dt;
  }
  const terrainJump = forest && !grounded;
  let jumpGround = yard
    ? surfaceAt(sceneTemplate, start[0], start[2])?.height ?? start[1]
    : start[1];
  let rotation = actor.rotation || 0;
  if (length && dt) {
    const distance = PLAYER_SPEED * dt * Math.max(0, Math.min(2, speedScale)),
      dx = (x / length) * distance,
      dz = (z / length) * distance;
    position[1] =
      surfaceAt(sceneTemplate, position[0], position[2])
        ?.height ?? position[1];
    jumpGround = position[1];
    const airborneFeetY = terrainJump
      ? jumpGround + Math.max(0, Math.min(startAir, air))
      : undefined;
    const goal = [position[0] + dx, position[1], position[2] + dz];
    if (
      segmentWalkable(snapshot, actor.sceneId, position, goal, collisionAir, airborneFeetY, yard)
    ) {
      goal[1] =
        surfaceAt(sceneTemplate, goal[0], goal[2])?.height ??
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
            airborneFeetY,
            yard,
          )
        ) {
          slide[1] =
            surfaceAt(sceneTemplate, slide[0], slide[2])
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
  // Air height is relative to the floor underfoot. Crossing an edge must not
  // change world-space height before the character actually lands.
  if (terrainJump) air += jumpGround - position[1];
  let supportHeight = 0;
  if (yard && (!grounded || actor.supportHeight > 0)) {
    const feetY = start[1] + air;
    const support = yardSupportAt(snapshot, actor.sceneId, position,
      start[1] + startAir + (grounded ? .18 : .025));
    if (support !== undefined && (grounded || verticalVelocity <= 0 && feetY <= support + .015)) {
      grounded = true;
      air = verticalVelocity = 0;
      supportHeight = support - jumpGround;
      position[1] = support;
    } else {
      position[1] = jumpGround = surfaceAt(sceneTemplate, position[0], position[2])?.height ?? jumpGround;
      air = feetY - jumpGround;
      if (grounded && air > 1e-8) {
        grounded = false;
        jumpStage = 1;
      }
    }
  }
  if (!grounded && air <= 1e-8) {
    air = 0;
    grounded = true;
    verticalVelocity = 0;
  }
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
    diving: grounded && (dive ?? actor.diving) === true,
  };
  return {
    ...next,
    ...waterPose(snapshot, next),
    ...(!grounded ? { pose: "jumping", form: actor.form === "swim" && (!forest || waterAt(snapshot, next)) ? "swim" : "normal" } : {}),
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
  const scene = snapshot.scenes.find((s) => s.sceneId === actor.sceneId);
  const forest = scene.templateId === "forest_v1";
  const destinationHeight = forest ? surfaceAt(getTemplate(scene.templateId), end[0], end[2])?.height : undefined;
  const secondJumpFrame = destinationHeight !== undefined &&
    destinationHeight - actor.position[1] > JUMP_SPEED ** 2 / (2 * JUMP_GRAVITY) ? 6 : null;
  const maxFrames = forest || actor.supportHeight > 0 ? 28 : 16;
  for (let i = 0; i < maxFrames; i++) {
    const remaining = Math.hypot(
      end[0] - state.position[0],
      end[2] - state.position[2],
    );
    state = advancePlayer(
      snapshot,
      state,
      direction,
      50,
      i === 0 || i === secondJumpFrame,
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
  return { frames, direction, speedScale, secondJumpAt: secondJumpFrame === null ? null : secondJumpFrame * 0.05 };
}
