import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildServer} from '../server/app.js';
import {createBaizeEncounter} from '../src/core/baize-encounter.js';
import {createRuntimeHandlers,WorldRuntime} from '../server/world/runtime.js';
import {PET_SKILLS} from '../shared/world/pet-skills.js';
import {attackTiming,chooseBaizeOrder,createBaizeBattle,eventDuration,FORMATION,resolveBaizeTurn,targetCells} from '../shared/world/baize-battle.js';
import {FOREST_LANDMARKS,FOREST_MAP,forestGrassAt} from '../shared/world/forest.js';
import {forestConnectionOps} from '../scripts/connect-forest.mjs';

test('the client counts only grounded travel in rendered tall grass and resets on exit',()=>{
 let rolls=0,random=0,previous={position:[-28.5,0,-2.75],grounded:true};
 const encounter=createBaizeEncounter(()=>{rolls++;return random;});
 const move=(z,grounded=true,inForest=true)=>{
  const next={position:[-28.5,0,z],grounded};
  const result=encounter.advance(previous,next,inForest);
  previous=next;
  return result;
 };
 const flower=FOREST_MAP.features.find(p=>p.prop==='flowers');
 assert.equal(forestGrassAt(flower.x,flower.z),false);
 assert.ok(forestGrassAt(-28.5,-2.75));
 assert.equal(move(-2.75),false);
 assert.equal(move(-2.5,false),false);
 assert.equal(move(-2.75),false);
 assert.equal(rolls,0);
 const walk=(steps,offset=0)=>{
  for(let i=offset;i<offset+steps;i++)assert.equal(move(i%2===0?-2.5:-2.75),false);
 };
 walk(31);
 assert.equal(rolls,1);
 assert.equal(move(-2.75),true);
 move(-2.5);move(-2.25);move(-2);move(-1.75);
 move(-2);move(-2.25);move(-2.5);move(-2.75);
 assert.equal(rolls,2);
 encounter.afterBattle();
 walk(51);
 assert.equal(move(-2.75),true);
 assert.equal(rolls,3);
 encounter.clearGrass();
 random=.999;
 walk(63);
 assert.equal(move(-2.75),true);
 assert.equal(rolls,4);
});

function duel(id,now){
 const battle=createBaizeBattle(id,now);
 for(const key of Object.keys(battle.units))if(key.startsWith('wild-'))delete battle.units[key];
 return battle;
}

test('two rows of five per side reserve a full formation and T attacks clip at row edges',()=>{
 assert.equal(FORMATION.length,20);
 assert.equal(new Set(FORMATION.map(slot=>slot.id)).size,20);
 assert.deepEqual(targetCells('enemy-front-2',PET_SKILLS.frost),['enemy-front-2']);
 assert.deepEqual(new Set(targetCells('enemy-front-2',PET_SKILLS.meteor)),new Set(['enemy-front-1','enemy-front-2','enemy-front-3','enemy-back-2']));
 assert.deepEqual(new Set(targetCells('enemy-back-0',PET_SKILLS.meteor)),new Set(['enemy-back-0','enemy-back-1','enemy-front-0']));
});

test('independent orders resolve together and deadline skips only units without orders',()=>{
 const initial=duel('typed',1000);
 const hero={unitId:'hero',choice:'meteor',target:'wild'},pet={unitId:'pet',choice:'frost',target:'wild'};
 assert.throws(()=>chooseBaizeOrder(initial,{...hero,target:'pet'},1000),/BATTLE_TARGET_INVALID/);
 assert.throws(()=>chooseBaizeOrder(initial,{...pet,choice:'meteor'},1000),/BATTLE_MOVE_INVALID/);
 assert.throws(()=>chooseBaizeOrder(initial,hero,initial.deadline),/BATTLE_ROUND_CLOSED/);
 const pending=chooseBaizeOrder(initial,hero,1000);
 assert.equal(pending.turn,1);
 assert.equal(pending.units.wild.hp,64);
 const both=chooseBaizeOrder(pending,pet,1001);
 assert.deepEqual(both.lastTurn.events.map(e=>e.side),['hero','pet','wild']);
 assert.equal(both.units.hero.uses.meteor,1);
 assert.equal(both.units.pet.uses.frost,2);
 assert.equal(both.deadline-both.readyAt,30_000);
 let playback=0;
 for(const event of both.lastTurn.events){
  const {approach,impact,retreat,end}=attackTiming(event);
  assert.ok(approach>0&&impact>approach&&retreat>impact&&end>retreat);
  assert.ok(Math.abs(impact-approach-PET_SKILLS[event.skillId].effect.impact)<1e-9);
  assert.equal(eventDuration(event),end);
  playback+=end;
 }
 assert.equal(both.readyAt,1001+Math.ceil(playback*1000)+200);
 assert.throws(()=>chooseBaizeOrder(both,hero,both.readyAt-1),/BATTLE_ROUND_CLOSED/);
 const expired=resolveBaizeTurn(pending,initial.deadline);
 assert.deepEqual(expired.lastTurn.events.map(e=>e.side),['hero','wild']);
 assert.equal(expired.units.pet.uses.frost,3);
});

