import {getTemplate} from './templates.js';
import {segmentWalkable,walkable} from './navigation.js';
import {surfaceAt} from './coastal.js';

export function spellTarget(snapshot, sceneId, position, spell, direction, heading = 0) {
 const template=getTemplate(snapshot.scenes.find(scene=>scene.sceneId===sceneId).templateId);
 const [x,y,z]=position;
 const start=[x,surfaceAt(template,x,z)?.height??y,z];
 let [dx,dz]=direction;
 let length=Math.hypot(dx,dz);
 const line=spell.kind==='line';
 if(line&&length<.2){dx=Math.sin(heading);dz=Math.cos(heading);length=1;}
 const distance=line?spell.range:Math.min(length,spell.range);
 const ux=length?dx/length:0,uz=length?dz/length:0;
 const {bounds}=template;
 const positionAt=length=>{
  let ex=x+ux*length,ez=z+uz*length;
  if(!line){
   ex=Math.max(bounds.x0+.19,Math.min(bounds.x1-.19,ex));
   ez=Math.max(bounds.z0+.19,Math.min(bounds.z1-.19,ez));
  }
  const ground=surfaceAt(template,ex,ez);
  return !ground||ground.kind==='water'?null:[ex,ground.height,ez];
 };
 let end=positionAt(distance);
 if(!line)return end&&walkable(snapshot,sceneId,end)?{start,end}:null;
 const aimEnd=[x+ux*distance,start[1],z+uz*distance];
 const clear=point=>point&&segmentWalkable(snapshot,sceneId,start,point);
 const obstructed=!clear(end);
 if(obstructed){
  let low=0,high=distance;
  for(let i=0;i<8;i++){
   const mid=(low+high)/2;
   if(clear(positionAt(mid)))low=mid;
   else high=mid;
  }
  end=low>=.3?positionAt(low):null;
 }
 return {start,end,aimEnd,obstructed};
}
