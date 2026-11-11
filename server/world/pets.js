import {PET_BOND_MAX, PET_BOND_HOURLY_CAP} from '../../shared/creatures/stats.js';
import {normalizePetInstance,createPetInstance} from '../../shared/creatures/instance.js';
import {getSpecies} from '../../shared/creatures/species.js';
import {EGG_CATALOG_VERSION,initialEggs,upgradeEggs} from '../../shared/creatures/eggs.js';
import {settlePetPoops,PET_POOP_SPEEDS,petPoopInterval} from '../../shared/creatures/poop.js';
import {addPoopGroundItem} from './items.js';
import {randomUUID} from 'node:crypto';
import {normalizeRoster, setFollowPet, setBattlePet} from '../../shared/creatures/roster.js';

const PET_LIMIT=20;
const HOUR_MS=60*60*1000;


function ensurePets(snapshot){
 if(!snapshot.pets||typeof snapshot.pets!=='object'||snapshot.pets.version!==1||!snapshot.pets.owners){
  snapshot.pets={version:1,owners:{}};
 }
 return snapshot.pets;
}

function actorOf(snapshot,actorId){
 const actor=snapshot.actors?.find(entry=>entry.actorId===actorId);
 if(!actor)throw Error('ACTOR_NOT_FOUND');
 return actor;
}

function ensureEggs(bucket,now=Date.now()){
 if(!bucket)return null;
 const hasPets=Object.keys(bucket.instances??{}).length>0;
 if(!Array.isArray(bucket.eggs)){
  // 新玩家/空名册发初始蛋；已有宠物的老存档不追发初始蛋。
  bucket.eggs=hasPets?[]:initialEggs(now);
  bucket.eggCatalogVersion=EGG_CATALOG_VERSION;
 }else{
  // 老快照没有版本号时按 0 处理；只补 grantToExisting 的新版本蛋。
  const fromVersion=Number.isFinite(bucket.eggCatalogVersion)?bucket.eggCatalogVersion:0;
  bucket.eggs=upgradeEggs(bucket.eggs,fromVersion,now);
  bucket.eggCatalogVersion=EGG_CATALOG_VERSION;
 }
 bucket.eggsInitialized=true;
 return bucket.eggs;
}

function bucketOf(snapshot,actorId,create=false){
 const pets=ensurePets(snapshot);
 let bucket=pets.owners[actorId];
 if(!bucket&&create){
  bucket={instances:{},roster:{followPetId:null,battlePetId:null},migration:{localVersion:null,importedAt:null}};
  ensureEggs(bucket);
  pets.owners[actorId]=bucket;
 }
 return bucket;
}

function ownedPet(snapshot,actorId,petId){
 const bucket=bucketOf(snapshot,actorId,false);
 const pet=bucket?.instances?.[petId];
 if(!pet||pet.ownerId!==actorId)throw Error('PET_NOT_FOUND');
 return pet;
}

export function projectPets(snapshot,actorIds){
 const owners={};
 for(const actorId of actorIds??[]){
  const bucket=snapshot.pets?.owners?.[actorId];
  if(bucket)owners[actorId]=structuredClone(bucket);
 }
 return {version:1,owners};
}

export function hasServerPets(snapshot,actorId){
 return Boolean(snapshot.pets?.owners?.[actorId]?.instances&&Object.keys(snapshot.pets.owners[actorId].instances).length);
}

function bondWindow(pet,now){
 if(!Number.isFinite(pet.bondWindowStart)||now-pet.bondWindowStart>=HOUR_MS){
  pet.bondWindowStart=now;
  pet.bondWindowPoints=0;
 }
}

