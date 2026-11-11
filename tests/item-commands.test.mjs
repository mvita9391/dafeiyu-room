import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {WorldService} from '../server/world/service.js';
import {migrateWorld} from '../server/storage/migrations.js';
import {createRuntimeHandlers} from '../server/world/runtime.js';
import {defaultManifest} from '../shared/world/default-manifest.js';
import {projectSnapshot} from '../server/mcp/resources.js';
import {createDefaultItemState} from '../shared/items/item-store.js';
import {ITEMS} from '../shared/world/items.js';

const setup=()=>{
 const db=new DatabaseSync(':memory:');
 migrateWorld(db,{defaultManifest});
 const service=new WorldService(db,{handlers:createRuntimeHandlers({baizeEnabled:true})});
 const actorId=service.readSnapshot('default').actors[0].actorId;
 const principal={subjectId:'owner',worldIds:['default'],scopes:['world:read','actor:control','build:write'],actorIds:[actorId],role:'owner'};
 // 把角色放到院子里，方便测试距离校验
 service.transactRuntime('default',({snapshot})=>{const actor=snapshot.actors.find(a=>a.actorId===actorId);actor.sceneId='yard';actor.position=[5,0,1];});
 return {db,service,actorId,principal};
};
const cmd=(service,principal,kind,payload)=>service.execute(principal,{kind,worldId:'default',requestId:randomUUID(),payload});

test('服务端物品同步、便便拾取和投影',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  const empty=createDefaultItemState();
  const synced=cmd(service,principal,'item.import',{actorId,state:empty});
  assert.equal(synced.total,0);
  cmd(service,principal,'item.poop',{actorId,sceneId:'yard',position:[5.2,0,1.2]});
  const snap=service.readSnapshot('default');
  const ground=snap.items.owners[actorId].groundItems;
  assert.equal(ground.length,1);
  const itemId=ground[0].id;
  assert.equal(projectSnapshot(snap,principal).items.owners[actorId].groundItems.length,1);
  const picked=cmd(service,principal,'item.pickup',{actorId,itemId});
  assert.equal(picked.inventory.poop,1);
  assert.equal(picked.ground.length,0);
  const tooFar=cmd(service,principal,'item.poop',{actorId,sceneId:'yard',position:[12,0,10]});
  assert.ok(tooFar.item);
  assert.throws(()=>cmd(service,principal,'item.pickup',{actorId,itemId:tooFar.item.id}),/ITEM_TOO_FAR/);
 }finally{db.close();}
});

test('服务端堆肥要求靠近并推进状态',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  const state=createDefaultItemState();
  state.inventory.poop=2;
  cmd(service,principal,'item.import',{actorId,state});
  const snap=service.readSnapshot('default');
  const compost=projectSnapshot(snap,principal).items.compostPosition;
  // 靠近堆肥箱
  service.transactRuntime('default',({snapshot})=>{const actor=snapshot.actors.find(a=>a.actorId===actorId);actor.position=[compost[0]+1,0,compost[2]+1];});
  const started=cmd(service,principal,'item.compost',{actorId});
  assert.equal(started.compost.status,'processing');
  // 时间推进：直接改快照 readyAt 后收取
  service.transactRuntime('default',({snapshot})=>{const bucket=snapshot.items.owners[actorId];bucket.compost.readyAt=Date.now()-1;});
  const collected=cmd(service,principal,'item.collect',{actorId});
  assert.equal(collected.inventory.fertilizer,1);
 }finally{db.close();}
});

test('授权角色可以看到自己 actor 的物品投影',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  cmd(service,principal,'item.poop',{actorId,sceneId:'yard',position:[5,0,1]});
  const agent={...principal,role:'agent',subjectId:'agent'};
  assert.ok(projectSnapshot(service.readSnapshot('default'),agent).items.owners[actorId]);
 }finally{db.close();}
});

