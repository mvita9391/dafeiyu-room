import {COASTAL_SCENE,COASTAL_ENTITIES} from '../../shared/world/coastal.js';
import {listPortalSlots} from './build.js';
export function installCoastalScene(service,worldId='default'){
 const old=service.readSnapshot(worldId);if(old.features?.coastalSliceV1||old.features?.oldCoastalRemovedV1)return {installed:false};if(old.scenes.some(x=>x.sceneId===COASTAL_SCENE.sceneId))return {installed:false};
 if(!old.scenes.some(s=>s.sceneId==='convenience-store')||old.scenes.length>=8)return {installed:false};
 const slot=listPortalSlots(old,'convenience-store').find(s=>['north','west'].includes(s.slotId)&&!s.occupied&&!s.blocked&&s.reachable);
 if(!slot)return {installed:false,reason:'COASTAL_ENTRANCE_BLOCKED'};
 return service.transactRuntime(worldId,({snapshot:s,emit})=>{s.features??={};s.features.coastalSliceV1=1;if(s.scenes.some(x=>x.sceneId===COASTAL_SCENE.sceneId))return {installed:false};s.scenes.push(structuredClone(COASTAL_SCENE));s.entities.push(...COASTAL_ENTITIES.map((e,i)=>({...structuredClone(e),sceneId:'seaside-town',entityId:`seaside-town-${i+1}`})));s.portals.push({id:'coastal-street-entrance',from:{sceneId:'convenience-store',slotId:slot.slotId},to:{sceneId:'seaside-town',slotId:'west'},bidirectional:true});s.layoutRevision++;s.topologyRevision++;emit('world.feature_installed',{feature:'coastalSliceV1'});return {installed:true};});
}
