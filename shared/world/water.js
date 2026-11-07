import {getTemplate} from './templates.js';
import {surfaceAt} from './coastal.js';
import {coastalSurface} from './coastal.js';
// Match the actual basin (4.8 × 3.4), not the larger furniture footprint
// which includes the ladder. X/Z are transformed into pool-local space.
export function poolAt(snapshot,sceneId,position){
 return snapshot.entities.find(e=>{if(e.sceneId!==sceneId||e.type!=='yardPool'||Math.abs(position[1]-e.position[1])>.65)return false;const dx=position[0]-e.position[0],dz=position[2]-e.position[2],c=Math.cos(e.rotation),s=Math.sin(e.rotation);return Math.abs((dx*c-dz*s)/e.scale[0])<2.3&&Math.abs((dx*s+dz*c)/e.scale[2])<1.6;});
}
export function waterPose(snapshot,actor){
 if(actor.grounded===false&&(actor.airHeight||0)>.02)return {form:'normal',pose:'jumping'};
 const coastal=snapshot.scenes.find(s=>s.sceneId===actor.sceneId)?.templateId==='coastal_town_v1';const shoreline=coastal&&actor.form==='swim'&&actor.position[2]>7.85&&actor.position[2]<8&&actor.position[0]>=-2&&actor.position[0]<=1;
 const template=getTemplate(snapshot.scenes.find(s=>s.sceneId===actor.sceneId).templateId);
 const pool=(template.authorSceneId&&surfaceAt(template,actor.position[0],actor.position[2])?.kind==='water')||shoreline||poolAt(snapshot,actor.sceneId,actor.position)|| (snapshot.scenes.find(s=>s.sceneId===actor.sceneId)?.templateId==='coastal_town_v1'&&coastalSurface(actor.position[0],actor.position[2])?.kind==='water');
 return {form:pool?'swim':'normal',pose:pool?'swimming':actor.moving?'walking':'idle'};
}
