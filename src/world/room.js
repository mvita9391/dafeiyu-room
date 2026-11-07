import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { P } from '../core/palette.js';
import { clay, glow, glass } from '../core/materials.js';
import { woodFloorTexture, plasterTexture, skyTexture, tex, lightShaftTexture } from '../core/textures.js';

export const ROOM = { floor: 7.0, wallH: 2.8, t: 0.16, inner: 3.5 };

const rbox = (w, h, d, r = 0.06, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);

export function buildRoom() {
  const group = new THREE.Group();
  const anchors = {};

  /* ---------- 地板 ---------- */
  const floorTex = tex(woodFloorTexture(), { repeat: [3.2, 3.2], aniso: 16 });
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex, roughness: 0.72, metalness: 0.0, envMapIntensity: 0.5,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.floor, ROOM.floor), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.004;
  floor.receiveShadow = true;
  group.add(floor);

  // 地板边缘倒角
  const edge = new THREE.Mesh(rbox(ROOM.floor + 0.06, 0.07, ROOM.floor + 0.06, 0.03, 2), clay(P.floorDark, { roughness: 0.7 }));
  edge.position.y = -0.045; edge.receiveShadow = true; edge.castShadow = false;
  group.add(edge);

  // 底座（悬浮展示台）
  const plinthMat = clay(P.plinth, { roughness: 0.82 });
  const plinth = new THREE.Mesh(rbox(ROOM.floor + 0.52, 0.62, ROOM.floor + 0.52, 0.12, 4), plinthMat);
  plinth.position.y = -0.38; plinth.castShadow = true; plinth.receiveShadow = true;
  group.add(plinth);
  const plinthTop = new THREE.Mesh(rbox(ROOM.floor + 0.42, 0.09, ROOM.floor + 0.42, 0.04, 2), clay(P.plinthDark, { roughness: 0.85 }));
  plinthTop.position.y = -0.075;
  group.add(plinthTop);

  /* ---------- 墙 ---------- */
  const plaster = tex(plasterTexture(), { repeat: [2, 1], aniso: 8 });
  const wallMat = new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.97, metalness: 0, envMapIntensity: 0.25 });
  const wallInner = 3.5, t = ROOM.t, H = ROOM.wallH, L = ROOM.floor + 0.32;

  const win = { x0: -0.9, x1: 1.0, y0: 0.92, y1: 2.32 }; // 后墙开窗

  // 后墙（z = -3.5）：拆成 4 段，留出窗洞
  const backZ = -wallInner - t / 2;
  const addWallPanel = (w, h, x, y, z, rotY = 0) => {
    const m = new THREE.Mesh(rbox(w, h, t, 0.02, 2), wallMat);
    m.position.set(x, y, z); m.rotation.y = rotY;
    m.castShadow = true; m.receiveShadow = true;
    group.add(m); return m;
  };
  const Lx0 = -L / 2 + 0.28, Lx1 = L / 2 - 0.28;
  // 窗左
  addWallPanel(win.x0 - Lx0, H, (Lx0 + win.x0) / 2, H / 2, backZ);
  // 窗右（到右边）
  addWallPanel(Lx1 - win.x1, H, (win.x1 + Lx1) / 2, H / 2, backZ);
  // 窗下
  addWallPanel(win.x1 - win.x0, win.y0, (win.x0 + win.x1) / 2, win.y0 / 2, backZ);
  // 窗上
  addWallPanel(win.x1 - win.x0, H - win.y1, (win.x0 + win.x1) / 2, (H + win.y1) / 2, backZ);

  // 左墙（x = -3.5），整面
  const leftX = -wallInner - t / 2;
  const addLeftWall = (w, h, z, y) => {
    const m = new THREE.Mesh(rbox(t, h, w, 0.02, 2), wallMat);
    m.position.set(leftX, y, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  };
  // 左墙留门洞（z 0.55~1.55，高 2.05）
  const door = { z0: 0.55, z1: 1.55, h: 2.05 };
  const segA0 = -L / 2 + 0.03, segA1 = door.z0;
  addLeftWall(segA1 - segA0, H, (segA0 + segA1) / 2, H / 2);
  const segB0 = door.z1, segB1 = L / 2 - 0.03;
  addLeftWall(segB1 - segB0, H, (segB0 + segB1) / 2, H / 2);
  addLeftWall(door.z1 - door.z0, H - door.h, (door.z0 + door.z1) / 2, (H + door.h) / 2);

  // 门框
  const doorFrameMat = clay(P.trim, { roughness: 0.6 });
  const dfPost = (z) => {
    const m = new THREE.Mesh(rbox(0.22, door.h + 0.08, 0.10, 0.02, 2), doorFrameMat);
    m.position.set(-wallInner + 0.02, door.h / 2, z);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  };
  dfPost(door.z0 - 0.02); dfPost(door.z1 + 0.02);
  const dfTop = new THREE.Mesh(rbox(0.22, 0.10, door.z1 - door.z0 + 0.2, 0.02, 2), doorFrameMat);
  dfTop.position.set(-wallInner + 0.02, door.h + 0.03, (door.z0 + door.z1) / 2);
  dfTop.castShadow = true; dfTop.receiveShadow = true; group.add(dfTop);

  // 门洞内部：暖光渐变的“外面”
  const doorGlowCanvas = document.createElement('canvas'); doorGlowCanvas.width = 128; doorGlowCanvas.height = 256;
  const dg = doorGlowCanvas.getContext('2d');
  const dgrad = dg.createLinearGradient(0, 0, 0, 256);
  dgrad.addColorStop(0, '#2b2236'); dgrad.addColorStop(0.45, '#5c4058'); dgrad.addColorStop(0.82, '#c98a72'); dgrad.addColorStop(1, '#ffcf9a');
  dg.fillStyle = dgrad; dg.fillRect(0, 0, 128, 256);
  const doorGlowTex = tex(doorGlowCanvas, { repeat: [1, 1], wrap: THREE.ClampToEdgeWrapping });
  const doorway = new THREE.Mesh(new THREE.PlaneGeometry(door.z1 - door.z0, door.h),
    new THREE.MeshBasicMaterial({ map: doorGlowTex }));
  doorway.rotation.y = Math.PI / 2;
  doorway.position.set(-wallInner - 0.02, door.h / 2, (door.z0 + door.z1) / 2);
  group.add(doorway);

  // 门口暖光溢出
  const doorLight = new THREE.PointLight(0xffb877, 3.2, 3.4, 2);
  doorLight.position.set(-2.95, 1.35, 1.05);
  group.add(doorLight);

  // 门垫
  const matCanvas = document.createElement('canvas'); matCanvas.width = 256; matCanvas.height = 160;
  const mg = matCanvas.getContext('2d');
  mg.fillStyle = '#b98a63'; mg.fillRect(0, 0, 256, 160);
  mg.strokeStyle = '#8d6446'; mg.lineWidth = 10; mg.strokeRect(12, 12, 232, 136);
  mg.fillStyle = 'rgba(120,80,56,.55)';
  for (let y = 26; y < 148; y += 12) for (let x = 26; x < 244; x += 12) mg.fillRect(x, y, 5, 3);
  const matTex = tex(matCanvas, { repeat: [1, 1], wrap: THREE.ClampToEdgeWrapping });
  const roomDoorHit = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.5),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.001, depthWrite: false, side: THREE.DoubleSide })
  );
  roomDoorHit.rotation.y = Math.PI / 2;
  roomDoorHit.position.set(-wallInner + 0.45, 1.15, (door.z0 + door.z1) / 2);
  roomDoorHit.name = 'roomDoorHit';
  roomDoorHit.userData.hotspot = 'exit';
  group.add(roomDoorHit);

  const doormat = new THREE.Mesh(rbox(0.72, 0.03, 1.12, 0.012, 2),
    new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.98, envMapIntensity: 0.2 }));
  doormat.position.set(-3.02, 0.022, 1.05);
  doormat.rotation.y = Math.PI / 2;
  doormat.receiveShadow = true;
  doormat.name = 'doormat';
  doormat.userData.hotspot = 'exit';
  doormat.userData.walkPortal = 'yard';
  group.add(doormat);

  /* ---------- 右侧：通往客厅的门垫（不建门框） ---------- */
  const toLiving = new THREE.Group();
  const pz = 0.45;

  // 门垫
  const matC2 = document.createElement('canvas'); matC2.width = 160; matC2.height = 100;
  const mg2 = matC2.getContext('2d');
  mg2.fillStyle = '#b98a63'; mg2.fillRect(0, 0, 160, 100);
  mg2.strokeStyle = '#8d6446'; mg2.lineWidth = 8; mg2.strokeRect(8, 8, 144, 84);
  mg2.fillStyle = 'rgba(120,80,56,.5)';
  for (let y2 = 20; y2 < 92; y2 += 10) for (let x2 = 20; x2 < 152; x2 += 10) mg2.fillRect(x2, y2, 4, 3);
  const mat2 = new THREE.Mesh(rbox(0.85, 0.03, 1.2, 0.012, 2),
    new THREE.MeshStandardMaterial({ map: tex(matC2, { repeat: [1, 1] }), roughness: 0.98, envMapIntensity: 0.2 }));
  mat2.position.set(3.12, 0.022, pz);
  mat2.rotation.y = Math.PI / 2;
  mat2.receiveShadow = true;
  mat2.userData.walkPortal = 'living';
  toLiving.add(mat2);
  // 可点热区：整块垫子 + 一点余量
  const portalHit = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 2.0),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.001, depthWrite: false, side: THREE.DoubleSide })
  );
  portalHit.rotation.x = -Math.PI / 2;
  portalHit.position.set(3.1, 0.4, pz);
  portalHit.userData.hotspot = 'living';
  toLiving.add(portalHit);
  // 门垫上的暖光
  const portalLight = new THREE.PointLight(0xffb877, 1.6, 2.6, 2);
  portalLight.position.set(3.05, 0.8, pz);
  toLiving.add(portalLight);
  group.add(toLiving);

  // 墙体顶沿（剖切高光）
  const trimMat = clay(P.trim, { roughness: 0.66 });
  const topEdge1 = new THREE.Mesh(rbox(L, 0.07, t + 0.04, 0.02, 2), trimMat);
  topEdge1.position.set(0, H + 0.035, backZ); group.add(topEdge1);
  const topEdge2 = new THREE.Mesh(rbox(t + 0.04, 0.07, L, 0.02, 2), trimMat);
  topEdge2.position.set(leftX, H + 0.035, 0); group.add(topEdge2);

  // 踢脚线
  const baseMat = clay(P.trimShade, { roughness: 0.7 });
  const sk1 = new THREE.Mesh(rbox(L - 0.3, 0.13, 0.045, 0.015, 2), baseMat);
  sk1.position.set(0, 0.065, -wallInner + 0.024); group.add(sk1);
  const sk2a = new THREE.Mesh(rbox(0.045, 0.13, 3.0, 0.015, 2), baseMat);
  sk2a.position.set(-wallInner + 0.024, 0.065, -2.0); group.add(sk2a);
  const sk2b = new THREE.Mesh(rbox(0.045, 0.13, 1.9, 0.015, 2), baseMat);
  sk2b.position.set(-wallInner + 0.024, 0.065, 2.55); group.add(sk2b);

  /* ---------- 窗 ---------- */
  const winGroup = new THREE.Group();
  const wW = win.x1 - win.x0, wH = win.y1 - win.y0;
  const cx = (win.x0 + win.x1) / 2, cy = (win.y0 + win.y1) / 2;

  // 窗框
  const frameMat = clay(P.trim, { roughness: 0.6 });
  const fT = 0.075, fD = 0.12;
  const frame = new THREE.Group();
  const fb1 = new THREE.Mesh(rbox(wW + fT * 2, fT, fD, 0.02, 2), frameMat);
  fb1.position.set(cx, win.y1 + fT / 2, -wallInner - 0.02);
  const fb2 = fb1.clone(); fb2.position.y = win.y0 - fT / 2;
  const fb3 = new THREE.Mesh(rbox(fT, wH + fT * 2, fD, 0.02, 2), frameMat);
  fb3.position.set(win.x0 - fT / 2, cy, -wallInner - 0.02);
  const fb4 = fb3.clone(); fb4.position.x = win.x1 + fT / 2;
  // 中梃
  const mullV = new THREE.Mesh(rbox(0.045, wH, fD * 0.8, 0.015, 2), frameMat);
  mullV.position.set(cx, cy, -wallInner - 0.02);
  const mullH = new THREE.Mesh(rbox(wW, 0.04, fD * 0.8, 0.012, 2), frameMat);
  mullH.position.set(cx, cy + 0.02, -wallInner - 0.02);
  frame.add(fb1, fb2, fb3, fb4, mullV, mullH);
  frame.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  winGroup.add(frame);

  // 窗台
  const sill = new THREE.Mesh(rbox(wW + 0.28, 0.055, 0.24, 0.02, 2), frameMat);
  sill.position.set(cx, win.y0 - 0.11, -wallInner + 0.06);
  sill.castShadow = true; sill.receiveShadow = true;
  winGroup.add(sill);

  // 玻璃
  const glassPlane = new THREE.Mesh(new THREE.PlaneGeometry(wW, wH), glass(0xcfe4ff, 0.10));
  glassPlane.position.set(cx, cy, -wallInner - 0.015);
  winGroup.add(glassPlane);

  // 窗外天空（自发光背景板，比墙更远）
  const skyTex = tex(skyTexture(), { repeat: [1, 1], aniso: 8, wrap: THREE.ClampToEdgeWrapping });
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(wW * 1.02, wH * 1.02),
    new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: true })
  );
  sky.position.set(cx, cy, -wallInner - 0.26);
  winGroup.add(sky);

  // 窗帘（波浪面片）+ 帘杆
  const curtainMat = new THREE.MeshStandardMaterial({ color: 0xf2dcc6, roughness: 0.98, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.3 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, wW + 0.7, 10), clay(0x8d6a4e, { roughness: 0.5, metalness: 0.3 }));
  rod.rotation.z = Math.PI / 2;
  rod.position.set(cx, win.y1 + 0.16, -wallInner + 0.14);
  rod.castShadow = true;
  winGroup.add(rod);
  const curtains = [];
  const makeCurtain = (x) => {
    const cw = 0.46, ch = wH + 0.72;
    const geo = new THREE.PlaneGeometry(cw, ch, 22, 6);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i);
      const u = px / cw + 0.5;
      const wave = Math.sin(u * Math.PI * 3.4) * 0.042 + Math.sin(u * Math.PI * 1.3 + 1.2) * 0.02;
      pos.setZ(i, wave);
      // 下摆微收
      pos.setX(i, px * (1 - Math.max(0, -py / ch - 0.35) * 0.12));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, curtainMat);
    m.position.set(x, cy - 0.07 + 0.06, -wallInner + 0.15);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.baseRot = x < cx ? -0.012 : 0.012;
    curtains.push(m);
    return m;
  };
  winGroup.add(makeCurtain(win.x0 - 0.16));
  winGroup.add(makeCurtain(win.x1 + 0.16));

  group.add(winGroup);

  // 阳光光柱（半透明加法面片）
  const shaftTex = tex(lightShaftTexture(), { wrap: THREE.ClampToEdgeWrapping, aniso: 4 });
  const shaftMat = new THREE.MeshBasicMaterial({
    map: shaftTex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 4.2), shaftMat);
  shaft.name = 'lightShaft';
  shaft.position.set(cx + 0.6, 2.0, -2.1);
  shaft.rotation.set(-0.55, 0.16, 0.1);
  group.add(shaft);
  shaftMat.opacity = 0.10;
  shaft.visible = false; // 光柱先关：等距视角下容易露馅

  anchors.window = new THREE.Vector3(cx, cy, -wallInner);
  anchors.windowLight = new THREE.Vector3(cx, cy, -wallInner + 0.2);

  /* ---------- 墙上装饰 ---------- */
  // 左墙两幅画
  const artColors = [
    ['#f3d9b8', '#c98f7a', '#5f7f9e'],
    ['#dfe8f2', '#8fb0d8', '#e8a98c'],
  ];
  const makeArtTexture = (cols) => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 420;
    const g = c.getContext('2d');
    g.fillStyle = cols[0]; g.fillRect(0, 0, 320, 420);
    // 抽象色块
    g.fillStyle = cols[1]; g.beginPath(); g.arc(160, 300, 120, Math.PI, 0); g.fill();
    g.fillStyle = cols[2]; g.beginPath(); g.ellipse(110, 170, 78, 96, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = cols[1]; g.globalAlpha = 0.6; g.beginPath(); g.ellipse(215, 120, 46, 30, -0.3, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    return tex(c, { repeat: [1, 1], wrap: THREE.ClampToEdgeWrapping });
  };
  const makeFrame = (w, h, t2, artTex) => {
    const g2 = new THREE.Group();
    const frameM = clay(P.trim, { roughness: 0.6 });
    const outer = new THREE.Mesh(rbox(w + 0.1, h + 0.1, 0.05, 0.015, 2), frameM);
    outer.castShadow = true; g2.add(outer);
    const mat = new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.85, envMapIntensity: 0.3 });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    pic.position.z = 0.028; g2.add(pic);
    return g2;
  };
  const art1 = makeFrame(0.52, 0.68, 0, makeArtTexture(artColors[0]));
  art1.position.set(-wallInner + 0.03, 1.62, 2.05);
  art1.rotation.y = Math.PI / 2;
  group.add(art1);

  const art2 = makeFrame(0.42, 0.54, 0, makeArtTexture(artColors[1]));
  art2.position.set(-wallInner + 0.03, 1.34, 1.32);
  art2.rotation.y = Math.PI / 2;
  group.add(art2);

  /* ---------- 串灯 ---------- */
  const stringLights = new THREE.Group();
  const bulbMat = glow(P.lampGlow, 2.6, { roughness: 0.4 });
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x4a3a34, roughness: 0.9 });
  const makeString = (p0, p1, sag, count) => {
    const curve = new THREE.CatmullRomCurve3([
      p0,
      new THREE.Vector3((p0.x + p1.x) / 2, Math.min(p0.y, p1.y) - sag, (p0.z + p1.z) / 2),
      p1,
    ]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.006, 5, false), wireMat);
    stringLights.add(tube);
    for (let i = 1; i < count; i++) {
      const u = i / count;
      const p = curve.getPoint(u);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.033, 10, 8), bulbMat);
      bulb.position.copy(p); bulb.position.y -= 0.035;
      stringLights.add(bulb);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.03, 6), wireMat);
      cap.position.copy(p); cap.position.y += 0.008;
      stringLights.add(cap);
    }
  };
  makeString(new THREE.Vector3(-4.2, 2.62, -3.3), new THREE.Vector3(3.5, 2.55, -3.3), 0.26, 13);
  makeString(new THREE.Vector3(-3.3, 2.55, -3.5), new THREE.Vector3(-3.3, 2.4, 3.6), 0.3, 12);
  group.add(stringLights);

  // 串灯补光（很弱，只为了有一点暖）
  const stringFill = new THREE.PointLight(0xffc084, 1.6, 6, 2);
  stringFill.position.set(-1.4, 2.45, -3.3);
  group.add(stringFill);

  /* ---------- 环境细节：脚线阴影 ---------- */
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(40,24,50,.42)');
    grad.addColorStop(1, 'rgba(40,24,50,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 64);
    return tex(c, { repeat: [1, 1], wrap: THREE.ClampToEdgeWrapping });
  })();
  const aoMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 });
  const ao1 = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.4, 0.42), aoMat);
  ao1.rotation.x = -Math.PI / 2;
  ao1.position.set(0, 0.004, -wallInner + 0.21);
  group.add(ao1);
  const ao2 = new THREE.Mesh(new THREE.PlaneGeometry(0.42, L - 0.4), aoMat);
  ao2.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  ao2.position.set(-wallInner + 0.21, 0.004, 0);
  group.add(ao2);

  group.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const sc = o.getWorldScale(new THREE.Vector3());
    const r = (o.geometry.boundingSphere?.radius ?? 1) * Math.max(sc.x, sc.y, sc.z);
    // 小物件不投影：省下大量 shadow pass draw call，视觉几乎无损
    o.castShadow = !!o.castShadow && !o.material.transparent && r > 0.16;
    o.receiveShadow = true;
  });

  // 串灯呼吸
  const bulbs = [];
  stringLights.traverse((o) => { if (o.isMesh && o.material === bulbMat) bulbs.push(o); });

  function update(dt, t) {
    curtains.forEach((c, i) => {
      c.rotation.z = c.userData.baseRot + Math.sin(t * 0.55 + i * 1.7) * 0.006;
      c.rotation.x = Math.sin(t * 0.4 + i) * 0.004;
    });
    const k = 0.85 + Math.sin(t * 1.6) * 0.1 + Math.sin(t * 3.7 + 1.2) * 0.05;
    bulbMat.emissiveIntensity = 2.6 * k;
    stringFill.intensity = 1.6 * k;
  }

  return { group, anchors, update };
}
