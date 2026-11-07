import {STORE_SCENE,STORE_SCENE_ID,STORE_PORTALS} from '../../shared/world/store-scene.js';
// One-time feature installation. Never reapply defaults over later player/agent edits.
export function installStoreScene(service,worldId='default'){
 const initial=service.readSnapshot(worldId);
 if(initial.features?.convenienceStoreV1)return {installed:false};
 if(!initial.scenes.some(s=>s.sceneId==='living'))return {installed:false};
 const alreadyExists=initial.scenes.some(s=>s.sceneId===STORE_SCENE_ID);
 const oldDoor=initial.portals.some(p=>p.kind==='legacy'&&p.fromSceneId==='living'&&p.toSceneId==='yard');
 if(!alreadyExists&&(!oldDoor||initial.scenes.length>=8))return {installed:false};
 return service.transactRuntime(worldId,({snapshot,emit})=>{
  snapshot.features??={};snapshot.features.convenienceStoreV1=1;
  if(alreadyExists)return {installed:false};
  const {entities,...scene}=structuredClone(STORE_SCENE);snapshot.scenes.push({...scene,status:'active'});
  snapshot.entities.push(...entities.map((e,i)=>({...e,entityId:`${STORE_SCENE_ID}-${i+1}`,sceneId:STORE_SCENE_ID})));
  snapshot.portals=snapshot.portals.filter(p=>!(p.kind==='legacy'&&p.fromSceneId==='living'&&p.toSceneId==='yard'));snapshot.portals.push(...structuredClone(STORE_PORTALS));
  snapshot.layoutRevision++;snapshot.topologyRevision++;emit('world.feature_installed',{feature:'convenienceStoreV1',sceneId:STORE_SCENE_ID});return {installed:true};
 });
}
