import {getTemplate} from '../../shared/world/templates.js';

// Use the local endpoint's normal; camera rotation is already applied to input.
export function portalInwardNormal(snapshot,portal,reverse=false){
 const endpoint=reverse?(portal.to||{sceneId:portal.toSceneId,slotId:portal.toSlotId}):(portal.from||{sceneId:portal.fromSceneId,slotId:portal.fromSlotId});
 const template=getTemplate(snapshot.scenes.find(scene=>scene.sceneId===endpoint.sceneId).templateId);
 if(portal.kind!=='legacy')return template.portalSlots.find(slot=>slot.slotId===endpoint.slotId).inwardNormal;
 if(template.legacyDoorNormal)return template.legacyDoorNormal;
 // Legacy openings predate slots. Infer their inward normal from the closest
 // scene boundary rather than from screen coordinates or a destination vector.
 const {x0,x1,z0,z1}=template.bounds;
 const point=reverse?portal.landing:portal.departure;
 return [[Math.abs(point[0]-x0),[1,0,0]],[Math.abs(point[0]-x1),[-1,0,0]],[Math.abs(point[2]-z0),[0,0,1]],[Math.abs(point[2]-z1),[0,0,-1]]].sort((a,b)=>a[0]-b[0])[0][1];
}
