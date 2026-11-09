import {FOREST_RETURN_SLOT,YARD_FOREST_SLOT} from '../../shared/world/templates.js';

export function forestConnectionOps(snapshot){
 const yard={sceneId:'yard',slotId:YARD_FOREST_SLOT};
 const isYardGate=end=>end?.sceneId===yard.sceneId&&end.slotId===yard.slotId;
 const forests=snapshot.scenes.filter(scene=>scene.templateId==='forest_v1');
 const link=snapshot.portals.find(portal=>isYardGate(portal.from)||isYardGate(portal.to));
 if(link){
  const other=isYardGate(link.from)?link.to:link.from;
  if(link.bidirectional&&other?.slotId===FOREST_RETURN_SLOT&&
     forests.some(scene=>scene.sceneId===other.sceneId&&scene.status==='active'))return [];
  throw Error('FOREST_GATE_OCCUPIED');
 }
 const forest=forests.find(scene=>scene.status==='active')??forests[0];
 const ref='forest-exploration';
 const connection={kind:'portal.link',from:yard,to:{sceneId:forest?.sceneId??ref,slotId:FOREST_RETURN_SLOT}};
 if(forest)return [connection];
 return [{kind:'scene.create',ref,templateId:'forest_v1',name:'森林',style:'natural'},connection];
}
