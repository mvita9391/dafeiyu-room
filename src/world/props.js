import {makeLocalAsset} from './local-assets.js';
import {makeCoastalBench,makeCoastalLantern} from './coastal-props.js';
import {makeCoastalHouse} from './coastal.js';
import {STORE_FURNITURE} from './convenience-store.js';
import {OUTDOOR_FURNITURE} from './outdoor-furniture.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { P } from '../core/palette.js';
import { clay, fabric, glow, glass } from '../core/materials.js';
import { BOOK_COLORS, contactShadowTexture, rugTexture, tex } from '../core/textures.js';

const rbox = (w, h, d, r = 0.04, s = 3) => new RoundedBoxGeometry(w, h, d, s, r);
const add = (g, m) => { g.add(m); return m; };
const setShadow = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };

let shadowTex = null;
function shadowDecal(w, d, opacity = 0.32) {
  if (!shadowTex) shadowTex = tex(contactShadowTexture({ strength: 1 }), { wrap: THREE.ClampToEdgeWrapping });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.008;
  m.renderOrder = 2;
  return m;
}

/* ================= 地毯 ================= */
function makeRug() {
  const g = new THREE.Group();
  const t = tex(rugTexture(), { repeat: [1, 1], wrap: THREE.ClampToEdgeWrapping, aniso: 16 });
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.98, metalness: 0, envMapIntensity: 0.22 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.55, 2.85), m);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.009;
  plane.receiveShadow = true;
  g.add(plane);
  // 毯边一条更暗的收边
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(3.62, 2.92), new THREE.MeshStandardMaterial({ color: 0xc9a887, roughness: 1 }));
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = 0.004;
  edge.receiveShadow = true;
  g.add(edge);
  return g;
}

/* ================= 床 ================= */
function makeBed() {
  const g = new THREE.Group();
  const W = 1.8, L = 2.2, frameY = 0.26;

  // 床架
  const frame = setShadow(new THREE.Mesh(rbox(W, 0.24, L, 0.055, 4), clay(P.woodDark, { roughness: 0.7 })));
  frame.position.y = frameY; g.add(frame);
  for (const [x, z] of [[-W / 2 + 0.16, -L / 2 + 0.16], [W / 2 - 0.16, -L / 2 + 0.16], [-W / 2 + 0.16, L / 2 - 0.16], [W / 2 - 0.16, L / 2 - 0.16]]) {
    const leg = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.03, 0.22, 10), clay(P.woodDark)));
    leg.position.set(x, 0.11, z); g.add(leg);
  }
  // 床垫
  const mattress = setShadow(new THREE.Mesh(rbox(W - 0.1, 0.24, L - 0.1, 0.10, 5), fabric(0xf8efe2)));
  mattress.position.y = frameY + 0.22; g.add(mattress);
  const topY = frameY + 0.22 + 0.12;

  // 被子：蓬松的软体 + 翻折 + 绗缝线（不要做成木板）
  const duvet = setShadow(new THREE.Mesh(rbox(W + 0.04, 0.19, L * 0.66, 0.085, 6), fabric(0x8fb3a5, { roughness: 1 })));
  duvet.position.set(0, topY + 0.065, L * 0.16); duvet.scale.set(1, 1, 1); g.add(duvet);
  const sleepContact = new THREE.Object3D();
  sleepContact.name = 'bed-sleep-contact';
  sleepContact.position.set(.02, topY + .16, -.10);
  g.add(sleepContact);
  // 被头翻折：一层薄被单压在枕头上方
  const topSheet = setShadow(new THREE.Mesh(rbox(W + 0.02, 0.055, 0.34, 0.028, 5), fabric(0xf2e7d6, { roughness: 1 })));
  topSheet.position.set(0, topY + 0.155, -L * 0.16 + 0.03); topSheet.rotation.x = -0.03; g.add(topSheet);
  const sheetFold = setShadow(new THREE.Mesh(rbox(W - 0.02, 0.035, 0.10, 0.016, 4), fabric(0xe4d5c0, { roughness: 1 })));
  sheetFold.position.set(0, topY + 0.178, -L * 0.16 - 0.12); g.add(sheetFold);
  // 绗缝线（横向两道细凹痕）
  for (const dz of [0.30, -0.02]) {
    const seam = setShadow(new THREE.Mesh(rbox(W - 0.14, 0.012, 0.018, 0.005, 2), fabric(0x7ea294, { roughness: 1 })));
    seam.position.set(0, topY + 0.157, L * 0.16 + dz); g.add(seam);
  }
  // 床尾搭毯（只盖住中间一段，带垂边）
  const throwB = setShadow(new THREE.Mesh(rbox(W * 0.86, 0.06, 0.46, 0.028, 6), fabric(0xe7c9a4, { roughness: 1 })));
  throwB.position.set(-0.02, topY + 0.128, L / 2 - 0.30); throwB.rotation.y = 0.02; g.add(throwB);
  const throwDrape = setShadow(new THREE.Mesh(rbox(W * 0.86, 0.30, 0.06, 0.026, 5), fabric(0xd9b892, { roughness: 1 })));
  throwDrape.position.set(-0.02, topY - 0.06, L / 2 - 0.05); g.add(throwDrape);
  const throwStripe = setShadow(new THREE.Mesh(rbox(W * 0.86 - 0.06, 0.012, 0.05, 0.006, 2), fabric(0xc79b74, { roughness: 1 })));
  throwStripe.position.set(-0.02, topY + 0.162, L / 2 - 0.24); g.add(throwStripe);

  // 枕头
  const pillow = (z, tint, rotY, sc = 1) => {
    const p = setShadow(new THREE.Mesh(rbox(0.70 * sc, 0.155 * sc, 0.42 * sc, 0.08, 6), fabric(tint, { roughness: 1 })));
    p.position.set(-0.02, topY + 0.10, z);
    p.rotation.y = rotY; p.rotation.x = -0.10; p.rotation.z = rotY * 0.6;
    g.add(p);
    return p;
  };
  pillow(-L / 2 + 0.42, 0xfdf7ec, 0.05);
  pillow(-L / 2 + 0.86, 0xf4e7d7, -0.03, 0.95);

  // 床头板
  const head = setShadow(new THREE.Mesh(rbox(W + 0.05, 0.60, 0.10, 0.05, 4), clay(P.woodWarm, { roughness: 0.68 })));
  head.position.set(0, 0.60, -L / 2 - 0.02); g.add(head);
  const headTop = setShadow(new THREE.Mesh(rbox(W + 0.10, 0.06, 0.15, 0.03, 3), clay(P.woodLight, { roughness: 0.55 })));
  headTop.position.set(0, 0.92, -L / 2 - 0.02); g.add(headTop);

  // 床边小地毯
  const rug2 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.95), new THREE.MeshStandardMaterial({ color: 0xe6cdb0, roughness: 1 }));
  rug2.rotation.x = -Math.PI / 2; rug2.position.set(-0.35, 0.006, L / 2 + 0.28);
  rug2.receiveShadow = true;
  g.add(rug2);

  return g;
}

