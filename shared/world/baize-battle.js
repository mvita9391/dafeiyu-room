import {PET_SKILLS,PET_SPECIES,speciesSkills} from './pet-skills.js';

export const BAIZE_ASSET_URL='/api/companion/baize.glb';
export const ROUND_MS=30_000;
export const BATTLE_INTRO_MS=2400;
export const BATTLE_RUN_DELAY_MS=500;
export const FLEE_TURN_SECONDS=.24;
export const FORMATION=['ally','enemy'].flatMap(team=>['front','back'].flatMap(row=>
 Array.from({length:5},(_,column)=>({id:`${team}-${row}-${column}`,team,row,column}))
));
const slots=Object.fromEntries(FORMATION.map(slot=>[slot.id,slot]));
export const skillTargetMode=move=>move?.targetMode??(move?.effect?.kind==='zone'?'t':'single');

export function targetCells(slotId,move){
 const center=slots[slotId];
 if(!center)return [];
 const mode=skillTargetMode(move);
 if(mode==='single')return [slotId];
 return FORMATION.filter(slot=>slot.team===center.team&&(mode==='all'||
  (slot.row===center.row?Math.abs(slot.column-center.column)<=1:slot.column===center.column))).map(slot=>slot.id);
}

export function unitSkills(unit){
 return unit.skills?.length?unit.skills:(unit.speciesId?speciesSkills(unit.speciesId):Object.values(PET_SKILLS).filter(move=>move.effect));
}

function unit(id,name,slot,hp,speciesId,extra={}){
 const fighter={id,name,slot,hp,maxHp:hp,speciesId,attack:extra.attack??20,defense:extra.defense??0,...extra};
 fighter.uses=Object.fromEntries(unitSkills(fighter).filter(move=>move.uses!==null).map(move=>[move.id,move.uses]));
 return fighter;
}

const FALLBACK_PET={name:'伙伴白泽',speciesId:'baize',modelId:'baize',level:1,maxHp:54,attack:20,defense:12,skills:speciesSkills('baize')};

export function createBaizeBattle(battleId,now=Date.now(),{pet=null}={}){
 const partner=pet??FALLBACK_PET;
 return {battleId,turn:1,readyAt:now,deadline:now+ROUND_MS,orders:{},outcome:null,lastTurn:null,units:{
  hero:unit('hero','大肥鱼','ally-back-2',72,null,{skills:null}),
  pet:unit('pet',partner.name,'ally-front-2',partner.maxHp,partner.speciesId,{attack:partner.attack,defense:partner.defense,skills:partner.skills,modelId:partner.modelId,level:partner.level}),
  wild:{...unit('wild','野生白泽','enemy-front-2',64,'baize-wild'),uses:{},powerScale:.75},
  'wild-west':{...unit('wild-west','林间白泽','enemy-front-1',28,'baize-wild'),uses:{},powerScale:.45},
  'wild-rear':{...unit('wild-rear','巡游白泽','enemy-back-2',30,'baize-wild'),uses:{},powerScale:.45},
  'wild-flank':{...unit('wild-flank','守林白泽','enemy-back-3',28,'baize-wild'),uses:{},powerScale:.45},
 }};
}

const teamOf=unit=>slots[unit.slot].team;
export const controlledUnits=battle=>Object.values(battle.units).filter(unit=>teamOf(unit)==='ally'&&unit.hp>0);
export const validTargets=(battle,unit)=>Object.values(battle.units).filter(target=>target.hp>0&&teamOf(target)!==teamOf(unit));
export function attackTiming(event){
 const effect=PET_SKILLS[event.skillId]?.effect;
 const approach=.72;
 const cast=effect?Math.max(.9,effect.impact+.62):.65;
 const retreat=approach+cast;
 return {approach,impact:approach+(effect?.impact??cast*.42),retreat,end:retreat+.68};
}

export const eventDuration=event=>{
 if(event.kind==='faint')return .75;
 if(event.kind==='flee')return FLEE_TURN_SECONDS+1.22;
 return attackTiming(event).end;
};

export function resolveBaizeTurn(battle,now){
 const next=structuredClone(battle),events=[];
 for(const unit of Object.values(next.units)){
  if(!unit.hp)continue;
  const targets=validTargets(next,unit);
  if(!targets.length)break;
  let order=battle.orders[unit.id];
  if(teamOf(unit)==='enemy'){
   const rotation=PET_SPECIES[unit.speciesId]?.wildRotation??unitSkills(unit).map(move=>move.id);
   const skills=rotation.filter(id=>unit.uses[id]!==0);
   const slot=slots[unit.slot];
   const offset=battle.turn-1+slot.column+Number(slot.row==='back');
   order={choice:skills[(battle.turn-1)%skills.length],target:targets[offset%targets.length].id};
  }
  const move=PET_SKILLS[order?.choice];
  const target=next.units[order?.target];
  if(!move||unit.uses[move.id]===0||!target||!target.hp)continue;
  if(unit.uses[move.id]!==undefined)unit.uses[move.id]--;
  const affected=new Set(targetCells(target.slot,move));
  const hits=[];
  for(const defender of targets.filter(candidate=>affected.has(candidate.slot))){
   const attackScale=(unit.attack??20)/20;
   const amount=Math.min(defender.hp,Math.round(move.power*attackScale*(unit.powerScale??1)));
   defender.hp-=amount;
   hits.push({target:defender.id,amount,hp:defender.hp});
  }
  events.push({kind:'attack',side:unit.id,target:target.id,skillId:move.id,hits});
  for(const hit of hits)if(!hit.hp)events.push({kind:'faint',side:hit.target});
 }
 next.outcome=!Object.values(next.units).some(unit=>teamOf(unit)==='enemy'&&unit.hp>0)?'won':!controlledUnits(next).length?'lost':null;
 next.lastTurn={turn:battle.turn,events};
 if(!next.outcome){
  next.turn++;
  next.orders={};
  next.readyAt=now+Math.ceil(events.reduce((sum,event)=>sum+eventDuration(event),0)*1000)+200;
  next.deadline=next.readyAt+ROUND_MS;
 }
 return next;
}

export function chooseBaizeOrder(battle,{choice,unitId,target},now){
 if(battle.outcome)throw Error('BATTLE_ENDED');
 if(battle.turn===1&&battle.introStartedAt!=null&&now<battle.readyAt)throw Error('BATTLE_ROUND_CLOSED');
 if(choice==='flee')return {...battle,outcome:'fled',lastTurn:{turn:battle.turn,events:[{kind:'flee'}]}};
 if(now<battle.readyAt||now>=battle.deadline)throw Error('BATTLE_ROUND_CLOSED');
 const unit=controlledUnits(battle).find(unit=>unit.id===unitId);
 if(!unit)throw Error('BATTLE_UNIT_INVALID');
 if(choice!=='wait'){
  if(!unitSkills(unit).some(move=>move.id===choice))throw Error('BATTLE_MOVE_INVALID');
  if(unit.uses[choice]===0)throw Error('BATTLE_NO_USES');
  if(!validTargets(battle,unit).some(unit=>unit.id===target))throw Error('BATTLE_TARGET_INVALID');
 }
 const next={...battle,orders:{...battle.orders,[unitId]:{choice,target}}};
 return controlledUnits(next).every(unit=>next.orders[unit.id])?resolveBaizeTurn(next,now):next;
}
