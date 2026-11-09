import {surfaceAt} from '../../shared/world/coastal.js';
import {randomUUID} from 'node:crypto';
import {getCatalogEntry} from '../../shared/world/catalog.js';
import {FOREST_RETURN_SLOT,YARD_FOREST_SLOT,getTemplate} from '../../shared/world/templates.js';
import {sceneRoute,findPath,nearestFree,invalidateNavigationCache,walkable} from '../../shared/world/navigation.js';
import {defaultManifest} from '../../shared/world/default-manifest.js';
import {protectFarm} from './starter.js';
import {forestConnectionOps} from './forest-connection.js';
import {validateSpatial,overlapsRect} from './spatial.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=(code,details)=>{const error=Error(code);error.details=details;throw error;};
export function listPortalSlots(snapshot,sceneId){const scene=snapshot.scenes.find(s=>s.sceneId===sceneId);if(!scene)throw Error('SCENE_NOT_FOUND');return getTemplate(scene.templateId).portalSlots.map(s=>({...s,occupied:snapshot.portals.some(p=>p.kind!=='legacy'&&[p.from,p.to].some(e=>e.sceneId===sceneId&&e.slotId===s.slotId)),reachable:(()=>{try{findPath(snapshot,sceneId,nearestFree(snapshot,sceneId,getTemplate(scene.templateId).spawn),s.landing);return true;}catch{return false;}})(),blocked:snapshot.entities.some(e=>e.sceneId===sceneId&&!e.supportEntityId&&getCatalogEntry(e.type).footprint.blocking&&overlapsRect(e,s.clearance))}));}
function checkLocks(snapshot,ops,subjectId,now){for(const op of ops){const ids=[op.sceneId,op.from?.sceneId,op.to?.sceneId,snapshot.entities.find(e=>e.entityId===op.entityId)?.sceneId];for(const scene of snapshot.scenes.filter(s=>ids.includes(s.sceneId))){if(scene.editLock&&scene.editLock.expiresAt>now&&scene.editLock.subjectId!==subjectId)throw Error('SCENE_EDIT_LOCKED');}}}
function simulate(before,ops,ids){const s=structuredClone(before),resolve=id=>ids[id]||id;const touched=new Set();
 for(const [opIndex,op] of ops.entries()){if(op.kind==='scene.create'){s.scenes.push({sceneId:ids[op.ref],templateId:op.templateId,name:op.name,style:op.style||'cozy',status:'draft'});continue;}
 if(op.kind==='portal.link'){const from={...op.from,sceneId:resolve(op.from.sceneId)},to={...op.to,sceneId:resolve(op.to.sceneId)};if(from.sceneId===to.sceneId)fail('PORTAL_SELF_LINK');for(const end of [from,to]){const slots=listPortalSlots(s,end.sceneId);if(!slots.some(slot=>slot.slotId===end.slotId&&!slot.occupied))fail('PORTAL_SLOT_UNAVAILABLE',{sceneId:end.sceneId,endpoints:[from,to],availableSlots:slots.filter(x=>!x.occupied&&!x.blocked&&x.reachable).map(slot=>({...slot,sceneId:end.sceneId}))});}s.portals.push({id:ids[`portal-${opIndex}`],from,to,bidirectional:true});continue;}
 const entityId=op.kind==='entity.add'?ids[op.ref]:resolve(op.entityId),old=s.entities.find(e=>e.entityId===entityId);if(op.kind!=='entity.add'&&!old)throw Error('ENTITY_NOT_FOUND');if(old?.protected)throw Error('PROTECTED_AREA');
 if(old&&Object.values(s.actions||{}).some(a=>a.status==='running'&&(a.target?.entityId===entityId||a.entityId===entityId)))throw Error('ENTITY_IN_USE');
 if(op.kind==='entity.remove'){if(s.entities.some(e=>e.supportEntityId===entityId))throw Error('SUPPORT_DEPENDENCY');s.entities=s.entities.filter(e=>e.entityId!==entityId);continue;}
 const e={...(old||{}),entityId,sceneId:old?.sceneId||resolve(op.sceneId),type:old?.type||op.type,position:[...op.position],rotation:op.rotation,scale:[...op.scale]};if(!s.scenes.some(x=>x.sceneId===e.sceneId))throw Error('SCENE_NOT_FOUND');const template=getTemplate(s.scenes.find(x=>x.sceneId===e.sceneId).templateId);if((template.templateId==='coastal_town_v1'||template.authorSceneId)&&!op.supportEntityId){const surface=surfaceAt(template,e.position[0],e.position[2]);if(surface)e.position[1]=surface.height+(getCatalogEntry(e.type).authorOffsetY||0);}if(op.supportEntityId){e.supportEntityId=resolve(op.supportEntityId);e.supportAnchorId=op.supportAnchorId;}else if(op.kind==='entity.add'&&op.supportAnchorId)throw Error('INVALID_SUPPORT');
 if(old){const angle=e.rotation-old.rotation,c=Math.cos(angle),sn=Math.sin(angle);for(const child of s.entities.filter(x=>x.supportEntityId===entityId)){const dx=(child.position[0]-old.position[0])*e.scale[0]/old.scale[0],dz=(child.position[2]-old.position[2])*e.scale[2]/old.scale[2];child.position=[e.position[0]+dx*c+dz*sn,e.position[1]+(child.position[1]-old.position[1])*e.scale[1]/old.scale[1],e.position[2]-dx*sn+dz*c];child.rotation+=angle;child.scale=child.scale.map((v,i)=>v*e.scale[i]/old.scale[i]);}Object.assign(old,e);}else s.entities.push(e);touched.add(e.sceneId);
 }
 if(s.scenes.length>8||s.scenes.some(scene=>s.entities.filter(e=>e.sceneId===scene.sceneId).length>(getTemplate(scene.templateId).maxEntities||100)))throw Error('QUOTA_EXCEEDED');
 const home=before.scenes.find(x=>x.status==='active')?.sceneId;for(const scene of s.scenes.filter(x=>x.status==='draft')){try{sceneRoute(s,home,scene.sceneId);sceneRoute(s,scene.sceneId,home);scene.status='active';}catch{}}
 for(const action of Object.values(before.actions||{})){const id=action.entityId||action.target?.entityId;if(action.status==='running'&&id&&!same(before.entities.find(e=>e.entityId===id),s.entities.find(e=>e.entityId===id)))throw Error('ENTITY_IN_USE');}
 invalidateNavigationCache(s);try{validateSpatial(before,s);}catch(error){if(['PORTAL_BLOCKED','PATH_BLOCKED'].includes(error.message)){const endpoints=error.details?.endpoints||[];const failingPortalId=error.details?.portalId;const available={...s,portals:s.portals.filter(p=>p.kind==='legacy'||p.id!==failingPortalId)};const sceneIds=[...new Set(endpoints.map(end=>end.sceneId))];error.details={...error.details,endpoints,availableSlots:sceneIds.flatMap(sceneId=>listPortalSlots(available,sceneId).filter(slot=>!slot.occupied&&!slot.blocked&&slot.reachable).map(slot=>({...slot,sceneId})))};}throw error;}return s;
}
function resetLayouts({snapshot,command,principal,now,emit}){
 if(principal.role!=='owner')throw Error('UNAUTHORIZED');
 if(snapshot.paused)throw Error('WORLD_PAUSED');
 const {sceneId,baseRevision}=command.payload;
 if(baseRevision!==snapshot.layoutRevision)throw Error('REVISION_CONFLICT');
 const baselines=sceneId?defaultManifest.scenes.filter(scene=>scene.sceneId===sceneId):defaultManifest.scenes;
 if(!baselines.length||baselines.some(baseline=>!snapshot.scenes.some(scene=>scene.sceneId===baseline.sceneId&&scene.templateId===baseline.templateId)))throw Error('DEFAULT_LAYOUT_UNAVAILABLE');
 const forestIds=new Set(snapshot.scenes.filter(scene=>scene.templateId==='forest_v1').map(scene=>scene.sceneId));
 const resetIds=new Set(baselines.map(scene=>scene.sceneId));
 // The forest terrain comes from its template. Its saved entities are custom additions.
 if(!sceneId)for(const id of forestIds)resetIds.add(id);
 checkLocks(snapshot,[...resetIds].map(sceneId=>({sceneId})),principal.subjectId,now);
 const current=snapshot.entities.filter(entity=>resetIds.has(entity.sceneId));
 const farm=current.find(entity=>entity.sceneId==='yard'&&entity.type==='yardFarm'&&entity.protected);
 const ids=new Set(current.map(entity=>entity.entityId));
 const actors=snapshot.actors.filter(actor=>resetIds.has(actor.sceneId));
 if(actors.some(actor=>actor.actionId||actor.resting||actor.battle)||
    Object.values(snapshot.actions||{}).some(action=>action.status==='running'&&
      [action.entityId,action.target?.entityId].some(id=>ids.has(id))))throw Error('ENTITY_IN_USE');
 const restored=baselines.flatMap(({sceneId,entities})=>entities.map(layout=>{
  const entity={...structuredClone(layout),sceneId,entityId:randomUUID(),legacy:true};
  if(entity.type!=='yardFarm')return entity;
  return protectFarm(farm?{...farm,...layout}:entity,farm?.plots);
 }));
 const entities=snapshot.entities.filter(entity=>!resetIds.has(entity.sceneId)).concat(restored);
 let next={...snapshot,entities};
 if(!sceneId){
  const yardGate=end=>end?.sceneId==='yard'&&end.slotId===YARD_FOREST_SLOT;
  const forestGate=end=>forestIds.has(end?.sceneId)&&end.slotId===FOREST_RETURN_SLOT;
  const retained=snapshot.portals.filter(portal=>{
   if(portal.bidirectional&&(yardGate(portal.from)&&forestGate(portal.to)||yardGate(portal.to)&&forestGate(portal.from)))return true;
   if([portal.from,portal.to].some(end=>yardGate(end)||forestGate(end)))return false;
   return ![portal.from?.sceneId??portal.fromSceneId,portal.to?.sceneId??portal.toSceneId].every(id=>resetIds.has(id));
  });
  next.portals=[...structuredClone(defaultManifest.portals),...retained];
 }
 if(actors.some(actor=>!walkable(next,actor.sceneId,actor.position)&&walkable(snapshot,actor.sceneId,actor.position)))throw Error('ACTOR_BLOCKED');
 for(const id of resetIds)if(listPortalSlots(next,id).some(slot=>slot.occupied&&slot.blocked))throw Error('PORTAL_BLOCKED');
 if(resetIds.has('yard')){
  const ops=forestConnectionOps(next);
  if(ops.length){
   checkLocks(next,ops,principal.subjectId,now);
   const ids=Object.fromEntries(ops.map((op,index)=>[op.ref??`portal-${index}`,randomUUID()]));
   next=simulate(next,ops,ids);
  }
 }
 if(!same(snapshot.portals,next.portals))snapshot.topologyRevision++;
 snapshot.scenes=next.scenes;
 snapshot.portals=next.portals;
 snapshot.entities=next.entities;
 snapshot.layoutRevision++;
 emit('build.reset',{...(sceneId?{sceneId}:{scope:'world'}),layoutRevision:snapshot.layoutRevision});
 return {status:'reset',...(sceneId?{sceneId}:{scope:'world'}),layoutRevision:snapshot.layoutRevision};
}
export function createBuildHandlers(){return {
 'build.resetScene':resetLayouts,
 'build.resetWorld':resetLayouts,
 'build.editLock':({snapshot,command,principal,now,emit})=>{if(principal.role!=='owner')throw Error('UNAUTHORIZED');const scene=snapshot.scenes.find(s=>s.sceneId===command.payload.sceneId);if(!scene)throw Error('SCENE_NOT_FOUND');scene.editLock=command.payload.locked?{subjectId:principal.subjectId,expiresAt:now+60000}:null;emit('build.edit_lock',{sceneId:scene.sceneId,locked:command.payload.locked});return {status:command.payload.locked?'locked':'released',expiresAt:scene.editLock?.expiresAt};},
 'build.preview':({snapshot,command,principal,now})=>{if(snapshot.paused)throw Error('WORLD_PAUSED');const {baseRevision,ops}=command.payload;if(baseRevision!==snapshot.layoutRevision)throw Error('REVISION_CONFLICT');const refs=ops.filter(o=>o.ref).map(o=>o.ref);if(new Set(refs).size!==refs.length||refs.some(r=>snapshot.scenes.some(s=>s.sceneId===r)||snapshot.entities.some(e=>e.entityId===r)))throw Error('DUPLICATE_REF');const ids=Object.fromEntries(refs.map(ref=>[ref,randomUUID()]));ops.forEach((op,i)=>{if(op.kind==='portal.link')ids[`portal-${i}`]=randomUUID();});checkLocks(snapshot,ops,principal.subjectId,now);const next=simulate(snapshot,ops,ids),planId=randomUUID(),expiresAt=now+300000; snapshot.buildPlans??={};snapshot.buildPlans[planId]={subjectId:principal.subjectId,baseRevision,ops,ids,expiresAt};return {status:'previewed',planId,expiresAt,diff:{ops:ops.map(op=>{if(!['entity.add','entity.transform'].includes(op.kind))return op;const e=next.entities.find(e=>e.entityId===(ids[op.ref]||op.entityId));return e?{...op,position:e.position}:op;}),createdIds:ids},validation:{ok:true},blueprint:next.scenes.map(s=>({sceneId:s.sceneId,entities:next.entities.filter(e=>e.sceneId===s.sceneId).map(e=>({entityId:e.entityId,type:e.type,position:e.position,rotation:e.rotation,scale:e.scale}))}))};},
 'build.apply':({snapshot,command,principal,now,changeId,emit,db})=>{if(snapshot.paused)throw Error('WORLD_PAUSED');const plan=snapshot.buildPlans?.[command.payload.planId];if(!plan||plan.subjectId!==principal.subjectId)throw Error('PLAN_NOT_FOUND');if(plan.expiresAt<=now)throw Error('PLAN_EXPIRED');if(plan.baseRevision!==snapshot.layoutRevision)throw Error('REVISION_CONFLICT');checkLocks(snapshot,plan.ops,principal.subjectId,now);const before=Object.fromEntries(['scenes','entities','portals'].map(k=>[k,structuredClone(snapshot[k])]));const next=simulate(snapshot,plan.ops,plan.ids);for(const key of ['scenes','entities','portals'])snapshot[key]=next[key];snapshot.layoutRevision++;if(!same(before.portals,next.portals))snapshot.topologyRevision++;const record={subjectId:principal.subjectId,before,after:Object.fromEntries(['scenes','entities','portals'].map(k=>[k,snapshot[k]])),revision:snapshot.layoutRevision};db.prepare('INSERT INTO build_history VALUES(?,?,?)').run(snapshot.worldId,changeId,JSON.stringify(record));delete snapshot.buildPlans[command.payload.planId];emit('build.applied',{layoutRevision:snapshot.layoutRevision,createdIds:plan.ids});return {status:'applied',layoutRevision:snapshot.layoutRevision,createdIds:plan.ids};},
 'build.undo':({snapshot,command,principal,now,emit,db})=>{const {changeId}=command.payload;const row=db.prepare('SELECT record FROM build_history WHERE world_id=? AND change_id=?').get(snapshot.worldId,changeId);const change=row&&JSON.parse(row.record);if(!change||change.subjectId!==principal.subjectId)throw Error('CHANGE_NOT_FOUND');if(change.undone)throw Error('ALREADY_UNDONE');const affectedScenes=new Set();for(const scene of [...change.before.scenes,...change.after.scenes]){const other=(change.before.scenes.includes(scene)?change.after.scenes:change.before.scenes).find(s=>s.sceneId===scene.sceneId);const clean=s=>s&&Object.fromEntries(Object.entries(s).filter(([key])=>key!=='editLock'));if(!same(clean(scene),clean(other)))affectedScenes.add(scene.sceneId);}for(const entity of [...change.before.entities,...change.after.entities]){if(!same(change.before.entities.find(e=>e.entityId===entity.entityId),change.after.entities.find(e=>e.entityId===entity.entityId)))affectedScenes.add(entity.sceneId);}for(const portal of [...change.before.portals,...change.after.portals])if(!same(change.before.portals.find(p=>(p.id||p.portalId)===(portal.id||portal.portalId)),change.after.portals.find(p=>(p.id||p.portalId)===(portal.id||portal.portalId)))){for(const end of [portal.from,portal.to])if(end)affectedScenes.add(end.sceneId);if(portal.fromSceneId)affectedScenes.add(portal.fromSceneId);if(portal.toSceneId)affectedScenes.add(portal.toSceneId);}checkLocks(snapshot,[...affectedScenes].map(sceneId=>({sceneId})),principal.subjectId,now);const dependencies=[];
  // A forest added by quick travel is independent of earlier construction.
  const forestId=snapshot.features?.quickTravelForestId;
  const addedForest=snapshot.scenes.find(scene=>scene.sceneId===forestId&&!change.after.scenes.some(prior=>prior.sceneId===forestId));
  const comparableScenes=scenes=>scenes.filter(scene=>scene!==addedForest).map(({editLock,...scene})=>scene);
  if(!same(comparableScenes(snapshot.scenes),comparableScenes(change.after.scenes)))dependencies.push('scenes');
  for(const key of ['entities','portals'])if(!same(snapshot[key],change.after[key]))dependencies.push(key);
  const removed=change.after.scenes.filter(s=>!change.before.scenes.some(b=>b.sceneId===s.sceneId)).map(s=>s.sceneId);if(snapshot.actors.some(a=>removed.includes(a.sceneId)))dependencies.push('actors');const edited=change.after.entities.filter(e=>!same(e,change.before.entities.find(x=>x.entityId===e.entityId))).map(e=>e.entityId);const removedPortals=change.after.portals.filter(p=>!change.before.portals.some(old=>(old.id||old.portalId)===(p.id||p.portalId))).map(p=>p.id||p.portalId);if(Object.values(snapshot.actions||{}).some(a=>{if(a.status!=='running')return false;if(edited.includes(a.entityId||a.target?.entityId)||removed.includes(a.target?.sceneId))return true;return (a.legs||[]).slice(a.legIndex||0).some(leg=>removed.includes(leg.sceneId)||removed.includes(leg.portal?.fromSceneId)||removed.includes(leg.portal?.toSceneId)||removedPortals.includes(leg.portal?.portalId||leg.portal?.id));}))dependencies.push('actions');if(dependencies.length)fail('UNDO_DEPENDENCY',{dependencies});const next={...snapshot,...structuredClone(change.before)};if(addedForest)next.scenes.push(addedForest);validateSpatial(snapshot,next);const liveLocks=new Map(snapshot.scenes.map(scene=>[scene.sceneId,scene.editLock]));for(const key of ['scenes','entities','portals'])snapshot[key]=next[key];for(const scene of snapshot.scenes){if(liveLocks.has(scene.sceneId))scene.editLock=liveLocks.get(scene.sceneId);}snapshot.layoutRevision++;snapshot.topologyRevision++;change.undone=true;db.prepare('UPDATE build_history SET record=? WHERE world_id=? AND change_id=?').run(JSON.stringify(change),snapshot.worldId,changeId);emit('build.undone',{originalChangeId:command.payload.changeId,layoutRevision:snapshot.layoutRevision});return {status:'undone',layoutRevision:snapshot.layoutRevision};}
 };}
export function createBuildService(service){return {previewBuild:(p,{worldId,requestId=randomUUID(),...payload})=>service.execute(p,{kind:'build.preview',worldId,requestId,payload}),applyBuild:(p,{worldId,requestId,...payload})=>service.execute(p,{kind:'build.apply',worldId,requestId,payload}),undoBuild:(p,{worldId,requestId,...payload})=>service.execute(p,{kind:'build.undo',worldId,requestId,payload}),listPortalSlots:(p,{worldId,sceneId})=>listPortalSlots(service.getSnapshot(p,worldId),sceneId)};}