/* ================= 床头柜 + 小台灯 ================= */
function makeNightstand() {
  const g = new THREE.Group();
  const body = setShadow(new THREE.Mesh(rbox(0.46, 0.44, 0.40, 0.03, 4), clay(P.woodWarm, { roughness: 0.7 })));
  body.position.y = 0.30; g.add(body);
  for (const x of [-0.17, 0.17]) for (const z of [-0.14, 0.14]) {
    const leg = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.16, 8), clay(P.woodDark)));
    leg.position.set(x, 0.08, z); g.add(leg);
  }
  const drawer = setShadow(new THREE.Mesh(rbox(0.38, 0.14, 0.02, 0.012, 3), clay(P.woodLight)));
  drawer.position.set(0, 0.34, 0.205); g.add(drawer);
  const knob = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), clay(P.woodDark, { roughness: 0.4, metalness: 0.4 })));
  knob.position.set(0, 0.34, 0.222); g.add(knob);

  // 小台灯
  const baseL = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.03, 18), clay(0x8a7a6a, { roughness: 0.4, metalness: 0.3 })));
  baseL.position.y = 0.54; g.add(baseL);
  const stem = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 8), clay(0x8a7a6a, { roughness: 0.4, metalness: 0.4 })));
  stem.position.y = 0.63; g.add(stem);
  const shade = setShadow(new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.105, 0.13, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xf8ecd6, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffc078, emissiveIntensity: 0.32 })
  ));
  shade.position.y = 0.76; g.add(shade);
  const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.075, 18), glow(0xffd7a0, 1.6));
  glowDisc.rotation.x = Math.PI / 2; glowDisc.position.y = 0.70; g.add(glowDisc);

  const lampLight = new THREE.PointLight(0xffbf85, 2.6, 2.6, 2);
  lampLight.position.set(0, 0.66, 0);
  g.add(lampLight);

  // 床头一杯水
  const glassCup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 16), glass(0xd8efff, 0.25));
  glassCup.position.set(0.14, 0.565, -0.10); g.add(glassCup);
  const book = setShadow(new THREE.Mesh(rbox(0.16, 0.03, 0.11, 0.006, 2), clay(0xc98b9f, { roughness: 0.9 })));
  book.position.set(-0.12, 0.535, -0.10); book.rotation.y = 0.3; g.add(book);
  return g;
}

