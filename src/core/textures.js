import * as THREE from 'three';

const cv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rnd = (a, b) => a + Math.random() * (b - a);

function tex(canvas, { repeat = [1, 1], srgb = true, aniso = 8, wrap = THREE.RepeatWrapping } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = wrap;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/* ---------------- 木地板 ---------------- */
export function woodFloorTexture({ size = 1024, rows = 7 } = {}) {
  const c = cv(size); const g = c.getContext('2d');
  const rowH = size / rows;
  g.fillStyle = '#c19a72'; g.fillRect(0, 0, size, size);

  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    // 每行随机切分成 2~3 块木板
    const off = rnd(0, size);
    const cuts = [0, ...Array.from({ length: 2 }, () => rnd(0.2, 0.8)).sort((a, b) => a - b).map((v) => v * size), size];
    for (let k = 0; k < cuts.length - 1; k++) {
      const x0 = cuts[k], x1 = cuts[k + 1];
      const tone = rnd(-16, 14);
      const base = 188 + tone;
      g.fillStyle = `rgb(${base},${base * 0.845},${base * 0.715})`;
      g.globalAlpha = 0.85;
      g.fillRect(x0 + 1, y + 1, x1 - x0 - 2, rowH - 2);
      g.globalAlpha = 1;
      // 木纹
      const grainCount = 26;
      for (let i = 0; i < grainCount; i++) {
        const gy = y + rnd(3, rowH - 3);
        const amp = rnd(0.5, 3.2);
        g.strokeStyle = `rgba(${104 + rnd(-20, 40)},${80 + rnd(-16, 30)},${58 + rnd(-12, 24)},${rnd(0.04, 0.13)})`;
        g.lineWidth = rnd(0.6, 1.9);
        g.beginPath();
        for (let x = x0; x <= x1; x += 8) {
          const yy = gy + Math.sin((x + off) * rnd(0.01, 0.02) + i) * amp;
          if (x === x0) g.moveTo(x, yy); else g.lineTo(x, yy);
        }
        g.stroke();
      }
      // 端部接缝
      g.fillStyle = 'rgba(70,42,24,.42)';
      g.fillRect(x1 - 1.2, y, 2.4, rowH);
    }
    // 行缝
    g.fillStyle = 'rgba(70,42,24,.42)'; g.fillRect(0, y + rowH - 2, size, 2.6);
  }
  // 整体明暗呼吸
  const img = g.getImageData(0, 0, size, size); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    d[i] += n; d[i + 1] += n * 0.9; d[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* ---------------- 墙面灰泥 ---------------- */
export function plasterTexture({ size = 512, base = [246, 232, 213] } = {}) {
  const c = cv(size); const g = c.getContext('2d');
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(0, 0, size, size);
  // 抹刀痕
  for (let i = 0; i < 90; i++) {
    const x = rnd(0, size), y = rnd(0, size), w = rnd(40, 220), h = rnd(20, 90);
    g.save(); g.translate(x, y); g.rotate(rnd(-0.6, 0.6));
    g.fillStyle = `rgba(${base[0] - rnd(0, 26)},${base[1] - rnd(0, 26)},${base[2] - rnd(0, 24)},${rnd(0.03, 0.1)})`;
    g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  // 细颗粒
  const img = g.getImageData(0, 0, size, size); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 9;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* ---------------- 地毯 ---------------- */
export function rugTexture({ size = 512 } = {}) {
  const c = cv(size); const g = c.getContext('2d');
  g.fillStyle = '#e9cdae'; g.fillRect(0, 0, size, size);
  // 外边框
  g.strokeStyle = '#c98f7a'; g.lineWidth = size * 0.035;
  g.strokeRect(size * 0.07, size * 0.07, size * 0.86, size * 0.86);
  g.strokeStyle = 'rgba(201,143,122,.55)'; g.lineWidth = size * 0.012;
  g.strokeRect(size * 0.115, size * 0.115, size * 0.77, size * 0.77);
  // 中心菱形
  g.save(); g.translate(size / 2, size / 2); g.rotate(Math.PI / 4);
  g.strokeStyle = 'rgba(201,143,122,.6)'; g.lineWidth = size * 0.014;
  const s = size * 0.26;
  g.strokeRect(-s, -s, s * 2, s * 2);
  g.strokeRect(-s * 0.62, -s * 0.62, s * 1.24, s * 1.24);
  g.restore();
  // 小点阵
  g.fillStyle = 'rgba(201,143,122,.42)';
  const step = size / 18;
  for (let x = step; x < size; x += step) for (let y = step; y < size; y += step) {
    if (Math.abs(x - size / 2) < size * 0.3 && Math.abs(y - size / 2) < size * 0.3) continue;
    g.beginPath(); g.arc(x, y, size * 0.006, 0, Math.PI * 2); g.fill();
  }
  // 织物噪点
  const img = g.getImageData(0, 0, size, size); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  return c;
}

/* ---------------- 窗外黄昏天空 ---------------- */
export function skyTexture({ w = 1024, h = 768 } = {}) {
  const c = cv(w, h); const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, '#5a5a9e');
  grad.addColorStop(0.32, '#9a76b8');
  grad.addColorStop(0.55, '#f08a86');
  grad.addColorStop(0.72, '#ffb072');
  grad.addColorStop(0.86, '#ffd79a');
  grad.addColorStop(1.0, '#ffe9c0');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);

  // 太阳
  const sx = w * 0.58, sy = h * 0.60;
  const sun = g.createRadialGradient(sx, sy, 0, sx, sy, w * 0.3);
  sun.addColorStop(0, 'rgba(255,246,226,1)');
  sun.addColorStop(0.07, 'rgba(255,238,196,.95)');
  sun.addColorStop(0.25, 'rgba(255,196,130,.40)');
  sun.addColorStop(1, 'rgba(255,170,120,0)');
  g.fillStyle = sun; g.beginPath(); g.arc(sx, sy, w * 0.3, 0, Math.PI * 2); g.fill();

  // 云带
  for (let i = 0; i < 16; i++) {
    const y = rnd(h * 0.18, h * 0.62), x = rnd(-w * 0.1, w);
    const cw = rnd(w * 0.12, w * 0.42), ch = rnd(6, 26);
    const cg = g.createLinearGradient(0, y - ch, 0, y + ch);
    cg.addColorStop(0, 'rgba(255,234,214,.55)');
    cg.addColorStop(0.5, 'rgba(255,198,178,.38)');
    cg.addColorStop(1, 'rgba(255,170,160,0)');
    g.fillStyle = cg;
    g.beginPath(); g.ellipse(x, y, cw, ch, 0, 0, Math.PI * 2); g.fill();
  }
  // 远处城市剪影
  g.fillStyle = 'rgba(92,66,108,.5)';
  let x = 0;
  while (x < w) {
    const bw = rnd(14, 46), bh = rnd(16, h * 0.15);
    g.fillRect(x, h - bh - h * 0.02, bw, bh);
    x += bw + rnd(3, 12);
  }
  g.fillStyle = 'rgba(72,50,88,.75)'; g.fillRect(0, h - h * 0.02, w, h * 0.02);
  // 星星点点
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${rnd(0.1, 0.5)})`;
    g.beginPath(); g.arc(rnd(0, w), rnd(0, h * 0.3), rnd(0.6, 1.8), 0, Math.PI * 2); g.fill();
  }
  return c;
}

/* ---------------- 接触阴影 ---------------- */
export function contactShadowTexture({ size = 256, strength = 1 } = {}) {
  const c = cv(size); const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(30,18,40,${0.55 * strength})`);
  grad.addColorStop(0.45, `rgba(30,18,40,${0.3 * strength})`);
  grad.addColorStop(1, 'rgba(30,18,40,0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  return c;
}

/* ---------------- 光束 ---------------- */
export function lightShaftTexture({ w = 128, h = 512 } = {}) {
  const c = cv(w, h); const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,226,180,.55)');
  grad.addColorStop(0.45, 'rgba(255,206,150,.22)');
  grad.addColorStop(1, 'rgba(255,190,140,0)');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  // 横向柔化
  const gx = g.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.2, 'rgba(0,0,0,0)');
  gx.addColorStop(0.8, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h);
  return c;
}

/* ---------------- 通用：噪点（法线/粗糙度用） ---------------- */
export function noiseTexture({ size = 256 } = {}) {
  const c = cv(size); const g = c.getContext('2d');
  const img = g.createImageData(size, size); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 90;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* ---------------- 书脊配色 ---------------- */
export const BOOK_COLORS = ['#d98c6a', '#7fa8c9', '#e8c48d', '#93b58f', '#c98b9f', '#8f86b8', '#d9b26a', '#6f9fa8'];

export { tex };
