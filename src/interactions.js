import {getCatalogEntry} from '../shared/world/catalog.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, damp } from './core/anim.js';
import { pushOutside } from './world/nav.js';
import { P } from './core/palette.js';

const LINES = {
  pet: ['唔…再摸一下下嘛。', '别戳啦，痒——', '你是不是又想让我干活。', '哼，今天心情好，勉强给你摸。', '手拿开啦……再放一会儿也行。'],
  feed: ['白饭！给我盛满一点。', '唔，热乎乎的白米饭。', '还有没有，再来半碗。', '你怎么知道我今天没吃饱。'],
  sleep: ['那我不客气了……呼。', '困了。别吵我。', '床我占了，你自己想办法。'],
  wake: ['嗯？……干嘛。', '我还没睡够呢。', '再让我飘五分钟。'],
  move: ['来啦来啦。', '飘过去～', '嗯？那边有什么。', '别催别催。'],
  idle: ['今天的窗外颜色好好看。', '我在想，鱼会不会做梦。', '房间好像有点太整齐了。', '你忙你的，我自己飘一会儿。'],
};

export class Interactions {
  constructor({ scene, camera, iso, whale, fx, props, hud, lights }) {
    this.scene = scene; this.camera = camera; this.iso = iso;
    this.whale = whale; this.fx = fx; this.props = props; this.hud = hud; this.lights = lights;
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.stats = { mood: 72, food: 46, energy: 80, love: 38, moodLabel: '悠闲' };
    this.hotspots = [];
    this.npcs = [];
    this.sleepAnchor = null;
    this.onNeedBed = null;
    this.bounds = { x0: -3, x1: 3, z0: -3, z1: 3 };
    this.onHotspot = null;
    this.hovering = false;
    this.movingGuard = null;      // 走动中禁止其它动作的判定回调
    this.centerPointer = false;   // 第一视角：按屏幕中心准星拾取
    this.suppressClick = false;   // 第一视角拖动视线后的误触抑制
    this.idleTimer = 0;
    this.blinkTimer = 0;
    this.whale.onEffect = (kind, pos) => {
      if (kind === 'hearts') { this.fx.hearts(pos, 5); this.stats.love = clamp(this.stats.love + 3, 0, 100); }
      if (kind === 'sparkle') this.fx.burst(pos, 6);
    };
    this._bind();
    this._syncStats();
    this._emitIdleLine(1.2);
  }

