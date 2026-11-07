import * as THREE from 'three';
import { P } from '../core/palette.js';
import { contactShadowTexture, tex } from '../core/textures.js';
import { damp, clamp } from '../core/anim.js';

const smoothstep = (x, a, b) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ---------------- 身体：胖胖的鲸（顶点变形 + 顶点色肚子） ---------------- */
function makeBodyGeometry() {
  const geo = new THREE.SphereGeometry(0.5, 72, 56);
  const pos = geo.attributes.position;
  const base = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const tBack = clamp(-v.z / 0.5, 0, 1);
    const taper = 1 - 0.34 * smoothstep(tBack, 0.42, 1.0);
    const widen = 1 + 0.14 * smoothstep(v.y, 0.22, -0.5);       // 下盘更胖
    const headLift = 1 + 0.05 * smoothstep(v.y, 0.1, 0.5);       // 头顶略饱满
    v.x *= 1.04 * taper * widen;
    v.y *= headLift * (taper * 0.92 + 0.08);
    v.z *= 1.02 * (1 - 0.03 * smoothstep(tBack, 0.3, 1.0));
    pos.setXYZ(i, v.x, v.y, v.z);
    base[i * 3] = v.x; base[i * 3 + 1] = v.y; base[i * 3 + 2] = v.z;
  }
  geo.computeVertexNormals();

  const colors = new Float32Array(pos.count * 3);
  const cBody = new THREE.Color(P.body);
  const cBelly = new THREE.Color(0xe6eeff);
  const cBack = new THREE.Color(P.bodyDark);
  const c = new THREE.Color();
  const dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
    dir.copy(v).normalize();
    const e = (v.x / 0.40) ** 2 + ((v.y + 0.085) / 0.36) ** 2;
    const front = smoothstep(dir.z, 0.02, 0.55);
    const m = Math.pow(clamp(1 - e, 0, 1), 1.25) * front;
    const backAO = smoothstep(-dir.z, 0.3, 0.95) * 0.5 + smoothstep(-v.y, 0.15, 0.55) * 0.5;
    c.copy(cBody).lerp(cBack, backAO * 0.5);
    c.lerp(cBelly, m);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/* ---------------- 材质 ---------------- */
const vinyl = (color, o = {}) => new THREE.MeshStandardMaterial({
  color, roughness: o.roughness ?? 0.40, metalness: 0.02, envMapIntensity: 0.9,
  ...o.extra,
});
const eyeWhiteMat = vinyl(0xf7f8ff, { roughness: 0.30, extra: { envMapIntensity: 0.9 } });
const pupilMat = vinyl(P.pupil, { roughness: 0.12, extra: { metalness: 0.1, envMapIntensity: 1.3 } });
const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const blushMat = new THREE.MeshStandardMaterial({ color: P.blush, roughness: 0.95, transparent: true, opacity: 0.9, envMapIntensity: 0.2 });
const mouthMat = new THREE.MeshStandardMaterial({ color: P.mouth, roughness: 0.55 });

/* ---------------- 小嘴：一段微笑的管子 ---------------- */
function makeMouthGeo() {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.055, 0.012, 0),
    new THREE.Vector3(0, -0.035, 0.012),
    new THREE.Vector3(0.055, 0.012, 0)
  );
  return new THREE.TubeGeometry(curve, 16, 0.0085, 8, false);
}

export class Whale {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'whale';
    this.tilt = new THREE.Group();
    this.bob = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.group.add(this.tilt);
    this.tilt.add(this.bob);
    this.bob.add(this.bodyGroup);

    // 身体（顶点色）
    const bodyMat = new THREE.MeshStandardMaterial({
      vertexColors: true, color: 0xffffff, roughness: 0.52, metalness: 0.0, envMapIntensity: 0.55,
    });
    this.body = new THREE.Mesh(makeBodyGeometry(), bodyMat);
    this.body.castShadow = true; this.body.receiveShadow = true;
    this.bodyGroup.add(this.body);

    // 实体材质（鳍/尾，避免顶点色缺失）
    this.solid = vinyl(P.body, { roughness: 0.52, extra: { envMapIntensity: 0.55 } });
    this.solidDark = vinyl(P.bodyDark, { roughness: 0.54, extra: { envMapIntensity: 0.5 } });

