import * as THREE from 'three';

const canvasTex = (draw, size = 128) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const softDot = () => canvasTex((g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,240,220,.55)');
  grd.addColorStop(1, 'rgba(255,230,200,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
});

const footDustTex = () => canvasTex((g, s) => {
  for (const [x, y, r] of [[.38, .54, .31], [.59, .46, .32], [.61, .65, .22], [.43, .32, .22]]) {
    const cloud = g.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s);
    cloud.addColorStop(0, 'rgba(214,191,151,.58)');
    cloud.addColorStop(.45, 'rgba(200,178,140,.32)');
    cloud.addColorStop(1, 'rgba(200,178,140,0)');
    g.fillStyle = cloud;
    g.fillRect(0, 0, s, s);
  }
}, 64);

const heartTex = () => canvasTex((g, s) => {
  g.translate(s / 2, s / 2);
  g.fillStyle = '#ff8fab';
  g.beginPath();
  const k = s / 34;
  g.moveTo(0, 9 * k);
  g.bezierCurveTo(-14 * k, -2 * k, -7 * k, -14 * k, 0, -6 * k);
  g.bezierCurveTo(7 * k, -14 * k, 14 * k, -2 * k, 0, 9 * k);
  g.fill();
}, 96);

const starTex = () => canvasTex((g, s) => {
  g.translate(s / 2, s / 2);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
  grd.addColorStop(0, 'rgba(255,255,235,1)');
  grd.addColorStop(0.25, 'rgba(255,232,180,.7)');
  grd.addColorStop(1, 'rgba(255,210,150,0)');
  g.fillStyle = grd; g.fillRect(-s / 2, -s / 2, s, s);
  g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    g.beginPath(); g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42);
    g.stroke();
  }
}, 96);

