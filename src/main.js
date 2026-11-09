import {poolAt,waterAt} from '/shared/world/water.js';
import {forestLakeDepth} from '/shared/world/forest.js';
import {createBaizeEncounter} from './core/baize-encounter.js';
import {createBaizeFollower} from './characters/baize.js';
import {mountBaizeBattle} from './ui/baize-battle.js';
import {createTeleportEffect} from "./ui/teleport-effect.js";
import {mountAuthorExamples} from "./ui/author-examples.js";
import {discoverLocalAssets,localAssetCache,prepareLocalSnapshot} from "./world/local-assets.js";
import {registerLocalFurniture} from "./world/props.js";
import {LocalSound} from "./core/local-sound.js";
import {UI_SOUND} from "./core/sound-dictionary.js";
import {mountAudioPlayer} from "./core/audio-playback.js";
import * as THREE from "three";
import {createRenderer} from "./core/renderer.js";
import {createRenderActivity} from "./core/render-activity.js";
import {setupEnvironment,setupBackdrop} from "./core/env.js";
import {setupLights} from "./core/lights.js";
import {IsoCamera,bindCameraWheel} from "./core/camera.js";
import {FirstPersonCamera} from "./core/first-person.js";
import {ThirdPersonCamera} from "./core/third-person.js";
import {resolveThirdPersonFacing,createThirdPersonFacingState,thirdPersonMoveDirection,thirdPersonMoveFacing,thirdPersonMoveAxis} from "./core/third-person-follow.js";
import {showEnclosure} from "./world/enclosure.js";
import {createSkyDome,FOREST_SUNNY_SKY,setSkyMood} from "./core/fp-sky.js";
import {contactShadowTexture,tex} from "./core/textures.js";
import {mountViewToggle} from "./ui/view-toggle.js";
import {mountActionPanel} from "./ui/action-panel.js";
import {buildRoom} from "./world/room.js";
import {buildProps,createFurniture} from "./world/props.js";
import {buildYard} from "./world/yard.js";
import {buildLiving} from "./world/living.js";
import {SceneRegistry} from "./world/registry.js";
import {ActionDispatcher} from "./core/action-dispatcher.js";
import {presentActor} from "./core/actor-presentation.js";
import {PlayerController} from "./core/player-controller.js";
import {ActorTimeline} from "./core/actor-timeline.js";
import {WorldClient} from "./core/world-client.js";
import {ownerSession} from "./ui/owner-session.js";
import {AgentConnect} from "./ui/agent-connect.js";
import {mountSettings} from "./ui/settings.js";
import {mountFoodPicker} from "./ui/food-picker.js";
import {mountSpellBar} from "./ui/spell-bar.js";
const agentConnect=new AgentConnect();
let desktopSuspended=Boolean(window.dafeiyuDesktop?.onRenderSuspended);
const renderActivity=createRenderActivity(!desktopSuspended&&!document.hidden);
const toolbar=document.getElementById('actions');
const settings=mountSettings({
 toolbar,
 onOpen:()=>{stopMovement();stopOrbit();pauseKeyboardWalking();},
 onConnect:onClose=>void agentConnect.open({onClose}),
 canReset:()=>Boolean(editor?.context&&!editor.context.loading),
 onReset:()=>editor?.requestReset(),
});
import {Whale} from "./characters/whale.js";
import characterConfig from "virtual:character-config";
import {WhaleMaid} from "./characters/whaleMaid.js";
import {FX} from "./effects/fx.js";
import {HUD} from "./ui/hud.js";
import {RoomEditor} from "./ui/room-editor.js";
import {Interactions} from "./interactions.js";
import {portalInwardNormal,reachesKeyboardPortal} from "./core/keyboard-portals.js";
import {portalEnds,walkable,segmentWalkable} from "/shared/world/navigation.js";
import {YARD_FOREST_SLOT} from "/shared/world/templates.js";
import {getCatalogEntry} from "/shared/world/catalog.js";
import {PLAYER_SPEED} from "/shared/world/movement.js";