    /* 眼睛 */
    this.eyes = [];
    const eyeGeo = new THREE.SphereGeometry(0.076, 32, 24);
    const pupilGeo = new THREE.SphereGeometry(0.055, 26, 20);
    const shineGeo = new THREE.SphereGeometry(0.013, 12, 10);
    const shine2Geo = new THREE.SphereGeometry(0.006, 8, 8);
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(0.152 * s, 0.135, 0.438);
      g.rotation.y = 0.13 * s;
      const white = new THREE.Mesh(eyeGeo, eyeWhiteMat);
      white.scale.set(1, 1.12, 0.55);
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(0.002 * s, 0, 0.030);
      pupil.scale.set(1, 1.10, 0.5);
      const sh = new THREE.Mesh(shineGeo, shineMat);
      sh.position.set(0.026, 0.030, 0.052);
      const sh2 = new THREE.Mesh(shine2Geo, shineMat);
      sh2.position.set(-0.020, -0.022, 0.050);
      g.add(white, pupil, sh, sh2);
      g.userData.pupil = pupil;
      this.eyes.push(g);
      this.bodyGroup.add(g);
    }

    /* 腮红 */
    this.blushes = [];
    const blushGeo = new THREE.SphereGeometry(0.068, 22, 16);
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(blushGeo, blushMat.clone());
      b.scale.set(1.0, 0.58, 0.20);
      b.position.set(0.240 * s, -0.005, 0.452);
      b.rotation.y = 0.46 * s;
      b.rotation.z = -0.14 * s;
      this.blushes.push(b);
      this.bodyGroup.add(b);
    }

    /* 嘴巴 */
    this.mouth = new THREE.Mesh(makeMouthGeo(), mouthMat);
    this.mouth.position.set(0, -0.050, 0.496);
    this.mouth.rotation.x = -0.10;
    this.bodyGroup.add(this.mouth);

    /* 胸鳍 */
    this.fins = [];
    const finGeo = new THREE.SphereGeometry(1, 24, 18);
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.46 * s, -0.10, 0.055);
      const m = new THREE.Mesh(finGeo, this.solid);
      m.scale.set(0.115, 0.245, 0.05);
      m.position.set(0.095 * s, -0.09, 0.0);
      m.rotation.z = 0.62 * s;
      m.rotation.x = -0.15;
      m.castShadow = true;
      pivot.add(m);
      this.fins.push(pivot);
      this.bodyGroup.add(pivot);
    }

    /* 短尾柄 + 连续的扁平双叶尾鳍。尾柄向后伸，不再折向地面。 */
    this.tail = new THREE.Group();
    this.tail.position.set(0, -.10, -.43);
    this.tail.rotation.x = -.12;
    const stemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, .035),
      new THREE.Vector3(0, .018, -.10),
      new THREE.Vector3(0, .035, -.22),
    ]);
    const stemGeo = new THREE.TubeGeometry(stemCurve, 16, .055, 12, false);
    const stemPos = stemGeo.attributes.position;
    // Taper toward the fluke, keeping a rounded attachment to the body.
    for (let i=0;i<stemPos.count;i++) {
      const k=clamp((.035-stemPos.getZ(i))/.255,0,1);
      stemPos.setX(i,stemPos.getX(i)*(1-k*.32));
    }
    stemGeo.computeVertexNormals();
    const stem = new THREE.Mesh(stemGeo, this.solid); stem.castShadow=true;
    this.tail.add(stem);
    const outline = new THREE.Shape();
    outline.moveTo(0,.055);
    outline.bezierCurveTo(.075,.025,.18,.045,.34,-.14);
    outline.bezierCurveTo(.39,-.20,.37,-.24,.32,-.215);
    outline.bezierCurveTo(.22,-.16,.11,-.235,.025,-.125);
    outline.quadraticCurveTo(0,-.09,-.025,-.125);
    outline.bezierCurveTo(-.11,-.235,-.22,-.16,-.32,-.215);
    outline.bezierCurveTo(-.37,-.24,-.39,-.20,-.34,-.14);
    outline.bezierCurveTo(-.18,.045,-.075,.025,0,.055);
    const flukeGeo=new THREE.ExtrudeGeometry(outline,{depth:.025,bevelEnabled:true,bevelThickness:.015,bevelSize:.014,bevelSegments:3,curveSegments:16,steps:1});
    // Shape coordinates map to X/Z; thickness is along Y.
    flukeGeo.translate(0,0,-.0125);flukeGeo.rotateX(Math.PI/2);
    this.fluke=new THREE.Mesh(flukeGeo,this.solid);
    this.fluke.position.set(0,.035,-.22);this.fluke.castShadow=true;
    this.tail.add(this.fluke);this.bodyGroup.add(this.tail);

    /* 背鳍 */
    const dorsal = new THREE.Mesh(finGeo, this.solid);
    dorsal.scale.set(0.045, 0.175, 0.026);
    dorsal.position.set(0, 0.475, -0.19);
    dorsal.rotation.x = -0.62;
    dorsal.castShadow = true;
    this.bodyGroup.add(dorsal);

    /* 呆毛：头顶一撮小卷 */
    const ahogeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.475, 0.06),
      new THREE.Vector3(0.01, 0.56, 0.02),
      new THREE.Vector3(0.06, 0.60, -0.02),
      new THREE.Vector3(0.10, 0.565, 0.0),
    ]);
    const ahoge = new THREE.Mesh(new THREE.TubeGeometry(ahogeCurve, 18, 0.016, 8, false), this.solidDark);
    ahoge.castShadow = true;
    this.bodyGroup.add(ahoge);

    /* 自发光 */
    this.rim = new THREE.PointLight(0x8fb2ff, 0.55, 2.6, 2);
    this.rim.position.set(-0.45, 0.55, -0.55);
    this.group.add(this.rim);

    /* 接触阴影 */
    const shTex = tex(contactShadowTexture({ strength: 1 }), { wrap: THREE.ClampToEdgeWrapping });
    this.shadowMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0.7 });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.013;
    this.group.add(this.shadow);

    /* 状态 */
    this.baseY = 1.14;
    this.pos = new THREE.Vector3(0.05, this.baseY, 0.55);
    this.home = this.pos.clone();
    this.target = this.pos.clone();
    this.state = 'idle';
    this.stateTime = 0;
    this.velocity = new THREE.Vector3();
    this.speed = 0;
    this.turnRate = 0;
    this.heading = 0.92;
    this.lookAt = new THREE.Vector3();
    this.lookEnabled = true;
    this.blinkT = 1.4;
    this.blink = 0;
    this.breathe = 0;
    this.happyT = 0;
    this.chewT = 0;
    this.floatOffset = Math.random() * 10;
    this.onEffect = null;
    this.idleTime = 0; this.idleGesture = 0; this.gestureTimer = 4;
    this.tailPhase = 0; this.finPhase = 0;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  /* ----------- 行为 ----------- */
  swimTo(p, { fast = false } = {}) {
    this.target.set(p.x, p.y ?? this.baseY, p.z);
    if (!this.state.startsWith('sleep')) this.state = this.food ? 'eat' : 'swim';
    this.idleTime = 0;
    this.speedMax = fast ? 3.6 : 2.2;
  }
  pet() {
    this.state = 'pet'; this.stateTime = 0; this.happyT = 1.4;
    this.onEffect?.('hearts', this.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)));
  }
  feed(pellet) { this.state = 'eat'; this.food = pellet; this.chewT = 0; }
  sleep(pos) {
    this.state = 'sleep'; this.stateTime = 0;
    this.sleepPos = pos.clone();
    this.target.set(pos.x, pos.y, pos.z); this.speedMax = 1.9;
  }
  wake() {
    if (!this.state.startsWith('sleep')) return;
    this.state = 'swim';
    this.sleepT = 0;
    this.target.copy(this.home).setY(1.14);
    this.onEffect?.('sparkle', this.group.position.clone());
  }
  setLookAt(v) { this.lookEnabled = !!v; if (v) this.lookAt.copy(v); }

  /* ----------- 每帧 ----------- */
  update(dt, time) {
    this.stateTime += dt;
    this.breathe += dt;
    const b = this.bounds || { x0: -3.05, x1: 3.05, z0: -3.05, z1: 3.05 };

    /* Turn before accelerating; velocity eases into turns and brakes near arrival. */
    const toTarget = new THREE.Vector3().subVectors(this.target, this.pos);
    const dist = Math.hypot(toTarget.x, toTarget.z);
    const navigating = ['swim', 'eat', 'sleep'].includes(this.state);
    const desiredVelocity = new THREE.Vector3();
    if (navigating && dist > .075) {
      const desiredHeading = Math.atan2(toTarget.x, toTarget.z);
      const error = Math.atan2(Math.sin(desiredHeading-this.heading),Math.cos(desiredHeading-this.heading));
      const turn = clamp(error*4.2,-2.4,2.4);
      this.turnRate = damp(this.turnRate,turn,8,dt);
      this.heading += this.turnRate*dt;
      const alignment = Math.max(.04,Math.cos(error));
      const brakingSpeed = Math.sqrt(2*1.8*Math.max(0,dist-.06));
      const speed = Math.min(this.speedMax ?? 2.2,brakingSpeed)*alignment;
      desiredVelocity.set(Math.sin(this.heading)*speed,0,Math.cos(this.heading)*speed);
      this.idleTime = 0;
    } else {
      this.turnRate = damp(this.turnRate,0,7,dt);
      if (this.state==='swim' && this.velocity.length()<.1) this.state='idle';
      if (this.state==='sleep' && this.velocity.length()<.1) this.state='sleepArrive';
    }
    const easing = desiredVelocity.lengthSq()>.01?3.5:7;
    this.velocity.x=damp(this.velocity.x,desiredVelocity.x,easing,dt);
    this.velocity.z=damp(this.velocity.z,desiredVelocity.z,easing,dt);
    this.pos.addScaledVector(this.velocity,dt);
    this.speed=this.velocity.length();
    this.pos.x=clamp(this.pos.x,b.x0,b.x1);this.pos.z=clamp(this.pos.z,b.z0,b.z1);
    if (this.pos.x===b.x0 || this.pos.x===b.x1) this.velocity.x=0;
    if (this.pos.z===b.z0 || this.pos.z===b.z1) this.velocity.z=0;
    // Occasionally look around or flutter a fin; no autonomous movement during a command.
    if (this.state==='idle') {
      this.idleTime+=dt;this.gestureTimer-=dt;
      if (this.gestureTimer<=0) {this.idleGesture=1.8;this.gestureTimer=5+Math.random()*5;}
      if (this.idleTime>1.5 && this.idleGesture<=0) {
        const face=Math.PI/4;const error=Math.atan2(Math.sin(face-this.heading),Math.cos(face-this.heading));
        this.heading+=error*Math.min(1,dt*.7);
      }
    } else this.idleTime=0;
    this.idleGesture=Math.max(0,this.idleGesture-dt);
    const curious=this.state==='idle'?Math.sin((1.8-this.idleGesture)/1.8*Math.PI)*(this.idleGesture>0?1:0):0;

    /* 高度 */
    if (this.state === 'sleep' || this.state === 'sleepArrive') {
      this.sleepT = (this.sleepT || 0) + dt;
      this.pos.y = damp(this.pos.y, (this.sleepPos?.y ?? 0.62), 2.6, dt);
    } else {
      this.floatOffset += dt;
      const bob = Math.sin(this.floatOffset * 1.5) * 0.05 + Math.sin(this.floatOffset * 0.63 + 1.3) * 0.022;
      const eatingHeight=this.state==='eat' && this.food && !this.food.userData.served ? this.food.position.y+.22 : this.baseY;
      this.pos.y = damp(this.pos.y, eatingHeight + bob*(this.state==='eat'?.2:1), 3, dt);
    }

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;

    /* 姿态 */
    const t = time;
    const swimK = clamp(this.speed / 2.4, 0, 1);
    const idleK = 1 - swimK;
    const sway = Math.sin(t * 1.05) * 0.04 * idleK + Math.sin(t * 0.57) * 0.014;
    const pitch = -swimK * 0.17 + Math.sin(t * 1.33) * 0.022 * idleK;
    const bank = clamp(-this.turnRate * 0.16, -0.28, 0.28);

    if (this.state === 'sleep' || this.state === 'sleepArrive') {
      this.tilt.rotation.z = damp(this.tilt.rotation.z, 1.28, 2.6, dt);
      this.tilt.rotation.x = damp(this.tilt.rotation.x, 0.12, 2.6, dt);
      this.tilt.rotation.y = damp(this.tilt.rotation.y, 0.1, 2.6, dt);
      this.bob.position.y = Math.sin(this.stateTime * 1.15) * 0.012;
    } else if (this.state === 'pet') {
      const k = Math.min(1, this.stateTime / 1.1);
      const sq = Math.sin(k * Math.PI) * 0.13;
      this.tilt.rotation.z = Math.sin(k * Math.PI) * 0.12;
      this.tilt.rotation.x = -Math.sin(k * Math.PI) * 0.08;
      this.bodyGroup.scale.set(1 + sq * 0.7, 1 - sq, 1 + sq * 0.5);
      if (this.stateTime > 1.1) { this.state = 'idle'; }
    } else {
      this.tilt.rotation.z = damp(this.tilt.rotation.z, sway + bank + curious*.13, 5.5, dt);
      this.tilt.rotation.x = damp(this.tilt.rotation.x, pitch, 5.5, dt);
      this.tilt.rotation.y = damp(this.tilt.rotation.y, -this.turnRate * 0.2, 5.5, dt);
      const breatheY = 1 + Math.sin(this.breathe * 2.0) * 0.013 * idleK;
      this.bodyGroup.scale.y = damp(this.bodyGroup.scale.y, breatheY, 6, dt);
      this.bodyGroup.scale.x = damp(this.bodyGroup.scale.x, 2 - breatheY, 6, dt);
      this.bodyGroup.scale.z = damp(this.bodyGroup.scale.z,1,6,dt);
      this.bob.position.y = Math.sin(t * 1.25) * 0.013 * idleK;
    }

    /* 尾巴 / 鳍 */
    const tailFreq = 2.1 + swimK * 5.4;
    this.tailPhase += dt*tailFreq; this.finPhase += dt*(2.1+swimK*2.6);
    this.tail.rotation.y = Math.sin(this.tailPhase) * (0.035 + swimK * 0.09);
    this.tail.rotation.x = -.12 + Math.sin(this.tailPhase) * (.035 + swimK*.10);
    const finAmp = 0.26 + swimK * 0.34;
    this.fins[0].rotation.z = Math.sin(this.finPhase) * finAmp + 0.10 + curious*.35;
    this.fins[1].rotation.z = -Math.sin(this.finPhase + 0.35) * finAmp - 0.10;

    /* 眼睛 */
    for (const e of this.eyes) {
      const p = e.userData.pupil;
      if (this.lookEnabled && this.state !== 'sleep' && this.state !== 'sleepArrive') {
        this.group.updateWorldMatrix(true,false);
        const local = this.group.worldToLocal(this.lookAt.clone());
        const dx = clamp(local.x * 0.05, -0.022, 0.022);
        const dy = clamp(local.y * 0.045, -0.016, 0.016);
        p.position.x = damp(p.position.x, dx, 9, dt);
        p.position.y = damp(p.position.y, dy, 9, dt);
      } else {
        p.position.x = damp(p.position.x, 0, 4, dt);
        p.position.y = damp(p.position.y, 0, 4, dt);
      }
    }

    // 眨眼
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkT = 2.4 + Math.random() * 4.5; this.blink = 1; }
    this.blink = Math.max(0, this.blink - dt * 7.5);
    const blinkK = 1 - Math.sin(this.blink * Math.PI) * 0.94;
    const sleeping = this.state === 'sleep' || this.state === 'sleepArrive';
    const closed = sleeping ? 0.05 : (this.happyT > 0.5 ? 0.55 : 1);
    const eyeScaleY = Math.min(blinkK, closed);
    for (const e of this.eyes) e.scale.y = damp(e.scale.y, eyeScaleY, 24, dt);

    // 腮红
    this.happyT = Math.max(0, this.happyT - dt);
    const blushBase = sleeping ? 0.38 : (this.happyT > 0 ? 1.0 : 0.88);
    for (const b of this.blushes) b.material.opacity = damp(b.material.opacity, blushBase, 5, dt);

    // 吃
    if (this.state === 'eat' && this.food) {
      const d2 = Math.hypot(this.pos.x-this.food.position.x,this.pos.z-this.food.position.z);
      if (d2 < (this.food.userData.served ? 1.0 : .42)) {
        this.chewT += dt;
        this.mouth.scale.setScalar(1 + Math.abs(Math.sin(this.chewT * 8)) * 0.9);
        for (const cheek of this.blushes) cheek.scale.x=1+Math.abs(Math.sin(this.chewT*8))*.25;
        this.bodyGroup.scale.y = 1 - Math.abs(Math.sin(this.chewT * 4)) * 0.025;
        if (this.chewT > 1.4) {
          this.mouth.scale.setScalar(1);
          this.food.userData.consumed = true;
          this.food.userData.dead = true;
          this.food = null; this.state = 'idle'; this.happyT = 1.6;
          this.onEffect?.('sparkle', this.group.position.clone());
          this.onEffect?.('hearts', this.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)));
        }
      }
    } else if (this.mouth.scale.x !== 1) {
      this.mouth.scale.setScalar(damp(this.mouth.scale.x, 1, 8, dt));
    }

    for (const cheek of this.blushes) if (this.state!=='eat') cheek.scale.x=damp(cheek.scale.x,1,8,dt);

    /* 影子 */
    const h = clamp(this.pos.y / 2.0, 0, 1);
    this.shadow.position.y = 0.014 - this.group.position.y;
    this.shadowMat.opacity = 0.62 * (1 - h * 0.55);
    const s = 1 + h * 0.25;
    this.shadow.scale.set(s, s, 1);

    this.rim.position.y = 0.1 + Math.sin(t * 2.2) * 0.05;
  }
}
