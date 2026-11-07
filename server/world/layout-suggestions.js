import {surfaceAt} from '../../shared/world/coastal.js';
import {getTemplate} from '../../shared/world/templates.js';
import {getCatalogEntry} from '../../shared/world/catalog.js';
import {validateSpatial,corners} from './spatial.js';
// Bounded deterministic search: suggestions never change state or bypass preview.
export function suggestLayout(snapshot,{sceneId,purpose='reading',zoneId,preferences=[]}){
 const scene=snapshot.scenes.find(s=>s.sceneId===sceneId);if(!scene)throw Error('SCENE_NOT_FOUND');const t=getTemplate(scene.templateId),zone=zoneId?t.regions.find(z=>z.zoneId===zoneId):t.regions.find(z=>z.purpose==='wall');if(!zone)throw Error('ZONE_NOT_FOUND');if(['entry-clearance','passage'].includes(zone.purpose))throw Error('RESERVED_ZONE');
 const preferred=Array.isArray(preferences)?preferences:preferences.types||[];const defaults=purpose==='reading'?['chair','lamp']:purpose==='rest'?['bean','smallPlant']:t.kind==='outdoor'?['yardBench','yardLantern']:['chair','smallPlant'];const types=(preferred.length?preferred:defaults).filter(type=>getCatalogEntry(type).sceneKinds.includes(t.kind)).slice(0,6),candidates=[];
 for(let variant=0;variant<3;variant++){
  const next=structuredClone(snapshot),ops=[];
  for(let index=0;index<types.length;index++){const type=types[index];let found;
   // Search around the semantic region centre, then nearby free positions on a 25 cm grid.
   const cx=(zone.bounds.x0+zone.bounds.x1)/2,cz=(zone.bounds.z0+zone.bounds.z1)/2,points=[];
   for(let x=Math.ceil(t.buildBounds.x0*4)/4;x<=t.buildBounds.x1;x+=.25)for(let z=Math.ceil(t.buildBounds.z0*4)/4;z<=t.buildBounds.z1;z+=.25)points.push([x,surfaceAt(t,x,z)?.height??0,z]);
   points.sort((a,b)=>(Math.hypot(a[0]-cx,a[2]-cz)-Math.hypot(b[0]-cx,b[2]-cz))||a[0]-b[0]||a[2]-b[2]);
   for(const position of points){const op={kind:'entity.add',ref:`suggest-${variant}-${index}`,sceneId,type,position,rotation:variant*Math.PI/12,scale:[1,1,1]},entity={...op,entityId:op.ref};delete entity.kind;delete entity.ref;
    // Explicit zone requests keep the complete asset inside that region. Default wall
    // preferences permit nearby furniture so narrow decorative strips remain useful.
    if(zoneId&&corners(entity).some(([x,z])=>x<zone.bounds.x0||x>zone.bounds.x1||z<zone.bounds.z0||z>zone.bounds.z1))continue;
    try{const candidate={...next,entities:[...next.entities,entity]};validateSpatial(next,candidate);next.entities.push(entity);found=op;break;}catch{}
   }
   if(found)ops.push(found);
  }
  if(ops.length)candidates.push({ops,explanation:`${purpose}：优先${zone.zoneId}区域，保留出生点、门口与通路；25 厘米网格、15°角度。`,blueprint:{sceneId,bounds:t.bounds,zones:t.regions,entities:ops.map(o=>({type:o.type,position:o.position,rotation:o.rotation,scale:o.scale}))}});
 }
 return {candidates};
}
export function createLayoutSuggester(service){return (principal,{worldId,...options})=>suggestLayout(service.getSnapshot(principal,worldId),options);}
