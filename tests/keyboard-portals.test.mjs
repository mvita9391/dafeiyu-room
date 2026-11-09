import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {portalEnds,walkable,segmentWalkable} from '../shared/world/navigation.js';
import {portalInwardNormal,reachesKeyboardPortal} from '../src/core/keyboard-portals.js';
import {YARD_FOREST_SLOT} from '../shared/world/templates.js';
import {advancePlayer} from '../shared/world/movement.js';
import {ActionDispatcher} from '../src/core/action-dispatcher.js';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('function directions('),source.indexOf('function renderActor('));
async function harness(snapshot,position,az,keys){
 const sent=[];const context={travelAction:null,whale:{},settings:{isOpen:false},foodPicker:{isOpen:false},fpActive:false,fp:{yaw:0},renderPosition:new THREE.Vector3(),sprintHeld:false,sprintToggle:false,thirdActive:false,crawling:false,diveRequested:undefined,wantSlide:false,slideUntil:0,slideDirX:0,slideDirZ:0,original:{startSlideClip(){}},teleportPending:false,actor:{sceneId:'a',position},iso:{az,drag:0},keys:new Set(keys),agentConnect:{},editor:null,lastInputAt:0,lastPortalAt:0,portalPending:false,client:{snapshot,connectionStatus:'connected'},goal:new THREE.Vector3(),portalEnds,portalInwardNormal,reachesKeyboardPortal,YARD_FOREST_SLOT,walkable,segmentWalkable,stopMovement(){},dispatcher:new ActionDispatcher(async(kind,target)=>sent.push({kind,target}))};
 context.player={active:false,begin(a){this.active=true;this.state={...a,position:[...a.position]};},step(s,d,dt){this.state=advancePlayer(s,this.state,d,dt*1000);},sample(){return this.state;},flush:async()=>{},stop(){this.held=false;this.stopped=true;},release(){this.active=false;}};
 context.action=(...args)=>context.dispatcher.submit(...args);
 vm.createContext(context);vm.runInContext(handler,context);context.updateKeyboard(.016,3000);await context.dispatcher.running;
 return {sent,context};
}
// Removing the outward-direction guard must fail these actual handler tests.
for(const [slot,position,inward,tangent,outward] of [
 ['north',[0,0,-2.2],'KeyA','KeyS','KeyD'],['south',[0,0,2.2],'KeyD','KeyS','KeyA'],
 ['west',[-2.2,0,0],'KeyS','KeyA','KeyW'],['east',[2.2,0,0],'KeyW','KeyA','KeyS'],
])for(const az of [0,Math.PI/2])test(`${slot} door respects world direction at camera ${az}`,async()=>{
 const snapshot={scenes:[{sceneId:'a',templateId:'cozy_room_v1'},{sceneId:'b',templateId:'cozy_room_v1'}],entities:[],portals:[{from:{sceneId:'a',slotId:slot},to:{sceneId:'b',slotId:slot},bidirectional:true}]};
 // At a quarter-turn camera rotation the WASD mapping advances by one key.
 const rotate={KeyA:'KeyS',KeyS:'KeyD',KeyD:'KeyW',KeyW:'KeyA'};
 const key=k=>az?rotate[k]:k;
 for(const input of [inward,tangent]){const {sent}=await harness(snapshot,position,az,[key(input)]);assert.equal(sent.length,0);assert.equal((await harness(snapshot,position,az,[key(input)])).context.player.sample().sceneId,'a');}
 const {sent}=await harness(snapshot,position,az,[key(outward)]);assert.equal(sent[0]?.target.sceneId,'b');assert.equal(sent[0].target.position,undefined);
 // Reverse endpoint after arrival: moving into the room must never bounce back.
 const opposite={north:'south',south:'north',east:'west',west:'east'};
 const reversed={...snapshot,portals:[{from:{sceneId:'b',slotId:opposite[slot]},to:{sceneId:'a',slotId:slot},bidirectional:true}]};
 assert.equal((await harness(reversed,position,az,[key(inward)])).sent.length,0);
 assert.equal((await harness(reversed,position,az,[key(outward)])).sent[0]?.target.sceneId,'b');
});
test('forest gate accepts either side of its opening but rejects walking into the fence',async()=>{
 const snapshot={scenes:[{sceneId:'a',templateId:'courtyard_v1'},{sceneId:'b',templateId:'forest_v1'}],entities:[],
  portals:[{from:{sceneId:'a',slotId:YARD_FOREST_SLOT},to:{sceneId:'b',slotId:'yard-gate'},bidirectional:true}]};
 for(const z of [-8.85,-7.15]){
  assert.equal((await harness(snapshot,[21.3,0,z],0,['KeyS'])).sent[0]?.target.sceneId,'b');
  assert.equal((await harness(snapshot,[21.85,0,z],0,['KeyS'])).sent[0]?.target.sceneId,'b');
  assert.equal((await harness(snapshot,[21.3,0,z],0,['KeyW'])).sent.length,0);
 }
 assert.equal((await harness(snapshot,[21.3,0,-6.7],0,['KeyS'])).sent.length,0);
});
test('legacy west boundary uses its world normal',async()=>{
 const snapshot={scenes:[{sceneId:'a',templateId:'cozy_room_v1'},{sceneId:'b',templateId:'courtyard_v1'}],entities:[],portals:[{kind:'legacy',fromSceneId:'bedroom',toSceneId:'yard'}]};
 // Preserve actual legacy endpoint IDs.
 snapshot.scenes[0].sceneId='bedroom';snapshot.scenes[1].sceneId='yard';
 const run=async key=>{const h=await harness({...snapshot,portals:[]},[-3.02,0,1.05],0,[]);h.context.actor.sceneId='bedroom';h.context.client.snapshot=snapshot;h.context.keys.add(key);h.context.updateKeyboard(.016,4000);await h.context.dispatcher.running;return h.sent;};
 assert.equal((await run('KeyS')).length,0);
 assert.equal((await run('KeyW'))[0]?.target.sceneId,'yard');
});
test('releasing WASD does not cancel an accepted doorway transition',async()=>{
 const snapshot={scenes:[{sceneId:'a',templateId:'cozy_room_v1'},{sceneId:'b',templateId:'cozy_room_v1'}],entities:[],portals:[{from:{sceneId:'a',slotId:'north'},to:{sceneId:'b',slotId:'south'},bidirectional:true}]};
 const {context}=await harness(snapshot,[0,0,-2.2],0,[]);
 const calls=[];let finish;
 context.dispatcher=new ActionDispatcher(async(kind,target)=>{calls.push({kind,target});if(kind==='move')await new Promise(resolve=>finish=resolve);});
 const listeners={};context.window={addEventListener:(name,fn)=>listeners[name]=fn};context.document={addEventListener(){}};
 vm.runInContext(source.slice(source.indexOf("window.addEventListener('keyup'"),source.indexOf('const pointer=')),context);
 context.keys.add('KeyD');context.updateKeyboard(.016,3000);
 listeners.keyup({code:'KeyD'});
 assert.equal(context.keys.size,0);assert.equal(calls.length,1);assert.equal(calls[0].target.sceneId,'b');
 finish();await context.dispatcher.running;
 assert.deepEqual(calls.map(call=>call.kind),['move']);
});