/* ================= 书桌 + 笔记本 ================= */
function makeDesk() {
  const g = new THREE.Group();
  const W = 1.95, D = 0.66, H = 0.76;

  const top = setShadow(new THREE.Mesh(rbox(W, 0.06, D, 0.025, 4), clay(P.woodLight, { roughness: 0.62, envMapIntensity: 0.7 })));
  top.position.y = H; g.add(top);
  // 桌腿（外八字）
  for (const s of [-1, 1]) {
    const leg = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, H, 10), clay(P.woodDark)));
    leg.position.set(s * (W / 2 - 0.12), H / 2, D / 2 - 0.1);
    leg.rotation.x = 0.06 * s; leg.rotation.z = -0.04 * s;
    g.add(leg);
    const leg2 = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, H, 10), clay(P.woodDark)));
    leg2.position.set(s * (W / 2 - 0.12), H / 2, -D / 2 + 0.1);
    leg2.rotation.x = -0.06 * s; leg2.rotation.z = -0.04 * s;
    g.add(leg2);
  }
  // 抽屉柜
  const drawer = setShadow(new THREE.Mesh(rbox(0.5, 0.42, D - 0.06, 0.03, 4), clay(P.woodWarm)));
  drawer.position.set(W / 2 - 0.34, H - 0.28, 0); g.add(drawer);
  for (let i = 0; i < 2; i++) {
    const d = setShadow(new THREE.Mesh(rbox(0.42, 0.14, 0.02, 0.015, 3), clay(P.woodLight)));
    d.position.set(W / 2 - 0.34, H - 0.16 - i * 0.19, D / 2 - 0.02); g.add(d);
    const knob = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), clay(P.woodDark)));
    knob.position.set(W / 2 - 0.34, H - 0.16 - i * 0.19, D / 2 + 0.005); g.add(knob);
  }

  /* 笔记本 */
  const laptop = new THREE.Group();
  const bodyM = clay(0x3c3b52, { roughness: 0.42, metalness: 0.35, env: 1.0 });
  const baseL = setShadow(new THREE.Mesh(rbox(0.44, 0.022, 0.31, 0.012, 3), bodyM));
  baseL.position.y = 0.011; laptop.add(baseL);
  const kb = setShadow(new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.19), new THREE.MeshStandardMaterial({ color: 0x2a2940, roughness: 0.7 })));
  kb.rotation.x = -Math.PI / 2; kb.position.set(0, 0.023, 0.03); laptop.add(kb);
  // 屏幕
  const screenG = new THREE.Group();
  screenG.position.set(0, 0.022, -0.15);
  screenG.rotation.x = -0.28;
  const lid = setShadow(new THREE.Mesh(rbox(0.44, 0.30, 0.014, 0.008, 3), bodyM));
  lid.position.y = 0.15; screenG.add(lid);
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.26), glow(0x9fd8ff, 1.35, { roughness: 0.35 }));
  disp.name = 'computer-display';
  disp.position.set(0, 0.15, 0.0085); screenG.add(disp);
  laptop.add(screenG);
  laptop.position.set(-0.18, H + 0.03, 0.03);
  laptop.rotation.y = -0.16;
  g.add(laptop);

  // 笔记本开机微光
  const screenLight = new THREE.PointLight(0x9fd8ff, 1.4, 1.6, 2);
  screenLight.position.set(-0.22, H + 0.25, 0.02);
  g.add(screenLight);

  /* 马克杯 */
  const mug = new THREE.Group();
  const cup = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.043, 0.10, 20, 1, false), clay(0xf6ead8, { roughness: 0.4 })));
  cup.position.y = 0.05; mug.add(cup);
  const handle = setShadow(new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.011, 8, 16, Math.PI * 1.3), clay(0xf6ead8, { roughness: 0.4 })));
  handle.position.set(0.055, 0.055, 0); handle.rotation.z = -0.2; mug.add(handle);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.041, 20), new THREE.MeshStandardMaterial({ color: 0x6b4a35, roughness: 0.5 }));
  coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.096; mug.add(coffee);
  mug.position.set(0.62, H + 0.03, 0.02);
  g.add(mug);

  /* 书堆 */
  const books = new THREE.Group();
  const bc = [0xd98c6a, 0x7fa8c9, 0xe8c48d];
  bc.forEach((c, i) => {
    const b = setShadow(new THREE.Mesh(rbox(0.26 - i * 0.01, 0.035, 0.19, 0.008, 2), clay(c, { roughness: 0.9 })));
    b.position.set(0.04 + i * 0.006, H + 0.03 + i * 0.037, 0.02);
    b.rotation.y = 0.18 - i * 0.07;
    books.add(b);
  });
  books.position.set(-0.62, 0, 0);
  g.add(books);

  /* 小盆栽 */
  const pot = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.042, 0.09, 14), clay(P.pot)));
  pot.position.set(0.86, H + 0.075, -0.12); g.add(pot);
  const leafMat = clay(P.leaf, { roughness: 0.7 });
  for (let i = 0; i < 5; i++) {
    const leaf = setShadow(new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), leafMat));
    leaf.scale.set(0.012, 0.09, 0.045);
    leaf.position.set(0.86 + Math.cos(i * 1.3) * 0.03, H + 0.19, -0.12 + Math.sin(i * 1.3) * 0.03);
    leaf.rotation.set(0.2, i * 1.3, 0.25 + Math.cos(i) * 0.1);
    g.add(leaf);
  }
  return g;
}

/* ================= 椅子 ================= */
function makeChair() {
  const g = new THREE.Group();
  const seatH = 0.45;
  const seat = setShadow(new THREE.Mesh(rbox(0.44, 0.06, 0.44, 0.02, 3), clay(P.woodWarm)));
  seat.position.y = seatH; g.add(seat);
  const cushion = setShadow(new THREE.Mesh(rbox(0.40, 0.07, 0.40, 0.03, 4), fabric(0xd9a58c)));
  cushion.position.y = seatH + 0.055; g.add(cushion);
  for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
    const leg = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, seatH, 8), clay(P.woodDark)));
    leg.position.set(x, seatH / 2, z); leg.rotation.z = -x * 0.20; leg.rotation.x = z * 0.20;
    g.add(leg);
  }
  // 靠背
  const back = setShadow(new THREE.Mesh(rbox(0.42, 0.40, 0.05, 0.025, 4), clay(P.woodWarm)));
  back.position.set(0, seatH + 0.27, -0.20); back.rotation.x = -0.12; g.add(back);
  const backCushion = setShadow(new THREE.Mesh(rbox(0.36, 0.30, 0.055, 0.03, 4), fabric(0xe8d3bd)));
  backCushion.position.set(0, seatH + 0.27, -0.16); backCushion.rotation.x = -0.12; g.add(backCushion);
  return g;
}

