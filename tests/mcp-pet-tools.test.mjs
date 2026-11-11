import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {WorldService} from '../server/world/service.js';
import {migrateWorld} from '../server/storage/migrations.js';
import {createRuntimeHandlers} from '../server/world/runtime.js';
import {defaultManifest} from '../shared/world/default-manifest.js';
import {createToolCaller} from '../server/mcp/tools.js';
import {compostPositionForSnapshot} from '../shared/world/compost.js';

test('actor:control 授权的 MCP agent 可以摸/喂/捡屎/堆肥',async()=>{
 const db=new DatabaseSync(':memory:');migrateWorld(db,{defaultManifest});
 const service=new WorldService(db,{handlers:createRuntimeHandlers({baizeEnabled:true})});
 const actorId=service.readSnapshot('default').actors[0].actorId;
 const owner={subjectId:'local-owner',worldIds:['default'],scopes:['world:read','actor:control'],actorIds:[actorId],role:'owner'};
 const command=(kind,payload)=>service.execute(owner,{worldId:'default',requestId:randomUUID(),kind,payload});
 service.transactRuntime('default',({snapshot})=>{const a=snapshot.actors.find(x=>x.actorId===actorId);a.sceneId='yard';a.position=[5,0,1];});
 command('pet.bootstrap',{actorId});
 const pet=command('pet.hatchEgg',{actorId,eggId:'starter-baize'}).petId;
 command('pet.syncPositions',{actorId,positions:[{petId:pet,sceneId:'yard',position:[5.2,0,1.1]}]});
 command('item.poop',{actorId,sceneId:'yard',position:[5.3,0,1.2]});
 service.transactRuntime('default',({snapshot})=>{snapshot.items.owners[actorId].inventory.poop=2;});
 const agent={subjectId:'agent-grant',worldIds:['default'],scopes:['world:read','actor:control'],actorIds:[actorId],role:'agent'};
 const call=createToolCaller(service,{resolvePrincipal:async()=>agent});
 try{
  assert.equal((await call('pet_pet',{requestId:'pet',petId:pet})).ok,true);
  assert.equal((await call('pet_feed',{requestId:'feed',petId:pet})).satiety,100);
  assert.equal((await call('yard_pickup_poop',{requestId:'pickup'})).ok,true);
  const snap=service.readSnapshot('default'),point=compostPositionForSnapshot(snap);
  service.transactRuntime('default',({snapshot})=>{const a=snapshot.actors.find(x=>x.actorId===actorId);a.position=[point[0]+1,0,point[2]+1];});
  assert.equal((await call('yard_compost',{requestId:'compost'})).ok,true);
 }finally{db.close();}
});