test('服务端按宠物所在场景结算便便并写入地面',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  cmd(service,principal,'pet.import',{actorId,pets:[{petId:'p1',speciesId:'baize'}],followPetId:'p1'});
  service.transactRuntime('default',({snapshot})=>{const actor=snapshot.actors.find(a=>a.actorId===actorId);actor.sceneId='yard';actor.position=[5,0,1];});
  let result=cmd(service,principal,'pet.settlePoops',{actorId,sceneId:'yard'});
  assert.equal(result.count,0);
  const pet=service.readSnapshot('default').pets.owners[actorId].instances.p1;
  assert.equal(pet.poopSceneId,'yard');
  assert.ok(pet.nextPoopAt>pet.lastPoopAt);
  // 把下一次到期时间调到过去，再次结算
  service.transactRuntime('default',({snapshot})=>{const p=snapshot.pets.owners[actorId].instances.p1;p.nextPoopAt=Date.now()-1;});
  result=cmd(service,principal,'pet.settlePoops',{actorId,sceneId:'yard'});
  assert.ok(result.count>=1);
  const ground=service.readSnapshot('default').items.owners[actorId].groundItems;
  assert.ok(ground.some(item=>item.type==='poop'&&item.sceneId==='yard'));
 }finally{db.close();}
});

test('背包堆叠满时拾取失败且不删除地面物品',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  const state=createDefaultItemState();
  state.inventory.poop=ITEMS.poop.stackMax;
  cmd(service,principal,'item.import',{actorId,state});
  cmd(service,principal,'item.poop',{actorId,sceneId:'yard',position:[5.1,0,1.1]});
  const ground=service.readSnapshot('default').items.owners[actorId].groundItems;
  assert.equal(ground.length,1);
  assert.throws(()=>cmd(service,principal,'item.pickup',{actorId,itemId:ground[0].id}),/INVENTORY_FULL/);
  assert.equal(service.readSnapshot('default').items.owners[actorId].groundItems.length,1);
  assert.equal(service.readSnapshot('default').items.owners[actorId].inventory.poop,ITEMS.poop.stackMax);
 }finally{db.close();}
});

test('旧背包只迁移一次，并保留服务端先生成的便便',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  cmd(service,principal,'item.poop',{actorId,sceneId:'yard',position:[5.1,0,1.1]});
  const legacy=createDefaultItemState();
  legacy.inventory.fertilizer=6;
  legacy.legacyImported=false;
  cmd(service,principal,'item.import',{actorId,state:legacy});
  const snap=service.readSnapshot('default');
  const bucket=snap.items.owners[actorId];
  assert.equal(bucket.inventory.fertilizer,6);
  assert.equal(bucket.groundItems.length,1);
  assert.equal(bucket.legacyImported,true);
  // 再导入一次不会把 6 份肥料翻倍
  cmd(service,principal,'item.import',{actorId,state:legacy});
  assert.equal(service.readSnapshot('default').items.owners[actorId].inventory.fertilizer,6);
 }finally{db.close();}
});

test('地面已满时旧背包迁移明确失败且不标记完成',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  for(let i=0;i<20;i++)cmd(service,principal,'item.poop',{actorId,sceneId:'yard',position:[5+i*0.02,0,1+i*0.02]});
  const before=service.readSnapshot('default').items.owners[actorId];
  assert.equal(before.groundItems.length,20);
  assert.equal(before.legacyImported,false);
  const legacy=createDefaultItemState();
  legacy.groundItems=[{id:'legacy-poop',type:'poop',sceneId:'yard',position:[5,0,1],createdAt:1}];
  assert.throws(()=>cmd(service,principal,'item.import',{actorId,state:legacy}),/LEGACY_GROUND_FULL/);
  const after=service.readSnapshot('default').items.owners[actorId];
  assert.equal(after.groundItems.length,20);
  assert.equal(after.legacyImported,false);
 }finally{db.close();}
});