/* ================= 书架 ================= */
function makeBookshelf() {
  const g = new THREE.Group();
  const W = 1.02, H = 1.92, D = 0.34;
  const wood = clay(P.woodWarm, { roughness: 0.72 });
  const woodD = clay(P.woodDark, { roughness: 0.75 });
  // 侧板
  for (const s of [-1, 1]) {
    const side = setShadow(new THREE.Mesh(rbox(0.05, H, D, 0.012, 2), wood));
    side.position.set(s * (W / 2 - 0.025), H / 2, 0); g.add(side);
  }
  // 层板 + 书
  const shelfYs = [0.12, 0.58, 1.02, 1.46, H - 0.03];
  shelfYs.forEach((y, si) => {
    const shelf = setShadow(new THREE.Mesh(rbox(W, 0.045, D, 0.012, 2), wood));
    shelf.position.set(0, y, 0); g.add(shelf);
    if (si === shelfYs.length - 1) return;
    const nextY = shelfYs[si + 1];
    const avail = nextY - y - 0.06;
    // 一排书
    let x = -W / 2 + 0.08;
    let idx = Math.floor(Math.random() * BOOK_COLORS.length);
    while (x < W / 2 - 0.14) {
      const bw = 0.024 + Math.random() * 0.028;
      const bh = avail * (0.62 + Math.random() * 0.32);
      const bd = D * (0.62 + Math.random() * 0.2);
      const b = setShadow(new THREE.Mesh(rbox(bw, bh, bd, 0.006, 2), clay(BOOK_COLORS[idx % BOOK_COLORS.length], { roughness: 0.88 })));
      b.position.set(x + bw / 2, y + 0.023 + bh / 2, 0.01);
      if (Math.random() < 0.10) { b.rotation.z = (Math.random() - 0.5) * 0.5; b.position.y -= 0.02; }
      g.add(b);
      x += bw + 0.004;
      idx += 1 + (Math.random() < 0.3 ? 1 : 0);
      if (Math.random() < 0.06) x += 0.05;
    }
    // 顶部放小物
    if (si === 1) {
      const vase = setShadow(new THREE.Mesh(new THREE.LatheGeometry(
        Array.from({ length: 12 }, (_, i) => {
          const t = i / 11;
          return new THREE.Vector2(0.035 + Math.sin(t * Math.PI) * 0.045, t * 0.22);
        }), 20), clay(0x9ec7c2, { roughness: 0.5 })));
      vase.position.set(0.28, y + 0.025, 0.02); g.add(vase);
      const leaf = setShadow(new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), clay(P.leafDark)));
      leaf.scale.set(0.02, 0.14, 0.02); leaf.position.set(0.28, y + 0.32, 0.02); leaf.rotation.z = 0.2; g.add(leaf);
    }
    if (si === 2) {
      // 相框
      const fr = new THREE.Group();
      const f = setShadow(new THREE.Mesh(rbox(0.2, 0.26, 0.02, 0.01, 2), clay(P.trim)));
      fr.add(f);
      const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.22), new THREE.MeshStandardMaterial({ color: 0x8fb0d8, roughness: 0.8 }));
      ph.position.z = 0.012; fr.add(ph);
      fr.position.set(-0.24, y + 0.16, 0.02); fr.rotation.y = -0.22;
      g.add(fr);
    }
  });
  return g;
}

/* ================= 落地灯 ================= */
function makeFloorLamp() {
  const g = new THREE.Group();
  const base = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.035, 24), clay(P.woodDark, { roughness: 0.5, metalness: 0.2 })));
  base.position.y = 0.018; g.add(base);
  const pole = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 1.32, 12), clay(P.metal, { roughness: 0.35, metalness: 0.7 })));
  pole.position.y = 0.7; g.add(pole);
  // 灯罩
  const shade = setShadow(new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.24, 0.30, 28, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xf8e6c8, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffc078, emissiveIntensity: 0.26 })
  ));
  shade.position.y = 1.44; g.add(shade);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.19, 24), glow(0xffd7a0, 1.5));
  inner.rotation.x = Math.PI / 2; inner.position.y = 1.30; g.add(inner);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), glow(0xfff0cf, 2.2));
  bulb.position.y = 1.34; g.add(bulb);
  return g;
}

/* ================= 吊灯 ================= */
function makePendant() {
  const g = new THREE.Group();
  const cordLen = 1.75;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, cordLen, 6), clay(0x5b4a44, { roughness: 0.9 }));
  cord.position.y = 2.62 + cordLen / 2; g.add(cord);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.05, 20), clay(P.woodDark, { roughness: 0.6 }));
  cap.position.y = 2.63; g.add(cap);
  // 编织灯罩
  const shade = setShadow(new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.30, 0.30, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xf6e2c4, roughness: 0.95, side: THREE.DoubleSide, emissive: 0xffc98a, emissiveIntensity: 0.3 })
  ));
  shade.position.y = 2.45; g.add(shade);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.28, 28), glow(0xffd7a0, 1.7));
  inner.rotation.x = Math.PI / 2; inner.position.y = 2.31; g.add(inner);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 12), glow(0xfff2d6, 2.2));
  bulb.position.y = 2.36; g.add(bulb);
  return g;
}

