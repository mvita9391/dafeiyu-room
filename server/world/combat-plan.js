import {SPELLS} from '../../shared/world/spells.js';
import {poolAt} from '../../shared/world/water.js';
import {spellTarget} from '../../shared/world/spell-target.js';
import {spellImpact} from '../../shared/world/combat-targets.js';
import {distance,findPath,sceneRoute,segmentWalkable,walkable} from './navigation.js';

const SKILLS=SPELLS.map((spell,index)=>({spell,slot:index+1}));

function options(snapshot,position,target,skills){
 const {sceneId,position:end}=target;
 if(poolAt(snapshot,sceneId,position)||!segmentWalkable(snapshot,sceneId,position,end))return [];
 const direction=[end[0]-position[0],end[2]-position[2]];
 return skills.filter(({spell})=>{
  if(Math.hypot(...direction)>spell.range)return false;
  const cast=spellTarget(snapshot,sceneId,position,spell,direction);
  return cast?.end&&spellImpact(spell,cast.start,cast.end,end)!==null;
 });
}

export function planAttack(snapshot,actor,target,now,requestedSpell){
 const lastSlot=actor.lastSpellCast?.slot??0;
 const skills=requestedSpell
  ?SKILLS.filter(({spell})=>spell.id===requestedSpell)
  :[...SKILLS.slice(lastSlot),...SKILLS.slice(0,lastSlot)];
 const {sceneId,position:end}=target;
 if(actor.sceneId===sceneId&&actor.grounded!==false&&actor.form!=='swim'){
  const available=options(snapshot,actor.position,target,skills);
  const ready=available.find(({slot})=>(actor.spellCooldowns?.[slot]??0)<=now);
  if(ready)return {slot:ready.slot};
  if(available.length)return {readyAt:Math.min(...available.map(({slot})=>actor.spellCooldowns[slot]))};
 }
 const origin=sceneRoute(snapshot,actor.sceneId,sceneId).at(-1)?.landing??actor.position;
 const candidates=[];
 for(const radius of [2,4,6]){
  for(let i=0;i<8;i++){
   const angle=i*Math.PI/4;
   const position=[end[0]+Math.cos(angle)*radius,end[1],end[2]+Math.sin(angle)*radius];
   if(walkable(snapshot,sceneId,position)&&options(snapshot,position,target,skills).length)candidates.push(position);
  }
 }
 candidates.sort((a,b)=>distance(origin,a)-distance(origin,b));
 for(const position of candidates){
  try{findPath(snapshot,sceneId,origin,position);return {position};}
  catch(error){if(!['DESTINATION_BLOCKED','PATH_NOT_FOUND','PATH_START_BLOCKED'].includes(error.message))throw error;}
 }
 throw Error('ATTACK_POSITION_UNREACHABLE');
}
