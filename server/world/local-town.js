import {COASTAL_ENTITIES} from '../../shared/world/coastal.js';
import {overlaps} from './spatial.js';
export function installLocalTown(service,manifest,worldId='default'){
 const available=new Set(manifest.assets.map(a=>a.type));if(!manifest.sample?.entities?.length)return {installed:false};
 const old=service.readSnapshot(worldId);if(old.features?.localTownV1||!old.scenes.some(s=>s.sceneId==='seaside-town'))return {installed:false};
 const decorations=manifest.sample.entities;
 return service.transactRuntime(worldId,({snapshot:s,emit})=>{
  // Only replace a known untouched default. Custom transforms or IDs are never reset.
  const same=(e,d)=>e.type===d.type&&JSON.stringify(e.position)===JSON.stringify(d.position)&&e.rotation===d.rotation&&JSON.stringify(e.scale)===JSON.stringify(d.scale);
  const untouched=new Set(s.entities.filter(e=>e.sceneId==='seaside-town'&&COASTAL_ENTITIES.some((d,i)=>e.entityId===`seaside-town-${i+1}`&&same(e,d))).map(e=>e.entityId));
  for(const replacement of manifest.sample.replacements||[]){const original=s.entities.find(e=>e.entityId===replacement.entityId&&e.sceneId==='seaside-town');if(original&&available.has(replacement.entity.type)&&same(original,COASTAL_ENTITIES[replacement.defaultIndex]))Object.assign(original,structuredClone(replacement.entity));}
  const occupied=s.entities.filter(e=>e.sceneId==='seaside-town');
  let installed=0;
  for(const [i,d]of decorations.entries()){
   const id=`local-town-v1-${i+1}`;if(!available.has(d.type)||s.entities.some(e=>e.entityId===id))continue;
   // Preserve customized furniture and its immediate space. Default sample decor can overlap flower patches.
   if(occupied.some(e=>!untouched.has(e.entityId)&&overlaps(e,d)))continue;
   s.entities.push({...d,sceneId:'seaside-town',entityId:id});installed++;
  }
  s.features??={};s.features.localTownV1=1;s.layoutRevision++;s.topologyRevision++;emit('world.feature_installed',{feature:'localTownV1',localOnly:true});return {installed:true,count:installed};
 });
}