setupBackdrop();
const R=createRenderer(document.getElementById('app')),scene=new THREE.Scene(),iso=new IsoCamera(),camera=iso.camera;
setupEnvironment(R.renderer,scene);const lights=setupLights(scene,{windowPos:new THREE.Vector3(.05,1.6,-3.4)});
const lightDefaults=Object.fromEntries(Object.entries(lights).map(([key,light])=>[key,{intensity:light.intensity,color:light.color.clone()}]));
const defaultGroundLight=lights.hemi.groundColor.clone();
const defaultSunPosition=lights.sun.position.clone(),defaultSunTarget=lights.sun.target.position.clone();
const forestFog=new THREE.Fog(FOREST_SUNNY_SKY.horizon,38,108);
const forestSunOffset=new THREE.Vector3(8,14,6);
let forestLighting=false;
function followForestSun(){
 lights.sun.target.position.set(Math.round(renderPosition.x/2)*2,Math.round(renderPosition.y/2)*2,Math.round(renderPosition.z/2)*2);
 lights.sun.position.copy(lights.sun.target.position).add(forestSunOffset);
}
function applySceneLighting(templateId){
 forestLighting=templateId==='forest_v1';
 const street=templateId==='street_corner_v1';
 const daylight={sun:2.55,hemi:1.03,fill:.58,window:0,lamp:0,screen:0};
 const daylightColors={sun:0xfff3d9,hemi:0xe1f2ff,fill:0xc3ddff};
 for(const [key,light] of Object.entries(lights)){
  light.intensity=forestLighting?daylight[key]:lightDefaults[key].intensity*(street?({sun:1.1,hemi:1.5,fill:1.15}[key]??0):1);
  light.color.set(forestLighting?(daylightColors[key]??lightDefaults[key].color):lightDefaults[key].color);
 }
 lights.hemi.groundColor.set(forestLighting?0x8b9d72:defaultGroundLight);
 scene.fog=forestLighting?forestFog:null;
 if(forestLighting)followForestSun();
 else{
  lights.sun.position.copy(defaultSunPosition);
  lights.sun.target.position.copy(defaultSunTarget);
 }
 lights.sun.shadow.needsUpdate=true;
}
let yard=null;const props={group:new THREE.Group()};
const registry=new SceneRegistry({scene,createFurniture,lazy:true,legacy:{
 bedroom:()=>{const room=buildRoom(),p=buildProps(),root=new THREE.Group();root.add(room.group,p.group);return {root,furniture:p.group,view:{target:new THREE.Vector3(.15,1.05,0),zoom:1.02},update:(dt,t)=>{room.update?.(dt,t);p.update?.(dt,t);}};},
 living:()=>{const c=buildLiving();return {root:c.group,furniture:c.group,view:c.view,update:c.update};},
 yard:()=>{yard=buildYard();return {root:yard.group,furniture:yard.group,view:yard.view,update:yard.update,refreshLandscape:yard.refreshLandscape};}
}});
const requested=new URLSearchParams(location.search).get('character');
const mode=requested==='whale'||!characterConfig.modelBase?'whale':characterConfig.defaultCharacter;
const DAFEIYU_PRESET={
  modelFile:'Dafeiyu.glb',
  weightedArms:true,
  modelScale:.65,

  bubbleHeight:1.62,
  eyeHeight:1.45,
  clipMap:{Idle:'HumanSpDwarfIdle',Walking:'HumanSpWalking6',Running:'HumanSpJogging',Sprint:'HumanSpRun',Jump:'HumanSpForwardJump',RunningJump:'HumanSpRunningJump',Slide:'HumanSpRunningSlide',Crawl:'HumanSpZombieCrawl',Sit:'HumanSpSitting2'},
  boneAliases:{upperL:'LeftArm',upperR:'RightArm',foreL:'LeftForeArm',foreR:'RightForeArm',handL:'LeftHand',handR:'RightHand',head:'Head',hips:'Hips',thighL:'LeftUpLeg',thighR:'RightUpLeg',shinL:'LeftLeg',shinR:'RightLeg'},
  stripRootMotion:true,
  speedBasedRun:true,
  proceduralPose:false,
};
const original=mode==='whale'?new Whale():new WhaleMaid(DAFEIYU_PRESET);
let whale=original;const blob=new Whale();blob.group.visible=false;scene.add(original.group,blob.group);original.ready?.then(()=>{
 registry.pool.retain(original.group);
 if(original.eyeHeight)fp.eyeHeight=original.eyeHeight;
 const clips=original.listClips?.()||[];
 if(clips.length)actionPanel=mountActionPanel({clips,container:leftRail,onPlay:async(name)=>{
  if(whale!==original){showMessage('变回人形才能做这个动作');return false;}
  if(original.externalMotion?.jumping||crawling||performance.now()<slideUntil)return false;
  if(original.state==='sit'){
   // 主动切换动作：先取消坐姿，等姿态离开 seated 再播下一个动作
   if(!lease||lease.expiresAt<=Date.now())await control(true).catch(()=>{});
   try{await client.dispatch({kind:'action.submit',payload:{actorId:actor.actorId,leaseId:lease?.leaseId,leaseVersion:lease?.leaseVersion,kind:'cancel'}});}catch{}
   if(original.state==='sit'&&(!lease||lease.expiresAt<=Date.now()))await control(true).catch(()=>{});
   for(let i=0;i<20&&original.state==='sit';i++)await new Promise(resolve=>setTimeout(resolve,60));
  }
  if(['sleep','pet','eat'].includes(original.state)){showMessage('先结束当前状态，再播放动作');return false;}
  const started=original.startPreview(name,{interruptWalking:player.active&&!actor?.actionId});
  if(started){travelAction=null;pauseKeyboardWalking();}
  return started;
 },onStop:()=>{travelAction=null;original.stopPreview();}});
});registry.pool.retain(blob.group);original.group.scale.setScalar(1.28);blob.group.scale.setScalar(1.28);
original.ready?.catch(()=>showMessage('角色模型加载失败，可使用 ?character=whale 查看默认鲸鱼'));
const fx=new FX(scene),hud=new HUD(),game=new Interactions({scene,camera,iso,whale,fx,props,hud,lights});
/* 第一视角：纯客户端相机模式，不改服务端 */
const fp=new FirstPersonCamera({fov:62});
const tp=new ThirdPersonCamera({fov:55});
const tpFacingState=createThirdPersonFacingState();
const skyDome=createSkyDome();scene.add(skyDome);
// 第一视角隐藏模型后，用一张柔和接触阴影表示「我站在这里」
const fpShadow=new THREE.Mesh(new THREE.PlaneGeometry(1.05,1.05),new THREE.MeshBasicMaterial({map:tex(contactShadowTexture(),{wrap:THREE.ClampToEdgeWrapping}),transparent:true,opacity:.55,depthWrite:false,color:0x241a20}));
fpShadow.rotation.x=-Math.PI/2;fpShadow.visible=false;fpShadow.renderOrder=1;scene.add(fpShadow);
function linkedPortalSlots(sceneId){const out=[];for(const portal of client.snapshot?.portals||[])for(const end of [portal.from,portal.to])if(end?.sceneId===sceneId&&end.slotId)out.push(end.slotId);return out;}
function skyMoodFor(cfg){
 const kind=cfg?.template?.kind;
 if(cfg?.data?.templateId==='forest_v1')return FOREST_SUNNY_SKY;
 if(cfg?.data?.templateId==='street_corner_v1')return {top:'#8fb6d6',horizon:'#dfe7ea',bottom:'#cbd3d2'};
 if(kind==='outdoor')return {top:'#9dbbd8',horizon:'#e8d4c0',bottom:'#cdb59e'};
 return {top:'#6f6a9e',horizon:'#d9a08f',bottom:'#c98f7c'};
}
let fpActive=false,thirdActive=false,currentPose='idle',actionPanel=null;
const viewToggle=mountViewToggle({canvas:R.renderer.domElement,onToggle:cycleView,onExit:exitView,isActive:()=>fpActive,isBlocked:()=>Boolean(editor?.active||editor?.resetPending||game.editing||settings.isOpen||agentConnect.panel||!worldReady)});
const localSound=new LocalSound();game.onVoice=kind=>localSound.play(kind);
const confirmClick=()=>localSound.playAction(UI_SOUND.confirm);
game.onClickSound=confirmClick;
document.addEventListener('click',event=>{
 if(event.button!==0)return;
 const target=event.target;
 const control=target.closest?.('button, a[href], summary, select, input:not([type="hidden"]), [role="button"], [role="tab"], [role="menuitem"]');
 if(control){
  if(!control.closest(':disabled, [aria-disabled="true"], [inert], [hidden]'))confirmClick();
 }else if(target.matches?.('dialog.settings-dialog, .agent-connect-backdrop'))confirmClick();
},true);
original.onActionSound=cue=>localSound.playAction(cue);
const transportMode=new URLSearchParams(location.search).get('transport')||'auto';
const client=new WorldClient({pollMs:100,prepareSnapshot:prepareLocalSnapshot,transport:transportMode}),actorTimeline=new ActorTimeline();let editor=null,activeScene=null,actor=null,lease=null,takeover=null,lastInputAt=0,lastPortalAt=0,portalPending=false;
const keys=new Set(),goal=new THREE.Vector3(),renderPosition=new THREE.Vector3();
let sprintHeld=false,sprintToggle=false,crawling=false,shiftHintAt=0,frameErrorAt=0,fpLockTimer=0,worldReady=false;
let diveRequested,swimDepth=0;
let wantSlide=false,slideUntil=0,slideDirX=0,slideDirZ=0,runningJump=false;
const WALK_FLYING_KICK_DISTANCE=1;
const SPRINT_FLYING_KICK_DISTANCE=2;
const AIR_FLYING_KICK_DISTANCE=3;
const ROLL_CHAIN_WINDOW_SECONDS=0.26;
let travelAction=null;
// 第一视角卡死排查：帧间隔、长任务、指针锁事件、运行时错误
const freezeLog={gaps:[],longTasks:[],lockEvents:[],errors:[],lastFrameAt:0,startedAt:Date.now()};
window.__freezeReport=()=>({uptimeMs:Date.now()-freezeLog.startedAt,gaps:freezeLog.gaps.slice(-12),longTasks:freezeLog.longTasks.slice(-12),lockEvents:freezeLog.lockEvents.slice(-12),errors:freezeLog.errors.slice(-6),fpActive,locked:document.pointerLockElement===document.querySelector('canvas')});
document.addEventListener('pointerlockchange',()=>freezeLog.lockEvents.push({t:Date.now()-freezeLog.startedAt,locked:!!document.pointerLockElement,fpActive}));
window.addEventListener('error',event=>freezeLog.errors.push({t:Date.now()-freezeLog.startedAt,message:String(event.message||event.error||'')}));
try{new PerformanceObserver(list=>{for(const entry of list.getEntries())if(entry.duration>200)freezeLog.longTasks.push({t:Date.now()-freezeLog.startedAt,duration:Math.round(entry.duration),name:entry.name});}).observe({entryTypes:['longtask']});}catch{}
const status=document.getElementById('world-sync-status');
const sprintStatus=document.getElementById('sprint-status');
let statusMessageUntil=0;
function showMessage(message){
 statusMessageUntil=performance.now()+4000;
 const connection=client.connectionStatus;
 if(connection==='offline'){
  status.dataset.control='offline';
  message='世界连接中断 · 正在自动重连';
 }else{
  status.removeAttribute('data-control');
  if(connection==='unauthorized')message='主人会话已失效，请刷新页面重新连接';
 }
 status.textContent=message;
}
function updateControlStatus(now=performance.now()){
 if(!actor||client.connectionStatus!=='connected'||now<statusMessageUntil)return;
 const controller=actor.controller;
 const inputLease=player.lease?.leaseId===controller?.leaseId?player.lease:null;
 const expiresAt=Math.max(controller?.expiresAt??0,inputLease?.expiresAt??0);
 const remaining=Math.ceil((expiresAt-Date.now())/1000);
 let kind='available',message='控制权空闲，智能体可接管';
 if(remaining>0){
  if(controller.subjectId==='local-owner'){
   kind='owner';
   message=player.held||actor.actionId
    ?'你正在控制 · 停手 10 秒后让出'
    :`你正在控制 · ${remaining} 秒后让出`;
  }else{
   kind='agent';
   message='智能体正在控制 · 按 WASD 接管';
  }
 }
 if(status.textContent!==message){
  status.dataset.control=kind;
  status.textContent=message;
 }
}
function setFirstPerson(active){
 if(active===fpActive)return;
 if(active&&!worldReady){showMessage('世界还在加载，稍等一下再切第一视角');return;}
 if(active&&thirdActive)setThirdPerson(false);
 if(active&&editor?.active){showMessage('先完成当前布置，再切换第一视角');return;}
 const cfg=registry.scenes.get(activeScene);
 fpActive=active;
 if(active){
  stopOrbit();
  fp.enter({position:renderPosition,yaw:actor?.rotation??whale.heading??0});
  setSkyMood(skyDome,skyMoodFor(cfg));skyDome.visible=true;fpShadow.visible=true;
  game.camera=fp.camera;game.centerPointer=true;game.suppressClick=false;
  if(R.renderPass)R.renderPass.camera=fp.camera;
  if(cfg)showEnclosure(cfg,true,linkedPortalSlots(activeScene));
  whale.group.visible=false;
  stopMovement();
  // 立刻锁定指针（延迟会丢掉 transient activation），卡顿由下一段的 watchdog 负责解锁退出
  viewToggle.setActive(true);viewToggle.requestLock();
  showMessage('第一视角 · 鼠标环视 · WASD 移动 · V 切到第三人称 · Esc 返回等距');
 }else{
  clearTimeout(fpLockTimer);fpLockTimer=0;fp.exit();
  skyDome.visible=false;fpShadow.visible=false;
  game.camera=iso.camera;game.centerPointer=false;game.suppressClick=false;
  if(R.renderPass)R.renderPass.camera=iso.camera;
  if(cfg)showEnclosure(cfg,false);
  whale.group.visible=true;
  viewToggle.setActive(false);viewToggle.exitLock();
  if(cfg?.template?.kind==='outdoor')iso.follow(renderPosition,0,true);
  else if(cfg){iso.target.copy(iso.homeTarget);iso.zoom=iso.zoomTarget=iso.homeZoom;}
  showMessage('等距视角 · WASD 移动 · 按住右键转镜头');
 }
}
function cycleView(){
 if(fpActive)setThirdPerson(true);
 else if(thirdActive)setThirdPerson(false);
 else setFirstPerson(true);
}
function exitView(){
 if(fpActive)setFirstPerson(false);
 else if(thirdActive)setThirdPerson(false);
 else if(orbitRightHeld)stopOrbit();
 else return false;
 return true;
}
function restoreIsoCamera(){
 const cfg=registry.scenes.get(activeScene);
 clearTimeout(fpLockTimer);fpLockTimer=0;
 skyDome.visible=false;fpShadow.visible=false;
 game.camera=iso.camera;game.centerPointer=false;game.suppressClick=false;
 if(R.renderPass)R.renderPass.camera=iso.camera;
 if(cfg)showEnclosure(cfg,false);
 whale.group.visible=true;
 if(cfg?.template?.kind==='outdoor')iso.follow(renderPosition,0,true);
 else if(cfg){iso.target.copy(iso.homeTarget);iso.zoom=iso.zoomTarget=iso.homeZoom;}
}
function setThirdPerson(active){
 if(active===thirdActive)return;
 if(active&&!worldReady){showMessage('世界还在加载，稍等一下再切视角');return;}
 if(active&&editor?.active){showMessage('先完成当前布置，再切换第三人称');return;}
 const cfg=registry.scenes.get(activeScene);
 if(active){
  if(fpActive)setFirstPerson(false);
  thirdActive=true;
  tp.enter({position:renderPosition,yaw:actor?.rotation??whale.heading??Math.PI});
  tpFacingState.facing=tp.yaw;tpFacingState.lastSceneId=activeScene;
  setSkyMood(skyDome,skyMoodFor(cfg));skyDome.visible=true;
  game.camera=tp.camera;game.centerPointer=false;game.suppressClick=false;
  if(R.renderPass)R.renderPass.camera=tp.camera;
  if(cfg)showEnclosure(cfg,true,linkedPortalSlots(activeScene));
  whale.group.visible=true;
  showMessage('第三人称 · WASD 相对镜头移动 · 右键拖动转镜头 · 滚轮缩放 · V / Esc 返回等距');
 }else{
  thirdActive=false;tp.exit();stopOrbit();
  restoreIsoCamera();
  showMessage('等距视角 · WASD 移动 · 按住右键转镜头');
 }
}
// 室内墙面限制镜头位置，户外的活动边界只限制角色。
function clampThirdCameraToRoom(){
 const cfg=registry.scenes.get(activeScene),b=cfg?.bounds;
 if(cfg?.template.kind!=='indoor'||!b)return;
 const c=tp.camera.position,m=0.28;
 const x=Math.min(Math.max(c.x,b.x0+m),b.x1-m);
 const z=Math.min(Math.max(c.z,b.z0+m),b.z1-m);
 const y=Math.max(c.y,0.45);
 if(Math.abs(x-c.x)>1e-4||Math.abs(z-c.z)>1e-4||Math.abs(y-c.y)>1e-4){c.set(x,y,z);tp.camera.lookAt(tp._look);}
}
client.onStatus(value=>{if(value==='connected'){statusMessageUntil=0;updateControlStatus();}else{keys.clear();player.release();lease=null;showMessage(value==='unauthorized'?'主人会话已失效，请刷新页面重新连接':'世界离线 · 草稿已保留，正在重连');}});
function showScene(id){const cfg=registry.scenes.get(id);if(!cfg)return;if(activeScene!==id)original.cancelSpellCast?.();activeScene=id;registry.show(id);refreshScenePicker();const street=cfg.data.templateId==='street_corner_v1';scene.background=street?new THREE.Color(0xc9e5ed):cfg.data.templateId==='forest_v1'?new THREE.Color(FOREST_SUNNY_SKY.horizon):(cfg.data.templateId==='coastal_town_v1'||cfg.template.authorSceneId)?new THREE.Color(0xd8e6dd):null;applySceneLighting(cfg.data.templateId);iso.setProfile(cfg.data.templateId);iso.setView(cfg.view.target,cfg.view.zoom);iso.target.copy(iso.homeTarget);iso.zoom=iso.homeZoom;iso.zoomTarget=iso.homeZoom;iso.drag=iso.dragTarget=0;iso.par.set(0,0);iso.parTarget.set(0,0);game.setScene(cfg);whale.bounds=cfg.bounds;whale.colliders=null;if(fpActive){showEnclosure(cfg,true,linkedPortalSlots(id));setSkyMood(skyDome,skyMoodFor(cfg));fp.yaw=actor?.rotation??fp.yaw;}else if(thirdActive){showEnclosure(cfg,true,linkedPortalSlots(id));setSkyMood(skyDome,skyMoodFor(cfg));tp.yaw=actor?.rotation??tp.yaw;}editor?.setContext(id);const loc=document.getElementById('loc');if(loc)loc.textContent=`${cfg.label}`;lastPortalAt=performance.now();}
let activeMeal;
client.onEvent(({kind,data})=>{
 if(!activeMeal||data?.actionId!==activeMeal.actionId)return;
 if(kind==='action.completed')localSound.playMealReaction(activeMeal.foodId);
 if(['action.completed','action.cancelled','action.failed'].includes(kind))activeMeal=null;
});
function applyRenderSnapshot(snapshot){
 registry.applySnapshot(snapshot);refreshScenePicker();
 if(editor){const missing=Object.values(registry.contexts).some(c=>!c.sync);if(missing)editor.updateWorldContexts();}
 if(actor&&activeScene!==actor.sceneId){
  const destination=registry.scenes.get(actor.sceneId);
  if(activeScene&&destination&&!teleportPending&&!baizeBattle.active&&!actor.battle){
   localSound.playAction('scene-transition');
   void teleportEffect.reveal(destination.label);
  }
  renderPosition.fromArray(actor.position);showScene(actor.sceneId);
  if(!actor.battle)playSceneMusic();
 }
 game._syncStats();
}
function playSceneMusic(){
 const cfg=registry.scenes.get(activeScene);
 if(!cfg)return;
 const type=cfg.data.templateId;
 localSound.setMusic(type==='forest_v1'?'wild':type==='courtyard_v1'||cfg.template.kind==='indoor'?'home':'city');
}
client.onSnapshot(snapshot=>{
 const next=snapshot.actors.find(a=>a.actorId==='whale')||snapshot.actors[0];if(!next)return;
 const meal=snapshot.actions?.[next.actionId];
 if(meal?.kind==='eat'&&meal.status==='running'){
  activeMeal={actionId:next.actionId,foodId:meal.foodId??'rice'};
 }
 if(actor?.sceneId!==next.sceneId&&portalPending)keys.clear();
 actor=next;player.reconcile(next);actorTimeline.push(next,performance.now());
 if(portalPending&&!player.active&&!next.actionId&&!dispatcher.busy)portalPending=false;
 if(lease){
  const current=next.controller;
  lease=current?.leaseId===lease.leaseId&&current.leaseVersion===lease.leaseVersion?current:null;
 }
 const need=next.needs||{};game.stats.food=100-(need.hunger??54);game.stats.mood=need.happiness??72;game.stats.energy=need.energy??80;
 if(renderActivity.active||!worldReady)applyRenderSnapshot(snapshot);
 worldReady=true;
});
async function control(force=false){if(takeover)return takeover;if(!force&&lease&&lease.expiresAt>Date.now()+5000)return lease;takeover=client.dispatch({kind:force||!lease?'control.takeover':'control.renew',payload:force||!lease?{actorId:actor.actorId}:{actorId:actor.actorId,leaseId:lease.leaseId,leaseVersion:lease.leaseVersion}})
  .catch(error=>{
   // 续租时发现租约已失效（过期/被接管）：丢掉旧租约，改用 takeover 重新拿一次
   if(!force&&/LEASE_(INVALID|BUSY)/.test(String(error?.message||error?.status||''))){lease=null;return client.dispatch({kind:'control.takeover',payload:{actorId:actor.actorId}});}
   throw error;
  })
  .then(result=>{lease=result;if(player?.active)player.lease=result;return result;}).finally(()=>takeover=null);return takeover;}