test('a T spell hits only occupied affected slots and the defeated cannot act',()=>{
 const battle=duel('area',1000);
 const wild=battle.units.wild;
 for(const [id,slot] of [['adjacent','enemy-front-3'],['behind','enemy-back-2'],['outside','enemy-back-3']]){
  battle.units[id]={...wild,id,slot};
 }
 wild.hp=1;
 const selected=chooseBaizeOrder(battle,{unitId:'hero',choice:'meteor',target:'wild'},1000);
 const next=chooseBaizeOrder(selected,{unitId:'pet',choice:'wait'},1000);
 assert.deepEqual(next.lastTurn.events[0].hits.map(hit=>hit.target),['wild','adjacent','behind']);
 assert.equal(next.lastTurn.events[1].kind,'faint');
 assert.equal(next.lastTurn.events.some(e=>e.kind==='attack'&&e.side==='wild'),false);
});

test('a full-side spell hits each living opponent in the forest encounter',()=>{
 const battle=createBaizeBattle('group',1000);
 const enemies=Object.values(battle.units).filter(unit=>unit.slot.startsWith('enemy-'));
 assert.equal(enemies.length,4);
 assert.equal(new Set(enemies.map(unit=>unit.slot)).size,4);
 const cells=targetCells(battle.units.wild.slot,PET_SKILLS.crown);
 assert.equal(cells.length,10);
 assert.ok(cells.every(cell=>cell.startsWith('enemy-')));
 battle.units['wild-flank'].hp=0;
 const selected=chooseBaizeOrder(battle,{unitId:'hero',choice:'crown',target:'wild'},1000);
 const next=chooseBaizeOrder(selected,{unitId:'pet',choice:'wait'},1000);
 assert.deepEqual(next.lastTurn.events[0].hits.map(hit=>hit.target),['wild','wild-west','wild-rear']);
 assert.equal(next.units['wild-flank'].hp,0);
});