test('opposing movement keys stop and flush an already moving player',async()=>{const snapshot={scenes:[{sceneId:'a',templateId:'cozy_room_v1'}],entities:[],portals:[]};const {context}=await harness(snapshot,[0,0,0],0,[]);context.player.active=true;context.player.held=true;context.keys=new Set(['KeyW','KeyS']);context.updateKeyboard(.016,4000);assert.equal(context.player.stopped,true);assert.equal(context.player.held,false);});

test('scene arrival clears held keys but retains portal protection until the move completes',()=>{
 const handlers=[];const snapshot={actors:[{actorId:'whale',sceneId:'b',position:[0,0,0],actionId:'crossing'}],entities:[]};
 const context={renderActivity:{active:true},applyRenderSnapshot(){},refreshScenePicker(){},client:{onSnapshot:fn=>handlers.push(fn)},registry:{applySnapshot(){},contexts:{}},actor:{sceneId:'a'},player:{active:false,reconcile(){}},actorTimeline:{push(){}},editor:null,portalPending:true,keys:new Set(['KeyW']),renderPosition:{fromArray(){}},showScene(){},lease:null,dispatcher:{busy:false},performance:{now:()=>0},game:{stats:{},_syncStats(){}}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('client.onSnapshot('),source.indexOf('async function control(')),context);
 handlers[0](snapshot);assert.equal(context.keys.size,0);assert.equal(context.portalPending,true);
 handlers[0]({...snapshot,actors:[{...snapshot.actors[0],actionId:null}]});assert.equal(context.portalPending,false);
});
test('OS key repeat cannot re-arm movement after a scene transition clears held keys',()=>{
 let keydown;const context={teleportPending:false,editor:null,window:{addEventListener:(_name,fn)=>keydown=fn},agentConnect:{},editable:()=>false,keys:new Set()};vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf("window.addEventListener('keydown'"),source.indexOf("window.addEventListener('keyup'")),context);
 keydown({code:'KeyW',repeat:true,preventDefault(){}});assert.equal(context.keys.size,0);
 keydown({code:'KeyW',repeat:false,preventDefault(){}});assert.equal(context.keys.has('KeyW'),true);
});
