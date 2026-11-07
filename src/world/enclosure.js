import * as THREE from 'three';
import { plasterTexture, tex } from '../core/textures.js';
import { clay } from '../core/materials.js';
import { P } from '../core/palette.js';

// 等距相机从 +x/+z 方向看，所以室内永远缺这两面墙（或只留 0.24m 矮墙）。
const OPEN_SIDES = ['south', 'east'];
const WALL_H = 2.7;
const WALL_T = 0.12;
const DOOR_H = 2.1;

function doorGradient() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 192;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#4a3f63');
  grad.addColorStop(0.35, '#241d34');
  grad.addColorStop(1, '#0f0c18');
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  const glow = g.createRadialGradient(c.width / 2, c.height * 0.88, 6, c.width / 2, c.height * 0.88, c.width * 0.72);
  glow.addColorStop(0, 'rgba(255,196,140,.45)');
  glow.addColorStop(1, 'rgba(255,196,140,0)');
  g.fillStyle = glow; g.fillRect(0, 0, c.width, c.height);
  return c;
}

function segments(from, to, openings) {
  const out = [];
  let cursor = from;
  for (const opening of [...openings].sort((a, b) => a.center - b.center)) {
    const start = opening.center - opening.width / 2;
    const end = opening.center + opening.width / 2;
    if (start > cursor) out.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < to) out.push([cursor, to]);
  return out.filter(([a, b]) => b - a > 0.01);
}

/**
 * 第一视角室内补墙：只补相机侧（南 +z / 东 +x）两面墙 + 天花板，
 * 北/西两面交给场景原有墙体。castShadow=false，不改变现有光照。
 * @param {object} template 场景模板（kind 必须为 indoor）
 * @param {string[]} linkedSlots 当前场景已连通的门槽 id，只有这些槽位会开口
 */
export function buildEnclosure(template, linkedSlots = []) {
  const group = new THREE.Group();
  group.name = 'first-person-enclosure';
  group.userData.enclosure = true;
  group.userData.fpOnly = true;
  if (!template || template.kind !== 'indoor') return group;

  const b = template.bounds;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const halfX = (b.x1 - b.x0) / 2, halfZ = (b.z1 - b.z0) / 2;

  const wallMat = new THREE.MeshStandardMaterial({
    map: tex(plasterTexture({ size: 512 }), { repeat: [2.4, 1.5] }),
    roughness: 0.97, metalness: 0, envMapIntensity: 0.55, color: 0xf6e9d6,
  });
  const ceilingMat = new THREE.MeshStandardMaterial({
    map: tex(plasterTexture({ size: 512 }), { repeat: [2.4, 2.4] }),
    roughness: 0.96, metalness: 0, envMapIntensity: 0.9, emissive: 0x3b2d22, emissiveIntensity: 0.55, color: 0xeddfc9,
  });
  const trimMat = clay(P.trim, { roughness: 0.9 });
  const doorMat = new THREE.MeshBasicMaterial({ map: tex(doorGradient(), { wrap: THREE.ClampToEdgeWrapping }) });

  const addBox = (w, h, d, x, y, z, material = wallMat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.fpEnclosure = true;
    group.add(mesh);
    return mesh;
  };

  const slots = template.portalSlots || [];
  const sides = [
    { side: 'south', alongX: true, fixed: cz + (halfZ - WALL_T / 2), from: cx - halfX, to: cx + halfX },
    { side: 'east', alongX: false, fixed: cx + (halfX - WALL_T / 2), from: cz - halfZ, to: cz + halfZ },
  ];

  for (const { side, alongX, fixed, from, to } of sides) {
    const openings = slots
      .filter((slot) => slot.side === side && linkedSlots.includes(slot.slotId))
      .map((slot) => ({ center: slot.position[alongX ? 0 : 2], width: slot.width ?? 1.2 }));

    for (const [segFrom, segTo] of segments(from, to, openings)) {
      const len = segTo - segFrom;
      const center = (segFrom + segTo) / 2;
      if (alongX) addBox(len, WALL_H, WALL_T, center, WALL_H / 2, fixed);
      else addBox(WALL_T, WALL_H, len, fixed, WALL_H / 2, center);
      // 踢脚
      if (alongX) addBox(len, 0.12, 0.02, center, 0.06, fixed - (WALL_T / 2 + 0.01), trimMat);
      else addBox(0.02, 0.12, len, fixed - (WALL_T / 2 + 0.01), 0.06, center, trimMat);
    }

    for (const opening of openings) {
      const { center, width } = opening;
      const lintelH = WALL_H - DOOR_H;
      if (alongX) addBox(width, lintelH, WALL_T, center, DOOR_H + lintelH / 2, fixed);
      else addBox(WALL_T, lintelH, width, fixed, DOOR_H + lintelH / 2, center);

      const jamb = 0.06;
      for (const s of [-1, 1]) {
        const off = center + s * (width / 2 + jamb / 2);
        if (alongX) addBox(jamb, DOOR_H, WALL_T + 0.04, off, DOOR_H / 2, fixed, trimMat);
        else addBox(WALL_T + 0.04, DOOR_H, jamb, fixed, DOOR_H / 2, off, trimMat);
      }
      if (alongX) addBox(width + jamb * 2, jamb, WALL_T + 0.04, center, DOOR_H + jamb / 2, fixed, trimMat);
      else addBox(WALL_T + 0.04, jamb, width + jamb * 2, fixed, DOOR_H + jamb / 2, center, trimMat);

      // 门洞暗面：只挡视线，不挡传送
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.02, DOOR_H - 0.02), doorMat);
      if (alongX) {
        panel.position.set(center, DOOR_H / 2, fixed);
        panel.rotation.y = 0;
      } else {
        panel.position.set(fixed, DOOR_H / 2, center);
        panel.rotation.y = -Math.PI / 2;
      }
      panel.userData.fpEnclosure = true;
      group.add(panel);
    }
  }

  // 天花板
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2, halfZ * 2), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(cx, WALL_H, cz);
  ceiling.receiveShadow = true;
  ceiling.userData.fpEnclosure = true;
  group.add(ceiling);

  // 顶线脚（只沿补出来的两面墙）
  addBox(halfX * 2, 0.1, 0.05, cx, WALL_H - 0.06, cz + (halfZ - WALL_T / 2), trimMat);
  addBox(0.05, 0.1, halfZ * 2, cx + (halfX - WALL_T / 2), WALL_H - 0.06, cz, trimMat);
  return group;
}

/** 懒建并缓存到场景配置上；active=false 时只隐藏，不销毁 */
export function showEnclosure(cfg, active, linkedSlots = []) {
  if (!cfg) return null;
  if (!cfg.template || cfg.template.kind !== 'indoor') {
    if (cfg.fpEnclosure) cfg.fpEnclosure.visible = false;
    return null;
  }
  const signature = [...linkedSlots].sort().join(',');
  if (!cfg.fpEnclosure || cfg.fpEnclosureSignature !== signature) {
    cfg.fpEnclosure?.removeFromParent();
    cfg.fpEnclosure = buildEnclosure(cfg.template, linkedSlots);
    cfg.fpEnclosureSignature = signature;
    cfg.root.add(cfg.fpEnclosure);
  }
  cfg.fpEnclosure.visible = !!active;
  return cfg.fpEnclosure;
}
