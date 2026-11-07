import * as THREE from 'three';
import characterConfig from 'virtual:character-config';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { damp, clamp } from '../core/anim.js';
import { resolveCircle } from '../world/nav.js';
import { ActionSequence, FLYING_KICK, KickSequence } from './kick-sequence.js';
import { BOXING_STEPS, buildBoxingClips } from './boxing-clips.js';
import { buildFloorSit } from './floor-sit.js';
import { aimBone, aimLimb } from './bone-aim.js';
import { buildCrawlRecovery } from './crawl-recovery.js';
import { ACTION_SOUND_CUES } from './action-sound-cues.js';
import { buildTreeClimbClip } from './tree-climb-clip.js';
import { clipDuration, DANCE_CLIPS, maneuverSpec, SPELL_THROW } from '../../shared/world/maneuvers.js';
import { JUMP_GRAVITY, JUMP_SPEED } from '../../shared/world/movement.js';

// Adapter for the existing pet interactions. The GLB's feet are at local Y=0.
const DEFAULT_BONES = {
  upperL: 'UpperArm.L', upperR: 'UpperArm.R',
  foreL: 'Forearm.L', foreR: 'Forearm.R',
  handL: 'Hand.L', handR: 'Hand.R', head: 'Head', hips: 'Hips',
  thighL: 'Thigh.L', thighR: 'Thigh.R', shinL: 'Shin.L', shinR: 'Shin.R',
};
const SLIDE_EXIT_FRAME = 1.27;
const SLIDE_GAIT_START = { Sprint: 0.33, Running: 0.55, Walking: 0.73 };
const BIG_JUMP_FRAMES = { takeoff: 0.46, apex: 0.92, land: 1.60 };

/** 去掉髋骨的水平位移（Mixamo 走路/跑步动画自带前进 root motion，会成为滑步） */
function stripRootMotion(clip) {
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position')) continue;
    if (!/(^|\.)Hips\.position$/.test(track.name)) continue;
    const v = track.values;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 2; i < v.length; i += 3) { minZ = Math.min(minZ, v[i]); maxZ = Math.max(maxZ, v[i]); }
    // 只有真正带前进位移的动作才需要抹平；原地动作保留髋部细节
    if (maxZ - minZ < 0.5) continue;
    const x = v[0], z = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x; v[i + 2] = z; }
    track.needsUpdate = true;
  }
}