const bubbleTex = () => canvasTex((g, s) => {
  const grd = g.createRadialGradient(s * 0.4, s * 0.38, s * 0.06, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,.95)');
  grd.addColorStop(0.55, 'rgba(210,240,255,.35)');
  grd.addColorStop(0.86, 'rgba(190,230,255,.55)');
  grd.addColorStop(1, 'rgba(180,220,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2); g.fill();
});

const zTex = () => canvasTex((g, s) => {
  g.fillStyle = '#dfe8ff';
  g.font = `bold ${s * 0.62}px "PingFang SC", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('z', s / 2, s / 2);
}, 96);

class SpritePool {
  constructor(scene, tex, count, { size = 0.18, additive = true } = {}) {
    this.items = [];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        opacity: 0,
      });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      sp.scale.setScalar(size);
      scene.add(sp);
      this.items.push({ sp, life: 0, max: 1, vel: new THREE.Vector3(), spin: 0, size, fade: 1 });
    }
  }
  spawn(pos, { vel, life = 1.2, size = 0.16, fade = 1 }) {
    const it = this.items.find((i) => i.life <= 0) || this.items[0];
    it.sp.position.copy(pos);
    it.sp.visible = true;
    it.sp.material.opacity = 1;
    it.sp.scale.setScalar(size * 0.4);
    it.vel.copy(vel);
    it.life = life; it.max = life; it.size = size; it.fade = fade;
    return it;
  }
  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.sp.visible = false; it.sp.material.opacity = 0; continue; }
      const k = 1 - it.life / it.max;
      it.sp.position.addScaledVector(it.vel, dt);
      it.sp.scale.setScalar(it.size * (0.35 + Math.sin(Math.min(1, k * 2.2) * Math.PI / 2) * 0.75));
      it.sp.material.opacity = Math.min(1, (1 - k) * 1.6) * it.fade;
    }
  }
  clear() {
    for (const item of this.items) {
      item.life = 0;
      item.sp.visible = false;
    }
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.heartPool = new SpritePool(scene, heartTex(), 18, { size: 0.2, additive: false });
    this.sparklePool = new SpritePool(scene, starTex(), 24, { size: 0.16 });
    this.bubblePool = new SpritePool(scene, bubbleTex(), 40, { size: 0.12, additive: false });
    this.zzzPool = new SpritePool(scene, zTex(), 10, { size: 0.16, additive: false });
    this.footDustPool = new SpritePool(scene, footDustTex(), 24, { additive: false });
    this.footPosition = new THREE.Vector3();
    this.footVelocity = new THREE.Vector3();
    this.footDistance = 0;
    this.footSide = 1;

    /* 尘埃 */
    const N = 130;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    this.dust = [];
    for (let i = 0; i < N; i++) {
      const p = new THREE.Vector3(
        -3.3 + Math.random() * 6.6,
        0.35 + Math.random() * 2.3,
        -3.2 + Math.random() * 6.4
      );
      pos.set([p.x, p.y, p.z], i * 3);
      this.dust.push({ p, phase: Math.random() * Math.PI * 2, speed: 0.06 + Math.random() * 0.1 });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dustTex = softDot();
    const dustMat = new THREE.PointsMaterial({
      map: dustTex, size: 0.045, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.5, color: 0xffe0b8, sizeAttenuation: true,
    });
    this.dustPoints = new THREE.Points(geo, dustMat);
    this.dustPoints.frustumCulled = false;
    scene.add(this.dustPoints);

    /* 点击地面涟漪 */
    this.ripples = [];
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.24, 0.3, 48),
        new THREE.MeshBasicMaterial({ color: 0xffe3bd, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      ring.visible = false;
      scene.add(ring);
      this.ripples.push({ mesh: ring, life: 0 });
    }

    this._v = new THREE.Vector3();
  }

  ripple(pos) {
    const r = this.ripples.find((i) => i.life <= 0) || this.ripples[0];
    r.life = 0.9;
    r.mesh.position.set(pos.x, 0.02, pos.z);
    r.mesh.visible = true;
    r.mesh.scale.setScalar(0.6);
    r.mesh.material.opacity = 0.7;
  }
  splash(pos) {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      this.bubblePool.spawn(pos, {
        vel: new THREE.Vector3(Math.cos(a) * 0.35, 0.45 + Math.random() * 0.4, Math.sin(a) * 0.35),
        life: 0.8 + Math.random() * 0.6, size: 0.08 + Math.random() * 0.08, fade: 0.9,
      });
    }
  }
  burst(pos, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      this.sparklePool.spawn(pos, {
        vel: new THREE.Vector3(Math.cos(a) * 0.9, 0.7 + Math.random() * 0.7, Math.sin(a) * 0.9),
        life: 0.7 + Math.random() * 0.5, size: 0.1 + Math.random() * 0.09,
      });
    }
  }
  hearts(pos, n = 5) {
    for (let i = 0; i < n; i++) {
      this.heartPool.spawn(
        this._v.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.1 + Math.random() * 0.25, (Math.random() - 0.5) * 0.4)),
        {
          vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.55 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3),
          life: 1.1 + Math.random() * 0.6, size: 0.14 + Math.random() * 0.1,
        }
      );
    }
  }
  zzz(pos) {
    this.zzzPool.spawn(pos, { vel: new THREE.Vector3(0.15, 0.28, 0.05), life: 2.4, size: 0.17, fade: 0.75 });
  }

  trackFootsteps(visual, outdoor, onStep) {
    const [x, y, z] = visual.position;
    const dx = x - this.footPosition.x, dz = z - this.footPosition.z;
    this.footPosition.set(x, y, z);
    const distance = Math.hypot(dx, dz);
    if (this.footScene !== visual.sceneId || distance > .65) {
      this.footScene = visual.sceneId;
      this.footDistance = 0;
      this.footDustPool.clear();
      return;
    }
    if ((!outdoor && !onStep) || visual.pose !== 'walking' || !visual.moving || visual.grounded === false || visual.crawl) {
      this.footDistance = 0;
      return;
    }
    if (distance < .001) return;
    const fast = visual.sprint || visual.speed > 4.2;
    const stride = fast ? .92 : .60;
    this.footDistance += distance;
    if (this.footDistance < stride) return;
    this.footDistance -= stride;
    this.footSide *= -1;
    onStep?.(this.footSide);
    if (!outdoor) return;
    const forwardX = dx / distance, forwardZ = dz / distance;
    const count = fast ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const side = this.footSide * .12 + (i - 1) * .065;
      const behind = .12 + i * .045;
      this._v.set(x + forwardZ * side - forwardX * behind, y + .035, z - forwardX * side - forwardZ * behind);
      this.footVelocity.set(-forwardX * .25 + forwardZ * side, .11 + .05 * i, -forwardZ * .25 - forwardX * side);
      this.footDustPool.spawn(this._v, {
        vel: this.footVelocity, life: .36 + i * .065,
        size: (fast ? .29 : .22) + i * .035, fade: fast ? .64 : .53,
      });
    }
  }

  update(dt, t) {
    this.heartPool.update(dt);
    this.sparklePool.update(dt);
    this.bubblePool.update(dt);
    this.zzzPool.update(dt);
    this.footDustPool.update(dt);

    // 尘埃漂移
    const attr = this.dustPoints.geometry.attributes.position;
    for (let i = 0; i < this.dust.length; i++) {
      const d = this.dust[i];
      d.p.x += Math.sin(t * 0.22 + d.phase) * d.speed * dt;
      d.p.y += (Math.cos(t * 0.3 + d.phase) * 0.5 + 0.15) * d.speed * dt;
      d.p.z += Math.cos(t * 0.18 + d.phase * 1.7) * d.speed * dt;
      if (d.p.y > 2.7) d.p.y = 0.3;
      if (d.p.x > 3.4) d.p.x = -3.4; if (d.p.x < -3.4) d.p.x = 3.4;
      if (d.p.z > 3.3) d.p.z = -3.3; if (d.p.z < -3.3) d.p.z = 3.3;
      attr.setXYZ(i, d.p.x, d.p.y, d.p.z);
    }
    attr.needsUpdate = true;
    this.dustPoints.material.opacity = 0.35 + Math.sin(t * 0.6) * 0.08;

    for (const r of this.ripples) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - r.life / 0.9;
      r.mesh.scale.setScalar(0.6 + k * 2.6);
      r.mesh.material.opacity = 0.65 * (1 - k);
      if (r.life <= 0) r.mesh.visible = false;
    }
  }
}
