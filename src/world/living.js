import { registerSceneFurniture } from './props.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { P } from '../core/palette.js';
import { clay, fabric, glow } from '../core/materials.js';
import { woodFloorTexture, plasterTexture, rugTexture, BOOK_COLORS, contactShadowTexture, tex } from '../core/textures.js';

const rbox = (w, h, d, r = 0.04, s = 3) => new RoundedBoxGeometry(w, h, d, s, r);
const setShadow = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };
const add = (g, m) => { g.add(m); return m; };

export function buildLiving() {
  const group = new THREE.Group();
  const W = 7.0, H = 2.8, t = 0.16, inner = 3.5;
  const wallX = -inner - t / 2, wallZ = -inner - t / 2, L = W + 0.32;

  /* ---------- 地面 ---------- */
  const floorTex = tex(woodFloorTexture(), { repeat: [3.2, 3.2], aniso: 16 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.72, metalness: 0, envMapIntensity: 0.5, color: 0xf2e4d2 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, W), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.004; floor.receiveShadow = true;
  group.add(floor);
  const edge = setShadow(new THREE.Mesh(rbox(W + 0.06, 0.07, W + 0.06, 0.03, 2), clay(P.floorDark, { roughness: 0.7 })), false);
  edge.position.y = -0.045; group.add(edge);
  const plinth = setShadow(new THREE.Mesh(rbox(W + 0.52, 0.62, W + 0.52, 0.12, 4), clay(P.plinth, { roughness: 0.82 })));
  plinth.position.y = -0.38; group.add(plinth);
  const plinthTop = setShadow(new THREE.Mesh(rbox(W + 0.42, 0.09, W + 0.42, 0.04, 2), clay(P.plinthDark, { roughness: 0.85 })), false);
  plinthTop.position.y = -0.075; group.add(plinthTop);

  /* ---------- 墙 ---------- */
  const plaster = tex(plasterTexture(), { repeat: [2, 1], aniso: 8 });
  const wallMat = new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.97, metalness: 0, envMapIntensity: 0.25 });
  const trimMat = clay(P.trim, { roughness: 0.66 });
  const Lx0 = -L / 2 + 0.02, Lx1 = L / 2 - 0.02;

  const doorA = { z0: 1.95, z1: 2.95, h: 2.05 };   // 左侧：通往卧室
  const doorB = { x0: 1.85, x1: 2.85, h: 2.05 };   // 后墙：通往院子

  const panelBack = (x0, x1, y0, y1) => {
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const m = setShadow(new THREE.Mesh(rbox(w, h, t, 0.02, 2), wallMat));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, wallZ);
    group.add(m);
  };
  const panelLeft = (z0, z1, y0, y1) => {
    const w = z1 - z0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const m = setShadow(new THREE.Mesh(rbox(t, h, w, 0.02, 2), wallMat));
    m.position.set(wallX, (y0 + y1) / 2, (z0 + z1) / 2);
    group.add(m);
  };
  const win = { z0: -0.85, z1: 0.65, y0: 0.98, y1: 2.12 };
  // 后墙（z=-3.5）：留出去院子的门洞
  panelBack(Lx0, doorB.x0, 0, H);
  panelBack(doorB.x1, Lx1, 0, H);
  panelBack(doorB.x0, doorB.x1, doorB.h, H);
  // 左墙（x=-3.5）：窗户 + 去卧室的门洞
  panelLeft(Lx0, win.z0, 0, H);
  panelLeft(win.z1, doorA.z0, 0, H);
  panelLeft(win.z0, win.z1, 0, win.y0);
  panelLeft(win.z0, win.z1, win.y1, H);
  panelLeft(doorA.z1, Lx1, 0, H);
  panelLeft(doorA.z0, doorA.z1, doorA.h, H);

  // 墙顶沿
  const topBack = setShadow(new THREE.Mesh(rbox(L, 0.07, t + 0.04, 0.02, 2), trimMat), false);
  topBack.position.set(0, H + 0.035, wallZ); group.add(topBack);
  const topLeft = setShadow(new THREE.Mesh(rbox(t + 0.04, 0.07, L, 0.02, 2), trimMat), false);
  topLeft.position.set(wallX, H + 0.035, 0); group.add(topLeft);
  // 踢脚线
  const baseMat = clay(P.trimShade, { roughness: 0.7 });
  const sk1 = setShadow(new THREE.Mesh(rbox(L - 0.3, 0.13, 0.045, 0.015, 2), baseMat), false);
  sk1.position.set(0, 0.065, -inner + 0.024); group.add(sk1);
  const sk2a = setShadow(new THREE.Mesh(rbox(0.045, 0.13, 4.6, 0.015, 2), baseMat), false);
  sk2a.position.set(-inner + 0.024, 0.065, -1.0); group.add(sk2a);
  const sk2b = setShadow(new THREE.Mesh(rbox(0.045, 0.13, 1.2, 0.015, 2), baseMat), false);
  sk2b.position.set(-inner + 0.024, 0.065, 3.1); group.add(sk2b);

  /* ---------- 左墙的窗 ---------- */
  {
    const wW = win.z1 - win.z0, wH = win.y1 - win.y0, wcy = (win.y0 + win.y1) / 2, wcz = (win.z0 + win.z1) / 2;
    const skyC = document.createElement('canvas'); skyC.width = 416; skyC.height = 312;
    const sk = skyC.getContext('2d');
    const grad = sk.createLinearGradient(0, 0, 0, 312);
    grad.addColorStop(0, '#5a5a9e'); grad.addColorStop(0.35, '#9a76b8');
    grad.addColorStop(0.6, '#f08a86'); grad.addColorStop(0.8, '#ffb072'); grad.addColorStop(1, '#ffd79a');
    sk.fillStyle = grad; sk.fillRect(0, 0, 416, 312);
    const sun = sk.createRadialGradient(250, 210, 0, 250, 210, 150);
    sun.addColorStop(0, 'rgba(255,244,214,.95)'); sun.addColorStop(0.35, 'rgba(255,200,150,.45)'); sun.addColorStop(1, 'rgba(255,180,130,0)');
    sk.fillStyle = sun; sk.fillRect(0, 0, 416, 312);
    sk.fillStyle = 'rgba(92,66,108,.55)';
    let xx = 0;
    while (xx < 416) { const bw = 12 + Math.random() * 34, bh = 14 + Math.random() * 44; sk.fillRect(xx, 312 - bh, bw, bh); xx += bw + 4 + Math.random() * 8; }
    const skyTex = tex(skyC, { wrap: THREE.ClampToEdgeWrapping });
    const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(wW, wH), new THREE.MeshBasicMaterial({ map: skyTex }));
    skyPlane.rotation.y = Math.PI / 2;
    skyPlane.position.set(wallX - 0.26, wcy, wcz);
    group.add(skyPlane);
    // 玻璃
    const glassP = new THREE.Mesh(new THREE.PlaneGeometry(wW, wH), new THREE.MeshPhysicalMaterial({
      color: 0xcfe4ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.10, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false,
    }));
    glassP.rotation.y = Math.PI / 2;
    glassP.position.set(wallX + 0.01, wcy, wcz);
    group.add(glassP);
    // 窗框
    const fMat = clay(P.trim, { roughness: 0.6 });
    const bars = [
      [0.1, wH + 0.18, 0.09, wcy, win.z0 - 0.045],
      [0.1, wH + 0.18, 0.09, wcy, win.z1 + 0.045],
      [0.1, 0.09, wW + 0.18, win.y1 + 0.045, wcz],
      [0.1, 0.09, wW + 0.18, win.y0 - 0.045, wcz],
      [0.08, wH, 0.05, wcy, wcz],
      [0.08, 0.05, wW, wcy, wcz],
    ];
    for (const [bw, bh, bd, by, bz] of bars) {
      const f = setShadow(new THREE.Mesh(rbox(bw, bh, bd, 0.01, 2), fMat));
      f.position.set(wallX + 0.05, by, bz);
      group.add(f);
    }
    // 窗台
    const sill = setShadow(new THREE.Mesh(rbox(0.22, 0.07, wW + 0.3, 0.02, 2), fMat));
    sill.position.set(wallX + 0.1, win.y0 - 0.09, wcz);
    group.add(sill);
    // 窗光
    const winLight = new THREE.PointLight(0xffd0a0, 6, 6.5, 2);
    winLight.position.set(wallX + 0.75, wcy, wcz);
    group.add(winLight);
  }

  /* ---------- 两扇门 ---------- */
  const makeDoorway = (opts) => {
    const g = new THREE.Group();
    const { axis, c0, c1, h, wallPos } = opts;
    const w = c1 - c0, mid = (c0 + c1) / 2;
    // 门框
    for (const c of [c0 - 0.02, c1 + 0.02]) {
      const post = setShadow(new THREE.Mesh(rbox(0.22, h + 0.08, 0.1, 0.02, 2), trimMat));
      if (axis === 'x') post.position.set(c, h / 2, wallPos + 0.02);
      else post.position.set(wallPos + 0.02, h / 2, c);
      if (axis === 'z') post.rotation.y = Math.PI / 2;
      g.add(post);
    }
    const top = setShadow(new THREE.Mesh(rbox(axis === 'x' ? w + 0.2 : 0.22, 0.1, axis === 'x' ? 0.22 : w + 0.2, 0.02, 2), trimMat));
    if (axis === 'x') top.position.set(mid, h + 0.03, wallPos + 0.02);
    else top.position.set(wallPos + 0.02, h + 0.03, mid);
    g.add(top);
    // 门洞里：暖光
    const cvs = document.createElement('canvas'); cvs.width = 64; cvs.height = 128;
    const g2 = cvs.getContext('2d');
    const grd = g2.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, '#2b2236'); grd.addColorStop(0.6, '#6b4a52'); grd.addColorStop(1, '#c98a62');
    g2.fillStyle = grd; g2.fillRect(0, 0, 64, 128);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex(cvs, { wrap: THREE.ClampToEdgeWrapping }) }));
    if (axis === 'x') { plane.position.set(mid, h / 2, wallPos - 0.02); }
    else { plane.rotation.y = Math.PI / 2; plane.position.set(wallPos - 0.02, h / 2, mid); }
    g.add(plane);
    // 门垫
    const mc = document.createElement('canvas'); mc.width = 128; mc.height = 80;
    const mg = mc.getContext('2d');
    mg.fillStyle = '#b98a63'; mg.fillRect(0, 0, 128, 80);
    mg.strokeStyle = '#8d6446'; mg.lineWidth = 6; mg.strokeRect(6, 6, 116, 68);
    const mat = setShadow(new THREE.Mesh(rbox(0.62, 0.03, 0.92, 0.012, 2),
      new THREE.MeshStandardMaterial({ map: tex(mc, { wrap: THREE.ClampToEdgeWrapping }), roughness: 0.98, envMapIntensity: 0.2 })), false);
    if (axis === 'x') mat.position.set(mid, 0.022, wallPos + 0.5);
    else { mat.position.set(wallPos + 0.5, 0.022, mid); mat.rotation.y = Math.PI / 2; }
    mat.receiveShadow = true;
    mat.userData.walkPortal = opts.target;
    g.add(mat);
    // 大片可点热区
    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 0.9, h + 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.001, depthWrite: false, side: THREE.DoubleSide })
    );
    if (axis === 'x') hit.position.set(mid, h / 2, wallPos + 0.35);
    else { hit.rotation.y = Math.PI / 2; hit.position.set(wallPos + 0.35, h / 2, mid); }
    hit.userData.hotspot = opts.target;
    g.add(hit);
    // 门口暖光
    const dl = new THREE.PointLight(0xffb877, 2.6, 3.4, 2);
    if (axis === 'x') dl.position.set(mid, 1.3, wallPos + 0.7);
    else dl.position.set(wallPos + 0.7, 1.3, mid);
    g.add(dl);
    return g;
  };

  group.add(makeDoorway({ axis: 'z', c0: doorA.z0, c1: doorA.z1, h: doorA.h, wallPos: -inner, target: 'room' }));
  group.add(makeDoorway({ axis: 'x', c0: doorB.x0, c1: doorB.x1, h: doorB.h, wallPos: -inner, target: 'yard' }));

  /* ---------- 地毯 ---------- */
  const rugT = tex(rugTexture(), { repeat: [1, 1], wrap: THREE.ClampToEdgeWrapping, aniso: 16 });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 3.1), new THREE.MeshStandardMaterial({ map: rugT, roughness: 0.98, envMapIntensity: 0.22 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-0.1, 0.009, 0.1); rug.receiveShadow = true;
  group.add(rug);

  /* ---------- 电视柜 + 电视 ---------- */
  const consoleG = new THREE.Group();
  const cw = 2.9, cd = 0.42, ch = 0.46;
  const body = setShadow(new THREE.Mesh(rbox(cw, ch, cd, 0.04, 4), clay(P.woodWarm, { roughness: 0.7 })));
  body.position.y = 0.09 + ch / 2; consoleG.add(body);
  for (const s of [-1, 1]) {
    const leg = setShadow(new THREE.Mesh(rbox(0.08, 0.10, 0.30, 0.02, 2), clay(P.woodDark)));
    leg.position.set(s * (cw / 2 - 0.18), 0.05, 0); consoleG.add(leg);
  }
  // 柜门缝
  for (const s of [-1, 1]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.012, ch - 0.08), new THREE.MeshBasicMaterial({ color: 0x6b4a35 }));
    line.position.set(0, 0.09 + ch / 2, cd / 2 + 0.001); consoleG.add(line);
  }
  // 电视
  const tvW = 1.62, tvH = 0.94;
  const tvBody = setShadow(new THREE.Mesh(rbox(tvW + 0.06, tvH + 0.06, 0.06, 0.02, 3), clay(0x2a2a35, { roughness: 0.45, metalness: 0.2 })));
  tvBody.position.set(0, 0.09 + ch + tvH / 2 + 0.06, -0.02); consoleG.add(tvBody);
  const screenC = document.createElement('canvas'); screenC.width = 512; screenC.height = 288;
  const sg = screenC.getContext('2d');
  const grd2 = sg.createLinearGradient(0, 0, 512, 288);
  grd2.addColorStop(0, '#1e3a6e'); grd2.addColorStop(0.45, '#3d6fb0'); grd2.addColorStop(0.7, '#f0a070'); grd2.addColorStop(1, '#2a2a55');
  sg.fillStyle = grd2; sg.fillRect(0, 0, 512, 288);
  for (let i = 0; i < 26; i++) {
    sg.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.08})`;
    sg.fillRect(Math.random() * 512, Math.random() * 288, 40 + Math.random() * 120, 2 + Math.random() * 6);
  }
  sg.fillStyle = 'rgba(255,255,255,.16)';
  sg.beginPath(); sg.arc(150, 90, 62, 0, Math.PI * 2); sg.fill();
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(tvW, tvH),
    new THREE.MeshBasicMaterial({ map: tex(screenC, { wrap: THREE.ClampToEdgeWrapping }) }));
  tvScreen.position.set(0, 0.09 + ch + tvH / 2 + 0.06, 0.012);
  consoleG.add(tvScreen);
  // 电视支架
  const stand = setShadow(new THREE.Mesh(rbox(0.42, 0.05, 0.18, 0.015, 2), clay(0x2a2a35, { roughness: 0.5 })));
  stand.position.set(0, 0.09 + ch + 0.02, 0); consoleG.add(stand);
  // 音响 + 小摆件
  for (const s of [-1, 1]) {
    const sp = setShadow(new THREE.Mesh(rbox(0.16, 0.26, 0.16, 0.03, 3), clay(0x3a3a48, { roughness: 0.6 })));
    sp.position.set(s * 1.2, 0.09 + ch + 0.13, 0.02); consoleG.add(sp);
  }
  const vase = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.2, 14), clay(0x9ec7c2, { roughness: 0.5 })));
  vase.position.set(-0.9, 0.09 + ch + 0.1, 0.02); consoleG.add(vase);
  consoleG.position.set(0, 0, -3.14);
  group.add(consoleG);
  // 电视背光
  const tvLight = new THREE.PointLight(0x8fb8ff, 3.2, 4.2, 2);
  tvLight.position.set(0, 1.1, -2.75);
  group.add(tvLight);

  /* ---------- 沙发 ---------- */
  const sofa = new THREE.Group();
  const sw = 2.5, sd = 1.0, seatH = 0.42;
  const base = setShadow(new THREE.Mesh(rbox(sw, 0.26, sd, 0.08, 4), fabric(0x9aa88f, { roughness: 1 })));
  base.position.y = seatH - 0.13; sofa.add(base);
  const backRest = setShadow(new THREE.Mesh(rbox(sw, 0.62, 0.26, 0.1, 5), fabric(0x8b9a80, { roughness: 1 })));
  backRest.position.set(0, seatH + 0.22, -sd / 2 + 0.1); sofa.add(backRest);
  for (const s of [-1, 1]) {
    const arm = setShadow(new THREE.Mesh(rbox(0.24, 0.42, sd, 0.08, 4), fabric(0x8b9a80, { roughness: 1 })));
    arm.position.set(s * (sw / 2 - 0.12), seatH + 0.02, 0); sofa.add(arm);
  }
  // 坐垫
  for (let i = 0; i < 3; i++) {
    const cush = setShadow(new THREE.Mesh(rbox(sw / 3 - 0.09, 0.16, sd - 0.3, 0.07, 5), fabric(0xa9b79c, { roughness: 1 })));
    cush.position.set((i - 1) * (sw / 3), seatH + 0.07, 0.02); sofa.add(cush);
  }
  // 抱枕
  const pillow = (x, color, rot) => {
    const p = setShadow(new THREE.Mesh(rbox(0.42, 0.42, 0.14, 0.07, 5), fabric(color, { roughness: 1 })));
    p.position.set(x, seatH + 0.32, -sd / 2 + 0.28);
    p.rotation.set(-0.22, rot, 0.08); sofa.add(p);
  };
  pillow(-0.85, 0xe8b48c, 0.22);
  pillow(0.85, 0xf2e2c8, -0.2);
  // 搭毯
  const throwB = setShadow(new THREE.Mesh(rbox(0.75, 0.07, 0.5, 0.03, 5), fabric(0xd8a98a, { roughness: 1 })));
  throwB.position.set(-0.72, seatH + 0.16, sd / 2 - 0.2); throwB.rotation.y = 0.16; sofa.add(throwB);
  // 沙发腿
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 8), clay(P.woodDark)));
    leg.position.set(sx * (sw / 2 - 0.16), 0.06, sz * (sd / 2 - 0.14)); sofa.add(leg);
  }
  sofa.position.set(-0.15, 0, 1.75);
  sofa.rotation.y = Math.PI;          // 背对镜头，面向电视
  group.add(sofa);

  /* ---------- 茶几 ---------- */
  const table = new THREE.Group();
  const top = setShadow(new THREE.Mesh(rbox(1.75, 0.07, 0.92, 0.03, 4), clay(P.woodLight, { roughness: 0.6, envMapIntensity: 0.7 })));
  top.position.y = 0.42; table.add(top);
  const lower = setShadow(new THREE.Mesh(rbox(1.6, 0.05, 0.78, 0.02, 3), clay(P.woodWarm, { roughness: 0.7 })));
  lower.position.y = 0.16; table.add(lower);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.42, 8), clay(P.woodDark)));
    leg.position.set(sx * 0.74, 0.21, sz * 0.36); table.add(leg);
  }
  // 桌上物件
  const bk = setShadow(new THREE.Mesh(rbox(0.3, 0.05, 0.22, 0.01, 2), clay(0xd98c6a, { roughness: 0.9 })));
  bk.position.set(-0.45, 0.48, 0.08); bk.rotation.y = 0.2; table.add(bk);
  const bk2 = setShadow(new THREE.Mesh(rbox(0.26, 0.045, 0.2, 0.01, 2), clay(0x7fa8c9, { roughness: 0.9 })));
  bk2.position.set(-0.42, 0.525, 0.06); bk2.rotation.y = -0.1; table.add(bk2);
  const cupC = document.createElement('canvas'); cupC.width = 64; cupC.height = 64;
  const mug = new THREE.Group();
  const cup = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.11, 18), clay(0xf6ead8, { roughness: 0.4 })));
  cup.position.y = 0.055; mug.add(cup);
  const handle = setShadow(new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 16, Math.PI * 1.3), clay(0xf6ead8, { roughness: 0.4 })));
  handle.position.set(0.06, 0.06, 0); handle.rotation.z = -0.2; mug.add(handle);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.047, 18), new THREE.MeshStandardMaterial({ color: 0x6b4a35, roughness: 0.5 }));
  coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.106; mug.add(coffee);
  mug.position.set(0.5, 0.455, -0.1); table.add(mug);
  const tray = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.03, 22), clay(0xc9a887, { roughness: 0.8 })));
  tray.position.set(0.12, 0.47, 0.12); table.add(tray);
  table.position.set(-0.1, 0, -0.5);
  group.add(table);

  /* ---------- 落地灯 ---------- */
  const lamp = new THREE.Group();
  const lbase = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.035, 22), clay(P.woodDark, { roughness: 0.5, metalness: 0.2 })));
  lbase.position.y = 0.018; lamp.add(lbase);
  const pole = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 1.34, 12), clay(P.metal, { roughness: 0.35, metalness: 0.7 })));
  pole.position.y = 0.71; lamp.add(pole);
  const shade = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.32, 26, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xf8e6c8, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffc078, emissiveIntensity: 0.3 })));
  shade.position.y = 1.5; lamp.add(shade);
  const lampInner = new THREE.Mesh(new THREE.CircleGeometry(0.2, 22), glow(0xffd7a0, 1.6));
  lampInner.rotation.x = Math.PI / 2; lampInner.position.y = 1.35; lamp.add(lampInner);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), glow(0xfff0cf, 2.2));
  bulb.position.y = 1.4; lamp.add(bulb);
  const lampLight = new THREE.PointLight(0xffb877, 8, 7, 2);
  lampLight.position.y = 1.42; lamp.add(lampLight);
  lamp.position.set(2.55, 0, 1.15);
  group.add(lamp);

  /* ---------- 单椅 ---------- */
  const chair = new THREE.Group();
  const cseat = setShadow(new THREE.Mesh(rbox(0.72, 0.16, 0.7, 0.06, 5), fabric(0xc98f6a, { roughness: 1 })));
  cseat.position.y = 0.42; chair.add(cseat);
  const cback = setShadow(new THREE.Mesh(rbox(0.72, 0.6, 0.16, 0.07, 5), fabric(0xbf8560, { roughness: 1 })));
  cback.position.set(0, 0.72, -0.3); cback.rotation.x = -0.12; chair.add(cback);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.42, 8), clay(P.woodDark)));
    leg.position.set(sx * 0.28, 0.21, sz * 0.26); chair.add(leg);
  }
  chair.position.set(-2.35, 0, 0.55);
  chair.rotation.y = 0.72;
  group.add(chair);

  /* ---------- 书柜（左墙） ---------- */
  const shelf = new THREE.Group();
  const shW = 1.0, shH = 1.9, shD = 0.34;
  for (const s of [-1, 1]) {
    const side = setShadow(new THREE.Mesh(rbox(0.05, shH, shD, 0.012, 2), clay(P.woodWarm)));
    side.position.set(s * (shW / 2 - 0.025), shH / 2, 0); shelf.add(side);
  }
  const shelfYs = [0.12, 0.58, 1.02, 1.46, shH - 0.03];
  shelfYs.forEach((y, si) => {
    const b = setShadow(new THREE.Mesh(rbox(shW, 0.045, shD, 0.012, 2), clay(P.woodWarm)));
    b.position.set(0, y, 0); shelf.add(b);
    if (si === shelfYs.length - 1) return;
    const avail = shelfYs[si + 1] - y - 0.06;
    let x = -shW / 2 + 0.08;
    let idx = Math.floor(Math.random() * BOOK_COLORS.length);
    while (x < shW / 2 - 0.14) {
      const bw = 0.024 + Math.random() * 0.028;
      const bh = avail * (0.62 + Math.random() * 0.32);
      const bd = shD * (0.62 + Math.random() * 0.2);
      const book = setShadow(new THREE.Mesh(rbox(bw, bh, bd, 0.006, 2), clay(BOOK_COLORS[idx % BOOK_COLORS.length], { roughness: 0.88 })));
      book.position.set(x + bw / 2, y + 0.023 + bh / 2, 0.01);
      shelf.add(book);
      x += bw + 0.004;
      idx += 1 + (Math.random() < 0.3 ? 1 : 0);
    }
  });
  shelf.position.set(-3.24, 0, -2.05);
  shelf.rotation.y = Math.PI / 2;
  group.add(shelf);

  /* ---------- 植物 ---------- */
  function leafGeo(len = 0.36, wid = 0.2) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(wid, len * 0.18, wid * 0.92, len * 0.72, 0, len);
    s.bezierCurveTo(-wid * 0.92, len * 0.72, -wid, len * 0.18, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 10 });
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z0 = pos.getZ(i);
      pos.setZ(i, z0 + Math.sin(y / len * Math.PI * 0.85) * -0.06 + Math.pow(Math.abs(x) / wid, 1.6) * 0.06);
    }
    g.computeVertexNormals();
    return g;
  }
  const plant = new THREE.Group();
  const pot = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.3, 20), clay(P.pot, { roughness: 0.9 })));
  pot.position.y = 0.15; plant.add(pot);
  const lg = leafGeo(0.36, 0.19);
  for (let i = 0; i < 9; i++) {
    const leaf = setShadow(new THREE.Mesh(lg, clay(i % 2 ? P.leaf : P.leafDark, { roughness: 0.72, extra: { side: THREE.DoubleSide } })));
    leaf.position.set(Math.cos(i) * 0.05, 0.34 + (i % 3) * 0.1, Math.sin(i) * 0.05);
    leaf.rotation.set(-0.5 - Math.random() * 0.4, i * 0.8, (Math.random() - 0.5) * 0.4);
    leaf.scale.setScalar(0.9 + Math.random() * 0.3);
    plant.add(leaf);
  }
  plant.position.set(2.95, 0, -2.75);
  group.add(plant);

  // 小盆栽放电视柜上
  const smallPot = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 14), clay(P.pot)));
  smallPot.position.set(0.95, 0.09 + ch + 0.05, 0.02); group.add(smallPot);
  const smallLeaf = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), clay(0x6fa87e, { roughness: 0.8 })));
  smallLeaf.position.set(0.95, 0.09 + ch + 0.16, 0.02); smallLeaf.scale.y = 0.9; group.add(smallLeaf);

  /* ---------- 挂画 ---------- */
  const makePoster = (w, h, palette) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 320;
    const g = c.getContext('2d');
    g.fillStyle = palette[0]; g.fillRect(0, 0, 256, 320);
    g.fillStyle = palette[1]; g.beginPath(); g.arc(128, 220, 96, Math.PI, 0); g.fill();
    g.fillStyle = palette[2]; g.beginPath(); g.ellipse(96, 130, 58, 74, 0.3, 0, Math.PI * 2); g.fill();
    const t = tex(c, { wrap: THREE.ClampToEdgeWrapping });
    const grp = new THREE.Group();
    const frame = setShadow(new THREE.Mesh(rbox(w + 0.08, h + 0.08, 0.05, 0.012, 2), clay(P.trim, { roughness: 0.6 })));
    grp.add(frame);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
    pic.position.z = 0.028; grp.add(pic);
    return grp;
  };
  const art1 = makePoster(0.72, 0.9, ['#e8dcc8', '#c98f7a', '#5f7f9e']);
  art1.position.set(-0.9, 1.75, -3.40);
  group.add(art1);
  const art2 = makePoster(0.5, 0.64, ['#dfe8f2', '#8fb0d8', '#e8a98c']);
  art2.position.set(1.25, 1.7, -3.40);
  group.add(art2);
  const art3 = makePoster(0.46, 0.6, ['#f3e7d4', '#b9c9a8', '#e0a487']);
  art3.position.set(-3.40, 1.55, 0.2);
  art3.rotation.y = Math.PI / 2;
  group.add(art3);

  // 墙上挂钟
  const clockC = document.createElement('canvas'); clockC.width = 200; clockC.height = 200;
  const cg = clockC.getContext('2d');
  cg.fillStyle = '#fdf6ea'; cg.beginPath(); cg.arc(100, 100, 98, 0, Math.PI * 2); cg.fill();
  cg.strokeStyle = '#b48d6a'; cg.lineWidth = 7; cg.beginPath(); cg.arc(100, 100, 92, 0, Math.PI * 2); cg.stroke();
  cg.fillStyle = '#5a4636';
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; cg.save(); cg.translate(100, 100); cg.rotate(a); cg.fillRect(-2, -84, 4, i % 3 === 0 ? 16 : 9); cg.restore(); }
  cg.save(); cg.translate(100, 100); cg.rotate((8 + 20 / 60) / 12 * Math.PI * 2); cg.fillStyle = '#3c3247'; cg.fillRect(-3, -50, 6, 54); cg.restore();
  cg.save(); cg.translate(100, 100); cg.rotate((20 / 60) * Math.PI * 2); cg.fillStyle = '#5a4636'; cg.fillRect(-2.5, -72, 5, 76); cg.restore();
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.24, 36), new THREE.MeshStandardMaterial({ map: tex(clockC, { wrap: THREE.ClampToEdgeWrapping }), roughness: 0.7 }));
  clockFace.position.set(-2.35, 2.05, -3.39);
  group.add(clockFace);
  const clockRim = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 40), clay(P.woodDark, { roughness: 0.6 })));
  clockRim.rotation.x = Math.PI / 2; clockRim.position.set(-2.35, 2.05, -3.41); group.add(clockRim);

  /* ---------- 吊灯 ---------- */
  const pendant = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.5, 6), clay(0x5b4a44, { roughness: 0.9 }));
  cord.position.y = 2.55; pendant.add(cord);
  const pshade = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.26, 28, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xf7e6ca, roughness: 0.92, side: THREE.DoubleSide, emissive: 0xffc98a, emissiveIntensity: 0.3 })));
  pshade.position.y = 1.85; pendant.add(pshade);
  const pinner = new THREE.Mesh(new THREE.CircleGeometry(0.28, 26), glow(0xffd7a0, 1.8));
  pinner.rotation.x = Math.PI / 2; pinner.position.y = 1.72; pendant.add(pinner);
  const pbulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), glow(0xfff2d6, 2.2));
  pbulb.position.y = 1.76; pendant.add(pbulb);
  const pLight = new THREE.PointLight(0xffc078, 7.5, 6.5, 2);
  pLight.position.y = 1.75; pendant.add(pLight);
  pendant.position.set(-0.1, 0, 0.2);
  group.add(pendant);

  /* ---------- 补光 ---------- */
  const hemi = new THREE.HemisphereLight(0xffe0c0, 0x4a3f55, 0.55);
  group.add(hemi);

  for(const [object,type,label,icon] of [
    [sofa,'livingSofa','长沙发','🛋️'],[table,'livingTable','茶几','☕'],
    [chair,'livingChair','休闲椅','🪑'],[shelf,'livingShelf','客厅书架','📚'],
    [lamp,'livingLamp','客厅落地灯','💡'],[plant,'livingPlant','客厅盆栽','🪴'],[rug,'livingRug','客厅地毯','🧶'],
  ]) registerSceneFurniture(object,type,label,icon);

  group.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.receiveShadow = true;
  });

  function update(dt, t) {
    pLight.intensity = 7.2 + Math.sin(t * 1.7) * 0.25;
    lampLight.intensity = 7.8 + Math.sin(t * 2.1 + 1.7) * 0.3;
    tvLight.intensity = 3.0 + Math.sin(t * 5.3) * 0.25 + Math.sin(t * 2.1) * 0.15;
  }

  return {
    group, update,
    view: { target: new THREE.Vector3(0.15, 1.05, 0.1), zoom: 1.0 },
    spawn: new THREE.Vector3(-0.1, 0.02, 0.35),
    bounds: { x0: -3.0, x1: 3.0, z0: -3.0, z1: 3.0 },
  };
}
