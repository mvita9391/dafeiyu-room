import{listPortalSlots}from'./build.js';
// Append-only import activation. Existing or deliberately removed authored scenes
// are never re-seeded; edited/missing props inside an existing scene stay untouched.
export function appendAuthorScenes(snapshot,manifest){
 const results=[];for(const[id,sceneId,name,entry,feature,preferred]of[['Demo_Town','town-demo','小镇','entry','authorTownImportV1','north'],['Demo_Beach','beach-demo','海岛','west','authorBeachV1','east']]){
  if(snapshot.scenes.some(s=>s.sceneId===sceneId)||snapshot.features?.[feature]||(id==='Demo_Town'&&snapshot.features?.authorTownReplacementV1)){results.push({sceneId,status:'preserved'});continue;}
  const data=manifest.authorScenes?.find(s=>s.id===id);if(!data?.template||!data.authorEntities?.length){results.push({sceneId,status:'unavailable'});continue;}
  let reason;if(!snapshot.scenes.some(s=>s.sceneId==='convenience-store'))reason='STREET_MISSING';else if(snapshot.scenes.length>=8)reason='SCENE_QUOTA';
  const candidates=reason?[]:listPortalSlots(snapshot,'convenience-store').filter(s=>!s.occupied&&!s.blocked&&s.reachable),slot=candidates.find(s=>s.slotId===preferred)||candidates[0];if(reason||!slot){results.push({sceneId,status:'catalog-only',reason:reason||'NO_STREET_SLOT'});continue;}
  if(data.authorEntities.some(e=>snapshot.entities.some(old=>old.entityId===e.entityId))||snapshot.portals.some(p=>p.id===`author-${id==='Demo_Town'?'town':'beach'}-street-entrance`)){results.push({sceneId,status:'catalog-only',reason:'ID_CONFLICT'});continue;}
  snapshot.scenes.push({sceneId,name,templateId:data.template.templateId,status:'active'});snapshot.entities.push(...structuredClone(data.authorEntities));snapshot.portals.push({id:`author-${id==='Demo_Town'?'town':'beach'}-street-entrance`,from:{sceneId:'convenience-store',slotId:slot.slotId},to:{sceneId,slotId:entry},bidirectional:true});snapshot.features??={};snapshot.features[feature]=1;snapshot.layoutRevision++;snapshot.topologyRevision++;results.push({sceneId,status:'added',slot:slot.slotId});
 }return results;
}

export function relocateStreetExits(service,worldId='default'){
 const snapshot=service.readSnapshot(worldId);
 const beach=snapshot.portals.find(p=>p.id==='author-beach-street-entrance'&&p.from?.sceneId==='convenience-store'&&p.from.slotId==='west');
 if(!beach||snapshot.portals.some(p=>[p.from,p.to].some(e=>e?.sceneId==='convenience-store'&&e.slotId==='east')))return;
 service.transactRuntime(worldId,({snapshot:s,emit})=>{s.portals.find(p=>p.id===beach.id).from.slotId='east';s.topologyRevision++;emit('world.street_exits_updated',{portalId:beach.id,slotId:'east'});});
}