/* ================= 懒人沙发 ================= */
function makeBeanbag() {
  const g = new THREE.Group();
  // 底部鼓起
  const bag = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.54, 36, 26), fabric(0x7fb0a6, { roughness: 1 })));
  bag.scale.set(1, 0.62, 1);
  bag.position.y = 0.32; g.add(bag);
  // 中间坐垫（略凹）
  const dent = new THREE.Mesh(new THREE.SphereGeometry(0.40, 28, 20), fabric(0x74a69c, { roughness: 1 }));
  dent.scale.set(1.02, 0.34, 1.02);
  dent.position.y = 0.50; g.add(dent);
  // 缝线
  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.014, 6, 40), fabric(0x5f8c83, { roughness: 1 }));
  seam.rotation.x = Math.PI / 2; seam.position.y = 0.50; g.add(seam);
  // 抱枕
  const cushion = setShadow(new THREE.Mesh(rbox(0.36, 0.32, 0.13, 0.07, 4), fabric(0xe8a98c)));
  cushion.position.set(0.08, 0.60, 0.24); cushion.rotation.set(-0.65, 0.35, 0.08); g.add(cushion);
  return g;
}

/* ================= 边几 + 鱼缸 ================= */
function makeSideTable() {
  const g = new THREE.Group();
  const top = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 28), clay(P.woodLight, { roughness: 0.6 })));
  top.position.y = 0.52; g.add(top);
  const stem = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 12), clay(P.woodDark)));
  stem.position.y = 0.27; g.add(stem);
  const base = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, 0.04, 24), clay(P.woodDark)));
  base.position.y = 0.02; g.add(base);

  // 鱼缸
  const bowl = new THREE.Group();
  const glassBall = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 24), glass(0xe6f6ff, 0.14));
  glassBall.position.y = 0.18; bowl.add(glassBall);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.008, 8, 28), clay(0xd8efff, { roughness: 0.15, env: 1.2 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.335; bowl.add(rim);
  const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.10, 0.022, 24), clay(0x8a6a4e, { roughness: 0.6 }));
  basePlate.position.y = 0.005; bowl.add(basePlate);
  const water = new THREE.Mesh(new THREE.SphereGeometry(0.168, 28, 20), new THREE.MeshPhysicalMaterial({
    color: 0x8fd3ff, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.30, envMapIntensity: 1.2,
  }));
  water.scale.y = 0.80; water.position.y = 0.17; bowl.add(water);
  // 小石头
  for (let i = 0; i < 7; i++) {
    const st = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), clay(0xc9b7a0, { roughness: 1 }));
    st.scale.y = 0.6;
    st.position.set((Math.random() - 0.5) * 0.22, 0.02 + Math.random() * 0.01, (Math.random() - 0.5) * 0.22);
    bowl.add(st);
  }
  // 小金鱼
  const fish = new THREE.Group();
  const fb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), clay(0xff9d6e, { roughness: 0.5 }));
  fb.scale.set(1.25, 0.85, 1); fish.add(fb);
  const ft = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 10), clay(0xffb37e, { roughness: 0.5 }));
  ft.rotation.z = Math.PI / 2; ft.position.x = -0.05; fish.add(ft);
  fish.position.set(0.02, 0.15, 0.02);
  fish.name = 'bowlFish';
  bowl.add(fish);
  bowl.position.y = 0.545;
  bowl.userData.fish = fish;
  bowl.scale.setScalar(1.15);
  g.add(bowl);
  g.userData.bowl = bowl;
  return g;
}

/* ================= 植物 ================= */
function makeLeafGeometry(len = 0.34, wid = 0.20) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(wid, len * 0.18, wid * 0.92, len * 0.72, 0, len);
  s.bezierCurveTo(-wid * 0.92, len * 0.72, -wid, len * 0.18, 0, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 12 });
  // 让叶片沿主脉折起 + 纵向弯曲，避免像纸片
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z0 = pos.getZ(i);
    const fold = Math.pow(Math.abs(x) / wid, 1.6) * 0.075;
    pos.setZ(i, z0 + Math.sin(y / len * Math.PI * 0.85) * -0.07 + fold);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeMonstera() {
  const g = new THREE.Group();
  const pot = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.34, 22), clay(P.pot, { roughness: 0.9 })));
  pot.position.y = 0.17; g.add(pot);
  const rim = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.24, 0.05, 22), clay(0xb96c4e)));
  rim.position.y = 0.35; g.add(rim);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.22, 22), new THREE.MeshStandardMaterial({ color: 0x5a4132, roughness: 1 }));
  soil.rotation.x = -Math.PI / 2; soil.position.y = 0.345; g.add(soil);

  const leafGeo = makeLeafGeometry(0.38, 0.22);
  const leafMat = clay(P.leaf, { roughness: 0.68, env: 0.4, extra: { side: THREE.DoubleSide } });
  const leafMatD = clay(P.leafDark, { roughness: 0.7, env: 0.35, extra: { side: THREE.DoubleSide } });
  const stemMat = clay(0x56805c, { roughness: 0.8 });
  const N = 13;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.3;
    const h = 0.48 + (i % 4) * 0.15 + Math.random() * 0.14;
    const leaf = setShadow(new THREE.Mesh(leafGeo, i % 2 ? leafMat : leafMatD), false);
    leaf.scale.setScalar(1.1 + Math.random() * 0.55);
    leaf.position.set(Math.cos(a) * 0.06, h, Math.sin(a) * 0.06);
    leaf.rotation.set(-0.35 - Math.random() * 0.5, a + Math.PI / 2, (Math.random() - 0.5) * 0.35);
    leaf.castShadow = true; leaf.receiveShadow = true;
    g.add(leaf);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.013, h - 0.2, 6), stemMat);
    stem.position.set(Math.cos(a) * 0.035, (h - 0.2) / 2 + 0.2, Math.sin(a) * 0.035);
    stem.rotation.z = Math.cos(a) * 0.16;
    stem.rotation.x = -Math.sin(a) * 0.16;
    g.add(stem);
  }
  return g;
}