export const petHandlers={
 'pet.import':({snapshot,command,principal,now,emit})=>{
  if(principal.role!=='owner')throw Error('UNAUTHORIZED');
  const {actorId}=command.payload;
  actorOf(snapshot,actorId);
  const bucket=bucketOf(snapshot,actorId,true);
  if(Object.keys(bucket.instances).length)return {status:'skipped',reason:'already-has-pets'};
  const instances={};
  for(const raw of command.payload.pets.slice(0,PET_LIMIT)){
   const pet=normalizePetInstance({...raw,ownerId:actorId},actorId);
   if(!pet)continue;
   if(instances[pet.petId])continue;
   instances[pet.petId]=pet;
  }
  if(!Object.keys(instances).length)throw Error('NO_VALID_PETS');
  bucket.instances=instances;
  bucket.roster=normalizeRoster({followPetId:command.payload.followPetId??null,battlePetId:command.payload.battlePetId??null},instances,actorId);
  bucket.migration={localVersion:Number.isFinite(command.payload.localVersion)?command.payload.localVersion:3,importedAt:now};
  // 从旧本地存档迁移过来的玩家已经有宠物，不再补发初始蛋。
  bucket.eggs=[];bucket.eggsInitialized=true;bucket.eggCatalogVersion=EGG_CATALOG_VERSION;
  emit('pets.imported',{actorId,count:Object.keys(instances).length});
  return {status:'imported',count:Object.keys(instances).length,roster:{...bucket.roster}};
 },

 'pet.bootstrap':({snapshot,command,principal,now,emit})=>{
  if(principal.role!=='owner')throw Error('UNAUTHORIZED');
  const {actorId}=command.payload;
  actorOf(snapshot,actorId);
  const bucket=bucketOf(snapshot,actorId,true);
  const eggs=ensureEggs(bucket,now);
  emit('pets.eggs_initialized',{actorId,eggs:eggs.length});
  return {eggs:structuredClone(eggs),eggCatalogVersion:bucket.eggCatalogVersion,roster:{...bucket.roster}};
 },

 'pet.hatchEgg':({snapshot,command,principal,now,emit})=>{
  if(principal.role!=='owner')throw Error('UNAUTHORIZED');
  const {actorId,eggId}=command.payload;
  actorOf(snapshot,actorId);
  const bucket=bucketOf(snapshot,actorId,true);
  const actor=actorOf(snapshot,actorId);
  const eggs=ensureEggs(bucket,now);
  const egg=eggs.find(entry=>entry.eggId===eggId&&!entry.hatched);
  if(!egg)throw Error('EGG_NOT_FOUND');
  const species=getSpecies(egg.speciesId);
  let petId=`pet-${egg.eggId}`;
  if(bucket.instances[petId])petId=`${petId}-${randomUUID().slice(0,6)}`;
  const pet=createPetInstance({petId,ownerId:actorId,speciesId:egg.speciesId,nickname:species.name,now});
  bucket.instances[petId]=pet;
  pet.lastSceneId=actor.sceneId;
  pet.lastPosition=[...(actor.position??[0,0,0])];
  egg.hatched=true;
  if(!bucket.roster.followPetId)bucket.roster.followPetId=petId;
  emit('pets.hatched',{actorId,eggId,petId,speciesId:egg.speciesId});
  return {petId,eggId,speciesId:egg.speciesId,name:pet.nickname,roster:{...bucket.roster},eggs:structuredClone(eggs)};
 },

 'pet.settlePoops':({snapshot,command,principal,now,emit})=>{
  const {actorId,sceneId}=command.payload;
  const actor=actorOf(snapshot,actorId);
  const bucket=bucketOf(snapshot,actorId,false);
  if(!bucket)return {count:0,items:[]};
  const pets=Object.values(bucket.instances??{});
  const plans=settlePetPoops({pets,roster:bucket.roster,actor,sceneId,now});
  const items=[];
  if(sceneId==='yard'){
   for(const {pet,count} of plans){
    const base=pet.homePosition||pet.lastPosition||actor.position||[0,0,0];
    for(let index=0;index<count;index++){
     const point=[base[0]+(Math.random()-0.5)*0.8,base[1]??0,base[2]+(Math.random()-0.5)*0.8];
     const item=addPoopGroundItem(snapshot,actorId,sceneId,point,now);
     if(item)items.push(item);
    }
   }
  }
  if(items.length)emit('items.updated',{actorId,kind:'pet-poop',count:items.length});
  return {count:items.length,items:items.map(item=>item.id),pets:plans.map(plan=>({petId:plan.pet.petId,count:plan.count}))};
 },

 'pet.setPoopSpeed':({snapshot,command,principal,now,emit})=>{
  const {actorId,petId,speed}=command.payload;
  actorOf(snapshot,actorId);
  const pet=ownedPet(snapshot,actorId,petId);
  if(!Object.hasOwn(PET_POOP_SPEEDS,speed))throw Error('INVALID_POOP_SPEED');
  pet.poopSpeed=speed;
  pet.lastPoopAt=now;
  pet.nextPoopAt=now+petPoopInterval(pet);
  emit('pets.poop_speed',{actorId,petId,speed,nextPoopAt:pet.nextPoopAt});
  return {ok:true,petId,speed,nextPoopAt:pet.nextPoopAt,intervalMs:petPoopInterval(pet)};
 },

 'pet.feed':({snapshot,command,principal,now,emit})=>{
  const {actorId,petId}=command.payload;
  actorOf(snapshot,actorId);
  const pet=ownedPet(snapshot,actorId,petId);
  pet.satiety=Math.min(100,(Number.isFinite(pet.satiety)?pet.satiety:80)+25);
  emit('pets.fed',{actorId,petId,satiety:pet.satiety});
  return {ok:true,petId,satiety:pet.satiety};
 },
 'pet.rename':({snapshot,command,principal,now,emit})=>{
  const {actorId,petId,name}=command.payload;
  actorOf(snapshot,actorId);
  const pet=ownedPet(snapshot,actorId,petId);
  pet.nickname=String(name).trim().slice(0,24);
  if(!pet.nickname)throw Error('INVALID_NAME');
  emit('pets.renamed',{actorId,petId,name:pet.nickname});
  return {ok:true,petId,name:pet.nickname};
 },
 'pet.syncPositions':({snapshot,command,principal})=>{
  const {actorId,positions}=command.payload;
  actorOf(snapshot,actorId);
  const bucket=bucketOf(snapshot,actorId,false);
  if(!bucket)return {updated:0};
  let updated=0;
  for(const entry of positions){
   const pet=bucket.instances?.[entry.petId];
   if(!pet||pet.ownerId!==actorId)continue;
   if(Array.isArray(entry.position)&&entry.position.length===3&&entry.position.every(Number.isFinite)){
    pet.lastSceneId=entry.sceneId;
    pet.lastPosition=entry.position.slice(0,3);
    updated+=1;
   }
  }
  return {updated};
 },

 'pet.setMode':({snapshot,command,principal,now,emit})=>{
  const {actorId,petId,mode}=command.payload;
  actorOf(snapshot,actorId);
  const bucket=bucketOf(snapshot,actorId,true);
  const pet=ownedPet(snapshot,actorId,petId);
  if(mode==='follow'){
   bucket.roster=setFollowPet(bucket.roster,petId,bucket.instances,actorId);
  }else{
   if(pet.homeSceneId&&command.payload.homeSceneId)pet.homeSceneId=command.payload.homeSceneId;
   if(Array.isArray(command.payload.homePosition)&&command.payload.homePosition.length===3&&command.payload.homePosition.every(Number.isFinite))pet.homePosition=command.payload.homePosition.slice(0,3);
   if(bucket.roster.followPetId===petId)bucket.roster.followPetId=null;
  }
  emit('pets.mode_changed',{actorId,petId,mode});
  return {petId,mode,roster:{...bucket.roster},homeSceneId:pet.homeSceneId,homePosition:pet.homePosition};
 },

 'pet.setBattle':({snapshot,command,principal,now,emit})=>{
  const {actorId,petId}=command.payload;
  actorOf(snapshot,actorId);
  const bucket=bucketOf(snapshot,actorId,true);
  if(petId)ownedPet(snapshot,actorId,petId);
  bucket.roster=setBattlePet(bucket.roster,petId??null,bucket.instances,actorId);
  emit('pets.battle_changed',{actorId,petId:bucket.roster.battlePetId});
  return {petId:bucket.roster.battlePetId,roster:{...bucket.roster}};
 },

 'pet.pet':({snapshot,command,principal,now,emit})=>{
  const {actorId,petId}=command.payload;
  actorOf(snapshot,actorId);
  const pet=ownedPet(snapshot,actorId,petId);
  if(pet.bond>=PET_BOND_MAX)return {ok:false,reason:'max',bond:pet.bond,evolved:pet.evolved};
  bondWindow(pet,now);
  if(pet.bondWindowPoints>=PET_BOND_HOURLY_CAP)return {ok:false,reason:'hourly-cap',bond:pet.bond,evolved:pet.evolved};
  pet.bond=Math.min(PET_BOND_MAX,pet.bond+1);
  pet.bondWindowPoints+=1;
  emit('pets.petted',{actorId,petId,bond:pet.bond});
  return {ok:true,gain:1,bond:pet.bond,evolved:pet.evolved,readyToEvolve:pet.bond>=PET_BOND_MAX&&!pet.evolved};
 },

 'pet.evolve':({snapshot,command,principal,now,emit})=>{
  if(principal.role!=='owner')throw Error('UNAUTHORIZED');
  const {actorId,petId}=command.payload;
  actorOf(snapshot,actorId);
  const pet=ownedPet(snapshot,actorId,petId);
  if(pet.bond<PET_BOND_MAX)return {ok:false,reason:'not-ready'};
  if(pet.evolved)return {ok:false,reason:'already-evolved'};
  pet.evolved=true;
  emit('pets.evolved',{actorId,petId});
  return {ok:true,evolved:true};
 },
};
