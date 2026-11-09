import {makeYardGarden, protectFarmSpace} from './yard-garden.js';
import { animateYardPool, fitYardPool } from './yard-pool.js';
import { buildYardTraining } from './yard-training.js';
import { createFurniture, registerSceneFurniture } from './props.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { P } from '../core/palette.js';
import { clay, glow } from '../core/materials.js';
import { tex } from '../core/textures.js';
import { getTemplate } from '../../shared/world/templates.js';

const rbox = (w, h, d, r = 0.04, s = 3) => new RoundedBoxGeometry(w, h, d, s, r);
const setShadow = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };

function poolGroundCutout(group, bounds, materials) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 768;
  const context = canvas.getContext('2d');
  const mask = new THREE.CanvasTexture(canvas);
  mask.flipY = false;
  mask.generateMipmaps = false;
  mask.minFilter = THREE.LinearFilter;
  const { x0, x1, z0, z1 } = bounds;
  const area = new THREE.Vector4(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0));
  for (const material of materials) {
    material.poolCutoutMask = mask;
    material.onBeforeCompile = shader => {
      shader.uniforms.poolCutoutMask = { value: mask };
      shader.uniforms.poolCutoutArea = { value: area };
      shader.vertexShader = 'varying vec2 vPoolGroundPosition;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPoolGroundPosition = (modelMatrix * vec4(transformed, 1.0)).xz;',
      );
      shader.fragmentShader = `
        varying vec2 vPoolGroundPosition;
        uniform sampler2D poolCutoutMask;
        uniform vec4 poolCutoutArea;
      ` + shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        vec2 poolUv = (vPoolGroundPosition - poolCutoutArea.xy) * poolCutoutArea.zw;
        if (texture2D(poolCutoutMask, poolUv).a > 0.5) discard;`,
      );
    };
  }
  let previous;
  return () => {
    const pools = group.children.filter(object => object.userData.poolRect);
    const signature = JSON.stringify(pools.map(pool => [pool.position.x, pool.position.z, pool.rotation.y, pool.scale.x, pool.scale.z]));
    if (signature === previous) return;
    previous = signature;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fff';
    for (const pool of pools) {
      const rect = pool.userData.poolRect;
      context.save();
      context.scale(canvas.width * area.z, canvas.height * area.w);
      context.translate(pool.position.x - x0, pool.position.z - z0);
      context.rotate(-pool.rotation.y);
      context.scale(pool.scale.x, pool.scale.z);
      // Tuck the opening under the rim so the ground cannot show at the seam.
      context.fillRect(rect.x0 - .025, rect.z0 - .025, rect.x1 - rect.x0 + .05, rect.z1 - rect.z0 + .05);
      context.restore();
    }
    mask.needsUpdate = true;
  };
}

function grassTexture({ size = 512 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#6d8a5f'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 200; i++) {
    g.fillStyle = `rgba(${78 + Math.random() * 34},${104 + Math.random() * 40},${68 + Math.random() * 30},${0.10 + Math.random() * 0.14})`;
    g.beginPath();
    g.ellipse(Math.random() * size, Math.random() * size, 12 + Math.random() * 46, 8 + Math.random() * 30, Math.random() * 6, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * size, y = Math.random() * size, h = 2 + Math.random() * 6;
    g.strokeStyle = `rgba(${66 + Math.random() * 46},${96 + Math.random() * 56},${58 + Math.random() * 38},${0.22 + Math.random() * 0.36})`;
    g.lineWidth = 0.7 + Math.random() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y - h); g.stroke();
  }
  return c;
}

function plasterTextureLocal({ size = 512 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#e9dcc6'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 80; i++) {
    g.fillStyle = `rgba(${215 + Math.random() * 30},${200 + Math.random() * 30},${180 + Math.random() * 30},${Math.random() * 0.12})`;
    g.beginPath(); g.ellipse(Math.random() * size, Math.random() * size, 30 + Math.random() * 90, 20 + Math.random() * 50, Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  return c;
}

export function buildYard() {
  const group = new THREE.Group();
  const bounds = getTemplate('courtyard_v1').bounds;
  const X0 = bounds.x0 - 0.4, X1 = bounds.x1 + 0.25;
  const Z0 = bounds.z0 - 0.25, Z1 = bounds.z1 + 0.25;
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
  const W = X1 - X0, D = Z1 - Z0;
  const wallX = X0 + 0.45;                 // 房子外墙内表面
  const houseNorth = -8.75;

  /* ---------- 地面 ---------- */
  const grassTex = tex(grassTexture(), { repeat: [W / 2.8, D / 2.55], aniso: 12 });
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.96, metalness: 0, envMapIntensity: 0.3, color: 0xf0f2da });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(W, D), grassMat);
  grass.name = 'yard-grass';
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(cx, 0.005, cz);
  grass.receiveShadow = true;
  group.add(grass);

  const slab = setShadow(new THREE.Mesh(rbox(W + 0.04, 0.34, D + 0.04, 0.06, 3), clay(0x84674c, { roughness: 0.9 }).clone()));
  slab.position.set(cx, -0.18, cz); group.add(slab);
  const plinth = setShadow(new THREE.Mesh(rbox(W + 0.34, 0.46, D + 0.34, 0.1, 3), clay(P.plinth, { roughness: 0.85 }).clone()));
  plinth.position.set(cx, -0.52, cz); group.add(plinth);
  const refreshPoolCutout = poolGroundCutout(group, { x0: X0, x1: X1, z0: Z0, z1: Z1 }, [grassMat, slab.material, plinth.material]);

  // 石板小径（从门口到院子中间）
  const stoneC = document.createElement('canvas'); stoneC.width = stoneC.height = 256;
  const sg = stoneC.getContext('2d');
  sg.fillStyle = '#b9b2a6'; sg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) { sg.fillStyle = `rgba(${140 + Math.random() * 60},${136 + Math.random() * 60},${128 + Math.random() * 56},${Math.random() * 0.22})`; sg.beginPath(); sg.arc(Math.random() * 256, Math.random() * 256, Math.random() * 7, 0, Math.PI * 2); sg.fill(); }
  const stoneMat = new THREE.MeshStandardMaterial({ map: tex(stoneC, { repeat: [1, 1], aniso: 8 }), roughness: 0.92, envMapIntensity: 0.4 });
  const path = Array.from({ length: 13 }, (_, i) => {
    const k = i / 12;
    return [wallX + 0.7 + k * 7.1, 1.05 - Math.sin(k * Math.PI / 2) * 0.75];
  });
  path.forEach(([x, z], i) => {
    const st = setShadow(new THREE.Mesh(rbox(0.52, 0.045, 0.46, 0.05, 3), stoneMat));
    st.position.set(x, 0.028, z);
    st.rotation.y = (i % 2 ? 1 : -1) * 0.08;
    group.add(st);
  });

  /* ---------- 房子外墙（带门和窗） ---------- */
  const wallMat = new THREE.MeshStandardMaterial({ map: tex(plasterTextureLocal(), { repeat: [2, 1], aniso: 8 }), roughness: 0.96, envMapIntensity: 0.25 });
  const H = 2.45, t = 0.24;
  const door = { z0: 0.55, z1: 1.55, h: 2.05 };
  const win = { z0: -2.35, z1: -0.95, y0: 0.95, y1: 2.15 };
  const wallCenterX = wallX - t / 2;
  const segs = [
    { z0: houseNorth, z1: win.z0, y0: 0, y1: H },
    { z0: win.z0, z1: win.z1, y0: 0, y1: win.y0 },
    { z0: win.z0, z1: win.z1, y0: win.y1, y1: H },
    { z0: win.z1, z1: door.z0, y0: 0, y1: H },
    { z0: door.z1, z1: Z1, y0: 0, y1: H },
    { z0: door.z0, z1: door.z1, y0: door.h, y1: H },
  ];
  for (const s of segs) {
    const w = s.z1 - s.z0, h = s.y1 - s.y0;
    if (w <= 0 || h <= 0) continue;
    const m = setShadow(new THREE.Mesh(rbox(t, h, w, 0.02, 2), wallMat));
    m.position.set(wallCenterX, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2);
    group.add(m);
  }
  // 屋檐
  const eave = setShadow(new THREE.Mesh(rbox(0.85, 0.12, Z1 - houseNorth + 0.2, 0.04, 3), clay(0x8a6247, { roughness: 0.8 })));
  eave.position.set(wallX + 0.18, H + 0.06, (Z1 + houseNorth) / 2); group.add(eave);

  // 门框
  const trimMat = clay(0xf0e6d6, { roughness: 0.65 });
  for (const z of [door.z0 - 0.04, door.z1 + 0.04]) {
    const post = setShadow(new THREE.Mesh(rbox(0.1, door.h + 0.08, 0.1, 0.02, 2), trimMat));
    post.position.set(wallX + 0.03, door.h / 2, z); group.add(post);
  }
  const lintel = setShadow(new THREE.Mesh(rbox(0.1, 0.1, door.z1 - door.z0 + 0.2, 0.02, 2), trimMat));
  lintel.position.set(wallX + 0.03, door.h + 0.04, (door.z0 + door.z1) / 2); group.add(lintel);

  // 门里透出的暖光（房间内部）
  // 门洞纵深（侧壁 + 顶）
  const tunnelMat = clay(0xd8c9b2, { roughness: 0.9 });
  for (const z of [door.z0, door.z1]) {
    const jamb = setShadow(new THREE.Mesh(rbox(0.26, door.h, 0.04, 0.01, 2), tunnelMat));
    jamb.position.set(wallX - 0.13, door.h / 2, z);
    group.add(jamb);
  }
  const soffit = setShadow(new THREE.Mesh(rbox(0.26, 0.04, door.z1 - door.z0, 0.01, 2), tunnelMat));
  soffit.position.set(wallX - 0.13, door.h - 0.02, (door.z0 + door.z1) / 2);
  group.add(soffit);
  // 门里：暗的房间 + 暖色灯光
  const roomGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(door.z1 - door.z0, door.h),
    new THREE.MeshBasicMaterial({ color: 0x2e2433 })
  );
  roomGlow.rotation.y = Math.PI / 2;
  roomGlow.position.set(wallX - 0.27, door.h / 2, (door.z0 + door.z1) / 2);
  group.add(roomGlow);
  const glowStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(door.z1 - door.z0 - 0.1, 0.55),
    new THREE.MeshBasicMaterial({ color: 0xffc07a, transparent: true, opacity: 0.85 })
  );
  glowStrip.rotation.y = Math.PI / 2;
  glowStrip.position.set(wallX - 0.26, 0.55, (door.z0 + door.z1) / 2);
  group.add(glowStrip);
  // 门里的小剪影（像有人在家）
  const doorLight = new THREE.PointLight(0xffb877, 4.5, 5.5, 2);
  doorLight.position.set(wallX + 0.65, 1.0, (door.z0 + door.z1) / 2);
  group.add(doorLight);
  // 可点热区：覆盖整扇门（透明，但参与射线检测）
  const doorHit = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.5),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.001, depthWrite: false, side: THREE.DoubleSide })
  );
  doorHit.rotation.y = Math.PI / 2;
  doorHit.position.set(wallX + 0.45, 1.2, (door.z0 + door.z1) / 2);
  doorHit.name = 'doorHit';
  doorHit.userData.hotspot = 'enter';
  group.add(doorHit);

  // 门垫（回屋）
  const matC = document.createElement('canvas'); matC.width = 256; matC.height = 160;
  const mg = matC.getContext('2d');
  mg.fillStyle = '#b98a63'; mg.fillRect(0, 0, 256, 160);
  mg.strokeStyle = '#8d6446'; mg.lineWidth = 10; mg.strokeRect(12, 12, 232, 136);
  mg.fillStyle = 'rgba(120,80,56,.5)';
  for (let y = 26; y < 148; y += 12) for (let x = 26; x < 244; x += 12) mg.fillRect(x, y, 5, 3);
  const doormat = new THREE.Mesh(rbox(0.64, 0.03, 1.04, 0.012, 2),
    new THREE.MeshStandardMaterial({ map: tex(matC, { repeat: [1, 1] }), roughness: 0.98, envMapIntensity: 0.2 }));
  doormat.position.set(wallX + 1.05, 0.022, 1.05);
  doormat.rotation.y = Math.PI / 2;
  doormat.receiveShadow = true;
  doormat.name = 'doormatYard';
  doormat.userData.hotspot = 'enter';
  doormat.userData.walkPortal = 'room';
  group.add(doormat);

  // 窗户
  const winGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(win.z1 - win.z0, win.y1 - win.y0),
    new THREE.MeshStandardMaterial({ color: 0xffcf96, emissive: 0xffa860, emissiveIntensity: 1.1, roughness: 0.4 })
  );
  winGlass.rotation.y = Math.PI / 2;
  winGlass.position.set(wallX - 0.02, (win.y0 + win.y1) / 2, (win.z0 + win.z1) / 2);
  group.add(winGlass);
  const winFrameMat = clay(0xe8ddc9, { roughness: 0.6 });
  const wW = win.z1 - win.z0, wH = win.y1 - win.y0;
  const wcx = (win.z0 + win.z1) / 2, wcy = (win.y0 + win.y1) / 2;
  const fx = wallX + 0.05;
  const bars = [
    [0.07, wH + 0.14, 0.09, wcy, win.z0 - 0.045],   // 左
    [0.07, wH + 0.14, 0.09, wcy, win.z1 + 0.045],   // 右
    [0.07, 0.09, wW + 0.18, win.y1 + 0.045, wcx],   // 上
    [0.07, 0.09, wW + 0.18, win.y0 - 0.045, wcx],   // 下
    [0.06, wH, 0.05, wcy, wcx],                     // 中挺
    [0.06, 0.05, wW, wcy, wcx],                     // 横档
  ];
  for (const [bw, bh, bd, by, bz] of bars) {
    const f = setShadow(new THREE.Mesh(rbox(bw, bh, bd, 0.01, 2), winFrameMat));
    f.position.set(fx, by, bz);
    group.add(f);
  }
  // 窗台
  const sill = setShadow(new THREE.Mesh(rbox(0.24, 0.07, wW + 0.3, 0.02, 2), winFrameMat));
  sill.position.set(wallX + 0.1, win.y0 - 0.09, wcx);
  group.add(sill);

  // 半开的门（一眼能看懂“这是门”）
  const doorLeaf = new THREE.Group();
  const leaf = setShadow(new THREE.Mesh(rbox(0.05, 1.98, 0.94, 0.015, 3), clay(0xd9c7a8, { roughness: 0.75 })));
  leaf.position.set(0, 0.99, 0.47);
  doorLeaf.add(leaf);
  for (const py of [0.55, 1.45]) {
    const panel = setShadow(new THREE.Mesh(rbox(0.02, 0.34, 0.66, 0.02, 3), clay(0xcbb694, { roughness: 0.8 })));
    panel.position.set(0.035, py, 0.47);
    doorLeaf.add(panel);
  }
  const knob = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), clay(0xd8b26a, { roughness: 0.35, metalness: 0.6 })));
  knob.position.set(0.06, 1.0, 0.86);
  doorLeaf.add(knob);
  doorLeaf.position.set(wallX - 0.01, 0, door.z0);
  doorLeaf.rotation.y = -1.15;      // 朝院子里打开
  leaf.userData.hotspot = 'enter';
  group.add(doorLeaf);

  /* ---------- 墙面细节 ---------- */
  // 门头壁灯
  const wallLamp = new THREE.Group();
  const wb = setShadow(new THREE.Mesh(rbox(0.1, 0.16, 0.1, 0.02, 2), clay(0x4a4440, { roughness: 0.7 })));
  wallLamp.add(wb);
  const wl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffcf96 }));
  wl.position.set(0.06, 0, 0); wallLamp.add(wl);
  const wallLampLight = new THREE.PointLight(0xffb877, 2.6, 2.6, 2);
  wallLampLight.position.set(0.08, 0, 0); wallLamp.add(wallLampLight);
  wallLamp.position.set(wallX + 0.08, door.h + 0.5, (door.z0 + door.z1) / 2 + 0.05);
  group.add(wallLamp);

  // 门牌
  const plate = setShadow(new THREE.Mesh(rbox(0.02, 0.16, 0.24, 0.01, 2), clay(0xe8ddc9, { roughness: 0.6 })));
  plate.position.set(wallX + 0.02, 1.55, door.z1 + 0.34);
  group.add(plate);

  // 墙上爬藤
  for (let i = 0; i < 70; i++) {
    const a = Math.random();
    const y = 0.4 + Math.random() * 2.2;
    const z = door.z1 + 0.25 + a * 3.0;
    const leaf = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 8, 6), clay(i % 3 ? 0x5f8f58 : 0x6fa060, { roughness: 0.85 })));
    leaf.scale.set(0.7, 0.5, 1);
    leaf.position.set(wallX + 0.03, y, z);
    group.add(leaf);
  }

  // 窗下花箱
  const boxMat = clay(0x9a7550, { roughness: 0.85 });
  const flowerBox = setShadow(new THREE.Mesh(rbox(0.26, 0.2, win.z1 - win.z0 + 0.2, 0.03, 3), boxMat));
  flowerBox.position.set(wallX + 0.16, win.y0 - 0.14, (win.z0 + win.z1) / 2);
  group.add(flowerBox);
  for (let i = 0; i < 9; i++) {
    const fz = win.z0 + 0.15 + Math.random() * (win.z1 - win.z0 - 0.3);
    const bloom = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), clay([0xf6a9c0, 0xffd479, 0xe89a8a][i % 3], { roughness: 0.75 })));
    bloom.position.set(wallX + 0.18 + Math.random() * 0.08, win.y0 - 0.01 + Math.random() * 0.05, fz);
    group.add(bloom);
  }

  /* ---------- 院子道具 ---------- */
  const woodMat = clay(0x8d6a4a, { roughness: 0.8 });

  // 矮栅栏（三面）
  const fence = (x, z, len, rotY) => {
    const g = new THREE.Group();
    const n = Math.max(2, Math.round(len / 0.55));
    for (let i = 0; i <= n; i++) {
      const post = setShadow(new THREE.Mesh(rbox(0.075, 0.78, 0.075, 0.02, 2), woodMat));
      post.position.set((i / n - 0.5) * len, 0.39, 0);
      g.add(post);
    }
    for (const y of [0.30, 0.60]) {
      const rail = setShadow(new THREE.Mesh(rbox(len, 0.06, 0.045, 0.015, 2), woodMat));
      rail.position.set(0, y, 0); g.add(rail);
    }
    g.position.set(x, 0, z); g.rotation.y = rotY;
    return g;
  };
  group.add(fence(X1 - 0.1, cz, D - 0.3, Math.PI / 2));
  group.add(fence(wallCenterX, (Z0 + houseNorth) / 2, houseNorth - Z0, Math.PI / 2));
  group.add(fence(cx, Z0 + 0.1, W - 0.2, 0));
  group.add(fence(cx, Z1 - 0.1, W - 0.2, Math.PI));

  const poolGroup=createFurniture('yardPool');
  poolGroup.position.set(5.5,0,-5.4);
  group.add(poolGroup);
  let pools=[poolGroup];

  // 树
  const tree = new THREE.Group();
  const trunk = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, 1.7, 12), clay(0x7d5a41, { roughness: 0.9 })));
  trunk.position.y = 0.85; tree.add(trunk);
  const leafMats = [clay(0x5f9a5f, { roughness: 0.8 }), clay(0x4f8752, { roughness: 0.82 }), clay(0x6cab68, { roughness: 0.78 })];
  [[0, 1.85, 0, 0.72], [-0.44, 1.6, 0.14, 0.48], [0.42, 1.55, -0.12, 0.5], [0.12, 2.15, 0.1, 0.44], [-0.18, 1.45, -0.36, 0.4]]
    .forEach(([bx, by, bz, br], i) => {
      const leaf = setShadow(new THREE.Mesh(new THREE.SphereGeometry(br, 18, 14), leafMats[i % 3]));
      leaf.position.set(bx, by, bz); leaf.scale.set(1, 0.85, 1); tree.add(leaf);
    });
  tree.position.set(6.4, 0, 4.8);
  group.add(tree);

  // 长椅
  const bench = new THREE.Group();
  const seat = setShadow(new THREE.Mesh(rbox(1.2, 0.08, 0.44, 0.03, 3), woodMat));
  seat.position.y = 0.44; bench.add(seat);
  const back = setShadow(new THREE.Mesh(rbox(1.2, 0.34, 0.06, 0.02, 2), woodMat));
  back.position.set(0, 0.66, -0.19); back.rotation.x = -0.12; bench.add(back);
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.16, 0.16]) {
    const leg = setShadow(new THREE.Mesh(rbox(0.07, 0.44, 0.07, 0.02, 2), clay(0x6f5136, { roughness: 0.85 })));
    leg.position.set(sx, 0.22, sz); bench.add(leg);
  }
  bench.position.set(3.8, 0, 5.8);
  bench.rotation.y = -0.25;
  group.add(bench);

  // −X、−Z 角落：九块独立正方形农田，留出田间小路。
  const farm = new THREE.Group();
  farm.name = 'farm-plots';
  const plotSize = 1.25, plotGap = 0.3;
  const farmSoil = clay(0x62412e, { roughness: 1 });
  const furrowMat = clay(0x4c3022, { roughness: 1 });
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const plot = new THREE.Group();
      plot.name = `farm-plot-${row + 1}-${col + 1}`;
      const soil = setShadow(new THREE.Mesh(rbox(plotSize, 0.12, plotSize, 0.045, 3), farmSoil));
      soil.position.y = 0.065;
      plot.add(soil);
      for (let line = 0; line < 4; line++) {
        const furrow = new THREE.Mesh(rbox(plotSize - 0.16, 0.014, 0.045, 0.008, 2), furrowMat);
        furrow.position.set(0, 0.13, (line - 1.5) * 0.25);
        furrow.receiveShadow = true;
        plot.add(furrow);
      }
      plot.position.set(wallX + 1.1 + col * (plotSize + plotGap), 0,
        -7 + row * (plotSize + plotGap));
      farm.add(plot);
    }
  }
  const farmCenter=new THREE.Box3().setFromObject(farm).getCenter(new THREE.Vector3());farmCenter.y=0;
  for(const plot of farm.children)plot.position.sub(farmCenter);
  farm.position.copy(farmCenter);
  group.add(farm);

  // 花圃
  const flowerStart=group.children.length;
  const flowerColors = [0xf6a9c0, 0xffd479, 0xa9c6f6, 0xf2a08a];
  for (let bed = 0; bed < 3; bed++) {
    const bx = -3.6 + bed * 2.5, bz = 7.2;
    const soil = setShadow(new THREE.Mesh(rbox(1.0, 0.12, 0.5, 0.04, 3), clay(0x6a4d38, { roughness: 1 })));
    soil.position.set(bx, 0.06, bz); group.add(soil);
    for (let i = 0; i < 7; i++) {
      const fx = bx + (Math.random() - 0.5) * 0.85, fz = bz + (Math.random() - 0.5) * 0.36;
      const stem = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.2 + Math.random() * 0.12, 5), clay(0x5f8a52)));
      stem.position.set(fx, 0.2, fz); group.add(stem);
      const bloom = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.045 + Math.random() * 0.02, 10, 8), clay(flowerColors[(i + bed) % 4], { roughness: 0.7 })));
      bloom.position.set(fx, 0.33 + Math.random() * 0.1, fz); bloom.scale.y = 0.8; group.add(bloom);
    }
  }

  const flowerGroup=new THREE.Group();
  for(const part of group.children.slice(flowerStart))flowerGroup.add(part);
  const flowerCenter=new THREE.Box3().setFromObject(flowerGroup).getCenter(new THREE.Vector3());flowerCenter.y=0;
  for(const part of flowerGroup.children)part.position.sub(flowerCenter);
  flowerGroup.position.copy(flowerCenter);
  group.add(flowerGroup);
  // 石灯笼
  const lantern = new THREE.Group();
  const lbase = setShadow(new THREE.Mesh(rbox(0.34, 0.18, 0.34, 0.05, 3), clay(0xb0a89c, { roughness: 0.9 })));
  lbase.position.y = 0.09; lantern.add(lbase);
  const lpost = setShadow(new THREE.Mesh(rbox(0.12, 0.62, 0.12, 0.03, 2), clay(0xb0a89c, { roughness: 0.9 })));
  lpost.position.y = 0.49; lantern.add(lpost);
  const lbox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshStandardMaterial({
    color: 0xffe2b8, roughness: 0.85, emissive: 0xffa860, emissiveIntensity: 1.3,
  }));
  lbox.position.y = 0.97; lantern.add(lbox);
  const lroof = setShadow(new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.22, 4), clay(0x9a9188, { roughness: 0.9 })));
  lroof.position.y = 1.25; lroof.rotation.y = Math.PI / 4; lantern.add(lroof);
  const lLight = new THREE.PointLight(0xffb877, 5, 5.5, 2);
  lLight.position.set(0, 0.97, 0); lantern.add(lLight);
  lantern.position.set(-1.8, 0, 5.1);
  group.add(lantern);

  // 靠墙一排花盆
  for (let i = 0; i < 4; i++) {
    const px = wallX + 0.55, pz = -0.55 - i * 0.55;
    const pot = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.26, 14), clay(0xc47a5a, { roughness: 0.9 })));
    pot.position.set(px, 0.13, pz); group.add(pot);
    const bush = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), clay(i % 2 ? 0x5f8f58 : 0x6fa060, { roughness: 0.85 })));
    bush.position.set(px, 0.35, pz); bush.scale.set(1, 0.85, 1); group.add(bush);
  }
  // 浇水壶
  const can = new THREE.Group();
  const canBody = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.2, 14), clay(0x7fa3b8, { roughness: 0.5, metalness: 0.3 })));
  canBody.position.y = 0.1; can.add(canBody);
  const spout = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.26, 8), clay(0x7fa3b8, { roughness: 0.5, metalness: 0.3 })));
  spout.position.set(0.16, 0.16, 0); spout.rotation.z = -0.9; can.add(spout);
  const handle = setShadow(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 8, 18, Math.PI), clay(0x7fa3b8, { roughness: 0.5, metalness: 0.3 })));
  handle.position.set(-0.02, 0.22, 0); handle.rotation.z = 0.2; can.add(handle);
  can.position.set(1.05, 0, -2.55); can.rotation.y = 0.5;
  group.add(can);
  // 栅栏上的小鸟屋
  const house2 = new THREE.Group();
  const hb = setShadow(new THREE.Mesh(rbox(0.28, 0.3, 0.24, 0.03, 3), clay(0xd8c9b2, { roughness: 0.85 })));
  house2.add(hb);
  const roof2 = setShadow(new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.18, 4), clay(0xa9785a, { roughness: 0.85 })));
  roof2.position.y = 0.22; roof2.rotation.y = Math.PI / 4; house2.add(roof2);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: 0x2a2230 }));
  hole.position.z = 0.121; house2.add(hole);
  house2.position.set(0.6, 1.55, Z1 - 0.16);
  group.add(house2);

  // 石头点缀
  for (let i = 0; i < 10; i++) {
    const r = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.07, 10, 8), clay(0xb0a89c, { roughness: 0.95 })));
    r.scale.set(1, 0.65, 1);
    r.position.set(wallX + 0.9 + Math.random() * (X1 - wallX - 1.8), 0.05, Z0 + 0.8 + Math.random() * (D - 1.6));
    group.add(r);
  }

  // 萤火虫
  const N = 30;
  const ffGeo = new THREE.BufferGeometry();
  const ffPos = new Float32Array(N * 3);
  const ffData = [];
  for (let i = 0; i < N; i++) {
    const p = new THREE.Vector3(wallX + 0.8 + Math.random() * (X1 - wallX - 1.6), 0.35 + Math.random() * 1.2, Z0 + 0.8 + Math.random() * (D - 1.6));
    ffPos.set([p.x, p.y, p.z], i * 3);
    ffData.push({ p, phase: Math.random() * Math.PI * 2, speed: 0.2 + Math.random() * 0.3 });
  }
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const dotC = document.createElement('canvas'); dotC.width = dotC.height = 64;
  const dg2 = dotC.getContext('2d');
  const grd2 = dg2.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd2.addColorStop(0, 'rgba(255,255,210,1)');
  grd2.addColorStop(0.4, 'rgba(255,236,150,.6)');
  grd2.addColorStop(1, 'rgba(255,220,120,0)');
  dg2.fillStyle = grd2; dg2.fillRect(0, 0, 64, 64);
  const dotTex = new THREE.CanvasTexture(dotC); dotTex.colorSpace = THREE.SRGBColorSpace;
  const ff = new THREE.Points(ffGeo, new THREE.PointsMaterial({
    map: dotTex, size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    color: 0xfff3b0, opacity: 0.9,
  }));
  ff.frustumCulled = false;
  group.add(ff);

  const garden = makeYardGarden({ placements: [
    [-6.7,4.7], [-6.7,-1.0], [.3,-6.9],
    [-5.2,Z1-1.2], [2,Z1-1.1], [8,Z1-1.1], [14,Z1-1.3], [20,Z1-1.2],
    [X1-1.1,8], [X1-1.1,2.4], [X1-1.1,-3.8], [14,Z0+1.2],
  ] });
  group.add(garden);
  const training = buildYardTraining(group);

  // 院子光照：黄昏侧逆光（暖）+ 天空冷补光
  const dusk = new THREE.DirectionalLight(0xffc28a, 2.6);
  dusk.position.set(cx + 9, 9.5, cz - 6);
  dusk.target.position.set(cx, 0, cz);
  dusk.castShadow = true;
  dusk.shadow.mapSize.set(2048, 2048);
  const shadowExtent = Math.hypot(W, D) / 2;
  dusk.shadow.camera.left = -shadowExtent; dusk.shadow.camera.right = shadowExtent;
  dusk.shadow.camera.top = shadowExtent; dusk.shadow.camera.bottom = -shadowExtent;
  dusk.shadow.camera.near = 1; dusk.shadow.camera.far = 45;
  dusk.shadow.bias = -0.0006; dusk.shadow.normalBias = 0.03;
  group.add(dusk, dusk.target);
  const sky = new THREE.HemisphereLight(0xbcd3ff, 0x5d6b4a, 1.15);
  group.add(sky);
  const coolFill = new THREE.DirectionalLight(0xa9c4ff, 0.6);
  coolFill.position.set(-6, 5, 7);
  group.add(coolFill);

  for(const [object,type,label,icon] of [
    [farm,'yardFarm','九宫格农田','🌱'],[tree,'yardTree','树木','🌳'],[bench,'yardBench','长椅','🪑'],
    [lantern,'yardLantern','石灯笼','🏮'],[flowerGroup,'yardFlowers','花圃','🌷'],[can,'yardCan','浇水壶','🚿'],
  ]) registerSceneFurniture(object,type,label,icon);

  group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });

  function update(dt, t) {
    for(const pool of pools)animateYardPool(pool,t);
    const attr = ff.geometry.attributes.position;
    for (let i = 0; i < ffData.length; i++) {
      const d = ffData[i];
      d.p.x += Math.sin(t * d.speed + d.phase) * 0.14 * dt;
      d.p.y += Math.cos(t * d.speed * 0.8 + d.phase) * 0.1 * dt;
      d.p.z += Math.cos(t * d.speed * 0.6 + d.phase * 1.7) * 0.14 * dt;
      if (d.p.x < wallX + 0.6) d.p.x = X1 - 0.6; if (d.p.x > X1 - 0.5) d.p.x = wallX + 0.7;
      if (d.p.z < Z0 + 0.6) d.p.z = Z1 - 0.6; if (d.p.z > Z1 - 0.5) d.p.z = Z0 + 0.7;
      if (d.p.y < 0.25) d.p.y = 1.6; if (d.p.y > 1.7) d.p.y = 0.3;
      attr.setXYZ(i, d.p.x, d.p.y, d.p.z);
    }
    attr.needsUpdate = true;
    ff.material.opacity = 0.5 + Math.sin(t * 1.3) * 0.25;
    lLight.intensity = 4.8 + Math.sin(t * 2.1) * 0.4;
    lbox.material.emissiveIntensity = 1.25 + Math.sin(t * 2.1) * 0.12;
    roomGlow.material.color.setHSL(0.07, 0.75, 0.58 + Math.sin(t * 1.7) * 0.02);
  }

  return {
    group, update, training,
    refreshLandscape:()=>{
      pools=group.children.filter(object=>object.userData.furnitureType==='yardPool');
      for(const pool of pools)fitYardPool(pool);
      protectFarmSpace(group,garden);
      refreshPoolCutout();
    },
    containsWater(position) {
      group.updateMatrixWorld(true);
      return group.children.some(o=>{
        const rect=o.userData.poolRect;if(!rect)return false;
        const p=o.worldToLocal(position.clone());
        return p.x>rect.x0&&p.x<rect.x1&&p.z>rect.z0&&p.z<rect.z1;
      });
    },
    bounds,
    view: { target: new THREE.Vector3(cx, 1.1, cz), zoom: 0.72 },
    spawn: new THREE.Vector3(wallX + 1.9, 1.12, 0.1),
  };
}