function makeSmallPlant(tint = P.leaf) {
  const g = new THREE.Group();
  const pot = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.058, 0.12, 16), clay(P.pot)));
  pot.position.y = 0.06; g.add(pot);
  const leafGeo = makeLeafGeometry(0.16, 0.075);
  for (let i = 0; i < 6; i++) {
    const leaf = setShadow(new THREE.Mesh(leafGeo, clay(tint)), false);
    leaf.position.set(Math.cos(i * 1.1) * 0.02, 0.14 + Math.random() * 0.03, Math.sin(i * 1.1) * 0.02);
    leaf.rotation.set(-0.55 - Math.random() * 0.4, i * 1.1, (Math.random() - 0.5) * 0.4);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

/* ================= 墙面：挂钟 / 架子 ================= */
function makeClock() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fdf6ea'; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#b48d6a'; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#5a4636';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.save(); g.translate(128, 128); g.rotate(a);
    g.fillRect(-3, -108, 6, i % 3 === 0 ? 20 : 12);
    g.restore();
  }
  // 指针 21:40
  g.save(); g.translate(128, 128); g.rotate((9 + 40 / 60) / 12 * Math.PI * 2);
  g.fillStyle = '#3c3247'; g.fillRect(-4, -62, 8, 66); g.restore();
  g.save(); g.translate(128, 128); g.rotate((40 / 60) * Math.PI * 2);
  g.fillStyle = '#5a4636'; g.fillRect(-3.5, -92, 7, 96); g.restore();
  g.fillStyle = '#c98f7a'; g.beginPath(); g.arc(128, 128, 7, 0, Math.PI * 2); g.fill();

  const t = tex(c, { wrap: THREE.ClampToEdgeWrapping });
  const g2 = new THREE.Group();
  const rim = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 40), clay(P.woodDark, { roughness: 0.6 })));
  rim.rotation.x = Math.PI / 2; g2.add(rim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.245, 40), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
  face.position.z = 0.027; g2.add(face);
  return g2;
}

function makeWallShelf() {
  const g = new THREE.Group();
  const board = setShadow(new THREE.Mesh(rbox(0.92, 0.045, 0.22, 0.012, 2), clay(P.woodWarm)));
  board.position.y = 0; g.add(board);
  for (const s of [-1, 1]) {
    const br = setShadow(new THREE.Mesh(rbox(0.03, 0.13, 0.18, 0.008, 2), clay(P.woodDark)));
    br.position.set(s * 0.36, -0.08, -0.02); g.add(br);
  }
  // 物件
  const plant = makeSmallPlant(0x6fa87e);
  plant.position.set(-0.25, 0.022, 0); plant.scale.setScalar(0.7); g.add(plant);
  const stack = new THREE.Group();
  [0xd98c6a, 0x7fa8c9].forEach((c, i) => {
    const b = setShadow(new THREE.Mesh(rbox(0.2, 0.032, 0.15, 0.008, 2), clay(c, { roughness: 0.9 })));
    b.position.set(0.02 + i * 0.01, 0.02 + i * 0.034, 0);
    b.rotation.y = 0.08 - i * 0.1;
    stack.add(b);
  });
  stack.position.set(0.16, 0, 0.01); g.add(stack);
  const cup = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.07, 16), clay(0x9ec7c2)));
  cup.position.set(0.36, 0.045, 0); g.add(cup);
  return g;
}

/* ================= 挂着的相框（后墙） ================= */
function makePoster() {
  const c = document.createElement('canvas'); c.width = 300; c.height = 400;
  const g = c.getContext('2d');
  g.fillStyle = '#f6e7d2'; g.fillRect(0, 0, 300, 400);
  g.fillStyle = '#5b7cfa';
  g.beginPath(); g.moveTo(70, 300); g.bezierCurveTo(60, 190, 140, 150, 160, 90); g.bezierCurveTo(220, 160, 260, 250, 230, 300); g.closePath(); g.fill();
  g.fillStyle = '#ffb08a';
  g.beginPath(); g.arc(215, 120, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8fb0d8';
  g.fillRect(60, 320, 180, 6);
  const t = tex(c, { wrap: THREE.ClampToEdgeWrapping });
  const grp = new THREE.Group();
  const frame = setShadow(new THREE.Mesh(rbox(0.56, 0.74, 0.045, 0.012, 2), clay(P.trim, { roughness: 0.55 })));
  grp.add(frame);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.68), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
  art.position.z = 0.026; grp.add(art);
  return grp;
}

