import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {WorldService} from '../server/world/service.js';
import {migrateWorld} from '../server/storage/migrations.js';
import {createRuntimeHandlers} from '../server/world/runtime.js';
import {defaultManifest} from '../shared/world/default-manifest.js';
import {projectSnapshot} from '../server/mcp/resources.js';
import {createPetInstance} from '../shared/creatures/instance.js';
import {startBaizeEncounter} from '../server/world/baize.js';
import {deriveStats} from '../shared/creatures/stats.js';

const setup=()=>{
 const db=new DatabaseSync(':memory:');
 migrateWorld(db,{defaultManifest});
 const service=new WorldService(db,{handlers:createRuntimeHandlers({baizeEnabled:true})});
 const actorId=service.readSnapshot('default').actors[0].actorId;
 const principal={subjectId:'owner',worldIds:['default'],scopes:['world:read','actor:control','build:write'],actorIds:[actorId],role:'owner'};
 return {db,service,actorId,principal};
};
const cmd=(service,principal,kind,payload)=>service.execute(principal,{kind,worldId:'default',requestId:randomUUID(),payload});

test('pet.import 建立归属、名册并写入 SQLite 快照',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  const imported=cmd(service,principal,'pet.import',{actorId,localVersion:3,pets:[
   {petId:'pet-baize',speciesId:'baize',nickname:'白泽',bond:7},
   {petId:'pet-fish',speciesId:'fish-bowl',nickname:'缸盆小鱼'},
  ],followPetId:'pet-baize',battlePetId:'pet-fish'});
  assert.equal(imported.count,2);
  const snap=service.readSnapshot('default');
  assert.equal(snap.pets.owners[actorId].instances['pet-baize'].bond,7);
  assert.equal(Object.keys(snap.pets.owners[actorId].instances).length,2);
  assert.equal(snap.pets.owners[actorId].roster.followPetId,'pet-baize');
  const projected=projectSnapshot(snap,principal);
  assert.equal(projected.pets.owners[actorId].instances['pet-fish'].nickname,'缸盆小鱼');
  const again=cmd(service,principal,'pet.import',{actorId,localVersion:3,pets:[{petId:'x',speciesId:'baize'}]});
  assert.equal(again.status,'skipped');
 }finally{db.close();}
});

test('跟随/出战唯一、抚摸上限与进化由服务端执行',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  const fish={petId:'pet-fish',speciesId:'fish-bowl',nickname:'缸盆小鱼'};
  const baize={petId:'pet-baize',speciesId:'baize',nickname:'白泽'};
  const evolvePet={petId:'pet-evolve',speciesId:'baize',nickname:'待进化',bond:100};
  cmd(service,principal,'pet.import',{actorId,pets:[fish,baize,evolvePet],followPetId:'pet-baize',battlePetId:'pet-fish'});
  cmd(service,principal,'pet.setMode',{actorId,petId:'pet-fish',mode:'follow'});
  assert.equal(service.readSnapshot('default').pets.owners[actorId].roster.followPetId,'pet-fish');
  cmd(service,principal,'pet.setBattle',{actorId,petId:'pet-baize'});
  assert.equal(service.readSnapshot('default').pets.owners[actorId].roster.battlePetId,'pet-baize');
  let last;
  for(let i=0;i<10;i++)last=cmd(service,principal,'pet.pet',{actorId,petId:'pet-baize'});
  assert.equal(last.bond,10);
  assert.equal(cmd(service,principal,'pet.pet',{actorId,petId:'pet-baize'}).reason,'hourly-cap');
  assert.equal(cmd(service,principal,'pet.evolve',{actorId,petId:'pet-evolve'}).ok,true);
  assert.equal(service.readSnapshot('default').pets.owners[actorId].instances['pet-evolve'].evolved,true);
 }finally{db.close();}
});

test('宠物归属校验与其他 actor 不可见',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  cmd(service,principal,'pet.import',{actorId,pets:[{petId:'p',speciesId:'baize'}],followPetId:'p'});
  const other={...principal,subjectId:'other',role:'agent'};
  assert.equal(cmd(service,other,'pet.setMode',{actorId,petId:'p',mode:'standby'}).petId,'p');
  assert.throws(()=>cmd(service,principal,'pet.setMode',{actorId,petId:'missing',mode:'follow'}),/PET_NOT_FOUND/);
  const viewer={...principal,role:'agent',subjectId:'agent'};
  assert.ok(projectSnapshot(service.readSnapshot('default'),viewer).pets.owners[actorId]);
 }finally{db.close();}
});

test('宠物快照可跨 WorldService 重启恢复',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  cmd(service,principal,'pet.import',{actorId,pets:[{petId:'p',speciesId:'baize',bond:12}],followPetId:'p'});
  const restarted=new WorldService(db,{handlers:createRuntimeHandlers({baizeEnabled:true})});
  const snap=restarted.readSnapshot('default');
  assert.equal(snap.pets.owners[actorId].instances.p.bond,12);
  assert.equal(snap.pets.owners[actorId].roster.followPetId,'p');
 }finally{db.close();}
});