const dispatcher=new ActionDispatcher(async(kind,target,{force=false,foodId}={})=>{if(!actor||client.connectionStatus!=='connected')return;try{const token=await control(force);const current=client.snapshot.actors.find(a=>a.actorId===actor.actorId);if(kind!=='cancel'&&current.actionId&&!(kind==='move'&&client.snapshot.actions[current.actionId]?.kind==='move')){await client.dispatch({kind:'action.submit',payload:{actorId:actor.actorId,leaseId:token.leaseId,leaseVersion:token.leaseVersion,kind:'cancel'}});}return await client.dispatch({kind:'action.submit',payload:{actorId:actor.actorId,leaseId:token.leaseId,leaseVersion:token.leaseVersion,kind,...(target?{target}:{}),...(foodId?{foodId}:{})}});}catch(error){showMessage(`操作未执行：${error.message}`);}});
game.movingGuard=()=>player.held||Boolean(player.sample()?.moving);
const baizeEncounter=createBaizeEncounter();
let encounterPending=false,encounterSceneId;
const player=new PlayerController({onStep:checkBaizeEncounter,takeControl:()=>control(true),send:payload=>client.dispatch({kind:'actor.input',payload},{refresh:false}),onRelease:last=>{if(last)actorTimeline.handoff(last,performance.now());},onError:error=>{baizeEncounter.clearGrass();keys.clear();showMessage(`移动未同步：${error.message}`);}});
const baizeFollower=createBaizeFollower(scene);
const baizeBattle=mountBaizeBattle(client,{
 character:original,
 playSound:cue=>localSound.playAction(cue),
 onEnter:showIntro=>{
  keys.clear();sprintHeld=false;stopOrbit();viewToggle.exitLock();
  player.release();lease=null;portalPending=false;
  if(travelAction){travelAction=null;original.stopPreview();}
  localSound.setMusic('battle');
  if(showIntro){
   localSound.playAction('battle-encounter');
   void teleportEffect.reveal('遇到野生白泽',{encounter:true});
  }
 },
 onExit:()=>{
  keys.clear();baizeEncounter.afterBattle();baizeFollower.reset();actorTimeline.handoff(actor,performance.now());renderPosition.fromArray(actor.position);
  playSceneMusic();
  localSound.playAction('scene-transition');
  void teleportEffect.reveal(registry.scenes.get(activeScene)?.label??'返回探索');
 },
});
client.onSnapshot(snapshot=>{
 const next=snapshot.actors.find(a=>a.actorId===actor?.actorId);
 if(!next)return;
 if(next.sceneId!==encounterSceneId||next.actionId){
  encounterSceneId=next.sceneId;
  baizeEncounter.clearGrass();
 }
 baizeBattle.sync(next.battle,next.actorId);
});
function checkBaizeEncounter(previous,next,snapshot){
 if(encounterPending||!baizeFollower.available||!previous.position||client.connectionStatus!=='connected')return;
 const inForest=snapshot.scenes.find(scene=>scene.sceneId===next.sceneId)?.templateId==='forest_v1';
 if(baizeEncounter.advance(previous,next,inForest))void requestBaizeBattle(next.actorId);
}
async function requestBaizeBattle(actorId){
 encounterPending=true;
 const generation=player.generation;
 keys.clear();
 player.stop();
 try{
  await player.drain();
  if(player.generation!==generation||!player.lease||!player.ack)return;
  const {leaseId,leaseVersion}=player.lease;
  await client.dispatch({kind:'battle.start',payload:{actorId,leaseId,leaseVersion,sequence:player.ack}});
 }catch(error){
  if(!['BATTLE_START_UNAVAILABLE','LEASE_INVALID','ACTOR_IN_BATTLE'].includes(error.message))showMessage('遇敌未同步，请继续探索');
 }finally{
  baizeEncounter.clearGrass();
  encounterPending=false;
 }
}
async function action(kind,target,options){
 if(encounterPending)return;
 try{if(player.active){player.stop();await player.drain();await client.refreshState();const settled=client.snapshot.actors.find(a=>a.actorId===actor.actorId);if(settled)actorTimeline.handoff(settled,performance.now());player.release();}
  return await dispatcher.submit(kind,target,options);
 }catch(error){showMessage(`操作未执行：${error.message}`);}
 finally{if(kind==='cancel')portalPending=false;}
}
function interact(kind,target){if(!actor)return;stopMovement();keys.clear();if(kind==='eat')return action(kind,undefined,{force:true});const candidate=client.snapshot.entities.filter(e=>(!target?.entityId||e.entityId===target.entityId)&&getCatalogEntry(e.type).actions.includes(kind)).sort((a,b)=>Number(b.sceneId===actor.sceneId)-Number(a.sceneId===actor.sceneId))[0];if(!candidate){showMessage('世界里还没有对应的家具');return;}if(kind==='climbTree')crawling=false;action(kind,{entityId:candidate.entityId,anchorId:'approach'},{force:true}).then(result=>{if(!result)return;if(kind==='climbTree')showMessage('爬树 · 按方向键可中途下来');localSound.play(kind);});}
game.worldAction=interact;
const foodPicker=mountFoodPicker({
 entry:toolbar.querySelector('[data-act="feed"]'),
 onOpen:()=>{stopMovement();stopOrbit();},
 onChoose:foodId=>action('eat',undefined,{force:true,foodId}),
});
game.onFeed=()=>foodPicker.open();
game.getFurniture=()=>registry.scenes.get(activeScene)?.furniture.children||[];
const teleportEffect=createTeleportEffect();let teleportPending=false;
async function teleportToScene(id,landmarkId,label){
 if(teleportPending||encounterPending||!actor)return false;
 if(client.connectionStatus!=='connected'){showMessage('世界尚未连接，请稍后传送');return false;}
 if(id===actor.sceneId&&!landmarkId)return true;
 if(dispatcher.busy){showMessage('请等待当前操作完成后传送');return;}
 teleportPending=true;keys.clear();
 try{
  if(editor?.active){await editor.setActive(false);if(editor.active){showMessage('请先保存当前布置再传送');return;}}
  player.stop();await player.drain();player.release();lease=null;
  localSound.playAction('scene-transition');
  await teleportEffect.depart(label||registry.scenes.get(id)?.label||id);
  await client.dispatch({kind:'actor.teleport',payload:{actorId:actor.actorId,...(id?{sceneId:id}:{templateId:'forest_v1'}),...(landmarkId?{landmarkId}:{})}});
  actorTimeline.handoff(actor,performance.now());renderPosition.fromArray(actor.position);
  if(landmarkId){
   baizeEncounter.clearGrass();
   if(!fpActive&&!thirdActive)iso.follow(renderPosition,0,true);
  }
  await teleportEffect.arrive();
  return true;
 }catch(error){showMessage(error.message==='QUOTA_EXCEEDED'?'场景数量已达上限，无法创建森林':`传送失败：${error.message}`);return false;}
 finally{teleportEffect.clear();teleportPending=false;keys.clear();}
}
const eventMenu=toolbar.querySelector('#quick-events');
const QUICK_EVENTS={
 sleep:{sceneId:'bedroom',type:'bed',label:'床'},
 computer:{sceneId:'bedroom',type:'chair',label:'电脑桌旁的椅子'},
 climbTree:{sceneId:'yard',type:'yardTree',label:'树'},
};
let quickEventPending=false;
async function runQuickEvent(kind){
 if(quickEventPending||!worldReady||!actor||client.connectionStatus!=='connected')return;
 const {sceneId,type,label}=QUICK_EVENTS[kind];
 const findTarget=()=>{
  const entities=client.snapshot.entities.filter(e=>e.sceneId===sceneId);
  if(kind!=='computer')return entities.find(e=>e.type===type);
  const desk=entities.find(e=>e.type==='desk');
  if(!desk)return null;
  const distanceToDesk=e=>Math.hypot(e.position[0]-desk.position[0],e.position[2]-desk.position[2]);
  return entities.filter(e=>e.type===type&&distanceToDesk(e)<1.8).sort((a,b)=>distanceToDesk(a)-distanceToDesk(b))[0];
 };
 let target=findTarget();
 if(!target){showMessage(`场景里找不到${label}`);return;}
 quickEventPending=true;
 try{
  stopMovement();stopOrbit();crawling=false;
  if(editor?.active){await editor.setActive(false);if(editor.active)return;}
  if(!await teleportToScene(sceneId))return;
  target=findTarget();
  if(!target){showMessage(`场景里找不到${label}`);return;}
  const result=await action(kind,{entityId:target.entityId,anchorId:'approach'},{force:true});
  if(result){showMessage(`${kind==='computer'?'玩电脑':kind==='sleep'?'睡觉':'爬树'} · 按方向键结束`);localSound.play(kind);}
 }finally{quickEventPending=false;}
}
eventMenu.addEventListener('click',event=>{
 const kind=event.target.closest('[data-event]')?.dataset.event;
 if(!kind)return;
 eventMenu.open=false;
 eventMenu.querySelector('summary').focus();
 void runQuickEvent(kind);
});
document.addEventListener('pointerdown',event=>{if(!eventMenu.contains(event.target))eventMenu.open=false;});
eventMenu.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&eventMenu.open){eventMenu.open=false;eventMenu.querySelector('summary').focus();}
});
const leftRail=document.createElement('div');leftRail.id='left-rail';leftRail.style.cssText='position:fixed;left:24px;top:110px;z-index:30;display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 312px);overflow:auto;padding-right:4px';document.body.append(leftRail);
const scenePicker=document.createElement('nav');scenePicker.setAttribute('aria-label','场景传送');scenePicker.style.cssText='display:grid;gap:7px;background:#faf1e5ed;padding:12px;border:1px solid #fff9;border-radius:16px;font:14px system-ui;min-width:110px';leftRail.append(scenePicker);
let scenePickerKey='';
function sceneEntry(node,label,current,disabled=false){
 node.textContent=label;
 node.style.cssText=`border:1px solid ${current?'#af8556':'#cbbba8'};background:${current?'#dfc39f':'#fff9ee'};color:#51454a;border-radius:10px;padding:9px 12px;font:inherit;cursor:${disabled?'default':'pointer'}`;
 if(current)node.setAttribute('aria-current','location');
}
function positionForestPicker(){
 const open=scenePicker.querySelector('.forest-teleport[open]');
 if(!open)return;
 const anchor=open.querySelector('summary').getBoundingClientRect();
 const rail=leftRail.getBoundingClientRect();
 if(anchor.bottom<=rail.top||anchor.top>=rail.bottom){open.open=false;return;}
 const box=open.querySelector('.forest-destinations');
 box.style.left=`${rail.right+7}px`;
 box.style.top=`${Math.max(8,Math.min(anchor.top,window.innerHeight-box.offsetHeight-8))}px`;
}
leftRail.addEventListener('scroll',positionForestPicker);
window.addEventListener('resize',positionForestPicker);
document.addEventListener('pointerdown',event=>{
 const open=scenePicker.querySelector('.forest-teleport[open]');
 if(open&&!open.contains(event.target))open.open=false;
});
scenePicker.addEventListener('keydown',event=>{
 const open=event.target.closest('.forest-teleport[open]');
 if(event.key==='Escape'&&open){open.open=false;open.querySelector('summary').focus();}
});
function refreshScenePicker(){
 const choices=[...registry.scenes].filter(([,cfg])=>cfg.data.status==='active');
 if(!choices.some(([,cfg])=>cfg.data.templateId==='forest_v1'))choices.push([null,{data:{templateId:'forest_v1'},label:'森林'}]);
 const key=JSON.stringify([activeScene,choices.map(([id,cfg])=>[id,cfg.label])]);if(key===scenePickerKey)return;scenePickerKey=key;
 scenePicker.replaceChildren();
 for(const [id,cfg]of choices){
  const current=id===activeScene;
  if(cfg.data.templateId==='forest_v1'){
   const details=document.createElement('details'),summary=document.createElement('summary');
   details.className='forest-teleport';
   details.addEventListener('toggle',positionForestPicker);
   sceneEntry(summary,cfg.label,current);
   const destinations=document.createElement('div');
   destinations.className='forest-destinations';
   destinations.setAttribute('role','group');
   destinations.setAttribute('aria-label','森林传送点');
   for(const [landmarkId,label] of [['entrance','入口'],['summit-lake','湖泊']]){
    const button=document.createElement('button');
    button.type='button';
    sceneEntry(button,label,false);
    button.onclick=()=>{details.open=false;void teleportToScene(id,landmarkId,`${cfg.label} · ${label}`);};
    destinations.append(button);
   }
   details.append(summary,destinations);
   scenePicker.append(details);
   continue;
  }
  const button=document.createElement('button');
  button.type='button';button.disabled=current;
  sceneEntry(button,cfg.label,current,current);
  button.onclick=()=>{keys.clear();void teleportToScene(id);};
  scenePicker.append(button);
 }
}