test('movement remains independent from battle start and owner requests are validated and idempotent',async()=>{
 const handlers=createRuntimeHandlers({baizeEnabled:true});
 const app=await buildServer({databasePath:':memory:',worldMode:true,startRuntime:false,worldHandlers:handlers});
 try{
  const service=app.worldService,read=()=>service.readSnapshot('default'),actor=()=>read().actors[0];
  const owner={role:'owner',subjectId:'local-owner',worldIds:['default'],actorIds:['whale'],scopes:['build:write','actor:control','world:read']};
  const agent={...owner,role:'agent',subjectId:'test-agent'};
  const command=(kind,payload)=>({worldId:'default',requestId:randomUUID(),kind,payload});
  const dispatch=(kind,payload)=>service.execute(owner,command(kind,payload));
  const seed=read();
  const plan=dispatch('build.preview',{baseRevision:seed.layoutRevision,ops:forestConnectionOps(seed)});
  const sceneId=dispatch('build.apply',{planId:plan.planId}).createdIds['forest-exploration'];
  const actorId=actor().actorId;
  const encounter=()=>{
   service.transactRuntime('default',({snapshot})=>Object.assign(snapshot.actors[0],{
    sceneId,position:[-28.3,0,-5.4],grounded:true,
   }));
   const {leaseId,leaseVersion}=dispatch('control.takeover',{actorId});
   const movement=dispatch('actor.input',{actorId,leaseId,leaseVersion,frames:[
    {sequence:1,dtMs:50,direction:[1,0]},{sequence:2,dtMs:50,direction:[1,0]},
   ]});
   assert.ok(!movement.actor.battle);
   assert.ok(Math.abs(movement.actor.position[0]-(-28.3+.282))<1e-8);
   assert.equal(movement.actor.input.sequence,2);
   const payload={actorId,leaseId,leaseVersion,sequence:2};
   assert.throws(()=>service.execute(agent,command('battle.start',payload)),/UNAUTHORIZED/);
   assert.throws(()=>dispatch('battle.start',{...payload,sequence:3}),/INPUT_SEQUENCE/);
   service.transactRuntime('default',({snapshot})=>{snapshot.actors[0].grounded=false;});
   assert.throws(()=>dispatch('battle.start',payload),/BATTLE_START_UNAVAILABLE/);
   service.transactRuntime('default',({snapshot})=>{snapshot.actors[0].grounded=true;snapshot.actors[0].position[2]=0;});
   assert.throws(()=>dispatch('battle.start',payload),/BATTLE_START_UNAVAILABLE/);
   service.transactRuntime('default',({snapshot})=>{snapshot.actors[0].position[2]=-5.4;});
   const start=command('battle.start',payload);
   const result=service.execute(owner,start);
   assert.deepEqual(service.execute(owner,start),result);
   assert.equal(actor().controller,null);
   service.transactRuntime('default',({snapshot})=>{
    const units=snapshot.actors[0].battle.units;
    for(const key of Object.keys(units))if(key.startsWith('wild-'))delete units[key];
   });
   return {actorId,battleId:result.battleId};
  };
  const first=encounter(),original=actor().position;
  assert.throws(()=>service.execute(agent,command('control.acquire',{actorId})),/ACTOR_IN_BATTLE/);
  assert.throws(()=>service.execute(agent,command('battle.choose',{...first,turn:1,choice:'frost'})),/UNAUTHORIZED/);
  assert.throws(()=>dispatch('battle.leave',first),/BATTLE_NOT_FINISHED/);
  let now=Date.now();service.clock=()=>now;
  const order=(battle,unitId,choice='frost')=>({...battle,turn:actor().battle.turn,unitId,choice,target:'wild'});
  const frost=command('battle.choose',order(first,'hero'));
  assert.ok(actor().battle.readyAt>actor().battle.introStartedAt);
  assert.equal(actor().battle.deadline-actor().battle.readyAt,30_000);
  assert.throws(()=>service.execute(owner,frost),/BATTLE_ROUND_CLOSED/);
  now=actor().battle.readyAt;
  const result=service.execute(owner,frost);
  assert.deepEqual(service.execute(owner,frost),result);
  assert.equal(actor().battle.units.wild.hp,64);
  const runtime=new WorldRuntime(service);
  now=actor().battle.deadline+100;
  runtime.tick();
  assert.equal(actor().battle.turn,2);
  assert.equal(actor().battle.units.wild.hp,46);
  assert.equal(actor().battle.units.pet.uses.frost,3);
  assert.throws(()=>dispatch('battle.choose',{...order(first,'pet'),turn:1}),/BATTLE_TURN_CHANGED/);
  dispatch('battle.choose',{...first,turn:2,choice:'flee'});
  dispatch('battle.leave',first);
  assert.deepEqual(actor().position,original);
  assert.equal(actor().battle,null);
  const second=encounter();
  for(let turn=1;turn<=3&&!actor().battle.outcome;turn++){
   now=actor().battle.readyAt;
   dispatch('battle.choose',order(second,'hero'));
   dispatch('battle.choose',order(second,'pet'));
  }
  assert.equal(actor().battle.outcome,'won');
  dispatch('battle.leave',second);
  assert.deepEqual(actor().position,original);
  const third=encounter();
  service.transactRuntime('default',({snapshot})=>{
   snapshot.actors[0].battle.units.pet.hp=0;
   snapshot.actors[0].battle.units.hero.hp=1;
  });
  now=actor().battle.readyAt;
  dispatch('battle.choose',order(third,'hero','wait'));
  assert.equal(actor().battle.outcome,'lost');
  dispatch('battle.leave',third);
  assert.deepEqual(actor().position,FOREST_LANDMARKS[0].position);
 }finally{await app.close();}
});

test('an active battle stays in memory and a service restart resumes in the bedroom',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'baize-save-'));
 const options={databasePath:path.join(dir,'world.sqlite'),worldMode:true,startRuntime:false,localAssetDir:null};
 let app;
 try{
  app=await buildServer(options);
  const read=()=>app.worldService.readSnapshot('default').actors[0];
  const {sceneId,position}=read();
  app.worldService.transactRuntime('default',({snapshot})=>{
   Object.assign(snapshot.actors[0],{sceneId:'yard',position:[10,0,8],battle:createBaizeBattle('session-only')});
  });
  assert.equal(read().battle.battleId,'session-only');
  await app.close();
  app=null;
  app=await buildServer(options);
  assert.equal(read().battle,undefined);
  assert.equal(read().sceneId,sceneId);
  assert.deepEqual(read().position,position);
 }finally{
  await app?.close();
  await rm(dir,{recursive:true,force:true});
 }
});
