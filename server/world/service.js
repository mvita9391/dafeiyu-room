import {installConsumers,recordDelivery,confirmEvents,resumeConsumer,snapshotRecovery} from './consumers.js';
import {randomUUID} from 'node:crypto';
import {validateCommand} from '../../shared/world/schema.js';
import {defaultManifest} from '../../shared/world/default-manifest.js';
import {protectFarm} from './starter.js';
import {nearestFree} from '../../shared/world/navigation.js';
import {getTemplate} from '../../shared/world/templates.js';
import {appendEvent,readEvents,readLatestCursor,projectEventPage} from './events.js';
const scopeFor=kind=>kind.startsWith('build.')?'build:write':kind.startsWith('control.')||kind.startsWith('action.')||kind.startsWith('actor.')||kind.startsWith('battle.')?'actor:control':'world:read';
// Trusted adapter-only principal: {subjectId,worldIds,actorIds,scopes,role,
// expiresAt?,revoked?}. Never construct this object from command/request JSON.
export function authorizePrincipal(principal,worldId,scope,actorId,now=Date.now()){
 if(!principal||typeof principal.subjectId!=='string'||!principal.subjectId||principal.revoked|| (principal.expiresAt!==undefined&&principal.expiresAt<=now)||!principal.worldIds?.includes(worldId)||!principal.scopes?.includes(scope)||(actorId&&!principal.actorIds?.includes(actorId)))throw Error('UNAUTHORIZED');
}
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export const NO_RUNTIME_CHANGE=Symbol('no runtime change');
const MOVEMENT_RECEIPT_TTL_MS=600_000;
export class WorldService{
 constructor(db,{handlers={},clock=Date.now,memoryPosition=false}={}){
  Object.assign(this,{db,handlers:{...handlers},clock,memoryPosition});
  this.bufferedWorlds=new Map();
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
 getSnapshot(principal,worldId){authorizePrincipal(principal,worldId,'world:read',undefined,this.clock());return this.readSnapshot(worldId);}
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
  const movement=command.kind==='actor.input';
  const canBuffer=movement&&this.memoryPosition;
  const serialized=canonical(command);const db=this.db;
  db.exec(canBuffer?'BEGIN':'BEGIN IMMEDIATE');
  try {
   const now=this.clock();
   const {worldId}=command;
   const identity=[principal.subjectId,worldId,command.requestId];
   const receiptKey=JSON.stringify(identity);
   const staged=this.bufferedWorlds.get(worldId)?.receipts.get(receiptKey);
   const prior=(staged?.expiresAt>now?staged:null)??db.prepare('SELECT command,result FROM command_results WHERE subject_id=? AND world_id=? AND request_id=?').get(...identity)
    ??db.prepare('SELECT command,result FROM movement_receipts WHERE subject_id=? AND world_id=? AND request_id=? AND expires_at>?').get(...identity,now);
   if(prior){if(prior.command!==serialized)throw Error('REQUEST_ID_REUSED');db.exec('COMMIT');return JSON.parse(prior.result);}
   const snapshot=this.readSnapshot(command.worldId);const handler=this.handlers[command.kind];if(!handler)throw Error('NOT_IMPLEMENTED');
   const {actorId}=command.payload;
   if(actorId&&!command.kind.startsWith('battle.')&&snapshot.actors.some(actor=>actor.actorId===actorId&&actor.battle))throw Error('ACTOR_IN_BATTLE');
   const resetFarm=command.kind==='build.resetScene'
    ?defaultManifest.scenes.find(scene=>scene.sceneId===command.payload.sceneId)?.entities.find(entity=>entity.type==='yardFarm')
    :null;
   const protectedEntities=snapshot.entities.filter(entity=>entity.protected).map(entity=>{
    const expected=resetFarm&&entity.sceneId===command.payload.sceneId&&entity.type==='yardFarm'
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
