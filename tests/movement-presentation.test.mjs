import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import {findPath} from '../shared/world/navigation.js';
import {damp,clamp} from '../src/core/anim.js';
import {KickSequence} from '../src/characters/kick-sequence.js';

test('unobstructed keyboard destinations stay on the requested straight line',()=>{
 const snapshot={scenes:[{sceneId:'room',templateId:'cozy_room_v1'}],entities:[]};
 const start=[.13,0,.17],goal=[.13+.8/Math.sqrt(2),0,.17+.8/Math.sqrt(2)];
 assert.deepEqual(findPath(snapshot,'room',start,goal),[goal]);
});
test('externally positioned character plays walk animation without moving itself twice',()=>{
 const source=fs.readFileSync(new URL('../src/characters/whaleMaid.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export class WhaleMaid','class WhaleMaid');
 const context={THREE,damp,clamp};vm.createContext(context);vm.runInContext(source+';globalThis.WhaleMaid=WhaleMaid;',context);
 const character=Object.create(context.WhaleMaid.prototype);const played=[];
 character.kicks=new KickSequence(()=>false);
 character.punches=new KickSequence(()=>false);
 Object.assign(character,{pos:new THREE.Vector3(),target:new THREE.Vector3(),group:new THREE.Group(),pivot:new THREE.Group(),state:'swim',stateTime:0,heading:0,groundY:0,speedMax:1.4,externalMotion:{moving:true,speed:1.4},play:name=>played.push(name)});
 character.update(1/60,1);assert.equal(played.at(-1),'Walking');assert.equal(character.speed,1.4);assert.deepEqual(character.pos.toArray(),[0,0,0]);
 character.externalMotion={moving:false,speed:0};character.update(1/60,2);assert.equal(played.at(-1),'Idle');
});

test('network samples render at an even speed between updates and stop at the last known point',async()=>{
 const {ActorTimeline}=await import('../src/core/actor-timeline.js');const timeline=new ActorTimeline({delayMs:250});
 const actor=x=>({sceneId:'room',position:[x,0,0],rotation:0,pose:'walking'});
 timeline.push(actor(0),0);timeline.push(actor(.28),200);timeline.push(actor(.56),400);
 const positions=Array.from({length:11},(_,i)=>timeline.sample(450+i*10).position[0]);
 for(let i=1;i<positions.length;i++)assert.ok(Math.abs(positions[i]-positions[i-1]-.014)<1e-8);
 assert.equal(timeline.sample(2000).position[0],.56);
 timeline.push({...actor(8),sceneId:'yard'},2100);assert.equal(timeline.sample(2100).position[0],8);
});
function maidFixture(){
 const source=fs.readFileSync(new URL('../src/characters/whaleMaid.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export class WhaleMaid','class WhaleMaid');const context={THREE,damp,clamp};vm.createContext(context);vm.runInContext(source+';globalThis.WhaleMaid=WhaleMaid;',context);
 const character=Object.create(context.WhaleMaid.prototype),played=[];const bones={};for(const key of ['hips','head','upperL','upperR','foreL','foreR','handL','handR','thighL','thighR','shinL','shinR'])bones[key]=new THREE.Bone();bones.hips.position.y=.65;const model=new THREE.Group();model.add(...Object.values(bones));
 character.kicks=new KickSequence(()=>false);
 character.punches=new KickSequence(()=>false);
 Object.assign(character,{pos:new THREE.Vector3(),target:new THREE.Vector3(),group:new THREE.Group(),pivot:new THREE.Group(),state:'idle',stateTime:0,heading:0,groundY:0,speedMax:1.4,weightedArms:true,bones,model,idleLifeTime:0,idleLifeBlend:0,hairTime:0,hairSpeed:0,hairHeading:0,play:name=>played.push(name),mixer:{update(){},timeScale:1},seatLegRest:['thighL','thighR','shinL','shinR'].map(key=>({key,bone:bones[key],rest:bones[key].quaternion.clone()}))});character.activityRest=['upperL','upperR','foreL','foreR','handL','handR','head'].map(key=>({bone:bones[key],rest:bones[key].quaternion.clone()}));character.group.add(character.pivot);character.pivot.add(model);return {character,played};
}
test('authoritative eating drives eating pose, visible rice bowl and weighted arm motion',async()=>{
 const {presentActor}=await import('../src/core/actor-presentation.js');const {character}=maidFixture();const visual={pose:'eating',position:[0,0,0],rotation:0,actionId:'meal',moving:false,speed:0};for(let i=0;i<30;i++)presentActor(character,visual,1/60,i/60);assert.equal(character.state,'eat');assert.ok(character.group.getObjectByName('white-rice-bowl')?.visible);assert.ok(character.bones.foreR.quaternion.angleTo(new THREE.Quaternion())>.1);presentActor(character,{...visual,pose:'idle',actionId:null},1/60,1);assert.equal(character.group.getObjectByName('white-rice-bowl').visible,false);
});
test('sleep lays the character along the bed and seated hips remain at the authoritative seat height',async()=>{
 const {presentActor}=await import('../src/core/actor-presentation.js');const {character}=maidFixture();const sleep={pose:'sleeping',position:[0,.84,.8],rotation:.4,actionId:'nap',moving:false,speed:0};for(let i=0;i<90;i++)presentActor(character,sleep,1/60,i/60);assert.equal(character.state,'sleep');assert.ok(Math.abs(character.pivot.rotation.x+Math.PI/2)<.02);assert.ok(Number.isFinite(character.group.position.y));for(let i=0;i<90;i++)presentActor(character,{...sleep,pose:'seated',position:[0,.54,0],actionId:'seat'},1/60,2+i/60);character.group.updateMatrixWorld(true);assert.ok(Math.abs(character.bones.hips.getWorldPosition(new THREE.Vector3()).y-.54)<1e-8);assert.ok(character.seatLegRest[0].bone.quaternion.angleTo(new THREE.Quaternion())>1);presentActor(character,{...sleep,pose:'idle',position:[0,0,0],actionId:null},1/60,4);assert.equal(character.state,'idle');assert.ok(Number.isFinite(character.group.position.y));
});
test('clicking a rendered chair submits interaction for that exact entity',()=>{
 const source=fs.readFileSync(new URL('../src/interactions.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export class Interactions','class Interactions');const context={THREE,window:{innerWidth:500,innerHeight:500},getCatalogEntry:()=>({actions:['sit']})};vm.createContext(context);vm.runInContext(source+';globalThis.Interactions=Interactions;',context);const controller=Object.create(context.Interactions.prototype);const chair=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());chair.userData={entityId:'clicked-chair',worldEntity:{type:'chair'}};chair.add(mesh);let requested;Object.assign(controller,{editing:false,pointer:new THREE.Vector2(),camera:{},whale:{group:new THREE.Group()},npcs:[],getFurniture:()=>[chair],ray:{setFromCamera(){},intersectObject:()=>[],intersectObjects:()=>[{object:mesh}]},worldAction:(...args)=>requested=args});controller._click({clientX:100,clientY:100});assert.equal(requested?.[0],'sit');assert.equal(requested?.[1].entityId,'clicked-chair');
});
test('non-interactive furniture blocks clicks on an occluded chair',()=>{const source=fs.readFileSync(new URL('../src/interactions.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export class Interactions','class Interactions');const context={THREE,window:{innerWidth:500,innerHeight:500},getCatalogEntry:type=>({actions:type==='chair'?['sit']:[]})};vm.createContext(context);vm.runInContext(source+';globalThis.Interactions=Interactions;',context);const c=Object.create(context.Interactions.prototype);const desk=new THREE.Group(),chair=new THREE.Group();desk.userData={entityId:'desk',worldEntity:{type:'desk'}};chair.userData={entityId:'chair',worldEntity:{type:'chair'}};let calls=0;Object.assign(c,{editing:false,pointer:new THREE.Vector2(),camera:{},whale:{group:new THREE.Group()},npcs:[],getFurniture:()=>[desk,chair],ray:{setFromCamera(){},intersectObject:()=>[],intersectObjects:()=>[{object:desk},{object:chair}]},worldAction:()=>calls++});c._click({clientX:100,clientY:100});assert.equal(calls,0);});
