import {
  createDefaultItemState, normalizeItemState, addItem, removeItem, moveItemSlot,
  addGroundItem, removeGroundItem, getGroundItem, startCompost, collectCompost,
  getCompostStatus, inventoryTotal,
} from '../../shared/items/item-store.js';
import {compostPositionForSnapshot as compostPosition} from '../../shared/world/compost.js';
export {compostPosition};

const INTERACT_DISTANCE=5;

function ensureItems(snapshot){
 if(!snapshot.items||typeof snapshot.items!=='object'||snapshot.items.version!==1||!snapshot.items.owners){
  snapshot.items={version:1,owners:{}};
 }
 return snapshot.items;
}

function ownerBucket(snapshot,actorId,create=false){
 const items=ensureItems(snapshot);
 let bucket=items.owners[actorId];
 if(!bucket&&create){
  bucket=createDefaultItemState();
  items.owners[actorId]=bucket;
 }
 return bucket;
}

function actorOf(snapshot,actorId){
 const actor=snapshot.actors?.find(entry=>entry.actorId===actorId);
 if(!actor)throw Error('ACTOR_NOT_FOUND');
 return actor;
}

function distance(actor,position){
 return Math.hypot(actor.position[0]-position[0],actor.position[2]-position[2]);
}

export function projectItems(snapshot,actorIds){
 const owners={};
 for(const actorId of actorIds??[]){
  const bucket=snapshot.items?.owners?.[actorId];
  if(bucket)owners[actorId]=structuredClone(bucket);
 }
 return {version:1,owners,compostPosition:compostPosition(snapshot)};
}

function summary(bucket,snapshot){
 return {
  inventory:{...bucket.inventory},
  total:inventoryTotal(bucket),
  ground:structuredClone(bucket.groundItems),
  slots:structuredClone(bucket.slots),
  compost:structuredClone(bucket.compost),
  compostStatus:getCompostStatus(bucket,Date.now()).status,
  compostPosition:compostPosition(snapshot),
 };
}

function mergeLegacyItems(current,legacy){
 const merged=structuredClone(current);
 for(const [id,count] of Object.entries(legacy.inventory??{})){
  merged.inventory[id]=Math.max(merged.inventory[id]??0,count??0);
 }
 // 旧背包槽位只补当前缺失的类型
 merged.slots=Array.isArray(merged.slots)?merged.slots:Array(12).fill(null);
 const present=new Set(merged.slots.filter(Boolean));
 for(const id of (legacy.slots??[]).filter(Boolean)){
  if(present.has(id)||(merged.inventory[id]??0)<=0)continue;
  const index=merged.slots.findIndex(value=>!value);
  if(index<0)break;
  merged.slots[index]=id;present.add(id);
 }
 const known=new Set((merged.groundItems??[]).map(item=>item.id));
 const incoming=(legacy.groundItems??[]).filter(item=>!known.has(item.id));
 if((merged.groundItems?.length??0)+incoming.length>20)throw Error('LEGACY_GROUND_FULL');
 for(const item of incoming){merged.groundItems.push(item);known.add(item.id);}
 if(merged.compost?.status==='empty'&&legacy.compost?.status!=='empty')merged.compost=structuredClone(legacy.compost);
 return merged;
}

export function addPoopGroundItem(snapshot,actorId,sceneId,position,now=Date.now()){
 const bucket=ownerBucket(snapshot,actorId,true);
 const result=addGroundItem(bucket,{type:'poop',sceneId,position,now});
 return result.ok?result.item:null;
}

