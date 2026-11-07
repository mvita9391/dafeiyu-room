import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ThirdPersonCamera } from '../src/core/third-person.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('third-person camera: starts behind the actor and looks at its upper body', () => {
  const tp = new ThirdPersonCamera({ distance: 3.6 });
  tp.enter({ position: new THREE.Vector3(1, 0, 2), yaw: 0 });
  assert.equal(tp.active, true);
  // yaw 0 → 朝向 +z，相机应在角色 -z 侧
  assert.ok(tp.camera.position.z < 2, 'cam behind actor');
  assert.ok(near(tp.camera.position.x, 1));
  assert.ok(tp.camera.position.y > 1.5, 'cam above ground');
  const dir = new THREE.Vector3();
  tp.camera.getWorldDirection(dir);
  assert.ok(dir.z > 0.3, 'looks toward the actor forward');
});

test('third-person camera: drag look and pitch clamp, wheel zoom clamps', () => {
  const tp = new ThirdPersonCamera({ distance: 3.6 });
  tp.enter({ position: new THREE.Vector3(0, 0, 0), yaw: 0 });
  tp.look(200, 0);
  assert.ok(tp.yaw < 0, 'drag right turns right');
  for (let i = 0; i < 40; i += 1) tp.look(0, -200);
  assert.ok(tp.pitch >= -0.05 && tp.pitch <= 1.05, 'pitch clamped');
  for (let i = 0; i < 40; i += 1) tp.zoom(-1);
  assert.ok(tp.distance <= 9);
  assert.ok(tp.targetDistance <= 9);
  for (let i = 0; i < 60; i += 1) tp.zoom(1);
  assert.ok(tp.targetDistance >= 1.5);
});

test('third-person camera: follows smoothly and keeps a base distance per form', () => {
  const tp = new ThirdPersonCamera({ distance: 3.6 });
  tp.enter({ position: new THREE.Vector3(0, 0, 0), yaw: 0 });
  tp.follow(new THREE.Vector3(10, 0, 0), 0.05);
  assert.ok(tp.target.x > 0 && tp.target.x < 10, 'smooth follow, not teleport');
  tp.setBaseDistance(6.4);
  assert.ok(near(tp.targetDistance, 6.4), 'base distance applies to human/whale forms');
});
