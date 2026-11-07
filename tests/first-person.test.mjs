import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FirstPersonCamera } from '../src/core/first-person.js';

// enclosure.js 会生成程序化贴图，Node 环境给一个最小 canvas 替身
const gradient = { addColorStop() {} };
const ctx = new Proxy({}, {
  get: (_, key) => key === 'getImageData' ? (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
    : key === 'createRadialGradient' || key === 'createLinearGradient' ? () => gradient
      : key === 'measureText' ? () => ({ width: 10 }) : () => {},
  set: () => true,
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
globalThis.window = { innerWidth: 1440, innerHeight: 860 };
const { buildEnclosure, showEnclosure } = await import('../src/world/enclosure.js');

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('first-person camera: eye height, look and pitch clamp', () => {
  const fp = new FirstPersonCamera({ eyeHeight: 1.32 });
  fp.enter({ position: new THREE.Vector3(1, 0, 2), yaw: Math.PI / 2 });
  assert.equal(fp.active, true);
  assert.ok(near(fp.camera.position.x, 1));
  assert.ok(near(fp.camera.position.z, 2));
  assert.ok(near(fp.camera.position.y, 1.32));

  fp.look(100, 0);
  assert.ok(near(fp.yaw, Math.PI / 2 - 0.26), '水平拖拽按灵敏度转动 yaw');

  fp.look(0, 100000);
  assert.ok(near(fp.pitch, -1.31), '向下看夹紧');
  fp.look(0, -100000);
  assert.ok(near(fp.pitch, 1.31), '向上看夹紧');

  fp.setEye(new THREE.Vector3(0, 0, 0), 'sleeping');
  assert.ok(near(fp.camera.position.y, 1.32 * 0.6), '躺/坐姿降低眼高');

  fp.exit();
  assert.equal(fp.active, false);
});

test('first-person camera: forward/right vectors follow yaw', () => {
  const fp = new FirstPersonCamera();
  fp.yaw = 0;
  assert.ok(near(fp.forward().x, 0) && near(fp.forward().z, -1), 'yaw=0 面向 -z');
  assert.ok(near(fp.right().x, 1) && near(fp.right().z, 0));
  fp.yaw = Math.PI / 2;
  assert.ok(near(fp.forward().x, -1) && near(fp.forward().z, 0), 'yaw=90° 面向 -x');
  assert.ok(near(fp.right().x, 0) && near(fp.right().z, -1));
});

test('first-person camera: resize keeps aspect and fov clamp', () => {
  const fp = new FirstPersonCamera({ fov: 62 });
  fp.resize(800, 600);
  assert.ok(near(fp.camera.aspect, 800 / 600));
  fp.setFov(10);
  assert.equal(fp.fov, 50);
  fp.setFov(200);
  assert.equal(fp.fov, 80);
});

const indoorTemplate = {
  kind: 'indoor',
  bounds: { x0: -3.6, x1: 3.6, z0: -3.6, z1: 3.6 },
  portalSlots: [
    { slotId: 'north', side: 'north', position: [0, 0, -3.6], width: 1.2 },
    { slotId: 'south', side: 'south', position: [0, 0, 3.6], width: 1.2 },
    { slotId: 'east', side: 'east', position: [3.6, 0, 0], width: 1.2 },
    { slotId: 'west', side: 'west', position: [-3.6, 0, 0], width: 1.2 },
  ],
};

test('enclosure: only camera-facing walls are closed and the ceiling exists', () => {
  const group = buildEnclosure(indoorTemplate, []);
  const southWalls = group.children.filter((o) => o.isMesh && o.geometry.type === 'BoxGeometry'
    && o.geometry.parameters.height > 2.6 && o.position.z > 3);
  assert.equal(southWalls.length, 1, '没有连通门槽时南墙是一整面');
  assert.ok(near(southWalls[0].geometry.parameters.width, 7.2, 0.01));

  const northWalls = group.children.filter((o) => o.isMesh && o.geometry.type === 'BoxGeometry' && o.position.z < -3);
  assert.equal(northWalls.length, 0, '北墙交给场景原有几何体');

  const ceiling = group.children.find((o) => o.isMesh && o.geometry.type === 'PlaneGeometry' && near(o.rotation.x, Math.PI / 2));
  assert.ok(ceiling, '有天花板');
  assert.ok(near(ceiling.position.y, 2.7));
});

test('enclosure: connected portal slot opens a doorway', () => {
  const group = buildEnclosure(indoorTemplate, ['south']);
  const walls = group.children.filter((o) => o.isMesh && o.geometry.type === 'BoxGeometry'
    && o.geometry.parameters.height > 2.6 && o.position.z > 3);
  assert.equal(walls.length, 2, '门洞把南墙切成两段');
  for (const wall of walls) {
    const half = wall.geometry.parameters.width / 2;
    const rightEdge = wall.position.x + half;
    const leftEdge = wall.position.x - half;
    assert.ok(rightEdge <= -0.6 + 1e-6 || leftEdge >= 0.6 - 1e-6, '门洞区域没有墙');
  }
  const panel = group.children.find((o) => o.isMesh && o.geometry.type === 'PlaneGeometry' && near(o.position.z, 3.54, 0.02));
  assert.ok(panel, '门洞有暗面遮挡');
});

test('enclosure: outdoor template yields an empty group and is cached per scene', () => {
  assert.equal(buildEnclosure({ kind: 'outdoor', bounds: indoorTemplate.bounds }, []).children.length, 0);

  const cfg = { template: indoorTemplate, root: new THREE.Group() };
  assert.equal(cfg.fpEnclosure, undefined);
  showEnclosure(cfg, true, []);
  assert.ok(cfg.fpEnclosure && cfg.fpEnclosure.parent === cfg.root);
  assert.equal(cfg.fpEnclosure.visible, true);

  const firstCount = cfg.fpEnclosure.children.length;
  showEnclosure(cfg, true, ['south']);
  assert.ok(cfg.fpEnclosure.children.length > firstCount, '连通关系变化时重建补墙');
  showEnclosure(cfg, false, ['south']);
  assert.equal(cfg.fpEnclosure.visible, false);
});