export const itemHandlers={
 'item.import':({snapshot,command,principal,now})=>{
  const {actorId,state}=command.payload;
  actorOf(snapshot,actorId);
  const items=ensureItems(snapshot);
  const legacy=normalizeItemState(state,now);
  let bucket=items.owners[actorId];
  if(bucket?.legacyImported){return summary(bucket,snapshot);}
  bucket=bucket?normalizeItemState(mergeLegacyItems(bucket,legacy),now):legacy;
  bucket.legacyImported=true;
  items.owners[actorId]=bucket;
  return summary(bucket,snapshot);
 },

 'item.moveSlot':({snapshot,command,principal,now})=>{
  const {actorId,from,to}=command.payload;
  actorOf(snapshot,actorId);
  const bucket=ownerBucket(snapshot,actorId,true);
  if(!moveItemSlot(bucket,from,to))throw Error('SLOT_MOVE_INVALID');
  return summary(bucket,snapshot);
 },

 'item.poop':({snapshot,command,principal,now,emit})=>{
  const {actorId,sceneId,position}=command.payload;
  actorOf(snapshot,actorId);
  const bucket=ownerBucket(snapshot,actorId,true);
  const result=addGroundItem(bucket,{type:'poop',sceneId,position,now});
  if(!result.ok)throw Error(result.reason==='ground-full'?'GROUND_FULL':'ITEM_POOP_FAILED');
  emit('items.updated',{actorId,kind:'poop',itemId:result.item.id});
  return {ok:true,item:result.item,...summary(bucket,snapshot)};
 },

 'item.pickup':({snapshot,command,principal,now,emit})=>{
  const {actorId,itemId}=command.payload;
  const actor=actorOf(snapshot,actorId);
  const bucket=ownerBucket(snapshot,actorId,true);
  const item=getGroundItem(bucket,itemId);
  if(!item)throw Error('ITEM_NOT_FOUND');
  if(item.sceneId!==actor.sceneId||distance(actor,item.position)>INTERACT_DISTANCE)throw Error('ITEM_TOO_FAR');
  if(addItem(bucket,item.type,1)<=0)throw Error('INVENTORY_FULL');
  removeGroundItem(bucket,itemId);
  emit('items.updated',{actorId,kind:'pickup',itemId});
  return {ok:true,itemId,...summary(bucket,snapshot)};
 },

 'item.drop':({snapshot,command,principal,now,emit})=>{
  const {actorId,type,sceneId,position}=command.payload;
  actorOf(snapshot,actorId);
  const bucket=ownerBucket(snapshot,actorId,true);
  if(removeItem(bucket,type,1)<=0)throw Error('ITEM_NOT_IN_BAG');
  const result=addGroundItem(bucket,{type,sceneId,position,now});
  if(!result.ok){addItem(bucket,type,1);throw Error(result.reason==='ground-full'?'GROUND_FULL':'ITEM_DROP_FAILED');}
  emit('items.updated',{actorId,kind:'drop',itemId:result.item.id});
  return {ok:true,item:result.item,...summary(bucket,snapshot)};
 },

 'item.compost':({snapshot,command,principal,now,emit})=>{
  const {actorId}=command.payload;
  const actor=actorOf(snapshot,actorId);
  const bucket=ownerBucket(snapshot,actorId,true);
  const point=compostPosition(snapshot);
  if(actor.sceneId!=='yard'||distance(actor,point)>INTERACT_DISTANCE)throw Error('COMPOST_TOO_FAR');
  const result=startCompost(bucket,now);
  if(!result.ok)throw Error(result.reason==='no-poop'?'NO_POOP':result.reason==='busy'?'COMPOST_BUSY':'COMPOST_FAILED');
  emit('items.updated',{actorId,kind:'compost'});
  return {ok:true,...summary(bucket,snapshot)};
 },

 'item.collect':({snapshot,command,principal,now,emit})=>{
  const {actorId}=command.payload;
  const actor=actorOf(snapshot,actorId);
  const bucket=ownerBucket(snapshot,actorId,true);
  const point=compostPosition(snapshot);
  if(actor.sceneId!=='yard'||distance(actor,point)>INTERACT_DISTANCE)throw Error('COMPOST_TOO_FAR');
  const result=collectCompost(bucket,now);
  if(!result.ok)throw Error(result.reason==='inventory-full'?'INVENTORY_FULL':result.reason==='not-ready'?'COMPOST_NOT_READY':result.reason==='empty'?'COMPOST_EMPTY':'COMPOST_FAILED');
  emit('items.updated',{actorId,kind:'collect'});
  return {ok:true,type:result.type,count:result.count,...summary(bucket,snapshot)};
 },
};