const editable=target=>target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName);
window.addEventListener('keydown', event => {
 if (!['KeyQ','KeyF','KeyE','KeyX','KeyG'].includes(event.code) || event.repeat || event.isComposing || event.metaKey || event.ctrlKey || (event.altKey&&!sprintHeld) || editable(event.target)) return;
 if (!worldReady || !actor || mode !== 'dafeiyu' || whale !== original || original.spellHeading!=null || teleportPending || portalPending || editor?.active || editor?.resetPending || agentConnect.panel || game.editing || crawling) return;
 if(travelAction){
  if(event.code==='KeyF'&&travelAction.roll){
   const roll=original.previewAction;
   if(roll&&original.previewEnd-roll.time<=roll.getEffectiveTimeScale()*ROLL_CHAIN_WINDOW_SECONDS){
    travelAction.buffered=true;
   }
   event.preventDefault();
  }
  return;
 }
 const motion=player.sample();
 const airborne=motion?.grounded===false&&!actor.actionId;
 const moving=player.held&&motion?.moving&&!actor.actionId;
 const sprint=sprintHeld||sprintToggle;
 if(event.code==='KeyF'){
  if(actor.actionId||client.connectionStatus!=='connected'||!original.startRoll({interruptWalking:player.active}))return;
  startTravelAction(4,true,{roll:true});
 }else if(event.code==='KeyX'){
  if(actor.actionId||!original.toggleFloorSit({interruptWalking:player.active}))return;
  if(original.floorSitting)keys.clear();
 }else if(event.code==='KeyG'){
  if(actor.actionId||!original.startRandomDance({interruptWalking:player.active}))return;
  keys.clear();
  showMessage('跳舞中 · G 重抽 · 方向键停止');
 }else if(event.code==='KeyE'){
  if(actor.actionId||!original.startPunch({interruptWalking:player.active}))return;
 }else if(moving||airborne){
  if(!original.startFlyingKick({airborne}))return;
  const distance=airborne?AIR_FLYING_KICK_DISTANCE:sprint?SPRINT_FLYING_KICK_DISTANCE:WALK_FLYING_KICK_DISTANCE;
  startTravelAction(distance,airborne||sprint);
 }else if(!original.startKick({interruptWalking:player.active&&!actor?.actionId})){
  return;
 }
 event.preventDefault();
 if(original.blocksWalking)pauseKeyboardWalking();
 actionPanel?.clearSelection();
});
window.addEventListener('keydown',e=>{if(teleportPending||e.repeat||editor?.resetPending||agentConnect.panel||editable(e.target)||!['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','AltLeft','AltRight','ControlLeft','ControlRight','KeyC'].includes(e.code))return;if(e.code==='AltLeft'||e.code==='AltRight'){sprintHeld=true;e.preventDefault();e.stopImmediatePropagation();return;}
 if(e.code==='ShiftLeft'||e.code==='ShiftRight'){
  // 点一下切换冲刺：避免长时间按住 Shift 触发浏览器扩展的长按快捷键
  e.preventDefault();e.stopImmediatePropagation();
  sprintToggle=!sprintToggle;
  sprintStatus.textContent=sprintToggle?'冲刺模式：开 · 按 Shift 关闭':'冲刺模式：关 · 按 Shift 开启';
  return;
 }
 if(e.code==='ControlLeft'||e.code==='ControlRight'||e.code==='KeyC'){
  const motion=player.sample()??actor;
  if(!editor?.active&&motion?.form==='swim'){
   if(e.code==='KeyC'&&motion.grounded!==false&&!settings.isOpen&&!foodPicker.isOpen){
    diveRequested=!(diveRequested??motion.diving);
    showMessage(diveRequested?'潜水 · C / 空格浮出':'浮出水面');
   }
  }else if(!editor?.active){
   const moving=keys.has('KeyW')||keys.has('KeyA')||keys.has('KeyS')||keys.has('KeyD');
   if(crawling)leaveCrawl();
   else if((sprintHeld||sprintToggle)&&moving)wantSlide=true;
   else if(!travelAction&&!whale.externalMotion?.jumping){
    crawling=true;
    showMessage('匍匐前进 · C / 空格起身');
   }
  }
  e.preventDefault();
  e.stopImmediatePropagation();
  return;
 }
 e.preventDefault();
 if(e.code==='Space'){
  if(!editor?.active&&!player.jumpRequested){
   if((diveRequested??(player.sample()??actor)?.diving)===true){
    diveRequested=false;
    showMessage('浮出水面');
   }else if(crawling)leaveCrawl();
   else{
    const sprinting=sprintHeld||sprintToggle;
    const moving=keys.has('KeyW')||keys.has('KeyA')||keys.has('KeyS')||keys.has('KeyD');
    runningJump=sprinting&&moving;
    player.jumpRequested=true;
   }
  }
  return;
 }
 keys.add(e.code);
});
function leaveCrawl(){
 crawling=false;
 if(whale.startCrawlRecovery?.()){
  pauseKeyboardWalking();
  showMessage('侧翻 · 鲤鱼打挺');
 }else showMessage('起身');
}
window.addEventListener('keyup',e=>{if(e.code==='AltLeft'||e.code==='AltRight')sprintHeld=false;const wasMovement=keys.delete(e.code);if(wasMovement&&!keys.size&&!editor?.active){player.stop();player.flush().catch(()=>{});}});
function pauseKeyboardWalking(){
 if(!player.held&&!player.sample()?.moving)return;
 player.stop();
 player.flush().catch(()=>{});
}
function stopMovement(){sprintHeld=false;diveRequested=undefined;const moving=keys.size>0;keys.clear();if(moving&&!editor?.active){player.stop();player.flush().catch(()=>{});}}window.addEventListener('blur',stopMovement);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMovement();});
const pointer=new THREE.Vector2();window.addEventListener('pointermove',e=>{pointer.set(e.clientX/window.innerWidth*2-1,-e.clientY/window.innerHeight*2+1);iso.setPointer(pointer.x,pointer.y);});
const canvas=R.renderer.domElement;
const spellBar=mountSpellBar({canvas,scene,playSound:cue=>localSound.playAction(cue),startCast:({start,end},release)=>{
 if(whale!==original||actor.actionId||crawling||travelAction||performance.now()<slideUntil||
    ['tree-climbing','climbing','sleeping','seated','eating','jumping'].includes(actor.pose))return false;
 if(mode!=='dafeiyu'&&!original.actions?.HumanSpFrisbeeThrow){release();return true;}
 const heading=Math.atan2(end.x-start.x,end.z-start.z);
 if(!original.startSpellCast(heading,release))return false;
 pauseKeyboardWalking();
 actionPanel?.clearSelection();
 return true;
},getContext:()=>actor&&{
 actor,feet:renderPosition,snapshot:client.snapshot,camera:fpActive?fp.camera:thirdActive?tp.camera:camera,
 training:actor.sceneId==='yard'?yard?.training:null,
 centered:fpActive||document.pointerLockElement===canvas,
 ready:worldReady&&client.connectionStatus==='connected'&&!teleportPending&&!portalPending&&
  !editor?.active&&!editor?.resetPending&&!game.editing&&!settings.isOpen&&!foodPicker.isOpen&&!agentConnect.panel,
}});
let fpDragging=false,lastX=0,lastY=0,fpPressMoved=0,thirdLeftHeld=false;
let orbitRightHeld=false,orbitLockPending=false,orbitLocked=false;
const canOrbit=()=>!fpActive&&worldReady&&!editor?.active&&!game.editing&&!settings.isOpen&&!agentConnect.panel;
function stopOrbit(){
 orbitRightHeld=false;
 thirdLeftHeld=false;
 document.body.style.cursor='';
 canvas.style.cursor='';
 if(orbitLocked&&document.pointerLockElement===canvas)document.exitPointerLock?.();
 orbitLocked=false;
}
function startOrbit(event){
 if(orbitRightHeld||!canOrbit())return;
 orbitRightHeld=true;
 game.pointerDown=null;
 lastX=event.clientX;lastY=event.clientY;
 document.body.style.cursor='none';
 canvas.style.cursor='none';
 if(orbitLockPending||!canvas.requestPointerLock)return;
 if(document.pointerLockElement===canvas){orbitLocked=true;return;}
 orbitLockPending=true;
 const unlockPending=()=>{orbitLockPending=false;};
 try{canvas.requestPointerLock()?.catch?.(unlockPending);}
 catch{unlockPending();}
}
// In third person the left button contributes only to the two-button movement shortcut.
function syncOrbitButtons(event){
 thirdLeftHeld=thirdActive&&canOrbit()&&(event.buttons&1)!==0;
 if(orbitRightHeld&&(!(event.buttons&2)||!canOrbit()))stopOrbit();
}
function thirdMoveAxis(){const both=thirdLeftHeld&&orbitRightHeld;return thirdPersonMoveAxis({forward:keys.has('KeyW'),backward:keys.has('KeyS'),left:keys.has('KeyA'),right:keys.has('KeyD'),bothButtons:both});}
canvas.addEventListener('pointerdown',event=>{
 if(fpActive){
  if(event.button!==0)return;
  if(document.pointerLockElement!==canvas)viewToggle.requestLock();
  fpDragging=true;lastX=event.clientX;lastY=event.clientY;fpPressMoved=0;
  return;
 }
 if(!canOrbit())return;
 syncOrbitButtons(event);
 if(event.button===2){event.preventDefault();startOrbit(event);}
 if(orbitRightHeld)game.pointerDown=null;
});
// Chromium may omit a second pointerdown when the left button was already held.
canvas.addEventListener('mousedown',event=>{
 if(!canOrbit())return;
 syncOrbitButtons(event);
 if(event.button===2)startOrbit(event);
 if(orbitRightHeld)game.pointerDown=null;
});
canvas.addEventListener('pointermove',event=>{
 const locked=document.pointerLockElement===canvas;
 const dx=locked?(event.movementX||0):(event.clientX-lastX);
 const dy=locked?(event.movementY||0):(event.clientY-lastY);
 if(fpActive){
  if(locked||fpDragging)fp.look(dx,dy);
  if(locked){fpPressMoved+=Math.abs(dx)+Math.abs(dy);if(fpPressMoved>30)game.suppressClick=true;}
 }else{
  syncOrbitButtons(event);
  if(orbitRightHeld){
   if(thirdActive)tp.look(dx,dy);
   else iso.addDrag(dx*.005);
  }
 }
 lastX=event.clientX;lastY=event.clientY;
});
function releasePointerButtons(event){
 if(fpActive){if(event.button===0){fpDragging=false;fpPressMoved=0;}return;}
 syncOrbitButtons(event);
}
window.addEventListener('pointerup',releasePointerButtons);
window.addEventListener('mouseup',releasePointerButtons);
function cancelPointerDrag(){fpDragging=false;fpPressMoved=0;stopOrbit();}
canvas.addEventListener('pointercancel',cancelPointerDrag);
window.addEventListener('blur',()=>{cancelPointerDrag();if(fpActive)viewToggle.exitLock();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelPointerDrag();});
canvas.addEventListener('contextmenu',event=>{if(canOrbit())event.preventDefault();});
document.addEventListener('pointerlockerror',()=>{orbitLockPending=false;});
document.addEventListener('pointerlockchange',()=>{
 if(document.pointerLockElement===canvas&&orbitLockPending){
  orbitLockPending=false;
  if(fpActive)return;
  orbitLocked=true;
  if(!orbitRightHeld||!canOrbit())stopOrbit();
 }else if(document.pointerLockElement!==canvas&&orbitLocked){
  stopOrbit();
 }
});
canvas.addEventListener('wheel',e=>{if(thirdActive){e.preventDefault();tp.zoom(e.deltaY);return;}if(!fpActive)return;e.preventDefault();fp.setFov(fp.fov-Math.sign(e.deltaY)*3);},{passive:false});
bindCameraWheel(canvas,iso,()=>editor);
window.addEventListener('resize',()=>{R.resize(window.innerWidth,window.innerHeight);iso.resize();fp.resize(window.innerWidth,window.innerHeight);tp.resize(window.innerWidth,window.innerHeight);});
function directions(snapshot){
 const result=[];
 for(const portal of snapshot.portals){
  const end=portalEnds(snapshot,portal);
  const isForestGate=[portal.from?.slotId,portal.to?.slotId].includes(YARD_FOREST_SLOT);
  if(end.fromSceneId===actor.sceneId)result.push({...end,gate:isForestGate,inwardNormal:portalInwardNormal(snapshot,{...portal,...end})});
  if(portal.bidirectional&&end.toSceneId===actor.sceneId)result.push({fromSceneId:end.toSceneId,toSceneId:end.fromSceneId,departure:end.landing,landing:end.departure,gate:isForestGate,inwardNormal:portalInwardNormal(snapshot,{...portal,...end},true)});
 }
 return result;
}
function startTravelAction(distance,sprint,{roll=false,heading=original.heading}={}){
 if(!player.active)player.begin(actor,{sceneId:actor.sceneId,position:renderPosition.toArray()});
 travelAction={heading,direction:[Math.sin(heading),Math.cos(heading)],sceneId:actor.sceneId,remaining:distance,sprint,roll,buffered:false};
}
function advanceTravelAction(dt,now){
 const action=travelAction;
 const state=player.sample();
 if(!state||state.sceneId!==action.sceneId||state.form==='swim'||!original.blocksWalking){
  travelAction=null;
  original.stopPreview();
  return false;
 }
 const speed=PLAYER_SPEED*(action.sprint?2:1);
 const distance=Math.min(action.remaining,speed*dt);
 let movedFor=0;
 if(distance>0){
  const [x,y,z]=state.position,[dx,dz]=action.direction;
  const end=[x+dx*distance,y,z+dz*distance];
  const air=(state.airHeight||0)+(state.supportHeight||0);
  const feetY=state.grounded===false?y+(state.airHeight||0):undefined;
  if(segmentWalkable(client.snapshot,action.sceneId,state.position,end,air,feetY)){
   player.step(client.snapshot,action.direction,distance/speed,false,action.sprint);
   movedFor=distance/speed;
   action.remaining=Math.max(0,action.remaining-distance);
  }else action.remaining=0;
 }
 if(player.sample()?.grounded===false){
  // Keep gravity running even when the kick runs out of distance or hits a wall.
  const fallTime=dt-movedFor;
  if(fallTime>1e-6)player.step(client.snapshot,[0,0],fallTime);
 }
 if(action.remaining===0&&player.sample()?.grounded!==false)pauseKeyboardWalking();
 else if(now-lastInputAt>=100){lastInputAt=now;player.flush().catch(()=>{});}
 return true;
}
function updateKeyboard(dt,now){
 if(teleportPending||settings.isOpen||foodPicker.isOpen||agentConnect.panel||editor?.resetPending){stopMovement();return;}
 let x=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),z=Number(keys.has('KeyS'))-Number(keys.has('KeyW'));
 if(thirdActive&&!editor?.active){const axis=thirdMoveAxis();x=axis.x;z=axis.z;}
 if(!actor)return;
 if(travelAction&&!editor?.active&&advanceTravelAction(dt,now))return;
 if(whale.floorSitting&&(x||z||player.jumpRequested||crawling))whale.endFloorSit();
 if(x||z||player.jumpRequested||crawling)whale.endDance?.();
 if(whale.blocksWalking&&!editor?.active){
  if(x||z)whale.finishPreviewCycle();
  pauseKeyboardWalking();
  return;
 }
 if(!(x||z)&&!player.jumpRequested&&diveRequested===undefined&&!(now<slideUntil)&&player.sample?.()?.grounded!==false){if(player.active&&player.held){player.stop();player.flush().catch(()=>{});}return;}
 let dx,dz;
 if(thirdActive){
  // 第三人称：WASD 相对镜头（W 前、S 后、A/D 左右平移）
  const move=thirdPersonMoveDirection(tp.yaw,x,z);dx=move.dx;dz=move.dz;
 }else{
  const az=fpActive?Math.PI/2-fp.yaw:iso.az+iso.drag;
  dx=x*Math.sin(az)+z*Math.cos(az);dz=-x*Math.cos(az)+z*Math.sin(az);
 }
 let length=Math.hypot(dx,dz);
 if(wantSlide){
  wantSlide=false;
  const sprinting=(sprintHeld||sprintToggle)&&!crawling;
  const grounded=player.sample?.()?.grounded!==false;
  if(sprinting&&grounded&&length>0.01&&now>=slideUntil){
   slideUntil=now+900;slideDirX=dx/length;slideDirZ=dz/length;crawling=false;
   original.startSlideClip?.(now,slideUntil);
   showMessage('滑铲');
  }
 }
 if(now<slideUntil){dx=slideDirX;dz=slideDirZ;length=1;crawling=false;}
 if(editor?.active){iso.target.x+=dx/length*4*dt;iso.target.z+=dz/length*4*dt;return;}
 if(portalPending||client.connectionStatus!=='connected')return;
 if(player.active&&player.lease?.expiresAt<=Date.now())player.release();
 if(!player.active)player.begin(actor,whale.state==='sleep'?null:{sceneId:actor.sceneId,position:[renderPosition.x,renderPosition.y,renderPosition.z]});
 const sprinting=(sprintHeld||sprintToggle)&&!crawling&&!whale.boxingActive;
 // Separate two real Space presses even when no simulation frame fell between them.
 if(player.jumpRequested&&player.sample()?.jumpHeld)player.step(client.snapshot,[0,0],0);
 const dive=diveRequested;
 diveRequested=undefined;
 player.step(client.snapshot,[length?dx/length:0,length?dz/length:0],dt,player.jumpRequested,sprinting,crawling,whale.boxingActive,dive);player.jumpRequested=false;
 const position=player.sample()?.position||actor.position;
 const portal=directions(client.snapshot).find(p=>reachesKeyboardPortal(p,position,dx,dz));
 if(portal&&now-lastPortalAt>2000){
  lastPortalAt=now;portalPending=true;
  action('move',{sceneId:portal.toSceneId}).then(result=>{if(!result)portalPending=false;}).catch(error=>{portalPending=false;showMessage(error.message);});return;
 }
 if(dive!==undefined||now-lastInputAt>=100){lastInputAt=now;player.flush().catch(()=>{});}
}
let activeComputerDisplay;
let renderedSpellCast;
const spellHand=()=>original.bones?.handR?.getWorldPosition(new THREE.Vector3());
function renderActor(dt,t){if(!actor)return;const local=player.sample();let visual={...(local||actorTimeline.sample(performance.now())||actor)};if(local)visual.maneuver=null;
 if(forestLighting&&visual.form==='swim'&&!waterAt(client.snapshot,visual)){
  visual={...visual,form:'normal',pose:visual.grounded===false?'jumping':visual.moving?'walking':'idle',diving:false};
 }
 currentPose=visual.pose;const next=visual.form==='swim'?blob:original;if(next!==whale){whale.group.visible=false;whale=next;whale.group.visible=true;game.whale=whale;window.__whale=whale;if(next===blob)localSound.play('pool');fx.splash(new THREE.Vector3(...actor.position));}
 visual.sprint=(local?(sprintHeld||sprintToggle):visual.sprint)&&!crawling&&!whale.boxingActive;
 visual.crawl=crawling;
 visual.runningJump=runningJump;
 if(next===original&&original.spellHeading!=null){
  visual={...visual,moving:false,rotation:original.spellHeading};
 }else if(travelAction&&next===original&&original.blocksWalking&&visual.sceneId===travelAction.sceneId){
  // Keep the selected action playing while its movement is applied.
  visual={...visual,moving:false,rotation:travelAction.heading};
 }else if(thirdActive&&!visual.maneuver){
  const axis=thirdMoveAxis();
  const moving=Boolean(axis.x||axis.z);
  const moveAngle=moving?thirdPersonMoveFacing(tp.yaw,axis.x,axis.z):null;
  const seated=['seated','sleeping','tree-climbing'].includes(visual.pose);
  const resolved=resolveThirdPersonFacing(tpFacingState,{yaw:tp.yaw,moving,moveAngle,pose:visual.pose,sceneId:visual.sceneId??activeScene,serverRotation:visual.rotation,dt});
  tp.yaw=resolved.yaw;
  // 未接管时保留服务端给出的坐姿和睡姿朝向。
  if(!seated||moving)visual.rotation=resolved.rotation;
 }
 const queuedRoll=travelAction?.buffered?original.previewAction:null;
 const rollEnd=original.previewEnd;
 if(visual.pose==='sleeping'&&next.actions?.Crawl){
  const bedPosition=registry.bedSleepPosition(visual);
  if(bedPosition)visual={...visual,position:bedPosition.toArray()};
 }
 presentActor(whale,visual,dt,t);
 if(next===blob){
  const pool=poolAt(client.snapshot,visual.sceneId,visual.position);
  const lakeDepth=forestLighting?forestLakeDepth(visual.position[0],visual.position[2]):0;
  const targetDepth=visual.diving?(lakeDepth?THREE.MathUtils.clamp(lakeDepth-.38,0,1.6):pool?Math.min(.86,.97*pool.scale[1]):.78):0;
  swimDepth=visual.grounded===false?0:THREE.MathUtils.damp(swimDepth,targetDepth,6,dt);
  blob.group.position.y-=swimDepth;
  blob.pos.y-=swimDepth;
 }else swimDepth=0;
 const display=visual.computerDeskId&&visual.pose==='seated'
  ?registry.entities.get(visual.computerDeskId)?.getObjectByName('computer-display'):null;
 if(activeComputerDisplay!==display){
  if(activeComputerDisplay)activeComputerDisplay.material.emissiveIntensity=1.35;
  if(display)display.material.emissiveIntensity=3;
  activeComputerDisplay=display;
 }
 renderedSpellCast=visual.lastSpellCast;
 if(travelAction&&!original.blocksWalking){
  const {heading,sceneId}=travelAction;
  travelAction=null;
  if(queuedRoll&&queuedRoll.time>=rollEnd&&next===original&&sceneId===actor.sceneId&&player.active
    &&!teleportPending&&!editor?.active&&!game.editing&&!agentConnect.panel&&client.connectionStatus==='connected'
    &&original.startRoll({interruptWalking:true})){
   startTravelAction(4,true,{roll:true,heading});
  }
 }
 const seatOffset=registry.seatOffset(visual);if(seatOffset)whale.group.position.add(seatOffset);renderPosition.copy(whale.group.position);
 const outdoors=registry.scenes.get(activeScene)?.template.kind==='outdoor';
 const feetActive=!editor?.active&&!original.sliding&&!travelAction&&!visual.maneuver;
 fx.trackFootsteps(visual,outdoors&&feetActive,feetActive?side=>{
  const surface=activeScene==='yard'?'grass':'hard';
  localSound.playAction(`run-${surface}-${side<0?'left':'right'}`);
 }:undefined);
 if(visual.pose==='sleeping'&&Math.floor(t*2)!==Math.floor((t-dt)*2))fx.zzz(renderPosition.clone().add(new THREE.Vector3(.3,.5,0)));
 if(!fpActive&&!thirdActive&&outdoors&&!editor?.active)iso.follow(new THREE.Vector3(visual.position[0],visual.position[1],visual.position[2]),dt);
 whale.group.visible=!fpActive;
 return visual;
}
R.setScene(scene,camera);const clock=new THREE.Clock();let time=0,shadowTick=0;lights.sun.shadow.autoUpdate=false;
const performanceStats={frames:[],longTasks:0};try{new PerformanceObserver(list=>{performanceStats.longTasks+=list.getEntries().filter(e=>e.duration>100).length;}).observe({entryTypes:['longtask']});}catch{}
const authorProgress=document.createElement('div');authorProgress.id='author-progress';authorProgress.style.cssText='position:fixed;top:110px;right:24px;z-index:25;padding:7px 10px;border-radius:10px;background:#fff9ee;color:#51454a;font:12px system-ui';document.body.append(authorProgress);
function updateAuthorProgress(){const cfg=registry.scenes.get(activeScene);authorProgress.hidden=!cfg?.template.progressiveEntities;if(authorProgress.hidden)return;const fixed=cfg.shell?.userData.streaming?.stats,p=cfg.progress;authorProgress.textContent=`完整小镇 · 地形 ${fixed?.resident||0}/185 · 摆设 ${p?.resident||0}/${p?.total||516} · 待加载 ${(fixed?.pending||0)+(p?.pending||0)+localAssetCache.stats.pending}`;}
function escapePointerTrap(message){
 stopOrbit();
 // 第一视角 + 指针锁定出问题时，先把人放出来：退出第一视角、释放指针锁，避免黑屏/冻结还吞着光标
 if(fpActive)setFirstPerson(false);
 viewToggle.exitLock();
 if(message)showMessage(message);
}
function frame(){
 const frameStart=performance.now();
 if(freezeLog.lastFrameAt){const gap=frameStart-freezeLog.lastFrameAt;if(gap>600)freezeLog.gaps.push({t:Date.now()-freezeLog.startedAt,gap:Math.round(gap),fpActive,locked:document.pointerLockElement===canvas});if(gap>1500&&fpActive){setTimeout(()=>escapePointerTrap('检测到明显卡顿，已退出第一视角以免光标被锁住'),0);}}
 freezeLog.lastFrameAt=frameStart;
 try{
  const dt=Math.min(.05,clock.getDelta());if(baizeBattle.active){baizeBattle.render(R.renderer,dt);return;}time+=dt;if(!encounterPending)updateKeyboard(dt,frameStart);updateControlStatus(frameStart);registry.update(dt,time);updateAuthorProgress();const visual=renderActor(dt,time);baizeFollower.update(dt,client.snapshot,visual,renderPosition);iso.update(dt);if(fpActive){fp.setEye(renderPosition,currentPose);fpShadow.position.set(renderPosition.x,renderPosition.y+0.015,renderPosition.z);if(R.renderPass)R.renderPass.camera=fp.camera;}else if(thirdActive){const isBlob=whale===blob;tp.setBaseDistance(isBlob?6.4:3.6);tp.follow(renderPosition,dt,isBlob?1.9:(currentPose==='sleeping'?0.5:1.15));clampThirdCameraToRoom();if(R.renderPass)R.renderPass.camera=tp.camera;}else if(R.renderPass)R.renderPass.camera=camera;spellBar.update(dt,frameStart,renderedSpellCast,spellHand);fx.update(dt,time);hud.updateBubble(dt,fpActive?fp.camera:camera);R.gradePass.uniforms.uTime.value=time;if(++shadowTick%2===0){if(forestLighting)followForestSun();lights.sun.shadow.needsUpdate=true;}R.composer.render();performanceStats.frames.push(performance.now()-frameStart);if(performanceStats.frames.length>1200)performanceStats.frames.shift();
 }catch(error){
  if(!frameErrorAt||performance.now()-frameErrorAt>3000){frameErrorAt=performance.now();console.error('frame loop failed',error);freezeLog.errors.push({t:Date.now()-freezeLog.startedAt,message:String(error?.message||error)});escapePointerTrap('运行出错，已退回等距视角：'+(error?.message||error));}
 }
}
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();escapePointerTrap('图形上下文丢失，已退回等距视角；如画面不恢复请刷新页面');},{passive:false});
canvas.addEventListener('webglcontextrestored',()=>showMessage('图形上下文已恢复'));
renderActivity.subscribe(active=>{
 freezeLog.lastFrameAt=0;
 if(active){
  clock.getDelta();
  lights.sun.shadow.needsUpdate=true;
  if(client.snapshot)applyRenderSnapshot(client.snapshot);
  return;
 }
 stopMovement();
 stopOrbit();
 viewToggle.exitLock();
 player.jumpRequested=false;
 wantSlide=false;
 slideUntil=0;
 if(travelAction){travelAction=null;original.stopPreview();}
 if(player.active){
  player.stop();
  const generation=player.generation;
  void player.drain().then(()=>{
   if(player.generation===generation&&!player.held)player.release();
  }).catch(()=>{});
 }
});
renderActivity.loop(frame);
const updateRenderVisibility=()=>renderActivity.setActive(!desktopSuspended&&!document.hidden);
window.dafeiyuDesktop?.onRenderSuspended?.(suspended=>{
 desktopSuspended=suspended;
 updateRenderVisibility();
});
document.addEventListener('visibilitychange',updateRenderVisibility);
async function start(){const session=await ownerSession.ensure();client.csrfToken=session.csrfToken;void baizeFollower.load();registerLocalFurniture(await discoverLocalAssets());mountAudioPlayer(client,localSound,settings.muteButton);await client.connect('default');editor=new RoomEditor({group:registry.contexts[activeScene].group,scene,camera,canvas,getScene:()=>activeScene,contexts:registry.contexts,worldClient:client,registry,onClickSound:confirmClick,onOrbit:(dx,dy)=>{if(thirdActive)tp.look(dx,dy);else iso.addDrag(dx*.005);},onToggle:active=>{if(active&&fpActive)setFirstPerson(false);if(active)editor.camera=thirdActive?tp.camera:iso.camera;game.editing=active;stopOrbit();stopMovement();if(player.active){player.stop();player.drain().then(()=>player.release()).catch(()=>{});}keys.clear();if(!active)iso.target.copy(iso.homeTarget);},onChange:()=>yard?.refreshLandscape?.()});toolbar.insertBefore(editor.toggle,toolbar.querySelector('#settings-entry'));editor.setContext(activeScene);window.__editor=editor;mountAuthorExamples({renderActivity,onOpen:()=>{stopMovement();keys.clear();game.editing=true;},onClose:()=>{game.editing=editor.active;}});document.getElementById('loading')?.classList.add('gone');for(const id of ['title','hint','status'])document.getElementById(id)?.classList.add('in');updateControlStatus();}
// Loading overlay must never hide the owner pairing dialog or block recovery.
document.getElementById('loadBar').style.width='100%';document.getElementById('loadText').textContent='正在连接世界';start().catch(error=>{document.getElementById('loading')?.classList.add('gone');showMessage(`连接失败：${error.message} · 请刷新重试`);});
Object.assign(window,{
 __motionDiagnostic:(ms=8000)=>new Promise(resolve=>{
  const frames=[];const start=performance.now();
  const sample=()=>{
   const p3=whale.group.position;const a=client.snapshot?.actors?.[0];
   frames.push({t:Math.round(performance.now()),x:+p3.x.toFixed(3),z:+p3.z.toFixed(3),active:player.active,held:player.held,holdLeft:Math.round((player.holdUntil||0)-performance.now()),state:whale.state,clip:whale.currentClip,server:a?a.position.slice(0,3).map(n=>+n.toFixed(3)):null});
  };
  const rec=()=>{sample();if(performance.now()-start<ms)requestAnimationFrame(rec);else{
   const jumps=[];
   for(let i=3;i<frames.length;i++){
    const a=frames[i-3],b=frames[i-1],c=frames[i];
    const v1x=b.x-a.x,v1z=b.z-a.z,v2x=c.x-b.x,v2z=c.z-b.z;
    const l1=Math.hypot(v1x,v1z),l2=Math.hypot(v2x,v2z);
    if(l1>0.05&&l2>0.05){const dot=(v1x*v2x+v1z*v2z)/(l1*l2);if(dot<-0.3)jumps.push({...c,dot:+dot.toFixed(2),back:+(l2).toFixed(2)});}
   }
   resolve({frames:frames.length,jumps:jumps.slice(0,20),tail:frames.slice(-40)});
  }};
  requestAnimationFrame(rec);
 }),
 __fp:fp,__tp:tp,__thirdPerson:()=>thirdActive,__thirdMouse:()=>({left:thirdLeftHeld,right:orbitRightHeld}),__player:player,__lease:()=>lease,__sprint:()=>({held:sprintHeld,toggled:sprintToggle,active:(sprintHeld||sprintToggle)&&!crawling}),__keys:()=>[...keys],__viewToggle:viewToggle,__actionPanel:()=>actionPanel,__transport:()=>client.socket?.readyState===1?'socket':'http',__skyDome:skyDome,__fpShadow:fpShadow,__localAssetCache:localAssetCache,__renderer:R.renderer,__R:R,__lights:lights,__iso:iso,__whale:whale,__scene:scene,__game:game,__blob:blob,__maid:original,__worldClient:client,__registry:registry,__coastalPerformance:()=>({p95:[...performanceStats.frames].sort((a,b)=>a-b)[Math.floor(performanceStats.frames.length*.95)]||0,longTasks:performanceStats.longTasks,heap:performance.memory?.usedJSHeapSize,geometries:R.renderer.info.memory.geometries,textures:R.renderer.info.memory.textures,loadedScenes:[...registry.scenes].filter(([,c])=>c.loaded||c.shell).map(([id])=>id),streaming:registry.scenes.get(activeScene)?.shell?.userData.streaming?.stats}),__ownerSession:ownerSession,__roomDebug:()=>({whale:whale.pos.toArray(),state:whale.state,sceneId:activeScene,zoom:iso.zoom,info:{calls:R.renderer.info.render.calls,tris:R.renderer.info.render.triangles}})});