  _bind() {
    const el = document.getElementById('actions');
    el?.addEventListener('click', (e) => {
      if (this.editing) return;
      if (!e.target.closest('[data-act="feed"]')) return;
      // 移动优先：走动中不做其它动作，避免边走边播
      if(this.movingGuard?.()){this.hud.say('先停下来再说。',this.whale.group.position.clone().add(new THREE.Vector3(0,this.whale.bubbleHeight??0.66,0)),2.2);return;}
      if(this.onFeed)this.onFeed();
      else if(this.worldAction)this.worldAction('eat');
      else this.feed();
    });

    const canvas = document.querySelector('#app canvas');
    this.pointerDown = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.pointerDown) return;
      const dx = e.clientX - this.pointerDown.x, dy = e.clientY - this.pointerDown.y;
      if (Math.hypot(dx, dy) < 8 && performance.now() - this.pointerDown.t < 520) this._click(e);
      this.pointerDown = null;
    });
    canvas.addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    });
  }

  /** 切换场景时更新活动范围与可点热点 */
  setScene(cfg) {
    this.bounds = cfg.bounds;
    this.sleepAnchor = cfg.sleepAnchor || null;
    this.hotspots = [];
    this.npcs = [];
    cfg.root.traverse((o) => {
      if (o.isMesh && o.userData.hotspot) this.hotspots.push(o);
      if (o.userData && o.userData.npc) this.npcs.push(o);
    });
  }

  _click(e) {
    if (this.editing) return;
    if (this.suppressClick) { this.suppressClick = false; return; }
    if (this.centerPointer) this.pointer.set(0, 0);
    else this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    // NPC
    if (this.npcs.length) {
      const ns = this.ray.intersectObjects(this.npcs, true);
      if (ns.length) {
        let obj = ns[0].object;
        while (obj && !obj.userData.npc) obj = obj.parent;
        if (obj) {
          const d = obj.userData.npc;
          this.hud.say(d.line, new THREE.Vector3(obj.position.x, 1.9, obj.position.z), 3.2);
          return;
        }
      }
    }
    if (this.whale.group.visible && this.ray.intersectObject(this.whale.group, true).length) {
      this.pet(); return;
    }

    // Resolve the clicked mesh back to the exact editable furniture entity.
    if(this.worldAction&&this.getFurniture){
      const furnitureHits=this.ray.intersectObjects(this.getFurniture(),true);
      for(const hit of furnitureHits){let object=hit.object;while(object&&!object.userData.entityId)object=object.parent;
        const entity=object?.userData.worldEntity;if(!entity)continue;
        let part=hit.object,requested;while(part&&part!==object){requested??=part.userData.actionKind;part=part.parent;}
        const kind=requested||getCatalogEntry(entity.type).actions[0];
        if(kind)this.worldAction(kind,{entityId:object.userData.entityId});
        return; // The nearest furniture occludes objects behind it.
      }
    }
    // Ground movement remains on WASD.
  }

  _line(kind) {
    this.onVoice?.(kind);
    const arr=LINES[kind];
    const text=arr[Math.floor(Math.random()*arr.length)];
    this.hud.say(text,this.whale.group.position.clone().add(new THREE.Vector3(0,this.whale.bubbleHeight??.66,0)),3);
  }

  _emitIdleLine(delay = 0) {
    this.idleTimer = -delay;
  }

  _syncStats() {
    if (this.stats.mood >= 78) this.stats.moodLabel = '开心';
    else if (this.stats.mood >= 55) this.stats.moodLabel = '悠闲';
    else if (this.stats.mood >= 35) this.stats.moodLabel = '有点困';
    else this.stats.moodLabel = '蔫了';
    if (this.whale.state.startsWith('sleep')) this.stats.moodLabel = '睡着了';
    if (this.stats.food < 25 && !this.whale.state.startsWith('sleep')) this.stats.moodLabel = '饿了';
    this.hud.setStats(this.stats);
  }

  pet() {
    if(this.worldAction){this.fx.hearts(this.whale.pos.clone(),5);this._line('pet');return;}
    if (this.whale.state.startsWith('sleep')) { this.toggleSleep(); return; }
    this.whale.pet();
    this.whale.group.scale.setScalar(1.28 * 1.06);
    this.stats.mood = clamp(this.stats.mood + 6, 0, 100);
    this.stats.love = clamp(this.stats.love + 4, 0, 100);
    this.fx.hearts(this.whale.group.position.clone().add(new THREE.Vector3(0, this.whale.bubbleHeight ?? 0.45, 0)), 6);
    this._line('pet');
    this._syncStats();
  }

  feed() {
    if (this.whale.state.startsWith('sleep')) this.toggleSleep();
    if (this.whale.food) return;
    // Present a bowl at mouth height in front of her, rather than throwing food.
    const base=this.whale.group.position.clone();
    const heading=this.whale.heading ?? Math.PI/4;
    const snack=new THREE.Group();snack.name='white-rice-bowl';
    snack.userData.served=true;
    const ceramic=new THREE.MeshStandardMaterial({color:0xe6f0ff,roughness:.35,metalness:0});
    const profile=[new THREE.Vector2(.07,0),new THREE.Vector2(.10,.02),new THREE.Vector2(.16,.08),new THREE.Vector2(.19,.14),new THREE.Vector2(.185,.155),new THREE.Vector2(.16,.13),new THREE.Vector2(.10,.055)];
    const bowl=new THREE.Mesh(new THREE.LatheGeometry(profile,32),ceramic);snack.add(bowl);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.187,.012,8,40),ceramic);rim.rotation.x=Math.PI/2;rim.position.y=.145;snack.add(rim);
    const riceMat=new THREE.MeshStandardMaterial({color:0xfff9e9,roughness:.95});
    const rice=new THREE.Group();rice.name='rice';rice.position.y=.14;snack.add(rice);snack.userData.rice=rice;
    const mound=new THREE.Mesh(new THREE.SphereGeometry(.168,24,16),riceMat);mound.scale.y=.42;rice.add(mound);
    const grainGeo=new THREE.SphereGeometry(1,8,6);
    for(let i=0;i<35;i++) {
      const a=i*2.39996,r=.15*Math.sqrt((i+.5)/35);
      const grain=new THREE.Mesh(grainGeo,riceMat);grain.scale.set(.012,.008,.023);
      grain.position.set(Math.cos(a)*r,.065*Math.sqrt(1-r*r/(.168*.168)),Math.sin(a)*r);grain.rotation.y=a;rice.add(grain);
    }
    snack.position.set(base.x+Math.sin(heading)*.78,Math.max(.45,base.y-.23),base.z+Math.cos(heading)*.78);
    snack.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    this.scene.add(snack);(this.snacks=this.snacks||[]).push(snack);
    this.whale.velocity?.set(0,0,0);
    this.whale.target.copy(this.whale.pos);
    this.whale.feed(snack);
    this._line('feed');
  }

  toggleSleep() {
    if (this.whale.state.startsWith('sleep')) {
      this.whale.wake();
      this._line('wake');
      this.stats.mood = clamp(this.stats.mood + 6, 0, 100);
    } else if (this.sleepAnchor) {
      const a = this.sleepAnchor;
      this.whale.sleep(new THREE.Vector3(a.x, a.y, a.z));
      this._line('sleep');
    } else {
      this.hud.say('这里没有床……回房间睡吧。', this.whale.group.position.clone().add(new THREE.Vector3(0, this.whale.bubbleHeight ?? 0.66, 0)), 2.6);
      this.onNeedBed?.();
      return;
    }
    this._syncStats();
  }

  update(dt, t) {
    this.whale.update(dt, t);
    // 点她时的弹回
    const targetScale = 1.28 * (this.whale.state === 'pet' ? 1.02 : 1);
    this.whale.group.scale.setScalar(damp(this.whale.group.scale.x, targetScale, 8, dt));

    if (this.drops) {
      this.drops = this.drops.filter((fn) => fn(dt));
    }

    // 她自己看鼠标（在鼠标世界点附近）
    if (this.pointer.lengthSq() > 0) {
      this.ray.setFromCamera(this.pointer, this.camera);
      const p = new THREE.Vector3();
      if (this.ray.ray.intersectPlane(this.plane, p)) {
        this.whale.setLookAt(p.clone().setY(this.whale.pos.y));
      }
    }

    // 睡觉时冒 Z
    this.blinkTimer -= dt;
    if (this.whale.state.startsWith('sleep') && this.blinkTimer <= 0) {
      this.blinkTimer = 0.9;
      this.fx.zzz(this.whale.group.position.clone().add(new THREE.Vector3(0.3, this.whale.bubbleHeight ?? 0.55, 0)));
    }

    // 轻微饥饿
    this.stats.food = clamp(this.stats.food - dt * 0.35, 0, 100);
    this.stats.mood = clamp(this.stats.mood - dt * 0.12, 0, 100);

    // 空闲小动作
    this.idleTimer += dt;
    if (this.idleTimer > 14 && this.whale.state === 'idle') {
      this.idleTimer = 0;
      if (Math.random() < 0.5) {
        const p = new THREE.Vector3(
          clamp(this.whale.pos.x + (Math.random() - 0.5) * 3.2, this.bounds.x0 + 0.15, this.bounds.x1 - 0.15),
          0.9 + Math.random() * 0.45,
          clamp(this.whale.pos.z + (Math.random() - 0.5) * 3.2, this.bounds.z0 + 0.15, this.bounds.z1 - 0.15)
        );
        this.whale.swimTo(p);
      } else {
        this._line('idle');
      }
    }
    this._statT = (this._statT || 0) + dt;
    if (this._statT > 0.2) { this._statT = 0; this._syncStats(); }

    // 饭吃完才增加饱食度，并收走碗。
    if (this.snacks) {
      this.snacks = this.snacks.filter((s2) => {
        if (s2.userData.rice && !s2.userData.dead) {
          const progress=clamp((this.whale.chewT ?? this.whale.chewTime ?? 0)/1.4,0,1);
          s2.userData.rice.scale.setScalar(1-progress*.85);
        }
        if (s2.userData.dead) {
          if(s2.userData.consumed) {this.stats.food=clamp(this.stats.food+22,0,100);this.stats.mood=clamp(this.stats.mood+4,0,100);this._syncStats();}
          this.scene.remove(s2);
          const geometries=new Set(),materials=new Set();s2.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);materials.add(o.material);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
          return false;
        }
        return true;
      });
    }
  }
}