/* ================= 悬挂绿植 ================= */
function makeHangingPlant() {
  const g = new THREE.Group();
  const pot = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.14, 18), clay(P.pot)));
  g.add(pot);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.85, 5), clay(0x6b5a4a));
  cord.position.y = 0.49; g.add(cord);
  const leafGeo = makeLeafGeometry(0.15, 0.07);
  for (let i = 0; i < 8; i++) {
    const a = i * 0.9;
    const leaf = setShadow(new THREE.Mesh(leafGeo, clay(i % 2 ? P.leaf : P.leafDark)), false);
    leaf.position.set(Math.cos(a) * 0.07, 0.06 + (i % 3) * 0.03, Math.sin(a) * 0.07);
    leaf.rotation.set(-1.4, a, 0.2 * Math.cos(a));
    leaf.castShadow = true;
    g.add(leaf);
  }
  // 垂下的藤
  for (let i = 0; i < 3; i++) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(i * 2) * 0.06, 0.02, Math.sin(i * 2) * 0.06),
      new THREE.Vector3(Math.cos(i * 2) * 0.12, -0.3, Math.sin(i * 2) * 0.1),
      new THREE.Vector3(Math.cos(i * 2) * 0.10, -0.62, Math.sin(i * 2) * 0.16),
    ]);
    const vine = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.006, 5), clay(0x4f7a56));
    g.add(vine);
    for (let k = 1; k <= 4; k++) {
      const p = curve.getPoint(k / 5);
      const leaf = setShadow(new THREE.Mesh(leafGeo, clay(k % 2 ? P.leafDark : P.leaf)), false);
      leaf.scale.setScalar(0.6);
      leaf.position.copy(p);
      leaf.rotation.set(-1.2, k * 1.3, 0.4);
      g.add(leaf);
    }
  }
  return g;
}

export const FURNITURE = {yardBench:{label:'长椅',icon:'🪑',make:makeCoastalBench},yardLantern:{label:'石灯笼',icon:'🏮',make:makeCoastalLantern},coastalHouse:{label:'海边小屋',icon:'🏠',make:makeCoastalHouse},
  ...OUTDOOR_FURNITURE,...STORE_FURNITURE,
  bed: { label: '床', icon: '🛏️', make: makeBed },
  desk: { label: '电脑桌', icon: '🖥️', make: makeDesk },
  chair: { label: '椅子', icon: '🪑', make: makeChair },
  shelf: { label: '书架', icon: '📚', make: makeBookshelf },
  lamp: { label: '落地灯', icon: '💡', make: makeFloorLamp },
  bean: { label: '懒人沙发', icon: '🛋️', make: makeBeanbag },
  table: { label: '小圆桌', icon: '☕', make: makeSideTable },
  plant: { label: '大盆栽', icon: '🪴', make: makeMonstera },
  smallPlant: { label: '小盆栽', icon: '🌿', make: () => makeSmallPlant(0x6fa87e) },
  nightstand: { label: '床头柜', icon: '🗄️', make: makeNightstand },
  rug: { label: '地毯', icon: '🧶', make: makeRug },
};
const furniturePreviewURL = type => `./furniture-previews/${type}.webp`;
for (const [type, meta] of Object.entries(FURNITURE)) {
  FURNITURE[type] = { ...meta, thumbnailURL: furniturePreviewURL(type) };
}
export function registerSceneFurniture(object, type, label, icon) {
  const template=object.clone(true);
  FURNITURE[type]={label,icon,thumbnailURL:furniturePreviewURL(type),make:()=>template.clone(true)};
  object.userData.furnitureType=type;
  return object;
}
export function markFurniture(object, type) {
  object.userData.furnitureType = type;
  if (type === 'chair') {
    object.name = 'computer-chair';
    object.userData.seat = { height: 0.53 };
  }
  return object;
}
export function registerLocalFurniture(entries){for(const e of entries)FURNITURE[e.type]={label:e.label,thumbnailURL:e.thumbnailURL,local:true,icon:{Buildings:'🏠',Furniture:'🪑',Seating:'🛋️',Tables:'🪵',Storage:'🗄️',Bedding:'🛏️',Kitchen:'🍽️',Lighting:'💡',Plants:'🌿',Trees:'🌳',Flowers:'🌷',Decor:'🖼️',Containers:'📦',Tools:'🔧',Weapons:'⚔️',Animals:'🐈',Characters:'🧍',Vehicles:'🚗',Terrain:'⛰️',Attachments:'🧷',Misc:'🧩',Roads:'🛤️',Floor:'⛰️',Laterns:'🏮'}[e.localCategory]||'🧩',make:()=>makeLocalAsset(e.type)};}
export function createFurniture(type) {
  if(type.startsWith('town-')&&!FURNITURE[type]){FURNITURE[type]={label:'本地素材缺失',icon:'🧩',make:()=>makeLocalAsset(type)};}
  if (!Object.hasOwn(FURNITURE, type)) throw new Error('Unknown furniture');
  return markFurniture(FURNITURE[type].make(), type);
}