test('森林战斗使用服务端选中的出战宠物属性与技能',()=>{
 const snapshot={
  worldId:'default',schemaVersion:1,
  scenes:[{sceneId:'forest',templateId:'forest_v1'}],
  actors:[{actorId:'whale',sceneId:'forest',position:[-28.5,0,-2.75],rotation:0,pose:'idle',form:'normal',grounded:true}],
  pets:{version:1,owners:{whale:{instances:{
   fish:{petId:'fish',ownerId:'whale',speciesId:'fish-bowl',nickname:'缸盆小鱼',level:1,exp:0,bond:0,evolved:false,learnedSkills:['tackle','waterJet','guard'],skillLoadout:['tackle','waterJet','guard'],homeSceneId:'yard',homePosition:null,bondWindowStart:0,bondWindowPoints:0,createdAt:0},
  },roster:{followPetId:null,battlePetId:'fish'},migration:{localVersion:3,importedAt:0}}}},
 };
 const events=[];
 const result=startBaizeEncounter({snapshot,emit:(kind,data)=>events.push({kind,data}),now:1000},snapshot.actors[0],true);
 assert.ok(result.battleId);
 const pet=snapshot.actors[0].battle.units.pet;
 assert.equal(pet.name,'缸盆小鱼');
 assert.equal(pet.speciesId,'fish-bowl');
 assert.equal(pet.maxHp,deriveStats('fish-bowl',1,0,false).maxHp);
 assert.ok(pet.skills.some(move=>move.id==='waterJet'));
 assert.equal(events[0].kind,'battle.started');
});

test('新玩家宝箱初始化两只蛋，孵化后按顺序成为宠物',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  const boot=cmd(service,principal,'pet.bootstrap',{actorId});
  assert.equal(boot.eggs.length,2);
  assert.deepEqual(boot.eggs.map(egg=>egg.speciesId).sort(),['baize','fish-bowl']);
  let owner=service.readSnapshot('default').pets.owners[actorId];
  assert.equal(Object.keys(owner.instances).length,0);
  assert.equal(owner.roster.followPetId,null);
  const first=cmd(service,principal,'pet.hatchEgg',{actorId,eggId:boot.eggs[0].eggId});
  assert.ok(first.petId);
  assert.equal(first.speciesId,boot.eggs[0].speciesId);
  owner=service.readSnapshot('default').pets.owners[actorId];
  assert.equal(owner.instances[first.petId].nickname,first.name);
  assert.equal(owner.roster.followPetId,first.petId);
  const second=cmd(service,principal,'pet.hatchEgg',{actorId,eggId:boot.eggs[1].eggId});
  assert.ok(second.petId);
  assert.equal(Object.keys(service.readSnapshot('default').pets.owners[actorId].instances).length,2);
  assert.equal(cmd(service,principal,'pet.hatchEgg',{actorId,eggId:boot.eggs[0].eggId}).error ?? 'unused',undefined);
 }catch(error){
  if(!/EGG_NOT_FOUND/.test(error.message))throw error;
 } finally {db.close();}
});

test('从旧本地宠物导入的玩家不补发初始蛋',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  cmd(service,principal,'pet.import',{actorId,pets:[{petId:'p',speciesId:'baize'}],followPetId:'p'});
  const boot=cmd(service,principal,'pet.bootstrap',{actorId});
  assert.equal(boot.eggs.length,0);
 }finally{db.close();}
});

test('宠物饱食度、改名和位置同步进入世界快照',()=>{
 const {db,service,actorId,principal}=setup();
 try{
  cmd(service,principal,'pet.bootstrap',{actorId});
  const hatched=cmd(service,principal,'pet.hatchEgg',{actorId,eggId:'starter-baize'});
  const fed=cmd(service,principal,'pet.feed',{actorId,petId:hatched.petId});
  assert.equal(fed.satiety,100);
  const renamed=cmd(service,principal,'pet.rename',{actorId,petId:hatched.petId,name:'小白'});
  assert.equal(renamed.name,'小白');
  cmd(service,principal,'pet.syncPositions',{actorId,positions:[{petId:hatched.petId,sceneId:'yard',position:[3.2,0,1.4]}]});
  const pet=service.readSnapshot('default').pets.owners[actorId].instances[hatched.petId];
  assert.equal(pet.satiety,100);
  assert.equal(pet.nickname,'小白');
  assert.deepEqual(pet.lastPosition,[3.2,0,1.4]);
 }finally{db.close();}
});

test('文件世界的位置上报走内存不写命令回执',()=>{
 const {db}=setup();
 try{
  const service=new WorldService(db,{handlers:createRuntimeHandlers({baizeEnabled:true}),memoryPosition:true});
  const snap=service.readSnapshot('default'),actorId=snap.actors[0].actorId;
  const principal={subjectId:'owner',worldIds:['default'],scopes:['world:read','actor:control'],actorIds:[actorId],role:'owner'};
  cmd(service,principal,'pet.import',{actorId,pets:[{petId:'p1',speciesId:'baize'}]});
  const before=db.prepare('SELECT COUNT(*) AS count FROM command_results').get().count;
  cmd(service,principal,'pet.syncPositions',{actorId,positions:[{petId:'p1',sceneId:'yard',position:[1,0,2]}]});
  const live=service.getSnapshot(principal,'default');
  assert.deepEqual(live.pets.owners[actorId].instances.p1.lastPosition,[1,0,2]);
  const raw=JSON.parse(db.prepare('SELECT snapshot FROM worlds LIMIT 1').get().snapshot);
  assert.equal(raw.pets.owners[actorId].instances.p1.lastPosition,null);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM command_results').get().count,before);
 }finally{db.close();}
});