export class WhaleMaid {
  constructor({
    modelFile = 'Dafeiyu.glb',
    loadModel = () => characterConfig.modelBase ? new GLTFLoader().loadAsync(characterConfig.modelBase + encodeURIComponent(modelFile)) : Promise.reject(new Error('Character model unavailable')),
    clipMap = null,
    boneAliases = null,
    modelScale = 1.12,
    modelYaw = 0,
    sleepLift = 0,
    bubbleHeight = 1.48,
    materialTint = null,
    weightedArms = null,
    stripRootMotion: removeRootMotion = false,
    speedBasedRun = false,
    proceduralPose = true,
    eyeHeight = 1.32,
  } = {}) {
    this.weightedArms = weightedArms ?? (modelFile==='Dafeiyu.glb');
    this.clipMap = clipMap || null;
    this.boneAliases = { ...DEFAULT_BONES, ...(boneAliases || {}) };
    this.modelScale = modelScale;
    this.modelYaw = modelYaw;
    this.sleepLift = sleepLift;
    this.materialTint = materialTint;
    this.removeRootMotion = removeRootMotion;
    this.speedBasedRun = speedBasedRun;
    this.proceduralPose = proceduralPose;
    this.eyeHeight = eyeHeight;
    this.idleLifeTime = 0; this.idleLifeBlend = 0;
    this.idleHeadOffset = null;
    this.hairTime = 0; this.hairSpeed = 0; this.hairHeading = this.heading ?? Math.PI/4;
    this.group = new THREE.Group();
    this.pivot = new THREE.Group(); this.group.add(this.pivot);
    this.pos = new THREE.Vector3(.05, .025, .55);
    this.home = this.pos.clone(); this.target = this.pos.clone();
    this.groundY = .025; this.bubbleHeight = bubbleHeight;
    this.state = 'idle'; this.stateTime = 0; this.heading = Math.PI / 4;
    this.speed = 0; this.speedMax = .75; this.bounds = null; this.onEffect = null;
    this.actions = {}; this.currentClip = null; this.group.position.copy(this.pos);
    this.previewAction = null; this.previewLoop = false; this.previewEnd = null;
    this.kicks = new KickSequence((name, timing) => this.#playPreview(name, { ...timing, loop: false, restart: true, interruptWalking: true }));
    this.punches = new ActionSequence((name, timing) => this.#playPreview(name, { ...timing, loop: false, restart: true, interruptWalking: true }), BOXING_STEPS);
    this.sitPlaying = false;
    this.activeAction = null; this.retiring = null;
    this.jumping = false;
    this.crawlActive = false;
    this.jumpPeak = 0;
    this.jumpLastAir = 0;
    this.sliding = false;
    this.slideEndsAt = 0;
    this.now = () => performance.now();
    this.ready = loadModel().then(gltf => {
      this.model = gltf.scene;
      // Root scaling remains controlled by existing pet interactions (1.28).
      this.model.scale.setScalar(this.modelScale);
      if (this.modelYaw) this.model.rotation.y = this.modelYaw;
      this.model.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        if (this.materialTint != null) {
          for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
            if (!m) continue;
            if (m.color) m.color.set(this.materialTint);
            if ('envMapIntensity' in m) m.envMapIntensity = .65;
            if ('roughness' in m) m.roughness = Math.max(.5, m.roughness ?? .5);
            m.needsUpdate = true;
          }
        }
      });
      this.pivot.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model);
      for (const clip of gltf.animations) {
        if (this.removeRootMotion) stripRootMotion(clip);
        this.actions[clip.name] = this.mixer.clipAction(clip);
      }
      const boxing = this.actions.HumanSpBoxing?.getClip();
      if (modelFile === 'Dafeiyu.glb' && boxing) {
        for (const clip of buildBoxingClips(this.model, boxing)) this.actions[clip.name] = this.mixer.clipAction(clip);
      }
      if (this.clipMap) {
        for (const [semantic, real] of Object.entries(this.clipMap)) {
          if (this.actions[real]) this.actions[semantic] = this.actions[real];
        }
      }
      this.skeletalSit = Boolean(this.actions.Sit);
      this.play('Idle');
      // 骨骼：手/小臂/大臂（GLB 里已有 Hand.L/R，可直接驱动）
      // GLTFLoader 会把节点名里的 . 等字符改成 _，两种都试
      const find = (n) => !n ? null : (this.model.getObjectByName(n)
        || this.model.getObjectByName(n.replace(/[.\s:[\]/]/g, '_'))
        || this.model.getObjectByName(n.replace(/\./g, '')));
      const alias = this.boneAliases;
      this.bones = {
        upperL: find(alias.upperL), upperR: find(alias.upperR),
        foreL: find(alias.foreL), foreR: find(alias.foreR),
        handL: find(alias.handL), handR: find(alias.handR),
        head: find(alias.head), hips: find(alias.hips),
        thighL: find(alias.thighL), thighR: find(alias.thighR),
        shinL: find(alias.shinL), shinR: find(alias.shinR),
      };
      this.seatLegRest = ['thighL', 'thighR', 'shinL', 'shinR']
        .filter(key => this.bones[key])
        .map(key => ({ key, bone: this.bones[key], rest: this.bones[key].quaternion.clone() }));
      this.activityRest=['upperL','upperR','foreL','foreR','handL','handR','head'].filter(key=>this.bones[key]).map(key=>({bone:this.bones[key],rest:this.bones[key].quaternion.clone()}));
      const tail=find('Tail');
      if (tail) {
        this.model.updateWorldMatrix(true,true);
        const inverse=tail.getWorldQuaternion(new THREE.Quaternion()).invert();
        this.tailMotion={bone:tail,rest:tail.quaternion.clone(),sideAxis:new THREE.Vector3(0,1,0).applyQuaternion(inverse),liftAxis:new THREE.Vector3(1,0,0).applyQuaternion(inverse),time:0,swing:0,lift:0};
      }
      this.hairSprings = [];
      for (const side of ['Left','Right','Back']) for (const part of ['Root','Tip']) {
        const bone=find('Hair'+side+part);
        if (bone) this.hairSprings.push({bone,rest:bone.quaternion.clone(),side,tip:part==='Tip',x:0,z:0,vx:0,vz:0});
      }
      return this;
    });
  }
  applyTailMotion(dt, moving, lying) {
    const tail=this.tailMotion;
    if (!this.weightedArms || !tail) return;
    tail.time+=dt*(moving?2.8:1.7);
    const amplitude=lying?.035:(moving?.38:.27);
    const target=Math.sin(tail.time)*amplitude+Math.sin(tail.time*.53)*amplitude*.14;
    tail.swing=damp(tail.swing,target,6,dt);
    tail.lift=damp(tail.lift,Math.sin(tail.time*.8+.6)*(lying?.015:.07),5,dt);
    const sideways=new THREE.Quaternion().setFromAxisAngle(tail.sideAxis,tail.swing);
    const lift=new THREE.Quaternion().setFromAxisAngle(tail.liftAxis,tail.lift);
    tail.bone.quaternion.copy(tail.rest).multiply(sideways).multiply(lift);
  }

  applyIdleLife(dt, moving, lying, suspended = false) {
    if (!this.weightedArms || !this.bones?.head) return;
    this.idleLifeTime += dt;
    // 点播/坐姿等骨骼动作播放时，不再叠程序化待机张望，否则会篡改动作里被 K 过的头颈骨骼
    const resting = !suspended && !moving && !lying && this.state === 'idle';
    this.idleLifeBlend = damp(this.idleLifeBlend, resting ? 1 : 0, 3, dt);
    if (suspended) return;
    const t = this.idleLifeTime, cycle=t%13;
    // A quiet look-around every so often, rather than constant repetitive nodding.
    const gesture=cycle>3 && cycle<8 ? Math.sin((cycle-3)/5*Math.PI)**2 : 0;
    const k=this.idleLifeBlend;
    const pitch=(Math.sin(t*1.35)*.014+gesture*Math.sin(t*1.5)*.025)*k;
    const yaw=(Math.sin(t*.68)*.023+gesture*Math.sin(t*.95)*.04)*k;
    const tilt=(Math.sin(t*.9+.7)*.018+gesture*.032)*k;
    const offset=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,tilt));
    this.bones.head.quaternion.multiply(offset);
    this.idleHeadOffset = offset;
  }

  applyHairMotion(dt, moving, lying) {
    if (!this.hairSprings?.length) return;
    this.hairTime += dt;
    const acceleration=THREE.MathUtils.clamp((this.speed-this.hairSpeed)/Math.max(dt,.001),-12,12);
    const turn=THREE.MathUtils.clamp(Math.atan2(Math.sin(this.heading-this.hairHeading),Math.cos(this.heading-this.hairHeading))/Math.max(dt,.001),-5,5);
    this.hairSpeed=this.speed;this.hairHeading=this.heading;
    const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
    for (const spring of this.hairSprings) {
      const phase=spring.side==='Left'?0:spring.side==='Right'?1.1:2.2;
      const amplitude=lying?0:(spring.tip?.12:.065);
      const driveX=THREE.MathUtils.clamp(acceleration*.009+Math.sin(this.hairTime*1.6+phase)*(moving?.024:(spring.tip?.045:.027)),-amplitude,amplitude);
      const driveZ=THREE.MathUtils.clamp(-turn*.028+Math.sin(this.hairTime*1.15+phase)*(moving?.018:(spring.tip?.035:.022)),-amplitude,amplitude);
      const stiffness=spring.tip?42:65,damping=spring.tip?9:12;
      for(let i=0;i<steps;i++) {
        spring.vx+=((driveX-spring.x)*stiffness-spring.vx*damping)*h;
        spring.vz+=((driveZ-spring.z)*stiffness-spring.vz*damping)*h;
        spring.x=THREE.MathUtils.clamp(spring.x+spring.vx*h,-amplitude,amplitude);
        spring.z=THREE.MathUtils.clamp(spring.z+spring.vz*h,-amplitude,amplitude);
      }
      const offset=new THREE.Quaternion().setFromEuler(new THREE.Euler(spring.x,0,spring.z));
      spring.bone.quaternion.copy(spring.rest).multiply(offset);
    }
  }

  /** 在动画之上叠加手部动作（wave / 摸头 / 喂饭） */
  applyHandPose(dt, t, lying) {
    if (this.weightedArms) return; // This variant already has weighted, authored arm motion.
    const b = this.bones;
    if (!b || !b.handL || !b.handR) return;
    const pet = this.state === 'pet' ? Math.min(1, this.stateTime / 0.35) : 0;
    const eat = this.state === 'eat' ? 1 : 0;
    // 待机：轻微摆臂（注意：该 GLB 手部蒙皮偏弱，手臂骨骼转动几乎不可见，
    // 真正能看出效果的是头/尾巴；这里保留手臂微动，主要动作用头部表达）
    const sway = Math.sin(t * 1.7) * 0.045;
    b.handL.rotation.z += sway;
    b.handR.rotation.z += sway * 0.8;
    // 被摸头：右手抬起挥手
    if (pet > 0) {
      const wave = Math.sin(t * 15) * 0.45;
      b.upperR.rotation.z += -1.05 * pet;
      b.foreR.rotation.z += 0.55 * pet;
      b.handR.rotation.z += (wave - 0.25) * pet;
      b.upperL.rotation.z += 0.18 * pet;
    }
    // 吃饭：左手托碗、右手往嘴边
    if (eat) {
      b.upperR.rotation.z += -0.75;
      b.foreR.rotation.z += 0.95;
      b.handR.rotation.x += Math.sin(t * 7) * 0.12;
      b.upperL.rotation.z += 0.25;
    }
    // 头部：被摸头时歪头点头，吃饭时轻微前倾（头部骨骼权重正常，效果可见）
    if (b.head) {
      const nod = pet > 0 ? Math.sin(t * 6) * 0.12 * pet : 0;
      const tilt = pet > 0 ? -0.22 * pet : 0;
      b.head.rotation.x += nod;
      b.head.rotation.z += tilt;
      if (eat) b.head.rotation.x += 0.18 + Math.sin(t * 8) * 0.05;
      if (lying) b.head.rotation.z += 0.25;
    }
    // 睡觉：手放松
    if (lying) {
      b.handL.rotation.z *= 0.4;
      b.handR.rotation.z *= 0.4;
    }
  }

  applyActivityPose(t,lying){
    if(!this.weightedArms||!this.bones)return;
    const b=this.bones;
    if(this.state==='eat'){
      const scoop=(1+Math.sin(t*5))/2;
      if(b.upperL)b.upperL.rotation.z+=.35;
      if(b.foreL)b.foreL.rotation.x-=.8;
      if(b.upperR)b.upperR.rotation.z-=.55+scoop*.18;
      if(b.foreR)b.foreR.rotation.x-=.75+scoop*.55;
      if(b.handR)b.handR.rotation.x+=Math.sin(t*5)*.12;
      if(b.head)b.head.rotation.x+=.13+Math.sin(t*10)*.035;
    }
    if(lying&&b.head)b.head.rotation.x+=.04;
  }

  /** 列出模型自带动画（按 clip 去重，附带时长） */
  listClips() {
    const seen = new Set(), clips = [];
    for (const action of Object.values(this.actions)) {
      const clip = action.getClip();
      if (seen.has(clip.uuid)) continue;
      seen.add(clip.uuid);
      clips.push({ name: clip.name, duration: clip.duration });
    }
    return clips.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** 唯一的动画切换入口：同一时刻只允许一个动作占权重，旧动作淡出并彻底停掉 */
  transitionTo(name, { loop = true, fade = 0.2, restart = false, start = 0, speed = 1, action: next = this.actions?.[name] } = {}) {
    if (!next) return false;
    if (next === this.activeAction && !restart) {
      if (name !== this.currentClip) this.currentClip = name;
      return true;
    }
    const previous = this.activeAction;
    if (this.retiring && this.retiring.action !== next) this.retiring.action.stop();
    next.reset();
    next.time = start;
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.setEffectiveTimeScale(speed).setEffectiveWeight(1).play();
    if (previous && previous !== next) next.crossFadeFrom(previous, fade, false);
    this.activeAction = next;
    this.currentClip = name;
    // 记录淡出中的旧动作，淡出结束后强制 stop，避免多条动画同时跑（bones 互相干扰）
    this.retiring = previous && previous !== next ? { action: previous, until: this.now() + fade * 1000 + 120 } : null;
    return true;
  }

  /** 每帧兜底：除了当前动作，其它任何还在跑的动画一律停掉 */
  enforceSingleAction() {
    const active = this.activeAction;
    if (this.retiring && this.now() >= this.retiring.until) {
      this.retiring.action.stop();
      this.retiring = null;
    }
    for (const action of new Set(Object.values(this.actions || {}))) {
      if (action === active || action === this.retiring?.action) continue;
      if (action.isRunning() && action.getEffectiveWeight() > 0.01) action.stop();
    }
  }

  /** 面板点播：暂停状态机选片，直接播指定动画；一次性动作播完自动回待机 */
  startPreview(name, options) {
    if (!this.#playPreview(name, { restart: this.kicks.active || this.punches.active, ...options })) return false;
    this.spellCast = null;
    this.kicks.cancel();
    this.punches.cancel();
    return true;
  }

  startSpellCast(heading, release) {
    if (this.blocksWalking || this.punches.active || !['idle', 'swim'].includes(this.state) ||
        this.externalMotion?.jumping || this.externalMotion?.crawl || this.sliding) return false;
    const { name, start, end, speed } = SPELL_THROW;
    if (!this.startPreview(name, { start, end, speed, loop: false, restart: true, fade: .065, interruptWalking: true })) return false;
    this.spellCast = { heading, release, action: this.previewAction };
    return true;
  }

  get spellHeading() {
    return this.spellCast && this.previewAction === this.spellCast.action ? this.spellCast.heading : null;
  }

  cancelSpellCast() {
    if (this.spellHeading !== null) this.stopPreview();
  }

  startKick({ interruptWalking = false } = {}) {
    const walking = this.state === 'swim' && this.externalMotion?.moving && interruptWalking;
    if ((this.state !== 'idle' && !walking) || this.externalMotion?.jumping || this.externalMotion?.crawl || this.sliding) return false;
    if (!this.kicks.press()) return false;
    this.punches.cancel();
    return true;
  }

  startPunch({ interruptWalking = false } = {}) {
    const walking = this.state === 'swim' && this.externalMotion?.moving && interruptWalking;
    if ((this.state !== 'idle' && !walking) || this.externalMotion?.jumping || this.externalMotion?.crawl || this.sliding) return false;
    if (this.punches.active && this.previewEnd - this.previewAction.time > this.previewAction.getEffectiveTimeScale() * 0.2) return false;
    if (!this.punches.press()) return false;
    this.kicks.cancel();
    return true;
  }

  startFlyingKick() {
    if (this.state !== 'swim' || this.externalMotion?.jumping || this.externalMotion?.crawl || this.sliding) return false;
    const { name, ...timing } = FLYING_KICK;
    // Blend into locomotion before the clip's final recovery settles.
    return this.startPreview(name, { ...timing, end: 1.12, loop: false, restart: true, interruptWalking: true });
  }

  startRoll({ interruptWalking = false } = {}) {
    const walking = this.state === 'swim' && interruptWalking && this.externalMotion?.moving;
    if ((this.state !== 'idle' && !walking) || this.externalMotion?.jumping || this.externalMotion?.crawl || this.sliding) return false;
    const name = 'HumanSpQuickRollToRun';
    const primary = this.actions[name];
    if (!primary) return false;
    // Consecutive rolls blend between two mixer actions instead of snapping the same action to frame zero.
    const action = this.activeAction === primary
      ? (this.rollBlendAction ??= this.mixer.clipAction(primary.getClip().clone()))
      : primary;
    return this.startPreview(name, {
      action, speed: 1.8, end: 1.34, fade: 0.08, loop: false, restart: true, interruptWalking,
    });
  }

  get blocksWalking() {
    return Boolean(this.previewAction) && !this.punches.active;
  }

  get boxingActive() {
    return this.punches.active;
  }

  get floorSitting() {
    return Boolean(this.previewAction) && this.previewAction === this.floorSitAction;
  }

  toggleFloorSit({ interruptWalking = false } = {}) {
    if (this.floorSitting) {
      this.endFloorSit();
      return true;
    }
    const walking = this.state === 'swim' && this.externalMotion?.moving && interruptWalking;
    if ((this.state !== 'idle' && !walking) || this.externalMotion?.jumping || this.externalMotion?.crawl || this.sliding) return false;
    if (!this.floorSitAction) {
      const source = this.actions.Sit?.getClip();
      const pose = source && buildFloorSit(this.model, source);
      if (!pose) return false;
      this.floorSitAction = this.mixer.clipAction(pose);
    }
    return this.startPreview(this.floorSitAction.getClip().name, {
      action: this.floorSitAction, loop: true, fade: 0.24, interruptWalking,
    });
  }

  endFloorSit() {
    if (!this.floorSitting) return;
    this.#clearPreview();
  }

  startRandomDance({ interruptWalking = false } = {}) {
    const walking = this.state === 'swim' && interruptWalking && this.externalMotion?.moving;
    if ((this.state !== 'idle' && !walking) || this.externalMotion?.jumping || this.externalMotion?.crawl || this.sliding) return false;
    const available = DANCE_CLIPS.map(clip => clip.name).filter(name => this.actions[name]);
    if (!available.length) return false;
    const name = available[Math.floor(Math.random() * available.length)];
    return this.startPreview(name, { loop: false, restart: true, interruptWalking });
  }

  endDance() {
    if (DANCE_CLIPS.some(clip => clip.name === this.previewAction?.getClip().name)) this.#clearPreview();
  }

  finishPreviewCycle() {
    if (!this.previewLoop) return;
    this.previewLoop = false;
    this.previewAction.setLoop(THREE.LoopOnce, 1);
    this.previewAction.clampWhenFinished = true;
  }

  #playPreview(name, { loop, restart, start, end, speed, fade, interruptWalking = false, action = this.actions?.[name] } = {}) {
    if (!action) return false;
    if (this.externalMotion?.moving && !interruptWalking) return false;
    const clip = action.getClip();
    // 循环动作：待机/走/跑/跳/爬这类可循环片段；其余（扫堂腿、前跳、甩手）按一次性处理。
    this.previewLoop = loop ?? (!/BigJump|MutantJumpAttack/.test(clip.name) && /idle|walk|jog|run|danc|crawl|sit/i.test(clip.name));
    this.previewEnd = Math.min(end ?? clip.duration - 0.02, clip.duration);
    this.previewAction = action;
    if (!this.transitionTo(name, { action, loop: this.previewLoop, restart, start, speed, fade })) return false;
    this.previewSoundCues = ACTION_SOUND_CUES[clip.name];
    this.previewSoundIndex = 0;
    this.#playPreviewSounds();
    return true;
  }

  #playPreviewSounds() {
    if (!this.previewAction || !this.previewSoundCues) return;
    while (this.previewSoundIndex < this.previewSoundCues.length) {
      const [time, cue] = this.previewSoundCues[this.previewSoundIndex];
      if (this.previewAction.time < time) break;
      this.previewSoundIndex++;
      this.onActionSound?.(cue);
    }
  }

  /** 匍匐：Ctrl 切换后循环 HumanSpZombieCrawl；原地不动时定格，空格起身 */
  updateCrawl(moving, wantCrawl, dt) {
    const action = this.actions?.Crawl;
    if (!action) return false;
    if (wantCrawl) {
      if (this.previewAction) this.#clearPreview();
      if (this.currentClip !== 'Crawl') this.transitionTo('Crawl', { loop: true, fade: 0.18 });
      action.paused = !moving;
      action.timeScale = 1;
      if (!this.crawlActive) this.crawlClothIn = 0.15;
      this.crawlActive = true;
      if (moving) {
        this.crawlClothIn -= dt;
        if (this.crawlClothIn <= 0) {
          this.onActionSound?.('crawl-cloth');
          this.crawlClothIn = 0.52;
        }
      }
      return true;
    }
    this.crawlActive = false;
    return false;
  }

  updateTreeClimb(dt) {
    if (!this.externalMotion?.treeClimbing || !this.mixer) return false;
    if (this.previewAction) this.#clearPreview();
    if (!this.treeClimbAction) {
      const idle = this.actions.Idle?.getClip();
      const clip = idle && buildTreeClimbClip(this.model, idle, this.bones);
      if (!clip) return false;
      this.treeClimbAction = this.mixer.clipAction(clip);
    }
    const action = this.treeClimbAction;
    if (this.activeAction !== action) this.transitionTo('TreeClimb', { action, fade: 0.16 });
    action.paused = true;
    action.time = (action.time + dt * 1.6 * this.externalMotion.climbMotion + 1) % 1;
    return true;
  }

  startCrawlRecovery() {
    const source = this.actions.HumanSpKipUp?.getClip();
    if (!source || !this.crawlActive || this.currentClip !== 'Crawl' || this.externalMotion?.jumping) return false;
    const clip = buildCrawlRecovery(this.model, source);
    const action = this.mixer.clipAction(clip);
    const started = this.startPreview(clip.name, {
      action, end: clip.duration, fade: 0.06, loop: false, interruptWalking: true,
    });
    if (!started) {
      this.mixer.uncacheClip(clip);
      return false;
    }
    if (this.crawlRecoveryClip) this.mixer.uncacheClip(this.crawlRecoveryClip);
    this.crawlRecoveryClip = clip;
    return true;
  }

  /** 空格跳跃：ForwardJump 只取「起跳→落地」这一段，并用真实跳跃高度驱动时间轴 */
  enterJumpClip() {
    this.sliding = false;
    this.jumpActionName = this.actions?.RunningJump && this.externalMotion?.runningJump ? 'RunningJump' : 'Jump';
    const action = this.actions?.[this.jumpActionName];
    if (!action) return false;
    this.jumping = true;
    if (!this.transitionTo(this.jumpActionName, { loop: false, fade: 0.08 })) return false;
    // 片段内 0.80s 起跳、1.00s 最高点、1.25s 触地（由 hips 轨迹分析得出）
    this.jumpPeak = 0;
    this.jumpLastAir = 0;
    this.jumpActionName = 'Jump';
    this.sliding = false;
    this.slideEndsAt = 0;
    action.paused = true;
    action.time = Math.min(0.80, action.getClip().duration * 0.33);
    return true;
  }

  enterSecondJumpClip() {
    if (!this.secondJumpAction) {
      const clip = this.actions.HumanSpBigJump?.getClip().clone();
      if (!clip) return false;
      const hips = clip.tracks.find(track => track.name === 'Hips.position');
      if (hips) {
        const { takeoff, land } = BIG_JUMP_FRAMES;
        const sample = hips.createInterpolant();
        const [x, startY, z] = sample.evaluate(takeoff);
        const endY = sample.evaluate(land)[1];
        // The world already moves the actor through the air. Preserve the
        // transition into the landing pose without adding a second trajectory.
        for (let i = 0; i < hips.times.length; i++) {
          const progress = clamp((hips.times[i] - takeoff) / (land - takeoff), 0, 1);
          hips.values.set([x, startY + (endY - startY) * progress, z], i * 3);
        }
      }
      this.secondJumpAction = this.mixer.clipAction(clip);
    }
    const action = this.secondJumpAction;
    if (!this.transitionTo('DoubleJump', { action, loop: false, fade: 0.09, start: BIG_JUMP_FRAMES.takeoff })) return false;
    this.jumping = true;
    this.jumpActionName = 'DoubleJump';
    const { airHeight, verticalVelocity } = this.externalMotion;
    this.jumpPeak = airHeight + verticalVelocity ** 2 / (2 * JUMP_GRAVITY);
    action.paused = true;
    return true;
  }

  /** 用 airHeight + 垂直速度把动画时间钉在起跳→落地的区间上 */
  driveJumpClip() {
    if (this.jumpActionName === 'DoubleJump') {
      const { takeoff, apex, land } = BIG_JUMP_FRAMES;
      const velocity = this.externalMotion.verticalVelocity;
      const landingSpeed = Math.sqrt(2 * JUMP_GRAVITY * this.jumpPeak) || JUMP_SPEED;
      this.secondJumpAction.time = velocity >= 0
        ? apex - (apex - takeoff) * clamp(velocity / JUMP_SPEED, 0, 1)
        : apex + (land - apex) * clamp(-velocity / landingSpeed, 0, 1);
      return;
    }
    const action = this.actions?.[this.jumpActionName] || this.actions?.Jump;
    if (!action) return;
    const duration = action.getClip().duration;
    const air = Math.max(0, this.externalMotion?.airHeight || 0);
    const vv = this.externalMotion?.verticalVelocity;
    const rising = typeof vv === 'number' ? vv >= 0 : air >= this.jumpLastAir;
    // 跳跃初速 5.4、重力 18 → 最高点 0.81m；用固定峰值算高度进度
    const k = Math.min(1, air / (JUMP_SPEED ** 2 / (2 * JUMP_GRAVITY)));
    if (this.jumpActionName === 'RunningJump') {
      // 助跑跳片段本身就是完整一跳（0.9s）：按进度铺满整段，等于 1.5× 自然速度
      const progress = rising ? 0.5 * k : 1 - 0.5 * k;
      action.paused = true;
      action.time = Math.max(0, Math.min(duration - 1e-3, progress * duration));
    } else {
      const ratio = duration / 2.43;
      const takeoff = 0.80 * ratio;
      const apex = 1.00 * ratio;
      const land = 1.25 * ratio;
      const time = rising ? takeoff + k * (apex - takeoff) : apex + (1 - k) * (land - apex);
      action.paused = true;
      action.time = Math.max(takeoff, Math.min(land, time));
    }
    this.jumpLastAir = air;
  }

  updateWorldManeuver(maneuver) {
    if (!maneuver) {
      this.worldManeuver = null;
      return false;
    }
    const spec = maneuverSpec(maneuver.name, maneuver.gait, maneuver.clip);
    if (!spec) return false;
    let elapsed = maneuver.elapsed;
    for (const [index, clip] of spec.clips.entries()) {
      const duration = clipDuration(clip);
      if (elapsed >= duration && index < spec.clips.length - 1) {
        elapsed -= duration;
        continue;
      }
      const action = this.actions?.[clip.name];
      if (!action) return false;
      const time = Math.min(clip.end, action.getClip().duration, (clip.start ?? 0) + elapsed * clip.speed);
      const key = `${maneuver.actionId}:${index}`;
      if (this.worldManeuver?.key !== key) {
        if (this.previewAction) this.#clearPreview();
        this.transitionTo(clip.name, { loop: false, restart: true, fade: .08 });
        action.paused = true;
        // A late join starts at the current pose and skips cues that already happened.
        this.worldManeuver = { key, time: elapsed <= .12 ? (clip.start ?? -1) : time };
      }
      const cues = clip.name === 'Slide' ? [[0, 'slide']] : ACTION_SOUND_CUES[clip.name] || [];
      for (const [at, cue] of cues) {
        if (at > this.worldManeuver.time && at <= time) this.onActionSound?.(cue);
      }
      this.worldManeuver.time = Math.max(time, this.worldManeuver.time);
      action.time = time;
      return true;
    }
    return false;
  }

  /** 冲刺滑铲：只播一次滑铲片段，移动由主循环接管 */
  startSlideClip(startedAt, endsAt) {
    const action = this.actions?.Slide;
    if (!action) return false;
    if (this.sliding) return true;
    if (this.previewAction) this.#clearPreview();
    if (!this.transitionTo('Slide', { loop: false, fade: 0.08 })) return false;
    this.sliding = true;
    this.slideStartedAt = startedAt;
    this.slideEndsAt = endsAt;
    action.paused = true;
    this.onActionSound?.('slide');
    return true;
  }

  updateSlide(locomotion, interrupted) {
    if (!this.sliding) return;
    if (interrupted) {
      this.sliding = false;
      return;
    }
    const action = this.actions.Slide;
    const progress = clamp((this.now() - this.slideStartedAt) / (this.slideEndsAt - this.slideStartedAt), 0, 1);
    action.time = Math.min(SLIDE_EXIT_FRAME, action.getClip().duration) * progress;
    if (progress < 1) return;
    this.sliding = false;
    // The slide ends with the right knee coming through. Pick up the same stride in locomotion.
    this.transitionTo(locomotion, { start: SLIDE_GAIT_START[locomotion] ?? 0, fade: 0.1 });
  }

  /** 骨骼坐下：坐姿片段本身首尾衔接，循环播放直到主动切换 */
  enterSkeletalSit() {
    if (!this.skeletalSit || this.sitPlaying) return;
    this.sliding = false;
    this.sitPlaying = true;
    this.transitionTo('Sit', { loop: true });
  }

  exitSkeletalSit(target = 'Idle') {
    if (!this.sitPlaying) return;
    this.sitPlaying = false;
    this.transitionTo(target, { loop: true });
  }

  enterBedSleep() {
    if (!this.bedSleepAction) {
      const source = this.actions.Crawl.getClip();
      const pose = THREE.AnimationUtils.subclip(source, 'DafeiyuBedSleep', 60, 61, 30);
      pose.duration = 1;
      const rig = this.model.clone();
      rig.scale.setScalar(1);
      const mixer = new THREE.AnimationMixer(rig);
      mixer.clipAction(pose).play();
      mixer.update(0);
      rig.updateMatrixWorld(true);
      const point = bone => bone.getWorldPosition(new THREE.Vector3());
      const storeRotation = bone => {
        const track = pose.tracks.find(track => track.name === bone.name + '.quaternion');
        if (track) bone.quaternion.toArray(track.values);
      };
      const spine = rig.getObjectByName('Spine');
      const neck = rig.getObjectByName('Neck');
      const head = rig.getObjectByName('Head');
      if (spine && neck) {
        const neckDirection = point(neck).sub(point(spine));
        aimBone(spine, neckDirection.clone(), neckDirection.setY(.005));
        storeRotation(spine);
      }
      if (head) {
        const parent = head.parent.getWorldQuaternion(new THREE.Quaternion());
        const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), .70);
        head.quaternion.premultiply(parent.clone().invert().multiply(turn).multiply(parent));
        storeRotation(head);
      }
      const hips = rig.getObjectByName('Hips');
      if (hips) for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
        const [thigh, shin, foot] = ['UpLeg', 'Leg', 'Foot'].map(part => rig.getObjectByName(side + part));
        if (!thigh || !shin || !foot) continue;
        const center = point(hips).x;
        const ankle = point(foot);
        const knee = point(shin);
        const hip = point(thigh);
        aimBone(thigh, knee.clone().sub(hip), knee.setX(center + sign * .12).sub(hip));
        aimLimb(thigh, shin, foot, ankle.setX(center + sign * .085).sub(point(foot)));
        storeRotation(thigh);
        storeRotation(shin);
        const [arm, forearm, hand] = ['Arm', 'ForeArm', 'Hand'].map(part => rig.getObjectByName(side + part));
        if (!arm || !forearm || !hand) continue;
        const wrist = new THREE.Vector3(center + sign * .18, .09, sign > 0 ? .62 : .57);
        aimLimb(arm, forearm, hand, wrist.sub(point(hand)));
        storeRotation(arm);
        storeRotation(forearm);
      }
      mixer.uncacheRoot(rig);
      this.bedSleepAction = this.mixer.clipAction(pose);
    }
    return this.transitionTo('BedSleep', { action: this.bedSleepAction, fade: .001 });
  }

  #clearPreview() {
    this.kicks.cancel();
    this.punches.cancel();
    this.spellCast = null;
    this.previewAction = null; this.previewLoop = false; this.previewEnd = null;
    this.previewSoundCues = null;
  }

  stopPreview(target = 'Idle') {
    if (!this.previewAction) return;
    this.#clearPreview();
    this.transitionTo(target, { loop: true });
  }

  play(name) {
    const action = this.actions?.[name];
    if (!action) return;
    const restart = this.activeAction === action && action.loop !== THREE.LoopRepeat;
    if (!restart && name === this.currentClip && this.activeAction === action) return;
    this.transitionTo(name, { loop: true, restart });
  }
  swimTo(p, { fast = false } = {}) {
    this.target.set(p.x, this.groundY, p.z);
    this.runRequested = fast;
    this.speedMax = fast ? 4.2 : 2.82;
    this.state = this.food ? 'eat' : 'swim'; this.stateTime = 0;
  }
  pet() { this.state = 'pet'; this.stateTime = 0; }
  feed(snack) { this.food = snack; this.chewTime = 0; this.state = 'eat'; }
  sleep(pos) {
    this.food && (this.food.userData.dead = true); this.food = null;
    this.sleepPos = pos.clone(); this.target.copy(pos);
    this.state = 'sleep'; this.stateTime = 0; this.sleepArrived = false; this.speedMax = 2.4;
  }
  wake() { this.state = 'swim'; this.target.copy(this.home); this.sleepArrived = false; }
  setLookAt(v) { this.lookAt = v?.clone(); }
  update(dt, time) {
    this.stateTime += dt;
    const delta = new THREE.Vector3().subVectors(this.target, this.pos);
    const distance = Math.hypot(delta.x, delta.z);
    const localMoving = !this.externalMotion && ['swim', 'eat', 'sleep'].includes(this.state) && distance > .045;
    const moving = this.externalMotion ? this.externalMotion.moving : localMoving;
    const startX = this.pos.x, startZ = this.pos.z;
    if (localMoving) {
      const step = Math.min(distance, this.speedMax * dt);
      this.pos.x += delta.x / distance * step; this.pos.z += delta.z / distance * step;
      const desired = Math.atan2(delta.x, delta.z);
      this.heading += Math.atan2(Math.sin(desired - this.heading), Math.cos(desired - this.heading)) * Math.min(1,dt*8);
      this.speed = step / Math.max(dt, .00001);
    } else {
      this.speed = this.externalMotion?.speed || 0;
      if (this.state === 'swim' && !moving) this.state = 'idle';
      if (this.state === 'eat' && this.food && !this.externalMotion) {
        this.chewTime += dt;
        if (this.chewTime > 1.4) { this.food.userData.consumed = true; this.food.userData.dead = true; this.food = null; this.state = 'idle'; }
      }
      if (this.state === 'sleep') this.sleepArrived = true;
    }
    if (this.colliders && this.colliders.length) resolveCircle(this.pos, .26, this.colliders);
    if (this.bounds) {
      this.pos.x = clamp(this.pos.x,this.bounds.x0,this.bounds.x1);
      this.pos.z = clamp(this.pos.z,this.bounds.z0,this.bounds.z1);
    }
    // 被墙卡住时自动放弃目标，避免一直走
    if (localMoving) {
      const advanced = Math.hypot(this.pos.x - startX, this.pos.z - startZ);
      this._stuck = advanced < this.speedMax * dt * 0.3 ? (this._stuck || 0) + dt : 0;
      if (this._stuck > 1.4) { this._stuck = 0; this.target.copy(this.pos); this.state = 'idle'; }
    } else this._stuck = 0;
    const lying = this.state === 'sleep' && this.sleepArrived;
    const bedSleep = lying && this.externalMotion && this.actions?.Crawl;
    if(!this.externalMotion)this.pos.y = damp(this.pos.y, lying ? this.sleepPos.y + .15 : this.groundY, 5, dt);
    this.pivot.rotation.x = bedSleep ? 0 : damp(this.pivot.rotation.x, lying ? -Math.PI / 2 : 0, 7, dt);
    this.pivot.rotation.y = bedSleep ? Math.PI : 0;
    this.pivot.position.y = this.state === 'pet' ? Math.sin(Math.min(1,this.stateTime/.8)*Math.PI)*.06 : 0;
    if (this.state === 'pet' && this.stateTime > .8) this.state = 'idle';
    this.group.position.copy(this.pos); this.group.rotation.y = this.heading;
    const run = this.speedBasedRun
      ? (this.runRequested || this.speed > 2.2)
      : (this.weightedArms ? !!this.runRequested : this.speedMax >= 1.7);
    if (this.previewAction && ((moving && !this.punches.active) || ['sleep', 'pet', 'eat', 'sit'].includes(this.state))) this.stopPreview();
    if ((this.kicks.active || this.punches.active) && (this.externalMotion?.crawl || this.externalMotion?.jumping || this.sliding)) this.stopPreview();
    const sitting = this.state === 'sit' && this.skeletalSit && !moving;
    if (sitting) this.enterSkeletalSit();
    else if (this.sitPlaying) this.exitSkeletalSit(moving ? (run ? 'Running' : 'Walking') : 'Idle');
    const treeClimbing = this.externalMotion?.treeClimbing && this.updateTreeClimb(dt);
    const crawlPlaying = this.updateCrawl(moving, !treeClimbing && this.externalMotion?.crawl === true, dt);
    const sprinting = moving && Boolean(this.actions?.Sprint) && (this.externalMotion?.sprint === true || (this.externalMotion?.speed || this.speed) > 4.2);
    const airborne = this.externalMotion?.jumping === true;
    if (airborne && this.externalMotion.maneuver?.name === 'doubleJump' && this.previewAction) this.stopPreview();
    if (airborne && !this.previewAction && !sitting) {
      if (this.externalMotion.jumpStage === 2 && (!this.jumping || this.jumpActionName !== 'DoubleJump') && this.actions?.HumanSpBigJump) this.enterSecondJumpClip();
      else if (!this.jumping) this.enterJumpClip();
    }
    else if (!airborne && this.jumping) { this.jumping = false; const jump = this.actions?.Jump; if (jump) { jump.paused = false; jump.time = 0; } this.onActionSound?.('land'); }
    if (this.jumping) this.driveJumpClip();
    const locomotion = moving ? (sprinting ? 'Sprint' : run ? 'Running' : 'Walking') : 'Idle';
    const maneuverPlaying = this.updateWorldManeuver(this.externalMotion?.maneuver);
    this.updateSlide(locomotion, maneuverPlaying || this.previewAction || this.jumping || crawlPlaying || treeClimbing || ['sit', 'sleep', 'eat'].includes(this.state));
    if (bedSleep) this.enterBedSleep();
    else if (!maneuverPlaying && !this.previewAction && !sitting && !this.jumping && !crawlPlaying && !treeClimbing && !this.sliding) this.play(locomotion);
    if (this.mixer) {
      // 动作播放速度跟着位移速度走，避免“滑步”
      const animationSpeed = this.externalMotion ? this.speed : this.speedMax;
      const base = run
        ? Math.min(1.9, Math.max(1.0, animationSpeed / 2.1))
        : Math.min(1.9, Math.max(1.0, animationSpeed / 1.25));
      this.mixer.timeScale = maneuverPlaying || this.previewAction || sitting || this.jumping || crawlPlaying ? 1 : (lying ? .2 : base);
      // 清掉上一帧的程序坐姿，让没有动画轨道的腿骨也能正确复原。
      if (this.wasSeated || this.state === 'sit') {
        for (const leg of this.seatLegRest || []) leg.bone.quaternion.copy(leg.rest);
      }
      if(this.wasActivity||this.state==='eat'||lying){for(const joint of this.activityRest||[])joint.bone.quaternion.copy(joint.rest);}
      // A paused track may skip writing its unchanged pose. Undo last frame's look offset before sampling.
      if (this.idleHeadOffset) {
        this.bones.head.quaternion.multiply(this.idleHeadOffset.invert());
        this.idleHeadOffset = null;
      }
      this.mixer.update(dt);
      const cast = this.spellCast;
      if (cast?.release && this.previewAction === cast.action && cast.action.time >= SPELL_THROW.release) {
        const release = cast.release;
        cast.release = null;
        const hand = this.bones?.handR?.getWorldPosition(new THREE.Vector3());
        release(hand);
      }
      if (this.previewSoundCues) this.#playPreviewSounds();
      this.enforceSingleAction();
      const boneDriven = Boolean(maneuverPlaying || this.previewAction || this.sitPlaying || crawlPlaying || treeClimbing);
      if (this.proceduralPose !== false && !boneDriven) this.applyActivityPose(time||0,lying);
      this.wasActivity=this.state==='eat'||lying;
      if (!crawlPlaying && !treeClimbing) this.applyHandPose(dt, time || 0, lying);
      this.applyIdleLife(dt, moving, lying, boneDriven);
      this.applyHairMotion(dt, moving, lying);
      this.applyTailMotion(dt, moving, lying);
      if (this.previewAction && !this.previewLoop && this.previewAction.time >= this.previewEnd) {
        if (!this.kicks.finish() && !this.punches.finish()) this.#clearPreview();
      }
      this.wasSeated = this.state === 'sit';
      if (this.wasSeated) {
        // 有骨骼坐姿时不再程序掰腿，只保留髋部对齐
        if (!this.skeletalSit) {
          for (const leg of this.seatLegRest || []) {
            const bend = leg.key.startsWith('thigh') ? -1.35 : 1.35;
            leg.bone.quaternion.copy(leg.rest).multiply(
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend));
          }
        }
        if (this.bones.hips) {
          this.group.updateMatrixWorld(true);
          const hip = this.bones.hips.getWorldPosition(new THREE.Vector3());
          this.group.position.y += this.seatHeight - hip.y;
        }
      }

    }
    if(lying&&this.model){
      if(!this.wasLying||(bedSleep&&!this.bedSleepAligned&&this.stateTime>=.1)){
        const pitch=this.pivot.rotation.x;
        if(!bedSleep)this.pivot.rotation.x=-Math.PI/2;
        this.group.updateMatrixWorld(true);
        if(bedSleep&&this.bones.upperL&&this.bones.upperR&&this.bones.hips){
          // Align the torso to the duvet. Loose hair and cloth can
          // settle into the bedding without lifting the whole body.
          const point=new THREE.Vector3();
          const shoulderY=Math.min(this.bones.upperL.getWorldPosition(point).y,this.bones.upperR.getWorldPosition(point).y);
          const torsoY=(shoulderY+this.bones.hips.getWorldPosition(point).y)/2;
          this.sleepYOffset=this.sleepPos.y+.06-torsoY;
          this.bedSleepAligned=this.stateTime>=.1;
        }else{
          const box=new THREE.Box3().setFromObject(this.model);
          this.sleepYOffset=(box.isEmpty()?0:this.sleepPos.y-box.min.y)+(this.sleepLift||0);
        }
        this.pivot.rotation.x=pitch;
      }
      this.group.position.y+=this.sleepYOffset||0;
    }
    if(!bedSleep)this.bedSleepAligned=false;
    this.wasLying=lying;
  }
}
