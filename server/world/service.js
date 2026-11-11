import {installConsumers,recordDelivery,confirmEvents,resumeConsumer,snapshotRecovery} from './consumers.js';
import {randomUUID} from 'node:crypto';
import {validateCommand} from '../../shared/world/schema.js';
import {defaultManifest} from '../../shared/world/default-manifest.js';
import {protectFarm} from './starter.js';
import {nearestFree} from '../../shared/world/navigation.js';
import {getTemplate} from '../../shared/world/templates.js';
import {appendEvent,readEvents,readLatestCursor,projectEventPage} from './events.js';
import {settlePetPoops} from '../../shared/creatures/poop.js';
const scopeFor=kind=>kind.startsWith('build.')?'build:write':kind.startsWith('control.')||kind.startsWith('action.')||kind.startsWith('actor.')||kind.startsWith('battle.')||kind.startsWith('pet.')||kind.startsWith('item.')?'actor:control':'world:read';
// Trusted adapter-only principal: {subjectId,worldIds,actorIds,scopes,role,
// expiresAt?,revoked?}. Never construct this object from command/request JSON.
export function authorizePrincipal(principal,worldId,scope,actorId,now=Date.now()){
 if(!principal||typeof principal.subjectId!=='string'||!principal.subjectId||principal.revoked|| (principal.expiresAt!==undefined&&principal.expiresAt<=now)||!principal.worldIds?.includes(worldId)||!principal.scopes?.includes(scope)||(actorId&&!principal.actorIds?.includes(actorId)))throw Error('UNAUTHORIZED');
}
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export const NO_RUNTIME_CHANGE=Symbol('no runtime change');
const MOVEMENT_RECEIPT_TTL_MS=600_000;
const EMPTY_SETTLEMENT_TTL_MS=60_000;
export class WorldService{
 constructor(db,{handlers={},clock=Date.now,memoryPosition=false}={}){
  Object.assign(this,{db,handlers:{...handlers},clock,memoryPosition});
  this.bufferedWorlds=new Map();
  this.livePetPositions=new Map();
  this.emptySettlements=new Map();
  installConsumers(db);
 }
 writeSnapshot(snapshot){
  // Locations, leases, and input sequences are valid only for this server session.
  const durable=this.memoryPosition?{...snapshot,actors:snapshot.actors.map(({actorId,needs})=>({actorId,needs}))}:snapshot;
  this.db.prepare('UPDATE worlds SET snapshot=?,layout_revision=? WHERE world_id=?')
   .run(JSON.stringify(durable),snapshot.layoutRevision,snapshot.worldId);
 }
 startMemoryRuntime(){
  if(!this.memoryPosition)return;
  const db=this.db;
  const rows=db.prepare('SELECT world_id,snapshot FROM worlds').all();
  for(const row of rows){
   const snapshot=JSON.parse(row.snapshot);
   const home=defaultManifest.actors[0];
   const scene=snapshot.scenes.find(scene=>scene.sceneId===home.sceneId&&scene.status==='active')
    ??snapshot.scenes.find(scene=>scene.status==='active');
   const spawn=scene.sceneId===home.sceneId?home.position:getTemplate(scene.templateId).spawn;
   const position=nearestFree(snapshot,scene.sceneId,spawn);
   const previousActors=snapshot.actors;
   snapshot.actors=previousActors.map(({actorId,needs})=>({
    actorId,needs,sceneId:scene.sceneId,position:[...position],rotation:0,pose:'idle',form:'normal',grounded:true,controller:null,actionId:null,
   }));
   const interrupted=Object.values(snapshot.actions??{}).filter(action=>action.status==='running'||action.status==='queued');
   const needsMigration=previousActors.some(actor=>Object.hasOwn(actor,'position'))
    ||(snapshot.runtime?.lastCheckpointSignature!==undefined&&!snapshot.runtime.checkpointPositionOmitted);
   const now=this.clock();
   db.exec('BEGIN IMMEDIATE');
   try{
    for(const action of interrupted){
     const actor=snapshot.actors.find(actor=>actor.actorId===action.actorId);
     action.status=action.phase='cancelled';
     action.result={status:'cancelled',reason:'server_restart',sceneId:actor?.sceneId,pose:'idle',needs:actor?.needs};
     appendEvent(db,{worldId:row.world_id,kind:'action.cancelled',subjectId:null,changeId:null,now,
      data:{actorId:action.actorId,actionId:action.actionId,result:action.result}});
    }
    if(needsMigration&&snapshot.runtime)delete snapshot.runtime.lastCheckpointSignature;
    if(needsMigration||interrupted.length)this.writeSnapshot(snapshot);
    db.prepare('DELETE FROM movement_receipts WHERE world_id=?').run(row.world_id);
    db.exec('COMMIT');
    this.bufferedWorlds.set(row.world_id,{snapshot,receipts:new Map(),dirty:false});
   }catch(error){db.exec('ROLLBACK');throw error;}
  }
 }
 writeMovementReceipts(receipts,now){
  if(this.memoryPosition||!receipts.size)return;
  this.db.prepare('DELETE FROM movement_receipts WHERE expires_at<=?').run(now);
  const insert=this.db.prepare('INSERT INTO movement_receipts VALUES(?,?,?,?,?,?)');
  for(const {identity,command,result,expiresAt} of receipts.values()){
   if(expiresAt>now)insert.run(...identity,command,result,expiresAt);
  }
 }
 flushRuntime(){
  for(const buffer of this.bufferedWorlds.values()){
   if(!buffer.dirty)continue;
   this.db.exec('BEGIN IMMEDIATE');
   try{
    this.writeSnapshot(buffer.snapshot);
    this.db.exec('COMMIT');
    buffer.dirty=false;
   }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
 }
 bufferState(worldId,snapshot){
  const previous=this.bufferedWorlds.get(worldId);
  return {snapshot,receipts:previous?.receipts??new Map(),dirty:true};
 }
 rememberMovement(receipts,key,receipt,now){
  for(const [id,previous] of receipts){
   if(previous.expiresAt>now)break;
   receipts.delete(id);
  }
  receipts.set(key,receipt);
 }
 finishSave(worldId,buffer){
  if(this.memoryPosition)this.bufferedWorlds.set(worldId,{...buffer,dirty:false});
 }
 // Internal trusted domain transaction; never wired to an HTTP route.
 transactRuntime(worldId,mutate,{buffered=false}={}){
  const db=this.db;
  const canBuffer=buffered&&this.memoryPosition;
  db.exec(canBuffer?'BEGIN':'BEGIN IMMEDIATE');
  try{const snapshot=this.readSnapshot(worldId),previous=canonical(snapshot.entities.filter(e=>e.protected)),pending=[],now=this.clock(),changeId=randomUUID();
   const result=mutate({snapshot,now,db,emit:(kind,data)=>pending.push({kind,data})});
   if(result&&typeof result.then==='function')throw Error('ASYNC_HANDLER_NOT_ALLOWED');
   if(result===NO_RUNTIME_CHANGE&&pending.length===0){db.exec('COMMIT');return;}
   if(canonical(snapshot.entities.filter(e=>e.protected))!==previous)throw Error('PROTECTED_AREA');
   const buffer=this.bufferState(worldId,snapshot);
   if(canBuffer&&!pending.length){
    db.exec('COMMIT');
    this.bufferedWorlds.set(worldId,buffer);
    return result;
   }
   this.writeSnapshot(snapshot);
   this.writeMovementReceipts(buffer.receipts,now);
   for(const event of pending)appendEvent(db,{...event,worldId,subjectId:null,changeId,now});
   db.exec('COMMIT');
   this.finishSave(worldId,buffer);
   return result;
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 priorReceipt(principal,worldId,requestId,serialized,now){
  const identity=[principal.subjectId,worldId,requestId];
  const key=JSON.stringify(identity);
  const staged=this.bufferedWorlds.get(worldId)?.receipts.get(key);
  const db=this.db;
  const prior=(staged?.expiresAt>now?staged:null)
   ??db.prepare('SELECT command,result FROM command_results WHERE subject_id=? AND world_id=? AND request_id=?').get(...identity)
   ??db.prepare('SELECT command,result FROM movement_receipts WHERE subject_id=? AND world_id=? AND request_id=? AND expires_at>?').get(...identity,now);
  if(prior){
   if(prior.command!==serialized)throw Error('REQUEST_ID_REUSED');
   return JSON.parse(prior.result);
  }
  const empty=this.emptySettlements.get(key);
  if(empty){
   if(empty.expiresAt<=now){this.emptySettlements.delete(key);return null;}
   if(empty.command!==serialized)throw Error('REQUEST_ID_REUSED');
   return JSON.parse(empty.result);
  }
  return null;
 }
 cacheEmptySettlement(principal,worldId,requestId,serialized,result,now){
  for(const [key,entry] of this.emptySettlements)if(entry.expiresAt<=now)this.emptySettlements.delete(key);
  this.emptySettlements.set(JSON.stringify([principal.subjectId,worldId,requestId]),{
   command:serialized,result:JSON.stringify(result),expiresAt:now+EMPTY_SETTLEMENT_TTL_MS,
  });
 }
 getSnapshot(principal,worldId){authorizePrincipal(principal,worldId,'world:read',undefined,this.clock());const snapshot=this.readSnapshot(worldId);this.applyLivePetPositions(snapshot,worldId);return snapshot;}
 applyLivePetPositions(snapshot,worldId){
  const world=this.livePetPositions.get(worldId);
  if(!world)return;
  for(const [actorId,pets] of world){
   const owner=snapshot.pets?.owners?.[actorId];
   if(!owner)continue;
   for(const [petId,entry] of pets){
    const pet=owner.instances?.[petId];
    if(!pet)continue;
    pet.lastSceneId=entry.sceneId;
    pet.lastPosition=[...entry.position];
   }
  }
 }
 rememberLivePetPositions(principal,worldId,command){
  const snapshot=this.readSnapshot(worldId);
  const {actorId,positions}=command.payload;
  const actor=snapshot.actors?.find(entry=>entry.actorId===actorId);
  if(!actor)throw Error('ACTOR_NOT_FOUND');
  const owner=snapshot.pets?.owners?.[actorId];
  if(!owner)return {updated:0,requestId:command.requestId,worldId};
  let world=this.livePetPositions.get(worldId);
  if(!world){world=new Map();this.livePetPositions.set(worldId,world);}
  let pets=world.get(actorId);
  if(!pets){pets=new Map();world.set(actorId,pets);}
  let updated=0;
  for(const entry of positions){
   const pet=owner.instances?.[entry.petId];
   if(!pet||pet.ownerId!==actorId)continue;
   if(!Array.isArray(entry.position)||entry.position.length!==3||!entry.position.every(Number.isFinite))continue;
   pets.set(entry.petId,{sceneId:entry.sceneId,position:entry.position.slice(0,3)});
   updated+=1;
  }
  return {updated,requestId:command.requestId,worldId};
 }
 readSnapshot(worldId){const buffered=this.bufferedWorlds.get(worldId);if(buffered)return structuredClone(buffered.snapshot);const row=this.db.prepare('SELECT snapshot FROM worlds WHERE world_id=?').get(worldId);if(!row)throw Error('WORLD_NOT_FOUND');return JSON.parse(row.snapshot);}
 latestCursor(principal,worldId){authorizePrincipal(principal,worldId,'world:read',undefined,this.clock());this.readSnapshot(worldId);return readLatestCursor(this.db,worldId);}
 // 实时通道内部使用：不进 consumer 记账，避免影响 MCP 的 ack 水位。
 cursor(worldId){return readLatestCursor(this.db,worldId);}
 pushEvents(principal,{worldId,afterCursor=0,limit=100}){authorizePrincipal(principal,worldId,'world:read',undefined,this.clock());return projectEventPage(readEvents(this.db,{worldId,afterCursor,limit,subjectId:principal.subjectId}),principal);}
 getEvents(principal,options){authorizePrincipal(principal,options.worldId,'world:read',undefined,this.clock());this.readSnapshot(options.worldId);const page=projectEventPage(readEvents(this.db,{...options,subjectId:principal.subjectId}),principal);recordDelivery(this.db,principal.subjectId,options.worldId,page);return page;}
 ackEvents(principal,options){authorizePrincipal(principal,options.worldId,'world:read',undefined,this.clock());this.readSnapshot(options.worldId);return confirmEvents(this.db,principal.subjectId,options,this.clock());}
 snapshotRecovery(principal,worldId){const snapshot=this.getSnapshot(principal,worldId);return {snapshot,...snapshotRecovery(this.db,principal.subjectId,worldId,this.clock())};}
 resumeSummary(principal,worldId){const snapshot=this.getSnapshot(principal,worldId);return {...resumeConsumer(this.db,principal.subjectId,worldId),rulesVersion:snapshot.rulesVersion};}
 execute(principal,command){
  if(!validateCommand(command).ok)throw Error('INVALID_COMMAND');
  authorizePrincipal(principal,command.worldId,scopeFor(command.kind),command.payload.actorId,this.clock());
  if((['control.takeover','actor.teleport'].includes(command.kind)||command.kind.startsWith('battle.'))&&principal.role!=='owner')throw Error('UNAUTHORIZED');
  if(command.kind==='pet.settlePoops'){
   // 先查历史回执（含内存/ SQLite 移动回执和空结算短期缓存），避免重试被空结算预检吞掉。
   const serialized=canonical(command);
   const prior=this.priorReceipt(principal,command.worldId,command.requestId,serialized,this.clock());
   if(prior)return prior;
   const snapshot=this.readSnapshot(command.worldId);
   const actor=snapshot.actors?.find(entry=>entry.actorId===command.payload.actorId);
   if(actor){
    const owner=snapshot.pets?.owners?.[command.payload.actorId];
    const before=JSON.stringify(Object.values(owner?.instances??{}).map(pet=>[pet.petId,pet.poopSceneId,pet.poopSpeed,pet.lastPoopAt,pet.nextPoopAt]));
    const probe=structuredClone(owner?.instances??{});
    const plans=settlePetPoops({pets:Object.values(probe),roster:owner?.roster,actor,sceneId:command.payload.sceneId,now:this.clock()});
    const after=JSON.stringify(Object.values(probe).map(pet=>[pet.petId,pet.poopSceneId,pet.poopSpeed,pet.lastPoopAt,pet.nextPoopAt]));
    if(!plans.length&&before===after){
     const result={count:0,items:[],pets:[],requestId:command.requestId,worldId:command.worldId};
     this.cacheEmptySettlement(principal,command.worldId,command.requestId,serialized,result,this.clock());
     return result;
    }
   }
  }
  if(command.kind==='pet.syncPositions'&&this.memoryPosition)return this.rememberLivePetPositions(principal,command.worldId,command);
  const movement=command.kind==='actor.input';
  const canBuffer=movement&&this.memoryPosition;
  const serialized=canonical(command);const db=this.db;
  db.exec(canBuffer?'BEGIN':'BEGIN IMMEDIATE');
  try {
   const now=this.clock();
   const {worldId}=command;
   const identity=[principal.subjectId,worldId,command.requestId];
   const receiptKey=JSON.stringify(identity);
   const prior=this.priorReceipt(principal,worldId,command.requestId,serialized,now);
   if(prior){db.exec('COMMIT');return prior;}
   const snapshot=this.readSnapshot(command.worldId);const handler=this.handlers[command.kind];if(!handler)throw Error('NOT_IMPLEMENTED');
   const {actorId}=command.payload;
   if(actorId&&!command.kind.startsWith('battle.')&&snapshot.actors.some(actor=>actor.actorId===actorId&&actor.battle))throw Error('ACTOR_IN_BATTLE');
   const resetYard=command.kind==='build.resetWorld'||(command.kind==='build.resetScene'&&command.payload.sceneId==='yard');
   const resetFarm=resetYard?defaultManifest.scenes.find(scene=>scene.sceneId==='yard')?.entities.find(entity=>entity.type==='yardFarm'):null;
   const protectedEntities=snapshot.entities.filter(entity=>entity.protected).map(entity=>{
    const expected=resetFarm&&entity.sceneId==='yard'&&entity.type==='yardFarm'
     ?protectFarm({...entity,...resetFarm},entity.plots):entity;
    return [entity.entityId,canonical(expected)];
   });
   const {schemaVersion}=snapshot;
   const changeId=randomUUID();const pending=[];
   // Handlers are synchronous: mutate detached snapshot and emit factual events.
   // T3/T4 provide effects and validation; an absent handler never claims success.
   const output=handler({principal,command,snapshot,db,now:this.clock(),changeId,emit:(kind,data)=>pending.push({kind,data})});
   if(output&&typeof output.then==='function')throw Error('ASYNC_HANDLER_NOT_ALLOWED');
   for(const [id,record] of protectedEntities)if(canonical(snapshot.entities.find(entity=>entity.entityId===id))!==record)throw Error('PROTECTED_AREA');
   if(snapshot.worldId!==command.worldId||snapshot.schemaVersion!==schemaVersion)throw Error('INVALID_WORLD_STATE');
   const buffer=this.bufferState(worldId,snapshot);
   let eventCursor=null;
   for(const event of pending)eventCursor=appendEvent(db,{...event,worldId,subjectId:principal.subjectId,changeId,now});
   const result={...output,requestId:command.requestId,worldId,changeId,eventCursor};
   const resultJson=JSON.stringify(result);
   const receipt=movement?{identity,command:serialized,result:resultJson,expiresAt:now+MOVEMENT_RECEIPT_TTL_MS}:null;
   if(canBuffer&&!pending.length){
    db.exec('COMMIT');
    this.rememberMovement(buffer.receipts,receiptKey,receipt,now);
    this.bufferedWorlds.set(worldId,buffer);
    return result;
   }
   this.writeSnapshot(snapshot);
   if(receipt&&!this.memoryPosition)this.writeMovementReceipts(new Map([[receiptKey,receipt]]),now);
   if(!movement)db.prepare('INSERT INTO command_results VALUES(?,?,?,?,?)').run(...identity,serialized,resultJson);
   db.exec('COMMIT');
   if(receipt&&this.memoryPosition)this.rememberMovement(buffer.receipts,receiptKey,receipt,now);
   this.finishSave(worldId,buffer);
   return result;
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
}
