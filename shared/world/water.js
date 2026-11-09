import {getTemplate} from './templates.js';
import {surfaceAt} from './coastal.js';
import {coastalSurface} from './coastal.js';
import {POOL_WIDTH,POOL_DEPTH} from './slide-path.js';

// Match the actual basin (4.8 × 3.4), not the larger furniture footprint
// which includes the ladder. X/Z are transformed into pool-local space.
export function poolAt(snapshot,sceneId,position){
 return snapshot.entities.find(e=>{if(e.sceneId!==sceneId||e.type!=='yardPool'||Math.abs(position[1]-e.position[1])>.65)return false;const dx=position[0]-e.position[0],dz=position[2]-e.position[2],c=Math.cos(e.rotation),s=Math.sin(e.rotation);return Math.abs((dx*c-dz*s)/e.scale[0])<POOL_WIDTH/2-.1&&Math.abs((dx*s+dz*c)/e.scale[2])<POOL_DEPTH/2-.1;});
}
export function waterAt(snapshot,actor){
 const {sceneId,position:[x,,z]}=actor;
 const template=getTemplate(snapshot.scenes.find(s=>s.sceneId===sceneId).templateId);
 const coastal=template.templateId==='coastal_town_v1';
 const shoreline=coastal&&actor.form==='swim'&&z>7.85&&z<8&&x>=-2&&x<=1;
 return (template.authorSceneId&&surfaceAt(template,x,z)?.kind==='water')||shoreline||
  Boolean(poolAt(snapshot,sceneId,actor.position))||(coastal&&coastalSurface(x,z)?.kind==='water');
}
export function waterPose(snapshot,actor){
 if(actor.grounded===false&&(actor.airHeight||0)>.02)return {form:'normal',pose:'jumping',diving:false};
 const pool=waterAt(snapshot,actor);
 return {form:pool?'swim':'normal',pose:pool?'swimming':actor.moving?'walking':'idle',diving:Boolean(pool)&&actor.diving===true};
}