/* ================= 组装 ================= */
export function buildProps() {
  const group = new THREE.Group();

  const rug = makeRug(); rug.position.set(-0.18, 0, 0.42); group.add(rug);

  const bed = makeBed();
  bed.position.set(-2.52, 0, -2.32); group.add(bed);

  const nightstand = makeNightstand();
  nightstand.position.set(-3.16, 0, -0.92); group.add(nightstand);
  group.add(shadowDecal(2.3, 1.0, 0.22).translateX(-2.0).translateZ(-0.95));

  const desk = makeDesk();
  desk.position.set(0.62, 0, -2.92); group.add(desk);

  const chair = makeChair();
  chair.userData.seat = { heading: Math.PI, height: 0.53 };
  chair.name = 'computer-chair';
  chair.position.set(0.58, 0, -2.18); chair.rotation.y = Math.PI; group.add(chair);

  const shelf = makeBookshelf();
  shelf.position.set(-3.24, 0, 2.15); shelf.rotation.y = Math.PI / 2; group.add(shelf);

  const lamp = makeFloorLamp();
  lamp.position.set(2.62, 0, -2.32); group.add(lamp);

  const pendant = makePendant();
  pendant.position.set(-0.18, 0, 0.55); group.add(pendant);

  const bean = makeBeanbag();
  bean.position.set(1.78, 0, 1.62); bean.rotation.y = -0.5; group.add(bean);

  const table = makeSideTable();
  table.position.set(-2.5, 0, 2.72); group.add(table);
  const bowlFish = table.userData.bowl?.userData?.fish;

  const monstera = makeMonstera();
  monstera.position.set(2.02, 0, -2.92); monstera.scale.setScalar(1.05); group.add(monstera);

  const plant2 = makeSmallPlant(0x6fa87e);
  plant2.position.set(2.95, 0, -0.75); plant2.scale.setScalar(1.25); group.add(plant2);

  const poster = makePoster();
  poster.position.set(1.9, 1.62, -3.40); group.add(poster);

  const clock = makeClock();
  clock.position.set(-3.39, 2.06, -0.9); clock.rotation.y = Math.PI / 2; group.add(clock);

  const shelf2 = makeWallShelf();
  shelf2.position.set(2.72, 1.84, -3.38); group.add(shelf2);

  const hanging = makeHangingPlant();
  hanging.position.set(2.95, 2.28, -3.30); group.add(hanging);

  const cushion = setShadow(new THREE.Mesh(rbox(0.46, 0.12, 0.46, 0.05, 3), fabric(0xe8b48c)));
  cushion.position.set(0.85, 0.065, 1.9); cushion.rotation.y = 0.4; group.add(cushion);

  // 前排：地垫 + 托盘 + 零食
  const mat2 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.15), new THREE.MeshStandardMaterial({ color: 0xdfc3a4, roughness: 1 }));
  mat2.rotation.x = -Math.PI / 2; mat2.position.set(-1.2, 0.007, 1.95); mat2.scale.set(0.72, 0.72, 1); mat2.receiveShadow = true;
  group.add(mat2);
  const tray = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.035, 28), clay(P.woodLight, { roughness: 0.55 })));
  tray.position.set(-1.15, 0.03, 1.9); group.add(tray);
  for (let i = 0; i < 3; i++) {
    const snap = setShadow(new THREE.Mesh(rbox(0.11, 0.03, 0.07, 0.012, 3), clay([0xf0b17a, 0xe8a06a, 0xf3c48d][i], { roughness: 0.75 })));
    snap.position.set(-1.22 + i * 0.08, 0.055, 1.88 + i * 0.03); snap.rotation.y = 0.4 * i; group.add(snap);
  }
  const cup2 = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.085, 18), clay(0xf6ead8, { roughness: 0.4 })));
  cup2.position.set(-1.34, 0.075, 2.06); group.add(cup2);

  // 散落的书
  const floorBooks = new THREE.Group();
  [[0x8fb0d8, 0.26, 0.03, 0.19], [0xd98c6a, 0.23, 0.028, 0.17]].forEach(([c, w, h, d], i) => {
    const b = setShadow(new THREE.Mesh(rbox(w, h, d, 0.006, 2), clay(c, { roughness: 0.9 })));
    b.position.set(0, i * h, 0); b.rotation.y = i * 0.22;
    floorBooks.add(b);
  });
  floorBooks.position.set(-0.95, 0.012, 1.55); group.add(floorBooks);

  // 前右角落：大盆栽
  const bigPlant = makeMonstera();
  bigPlant.position.set(-3.26, 0, 3.02); bigPlant.scale.setScalar(0.84); bigPlant.rotation.y = 1.35; group.add(bigPlant);

  // 床头墙面：大挂画
  const bigFrame = makePoster();
  bigFrame.scale.set(1.35, 1.35, 1.35);
  bigFrame.position.set(-3.38, 1.78, -2.30);
  bigFrame.rotation.y = Math.PI / 2;
  group.add(bigFrame);

  for (const [object, type] of [[bed,'bed'],[desk,'desk'],[chair,'chair'],[shelf,'shelf'],
    [lamp,'lamp'],[bean,'bean'],[table,'table'],[monstera,'plant'],[plant2,'smallPlant'],
    [bigPlant,'plant'],[nightstand,'nightstand'],[rug,'rug']]) markFurniture(object, type);

  group.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const sc = o.getWorldScale(new THREE.Vector3());
    const r = (o.geometry.boundingSphere?.radius ?? 1) * Math.max(sc.x, sc.y, sc.z);
    o.castShadow = !!o.castShadow && !o.material.transparent && r > 0.13;
    o.receiveShadow = true;
  });

  function update(dt, t) {
    if (bowlFish) {
      const a = t * 0.9;
      bowlFish.position.set(Math.cos(a) * 0.08, 0.15 + Math.sin(t * 1.6) * 0.012, Math.sin(a) * 0.08);
      bowlFish.rotation.y = -a;
    }
  }

  return {
    group,
    update,
    anchors: {
      bed: new THREE.Vector3(-2.45, 0.66, -2.32),
      rug: new THREE.Vector3(-0.18, 1.10, 0.42),
      lamp: new THREE.Vector3(2.62, 0, -2.32),
      table: new THREE.Vector3(2.62, 0.62, 0.62),
      pendant: new THREE.Vector3(-0.18, 0, 0.55),
      bowl: table.userData.bowl,
    },
  };
}
