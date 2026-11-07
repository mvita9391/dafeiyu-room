import {walkable,nearestFree} from '../../shared/world/navigation.js';
import {STORE_SCENE_ID} from '../../shared/world/store-scene.js';
export function installStreetHomeEntrance(service,worldId='default'){
 const feature='streetHomeWidenedV1';
 const s=service.readSnapshot(worldId);if(s.features?.[feature]||!s.scenes.some(x=>x.sceneId===STORE_SCENE_ID))return;
 service.transactRuntime(worldId,({snapshot,emit})=>{
  snapshot.features??={};snapshot.features[feature]=1;
  for(const actor of snapshot.actors)if(actor.sceneId===STORE_SCENE_ID&&!walkable(snapshot,actor.sceneId,actor.position)){actor.position=nearestFree(snapshot,actor.sceneId,[-1.9,0,3.4]);actor.pose='idle';actor.form='normal';actor.resting=null;}
  snapshot.topologyRevision++;emit('world.feature_installed',{feature,sceneId:STORE_SCENE_ID});
 });
}
