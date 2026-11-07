import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveThirdPersonFacing,
  createThirdPersonFacingState,
  thirdPersonMoveAxis,
  thirdPersonMoveDirection,
  thirdPersonMoveFacing,
} from '../src/core/third-person-follow.js';

const near = (a, b, eps = 1e-6) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < eps;
const resolve = (state, extra = {}) =>
  resolveThirdPersonFacing(state, {
    yaw: 0,
    moving: false,
    moveAngle: null,
    pose: 'idle',
    sceneId: 'yard',
    serverRotation: null,
    dt: 1 / 60,
    ...extra,
  });

test('静止无拖动：人物保持朝向，镜头 yaw 原样返回', () => {
  const state = createThirdPersonFacingState(1.2);
  const out = resolve(state, { yaw: 1.2 });
  assert.ok(near(out.rotation, 1.2));
  assert.ok(near(out.yaw, 1.2));
  assert.ok(near(state.facing, 1.2));
});

test('移动时人物面向移动方向（A 左、D 右），镜头 yaw 不变', () => {
  const state = createThirdPersonFacingState(0.5);
  const out = resolve(state, { yaw: 1.0, moving: true, moveAngle: 0.5 - Math.PI / 2 });
  assert.ok(near(out.rotation, 0.5 - Math.PI / 2), 'D 时人物朝屏幕右');
  assert.ok(near(out.yaw, 1.0), '镜头 yaw 不被修改');
  assert.ok(near(state.idleFacing, 0.5), '记住移动前朝向');
});

test('镜头转动后，A/D 仍让人物面向移动方向', () => {
  const state = createThirdPersonFacingState(0.5);
  const yaw = 1.1;
  for (const [x, expected] of [[-1, yaw + Math.PI / 2], [1, yaw - Math.PI / 2]]) {
    const out = resolve(state, {
      yaw, moving: true, moveAngle: thirdPersonMoveFacing(yaw, x, 0),
    });
    assert.ok(near(out.rotation, expected), `移动轴 ${x} 应决定角色朝向`);
    assert.ok(near(out.yaw, yaw));
  }
});

test('停下后人物平滑转回移动前朝向（镜头不回中）', () => {
  const state = createThirdPersonFacingState(0.5);
  resolve(state, { yaw: 1.0, moving: true, moveAngle: 0.5 - Math.PI / 2 });
  let last = null;
  for (let i = 0; i < 60; i += 1) {
    last = resolve(state, { yaw: 1.0, moving: false, dt: 1 / 60 });
    if (!state.returning) break;
  }
  assert.ok(near(last.rotation, 0.5), '回到移动前的朝向');
  assert.ok(near(last.yaw, 1.0), '镜头 yaw 始终不变');
});

test('右键拖动（静止）：只转镜头，人物朝向不变', () => {
  const state = createThirdPersonFacingState(0.5);
  const out = resolve(state, { yaw: 2.0 });
  assert.ok(near(out.rotation, 0.5));
  assert.ok(near(out.yaw, 2.0));
  assert.ok(near(state.facing, 0.5));
});

test('就座/睡觉：采用服务端朝向', () => {
  const state = createThirdPersonFacingState(0.5);
  state.lastSceneId = 'yard';
  const out = resolve(state, { yaw: 2.0, pose: 'seated', serverRotation: 1.0 });
  assert.ok(near(out.rotation, 1.0));
});

test('切换场景：采用服务端朝向（首帧不误判）', () => {
  const state = createThirdPersonFacingState(0.5);
  state.lastSceneId = 'yard';
  const out = resolve(state, { yaw: 2.0, sceneId: 'bedroom', serverRotation: 0.7 });
  assert.ok(near(out.rotation, 0.7));
  assert.equal(state.lastSceneId, 'bedroom');
});

test('输入轴与移动方向：W/S 前后、A/D 左右，双键前进', () => {
  assert.deepEqual(thirdPersonMoveAxis({}), { x: 0, z: 0 });
  assert.deepEqual(thirdPersonMoveAxis({ forward: true }), { x: 0, z: -1 });
  assert.deepEqual(thirdPersonMoveAxis({ backward: true }), { x: 0, z: 1 });
  assert.deepEqual(thirdPersonMoveAxis({ left: true }), { x: -1, z: 0 });
  assert.deepEqual(thirdPersonMoveAxis({ right: true }), { x: 1, z: 0 });
  assert.deepEqual(thirdPersonMoveAxis({ bothButtons: true }), { x: 0, z: -1 });
  const near9 = (a, b) => Math.abs(a - b) < 1e-9;
  const w = thirdPersonMoveDirection(0, 0, -1);
  assert.ok(near9(w.dx, 0) && near9(w.dz, 1), 'W 朝镜头前方');
  const d = thirdPersonMoveDirection(0, 1, 0);
  assert.ok(near9(d.dx, -1) && near9(d.dz, 0), 'D 朝屏幕右侧');
  const a = thirdPersonMoveDirection(0, -1, 0);
  assert.ok(near9(a.dx, 1) && near9(a.dz, 0), 'A 朝屏幕左侧');
});

test('移动朝向：W=镜头前方、D=右、A=左、S=转身向后', () => {
  assert.ok(near(thirdPersonMoveFacing(0, 0, -1), 0));
  assert.ok(near(thirdPersonMoveFacing(0, 1, 0), -Math.PI / 2));
  assert.ok(near(thirdPersonMoveFacing(0, -1, 0), Math.PI / 2));
  assert.ok(near(thirdPersonMoveFacing(0, 0, 1), Math.PI));
  const yaw = 1.1;
  assert.ok(near(thirdPersonMoveFacing(yaw, 1, 0), yaw - Math.PI / 2));
});
