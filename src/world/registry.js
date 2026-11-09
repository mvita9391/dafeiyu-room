import {buildAuthorScene} from './author-scene.js';
import {releaseLocalAssets} from './local-assets.js';
import {ResourcePool} from '../core/resource-pool.js';
import {buildCoastalTown} from './coastal.js';
import {buildStoreStreet,buildStreetExitRoad} from './convenience-store.js';
import {animateOutdoorFurniture} from './outdoor-furniture.js';
import {fitYardPool} from './yard-pool.js';
import * as THREE from 'three';
import {getTemplate,YARD_FOREST_SLOT,FOREST_RETURN_SLOT} from '../../shared/world/templates.js';
import {buildForest,buildForestGate} from './forest.js';
import {portalEnds,anchor} from '../../shared/world/navigation.js';

const box=(w,h,d,color)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.85}));
function shell(template,openSlots){
 const root=new THREE.Group(),b=template.bounds;root.userData.openSlots=[...openSlots];
 const floor=box(b.x1-b.x0,.16,b.z1-b.z0,template.kind==='indoor'?0xd6b799:0x9caf7b);floor.position.set((b.x0+b.x1)/2,-.09,(b.z0+b.z1)/2);floor.receiveShadow=true;root.add(floor);
 for(const slot of template.portalSlots){const alongX=slot.side==='north'||slot.side==='south',start=alongX?b.x0:b.z0,end=alongX?b.x1:b.z1;const height=template.kind==='indoor'?2.7:.48;const opening=openSlots.includes(slot.slotId),width=slot.width,center=slot.position[alongX?0:2];
  const add=(span,center,h=height,y=height/2)=>{const wall=box(alongX?span:.16,h,alongX?.16:span,template.kind==='indoor'?0xe8d8c4:0xd6c7ab);wall.position.fromArray(slot.position);wall.position[alongX?'x':'z']=center;wall.position.y=y;wall.castShadow=true;root.add(wall);};
  // Front walls remain low so the fixed isometric camera can see the room.
  const visibleHeight=template.kind==='indoor'&&['south','east'].includes(slot.side)?.24:height;
  if(opening){const left=center-width/2,right=center+width/2;add(left-start,(start+left)/2,visibleHeight,visibleHeight/2);add(end-right,(right+end)/2,visibleHeight,visibleHeight/2);if(visibleHeight>2.1)add(width,center,height-2.1,height-(height-2.1)/2);}else add(end-start,(start+end)/2,visibleHeight,visibleHeight/2);
 }
 return root;
}
export class SceneRegistry {
 constructor({scene,createFurniture,legacy={},lazy=false}){Object.assign(this,{scene,createFurniture,legacy,lazy});this.pool=new ResourcePool();this.scenes=new Map();this.entities=new Map();this.contexts={};}
 applySnapshot(snapshot){
  // Runtime state polls share the same layout arrays: don't recompute furniture
  // bounds and garden transforms on the rendering thread for every movement ack.
  const draft=[...this.scenes.values()].some(cfg=>cfg.draft);
  if(!draft&&!this.hadDraft&&this.snapshot&&snapshot.actors?.[0]?.sceneId===this.snapshot.actors?.[0]?.sceneId&&snapshot.scenes===this.snapshot.scenes&&snapshot.entities===this.snapshot.entities&&snapshot.portals===this.snapshot.portals){this.snapshot=snapshot;return this;}
  this.hadDraft=draft;this.snapshot=snapshot;for(const [id,cfg]of this.scenes){const active=!this.lazy||snapshot.actors?.some(a=>a.sceneId===id);if(active&&!cfg.loaded&&typeof this.legacy[id]==='function'){this.scene.remove(cfg.root);this.scenes.delete(id);delete this.contexts[id];}else if(this.lazy&&!active&&!cfg.draft&&(cfg.loaded||cfg.shell)){this.unload(id);}}const present=new Set(snapshot.scenes.map(s=>s.sceneId));for(const [id,cfg] of this.scenes)if(!present.has(id)){cfg.draft=false;this.unload(id);}
  for(const data of snapshot.scenes){let cfg=this.scenes.get(data.sceneId);const template=getTemplate(data.templateId);if(!cfg){const live=!this.lazy||snapshot.actors?.some(a=>a.sceneId===data.sceneId);const old=live&&typeof this.legacy[data.sceneId]==='function'?this.legacy[data.sceneId]():typeof this.legacy[data.sceneId]==='object'?this.legacy[data.sceneId]:null;const root=old?.root||new THREE.Group(),furniture=old?.furniture||new THREE.Group(),portals=new THREE.Group();if(!old)root.add(furniture);root.add(portals);this.scene.add(root);root.visible=false;cfg={...old,loaded:!!old,root,furniture,portals,bounds:template.bounds,view:old?.view||{target:new THREE.Vector3(0,1,0),zoom:template.templateId==='street_corner_v1'?.58:template.kind==='outdoor'?.7:1},spawn:new THREE.Vector3(...template.spawn)};this.scenes.set(data.sceneId,cfg);
   // Keep scenery and animation objects, adopt furniture roots by occurrence below.
   cfg.unclaimed=furniture.children.filter(o=>o.userData.furnitureType);this.contexts[data.sceneId]={group:furniture,sceneId:data.sceneId,label:({'town-demo':'小镇','beach-demo':'海岛'}[data.sceneId]||data.name),bounds:template.buildBounds,templateId:data.templateId};
  }Object.assign(cfg,{data,template,label:({'town-demo':'小镇','beach-demo':'海岛'}[data.sceneId]||data.name)});const ends=[];for(const portal of snapshot.portals){for(const end of (()=>{const base=portalEnds(snapshot,portal);return [{...base,portalId:portal.portalId||portal.id},...(portal.bidirectional?[{fromSceneId:base.toSceneId,toSceneId:base.fromSceneId,departure:base.landing,landing:base.departure,portalId:portal.portalId||portal.id}]:[])];})())if(end.fromSceneId===data.sceneId)ends.push(end);}
  const linkedSlots=snapshot.portals.flatMap(p=>[p.from,p.to]).filter(e=>e?.sceneId===data.sceneId).map(e=>e.slotId);
  const signature=JSON.stringify(ends);
  const needsShell=!this.legacy[data.sceneId]&&(!this.lazy||snapshot.actors?.some(a=>a.sceneId===data.sceneId));
  if(cfg.portalSignature!==signature||(!cfg.shell&&needsShell)){
   cfg.portalSignature=signature;
   releaseLocalAssets(cfg.portals);
   const previousDoors=this.pool.retain(cfg.portals);
   cfg.portals.clear();
   this.pool.release(previousDoors);
   for(const end of ends){
    const portal=snapshot.portals.find(p=>(p.id||p.portalId)===end.portalId);
    const endpoint=[portal?.from,portal?.to].find(e=>e?.sceneId===data.sceneId);
    const slot=template.portalSlots.find(s=>s.slotId===endpoint?.slotId);
    const door=new THREE.Group();
    door.position.fromArray(slot?.position||end.departure);
    door.userData={portalId:end.portalId,walkPortal:end.toSceneId,landing:slot?.landing||end.landing,departure:end.departure};
    if(slot?.slotId===YARD_FOREST_SLOT||slot?.slotId===FOREST_RETURN_SLOT){
     door.add(buildForestGate(slot,slot.slotId===FOREST_RETURN_SLOT));
    }else if(template.templateId==='street_corner_v1'&&slot){
     door.add(buildStreetExitRoad(slot.side));
    }else if(template.templateId!=='coastal_town_v1'){
     const mat=box(slot?.width||1.2,.025,.8,0xa5b6c1);
     mat.position.y=template.authorSceneId?.02:.015;
     door.add(mat);
    }
    cfg.portals.add(door);
   }
   if(needsShell){
    if(template.templateId==='forest_v1'){
     if(!cfg.shell){cfg.shell=buildForest();cfg.root.add(cfg.shell);}
    }else{
     if(cfg.shell)cfg.root.remove(cfg.shell);
     cfg.shell=template.authorSceneId?buildAuthorScene(template.authorSceneId):template.templateId==='coastal_town_v1'?buildCoastalTown():template.templateId==='street_corner_v1'?buildStoreStreet():shell(template,linkedSlots);
     cfg.root.add(cfg.shell);
    }
   }else if(this.legacy[data.sceneId])this.cutLegacyOpenings(cfg,linkedSlots);
  }
 }
 const ids=new Set(snapshot.entities.map(e=>e.entityId));for(const [id,o]of this.entities)if(!ids.has(id)&&!this.scenes.get(o.userData.worldEntity?.sceneId)?.draft){releaseLocalAssets(o);o.removeFromParent();this.entities.delete(id);}
 for(const entity of snapshot.entities){let object=this.entities.get(entity.entityId);const cfg=this.scenes.get(entity.sceneId);if(!cfg||cfg.draft||(this.lazy&&!snapshot.actors?.some(a=>a.sceneId===entity.sceneId)))continue;const adopted=cfg.furniture.children.find(o=>o.userData.entityId===entity.entityId);if(adopted){object=adopted;this.entities.set(entity.entityId,object);}if(cfg.template.progressiveEntities&&!object)continue;if(!object){const index=cfg.unclaimed.findIndex(o=>o.userData.furnitureType===entity.type);object=index>=0?cfg.unclaimed.splice(index,1)[0]:this.createFurniture(entity.type);cfg.furniture.add(object);this.entities.set(entity.entityId,object);}if(object.parent!==cfg.furniture)cfg.furniture.add(object);object.userData.entityId=entity.entityId;object.userData.protected=!!entity.protected;object.userData.worldEntity=entity;if(!object.userData.editPreview){object.position.fromArray(entity.position);object.rotation.y=entity.rotation;object.scale.fromArray(entity.scale);fitYardPool(object);}}
 for(const cfg of this.scenes.values()){if(!cfg.draft)for(const object of cfg.furniture.children.filter(o=>o.userData.furnitureType&&!snapshot.entities.some(e=>e.entityId===o.userData.entityId))){releaseLocalAssets(object);object.removeFromParent();}for(const object of cfg.unclaimed.splice(0)){releaseLocalAssets(object);object.removeFromParent();}cfg.refreshLandscape?.();}return this;
 }
 cutLegacyOpenings(cfg,slots){
  for(const object of cfg.cutOriginals||[])object.visible=true;
  for(const object of cfg.cutReplacements||[]){releaseLocalAssets(object);object.removeFromParent();}
  cfg.cutOriginals=[];cfg.cutReplacements=[];
  cfg.root.updateMatrixWorld(true);
  for(const slotId of slots){
   const slot=cfg.template.portalSlots.find(s=>s.slotId===slotId),alongX=['north','south'].includes(slot.side);
   const along=alongX?'x':'z',across=alongX?'z':'x',boundary=slot.position[alongX?2:0],center=slot.position[alongX?0:2],lo=center-slot.width/2,hi=center+slot.width/2;
   const candidates=[];
   cfg.root.traverse(object=>{
    if(!object.isMesh||!object.visible)return;
    let ancestor=object;while(ancestor&&ancestor!==cfg.root){if(ancestor.userData.furnitureType||ancestor===cfg.portals)return;ancestor=ancestor.parent;}
    const b=new THREE.Box3().setFromObject(object);
    if(b.max.y>.03&&b.min.y<2.1&&b.max.y-b.min.y>.015&&b.min[across]<boundary+.6&&b.max[across]>boundary-.6&&b.min[along]<hi&&b.max[along]>lo)candidates.push({object,b});
   });
   for(const {object,b} of candidates){
    object.visible=false;cfg.cutOriginals.push(object);
    const add=(lo,hi,y0,y1)=>{if(hi-lo<.001||y1-y0<.001)return;const size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());size[along]=hi-lo;size.y=y1-y0;center[along]=(lo+hi)/2;center.y=(y0+y1)/2;const replacement=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z),object.material);replacement.position.copy(center);replacement.castShadow=object.castShadow;replacement.receiveShadow=object.receiveShadow;replacement.userData.portalReplacement=true;cfg.root.add(replacement);cfg.cutReplacements.push(replacement);};
    add(b.min[along],Math.min(lo,b.max[along]),b.min.y,b.max.y);
    add(Math.max(hi,b.min[along]),b.max[along],b.min.y,b.max.y);
    if(b.max.y>2.1)add(Math.max(lo,b.min[along]),Math.min(hi,b.max[along]),2.1,b.max.y);
   }
  }
 }
 applyChanges(events){for(const event of events)if(event.snapshot)this.applySnapshot(event.snapshot);}
 unload(id){const cfg=this.scenes.get(id);if(!cfg||cfg.draft)return;cfg.shell?.userData.streaming?.dispose();releaseLocalAssets(cfg.root);const resources=this.pool.retain(cfg.root);cfg.root.removeFromParent();this.pool.release(resources);for(const [key,obj]of this.entities)if(obj.userData.worldEntity?.sceneId===id)this.entities.delete(key);this.scenes.delete(id);delete this.contexts[id];}
 show(sceneId){for(const[id,cfg]of this.scenes)cfg.root.visible=id===sceneId;}
 bedSleepPosition(actor){
  const entityId=this.snapshot?.actions?.[actor.actionId]?.entityId;
  const contact=this.entities.get(entityId)?.getObjectByName('bed-sleep-contact');
  return contact?.getWorldPosition(new THREE.Vector3());
 }
 seatOffset(actor){
  const entityId=actor.resting?.entityId||this.snapshot?.actions?.[actor.actionId]?.entityId;
  const object=this.entities.get(entityId),marker=object?.getObjectByName('swing-seat-contact');
  if(actor.pose!=='seated'||!marker)return null;
  object.updateWorldMatrix(true,true);
  return marker.getWorldPosition(new THREE.Vector3()).sub(new THREE.Vector3(...anchor(object.userData.worldEntity,'interaction')));
 }
 populateProgressive(cfg){
  if(cfg.draft)return;const all=this.snapshot.entities.filter(e=>e.sceneId===cfg.data.sceneId),actor=this.snapshot.actors?.find(a=>a.sceneId===cfg.data.sceneId),position=actor?.position||cfg.template.spawn;
  const pending=all.filter(e=>!this.entities.has(e.entityId)).sort((a,b)=>Math.hypot(a.position[0]-position[0],a.position[2]-position[2])-Math.hypot(b.position[0]-position[0],b.position[2]-position[2]));
  for(const entity of pending.slice(0,4)){const object=this.createFurniture(entity.type);object.position.fromArray(entity.position);object.rotation.y=entity.rotation;object.scale.fromArray(entity.scale);object.userData.entityId=entity.entityId;object.userData.worldEntity=entity;object.userData.protected=!!entity.protected;cfg.furniture.add(object);this.entities.set(entity.entityId,object);}cfg.progress={total:all.length,resident:all.length-Math.max(0,pending.length-4),pending:Math.max(0,pending.length-4)};
 }
 update(dt,t){for(const cfg of this.scenes.values())if(cfg.root.visible){if(cfg.template.progressiveEntities)this.populateProgressive(cfg);if(cfg.shell?.userData.streaming){const actor=this.snapshot?.actors?.find(a=>a.sceneId===cfg.data.sceneId);if(actor)cfg.shell.userData.streaming.update(actor.position);cfg.shell.userData.streaming.tick();}cfg.shell?.userData.updateForest?.(t,this.snapshot?.actors?.find(a=>a.sceneId===cfg.data.sceneId)?.position);cfg.update?.(dt,t);for(const object of cfg.furniture.children){if(object.userData.furnitureType!=='yardSwing')continue;const id=object.userData.entityId;const occupied=this.snapshot?.actors.some(a=>a.pose==='seated'&&(a.resting?.entityId===id||this.snapshot.actions?.[a.actionId]?.entityId===id));animateOutdoorFurniture(object,t,occupied);}}}

}
