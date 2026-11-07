import {randomUUID} from 'node:crypto';
import {advancePlayer,PLAYER_SPEED} from '../../shared/world/movement.js';
import {segmentWalkable} from '../../shared/world/navigation.js';
import {SPELLS} from '../../shared/world/spells.js';
import {spellTarget} from '../../shared/world/spell-target.js';
import {DANCE_CLIPS,SPELL_RELEASE_SECONDS,maneuverDuration,maneuverSpec} from '../../shared/world/maneuvers.js';

export function startManeuver(snapshot,actor,payload,principal,now,emit){
 if(actor.grounded===false||actor.form==='swim')throw Error('MANEUVER_UNAVAILABLE');
 const {maneuver,gait}=payload;
 let heading=payload.heading??actor.rotation??0;
 let spell,clip;
 if(maneuver==='dance')clip=DANCE_CLIPS[Math.floor(Math.random()*DANCE_CLIPS.length)].name;
 if(maneuver==='spell'){
  const slot=payload.slot,definition=SPELLS[slot-1];
  if((actor.spellCooldowns?.[slot]??0)>now)throw Error('SPELL_COOLDOWN');
  const direction=payload.groundPosition
   ?[payload.groundPosition[0]-actor.position[0],payload.groundPosition[1]-actor.position[2]]
   :[Math.sin(heading)*definition.range,Math.cos(heading)*definition.range];
  const target=spellTarget(snapshot,actor.sceneId,actor.position,definition,direction,heading);
  if(!target?.end)throw Error('SPELL_TARGET_BLOCKED');
  const {start,end}=target,dx=end[0]-start[0],dz=end[2]-start[2];
  if(Math.hypot(dx,dz)>.001)heading=Math.atan2(dx,dz);
  spell={slot,sceneId:actor.sceneId,start,end};
 }
 const action={
  actionId:randomUUID(),actorId:actor.actorId,subjectId:principal.subjectId,
  kind:'maneuver',maneuver,gait:gait??'walk',heading:Math.atan2(Math.sin(heading),Math.cos(heading)),
  leaseId:payload.leaseId,leaseVersion:payload.leaseVersion,status:'running',phase:'performing',
  elapsed:0,distance:0,blocked:false,...clip?{clip}:{},...spell?{spell}:{},
 };
 snapshot.actions[action.actionId]=action;
 actor.actionId=action.actionId;
 actor.rotation=action.heading;
 actor.moving=false;
 actor.speed=0;
 actor.pose='idle';
 if(maneuver==='doubleJump')actor.jumpHeld=false;
 actor.maneuver={actionId:action.actionId,name:maneuver,gait:action.gait,elapsed:0,...clip?{clip}:{}};
 emit('action.started',{actorId:actor.actorId,actionId:action.actionId,kind:'maneuver',maneuver});
 return {actionId:action.actionId,status:action.status,phase:action.phase};
}

export function advanceManeuver(snapshot,actor,action,now){
 if(action.maneuver==='doubleJump'){
  for(let i=0;i<2;i++){
   const step=Math.round(action.elapsed/.05);
   Object.assign(actor,advancePlayer(snapshot,actor,[0,0],50,step===0||step===6));
   action.elapsed+=.05;
   if(actor.grounded)break;
  }
  actor.maneuver.elapsed=action.elapsed;
  return actor.grounded;
 }
 const spec=maneuverSpec(action.maneuver,action.gait,action.clip);
 const duration=maneuverDuration(spec);
 const dt=Math.min(.1,duration-action.elapsed);
 const direction=[Math.sin(action.heading),Math.cos(action.heading)];
 const speed=PLAYER_SPEED*spec.speedScale;
 actor.moving=false;
 actor.speed=0;
 for(let remaining=dt;remaining>1e-8&&!action.blocked&&action.distance<spec.distance-1e-8;remaining-=.05){
  const limit=Math.min(speed*Math.min(.05,remaining),spec.distance-action.distance);
  const [x,y,z]=actor.position;
  const canMove=distance=>segmentWalkable(snapshot,actor.sceneId,actor.position,
   [x+direction[0]*distance,y,z+direction[1]*distance],(actor.airHeight||0)+(actor.supportHeight||0));
  let distance=limit;
  if(!canMove(limit)){
   let low=0,high=limit;
   for(let i=0;i<8;i++){
    const middle=(low+high)/2;
    if(canMove(middle))low=middle;
    else high=middle;
   }
   distance=low;
   action.blocked=true;
  }
  if(distance<=1e-8)break;
  const next=advancePlayer(snapshot,actor,direction,distance/speed*1000,false,spec.speedScale);
  if(next.form==='swim'){action.blocked=true;break;}
  Object.assign(actor,next);
  action.distance+=distance;
 }
 actor.rotation=action.heading;
 actor.pose=actor.moving?'walking':'idle';
 action.elapsed=Math.min(duration,action.elapsed+dt);
 actor.maneuver.elapsed=action.elapsed;
 if(action.spell&&!action.released&&action.elapsed>=SPELL_RELEASE_SECONDS){
  action.released=true;
  actor.spellCooldowns??={};
  actor.spellCooldowns[action.spell.slot]=now+SPELLS[action.spell.slot-1].cooldown*1000;
  actor.lastSpellCast={...action.spell,actionId:action.actionId,releasedAt:now};
 }
 return action.elapsed>=duration-1e-8;
}
