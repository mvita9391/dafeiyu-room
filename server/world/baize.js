import {randomUUID} from 'node:crypto';
import {BATTLE_INTRO_MS,createBaizeBattle,chooseBaizeOrder} from '../../shared/world/baize-battle.js';
import {forestGrassAt} from '../../shared/world/forest.js';
import {getTemplate} from '../../shared/world/templates.js';
import {nearestFree} from '../../shared/world/navigation.js';

export function startBaizeEncounter({snapshot,emit,now},actor,enabled){
 const scene=snapshot.scenes.find(scene=>scene.sceneId===actor.sceneId);
 const [x,,z]=actor.position;
 if(!enabled||actor.battle||actor.actionId||actor.grounded===false||actor.form==='swim'||
    scene?.templateId!=='forest_v1'||!forestGrassAt(x,z))throw Error('BATTLE_START_UNAVAILABLE');
 actor.battle={...createBaizeBattle(randomUUID(),now+BATTLE_INTRO_MS),introStartedAt:now};
 actor.controller=null;
 actor.input=null;
 Object.assign(actor,{pose:'idle',moving:false,speed:0,sprint:false});
 emit('battle.started',{actorId:actor.actorId,battleId:actor.battle.battleId});
 return {battleId:actor.battle.battleId};
}

function currentBattle({snapshot,command,principal}){
 if(principal.role!=='owner')throw Error('UNAUTHORIZED');
 const actor=snapshot.actors.find(a=>a.actorId===command.payload.actorId);
 if(!actor?.battle||actor.battle.battleId!==command.payload.battleId)throw Error('BATTLE_NOT_CURRENT');
 return actor;
}

export const baizeHandlers={
 'battle.choose':ctx=>{
  const actor=currentBattle(ctx),{turn}=ctx.command.payload;
  if(actor.battle.turn!==turn)throw Error('BATTLE_TURN_CHANGED');
  actor.battle=chooseBaizeOrder(actor.battle,ctx.command.payload,ctx.now);
  const {battleId,outcome}=actor.battle;
  return {battleId,turn,outcome};
 },
 'battle.leave':ctx=>{
  const actor=currentBattle(ctx),{battleId,outcome}=actor.battle;
  if(!outcome)throw Error('BATTLE_NOT_FINISHED');
  const template=getTemplate(ctx.snapshot.scenes.find(scene=>scene.sceneId===actor.sceneId).templateId);
  actor.position=nearestFree(ctx.snapshot,actor.sceneId,outcome==='lost'?template.spawn:actor.position);
  actor.battle=null;
  return {battleId,outcome};
 },
};
