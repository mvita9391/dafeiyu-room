import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { P } from './palette.js';

export function setupLights(scene, { windowPos = new THREE.Vector3(-0.6, 1.7, -3.55) } = {}) {
  RectAreaLightUniformsLib.init();
  const rig = {};

  // 天空/地面环境补光
  rig.hemi = new THREE.HemisphereLight(0xffd9b8, 0x5a3f63, 0.68);
  scene.add(rig.hemi);

  // 主光：窗外的黄昏太阳
  const sun = new THREE.DirectionalLight(0xffd0a0, 2.15);
  sun.position.set(7.0, 8.6, -9.0);
  sun.target.position.set(-0.5, 0.6, 0.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 32;
  sun.shadow.camera.left = -11;
  sun.shadow.camera.right = 11;
  sun.shadow.camera.top = 11;
  sun.shadow.camera.bottom = -11;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.028;
  sun.shadow.radius = 3.2;
  scene.add(sun); scene.add(sun.target);
  rig.sun = sun;

  // 冷色补光（从观众侧上方）
  const fill = new THREE.DirectionalLight(0x9fb8ff, 0.72);
  fill.position.set(-5, 5.5, 8);
  scene.add(fill);
  rig.fill = fill;

  // 窗口面光：模拟窗洞透进来的柔和光
  const rect = new THREE.RectAreaLight(0xffd2a6, 1.35, 2.2, 1.5);
  rect.position.copy(windowPos);
  rect.lookAt(0, 1.0, 1.5);
  scene.add(rect);
  rig.window = rect;

  // 落地灯暖光
  const lamp = new THREE.PointLight(0xffb877, 7.5, 7.5, 2);
  lamp.position.set(2.35, 1.45, -2.15);
  lamp.castShadow = false;
  scene.add(lamp);
  rig.lamp = lamp;

  // 屏幕冷光
  const screen = new THREE.PointLight(0x9fd8ff, 2.2, 3.2, 2);
  screen.position.set(0.1, 1.05, -2.75);
  scene.add(screen);
  rig.screen = screen;

  return rig;
}
