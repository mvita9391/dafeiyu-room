import {listPortalSlots} from './build.js';
export function installAuthorBeach(service,manifest,worldId='default'){
 const beach=manifest.authorScenes?.find(s=>s.id==='Demo_Beach');if(!beach?.template||!manifest.assets.length)return {installed:false};const old=service.readSnapshot(worldId);if(old.features?.authorBeachV1||old.scenes.some(s=>s.sceneId==='beach-demo'))return {installed:false};
 if(old.scenes.length>=8)return {installed:false,reason:'SCENE_QUOTA'};
 const slots=listPortalSlots(old,'convenience-store').filter(s=>!s.occupied&&!s.blocked&&s.reachable),slot=slots.find(s=>s.slotId==='east')||slots[0];if(!slot)return {installed:false,reason:'NO_STREET_SLOT'};
 return service.transactRuntime(worldId,({snapshot:s,emit})=>{s.entities.push(...structuredClone(beach.authorEntities||[]));s.scenes.push({sceneId:'beach-demo',name:'海岛',templateId:beach.template.templateId,status:'active'});s.portals.push({id:'author-beach-street-entrance',from:{sceneId:'convenience-store',slotId:slot.slotId},to:{sceneId:'beach-demo',slotId:'west'},bidirectional:true});s.features??={};s.features.authorBeachV1=1;s.layoutRevision++;s.topologyRevision++;emit('world.feature_installed',{feature:'authorBeachV1',localOnly:true});return {installed:true,slot:slot.slotId};});
}
