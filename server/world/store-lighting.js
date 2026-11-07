import {STORE_EXTRA_LIGHTS,STORE_SCENE_ID} from '../../shared/world/store-scene.js';
import {validateSpatial} from './spatial.js';
// Add these lights once, respecting subsequent owner/agent edits and occupied spots.
export function installStoreLights(service,worldId='default'){
 const before=service.readSnapshot(worldId);
 if(before.features?.storeLightingV1||!before.scenes.some(s=>s.sceneId===STORE_SCENE_ID))return {added:0};
 return service.transactRuntime(worldId,({snapshot,emit})=>{
  let added=0;
  for(const [index,config]of STORE_EXTRA_LIGHTS.entries()){
   if(snapshot.entities.some(e=>e.sceneId===STORE_SCENE_ID&&e.type==='shopLamp'&&JSON.stringify(e.position)===JSON.stringify(config.position)))continue;
   if(snapshot.entities.filter(e=>e.sceneId===STORE_SCENE_ID).length>=100)break;
   const previous=structuredClone(snapshot),entity={...structuredClone(config),entityId:`store-lighting-${index+1}`,sceneId:STORE_SCENE_ID};
   if(snapshot.entities.some(e=>e.entityId===entity.entityId))continue;
   snapshot.entities.push(entity);try{validateSpatial(previous,snapshot);added++;}catch{snapshot.entities.pop();}
  }
  snapshot.features??={};snapshot.features.storeLightingV1=1;
  if(added){snapshot.layoutRevision++;emit('world.feature_installed',{feature:'storeLightingV1',added});}
  return {added};
 });
}
