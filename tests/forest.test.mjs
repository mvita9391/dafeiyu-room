import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {buildServer} from '../server/app.js';
import {getTemplate} from '../shared/world/templates.js';
import {FOREST_LAKE_LEVEL,FOREST_STAIRS,FOREST_TREES,forestLakeDepth} from '../shared/world/forest.js';
import {surfaceAt} from '../shared/world/coastal.js';
import {findPath,walkable,segmentWalkable} from '../shared/world/navigation.js';
import {advancePlayer,simulateJump} from '../shared/world/movement.js';
import {WorldRuntime} from '../server/world/runtime.js';
import {forestConnectionOps} from '../scripts/connect-forest.mjs';
import {compileOutdoorMap} from '../shared/world/outdoor-builder.js';

test('outdoor authoring merges flat cells, emits exposed faces and validates stair rise',()=>{
 const bounds={x0:0,x1:4,z0:0,z1:2};
 const flat=compileOutdoorMap({version:1,bounds,ops:[]});
 assert.equal(flat.tops.length,1);
 assert.equal(flat.surfaces.length,2);
 assert.equal(flat.walls.length,24);
 const rect={x0:0,x1:2,z0:0,z1:1};
 const ops=[
  {kind:'paint',rect,material:'dirt'},
  {kind:'stairs',rect,direction:'east',from:0,to:4},
  {kind:'place',x:1.25,z:.25,prop:'flowers'},
 ];
 const ramp=compileOutdoorMap({version:1,bounds,ops});
 assert.deepEqual(ramp.tops.filter(t=>t.step).map(t=>t.y),[.16,.32,.48,.64]);
 assert.deepEqual(ramp.features,[{x:1.25,z:.25,prop:'flowers',size:1,y:.48}]);
 assert.throws(()=>compileOutdoorMap({version:1,bounds,ops:[{...ops[1],to:5}]}),/OUTDOOR_STAIRS_TOO_STEEP/);
});

test('both forest trails support walking and sprinting while cliffs and trunks block',()=>{
 const template=getTemplate('forest_v1'),world={scenes:[{sceneId:'forest',templateId:template.templateId}],entities:[]};
 for(const [lane,z] of FOREST_STAIRS.entries()){
  let actor={sceneId:'forest',position:[-18,0,z],grounded:true};
  for(let i=0;actor.position[0]<27&&i<350;i++)actor=advancePlayer(world,actor,[1,0],50,false,lane+1);
  assert.ok(actor.position[0]>=27);
  assert.ok(Math.abs(actor.position[1]-4.8)<1e-8);
  for(let i=0;actor.position[0]>-18&&i<350;i++)actor=advancePlayer(world,actor,[-1,0],50,false,lane+1);
  assert.ok(actor.position[0]<=-18);
  assert.equal(actor.position[1],0);
 }
 assert.equal(segmentWalkable(world,'forest',[-8.3,0,0],[-7.7,1.6,0]),false);
 const {x,z}=FOREST_TREES[0];
 assert.equal(walkable(world,'forest',[x,0,z]),false);
});

test('forest jumps clear a terrace lip and keep their world height when leaving it',()=>{
 const world={scenes:[{sceneId:'forest',templateId:'forest_v1'}],entities:[]};
 const actor=position=>({sceneId:'forest',position,grounded:true});
 const low=[-8.65,0,0],high=[-7.4,1.6,0];
 let single=actor(low),peak=0;
 for(let i=0;i<20;i++){
  single=advancePlayer(world,single,[1,0],50,i===0);
  peak=Math.max(peak,single.airHeight);
 }
 assert.ok(Math.abs(peak-.81)<1e-8);
 assert.ok(single.position[0]<-8);
 for(const [start,end] of [[low,high],[high,low]]){
  const {frames}=simulateJump(world,actor(start),end);
  assert.equal(frames.some(frame=>frame.jumpStage===2),start===low);
  const landing=frames.at(-1);
  assert.ok(Math.abs(landing.position[0]-end[0])<.001);
  assert.ok(Math.abs(landing.position[1]-end[1])<1e-8);
  assert.equal(landing.grounded,true);
  const edge=frames.findIndex(frame=>Math.abs(frame.position[1]-start[1])>1);
  assert.ok(edge>0);
  const feet=frame=>frame.position[1]+frame.airHeight;
  assert.ok(Math.abs(feet(frames[edge])-feet(frames[edge-1]))<.5);
  if(start===high)assert.ok(frames[edge].airHeight>1.6);
 }
 const blocked=advancePlayer(world,actor([-8.05,0,0]),[1,0],50);
 assert.deepEqual(blocked.position,[-8.05,0,0]);
});

test('the summit lake shares one navigable surface above a shallow shore and deep basin',()=>{
 const template=getTemplate('forest_v1');
 const world={scenes:[{sceneId:'forest',templateId:template.templateId}],entities:[]};
 assert.equal(forestLakeDepth(35,0),0);
 assert.ok(forestLakeDepth(38,0)<.6);
 const depths=[38,39,40,41,42,43,44,45,46,47].map(x=>forestLakeDepth(x,0));
 assert.ok(depths.every((depth,i)=>i===0||(depth>depths[i-1]&&depth-depths[i-1]<.6)));
 assert.ok(forestLakeDepth(47,0)>2.7);
 assert.equal(surfaceAt(template,47,0).kind,'water');
 assert.ok(segmentWalkable(world,'forest',[35,4.8,0],[47,FOREST_LAKE_LEVEL,0]));
 let actor={sceneId:'forest',position:[35,4.8,0],grounded:true};
 for(let i=0;actor.position[0]<46&&i<95;i++)actor=advancePlayer(world,actor,[1,0],50);
 assert.ok(actor.position[0]>=46&&actor.form==='swim');
 actor=advancePlayer(world,actor,[0,0],50,false,1,true);
 assert.equal(actor.diving,true);
 for(let i=0;actor.position[0]>36&&i<95;i++)actor=advancePlayer(world,actor,[-1,0],50);
 assert.ok(actor.position[0]<=36&&actor.form==='normal');
 assert.equal(actor.diving,false);

 // A leap from the lake toward the mountain must switch form on dry ground.
 actor={sceneId:'forest',position:[57.5,FOREST_LAKE_LEVEL,0],grounded:true,form:'swim'};
 for(let i=0;i<10;i++){
  actor=advancePlayer(world,actor,[1,0],50,i===0,2);
  assert.equal(actor.form,surfaceAt(template,actor.position[0],actor.position[2]).kind==='water'?'swim':'normal');
 }
 assert.ok(actor.position[0]>59);
});

test('the mountain stairs connect the lakeshore to a clear, level boss arena',()=>{
 const template=getTemplate('forest_v1');
 const world={scenes:[{sceneId:'forest',templateId:template.templateId}],entities:[]};
 const arena=template.landmarks.find(landmark=>landmark.landmarkId==='boss-arena').position;
 const stairs=[59.5,4.8,-10];
 assert.equal(arena[1],11.2);
 assert.ok(segmentWalkable(world,'forest',stairs,[83,11.2,-10]));
 assert.ok(!segmentWalkable(world,'forest',[59.5,4.8,-17],[83,11.2,-17]));
 for(const x of [84,91,101])for(const z of [-20,-9,2]){
  assert.equal(surfaceAt(template,x,z).height,11.2);
  assert.ok(walkable(world,'forest',[x,11.2,z]));
 }
 const lake=template.landmarks.find(landmark=>landmark.landmarkId==='summit-lake').position;
 assert.deepEqual(findPath(world,'forest',lake,arena).at(-1),arena);
 assert.deepEqual(findPath(world,'forest',arena,lake).at(-1),lake);
});

test('quick teleport installs one forest on demand without linking or changing existing layouts',async()=>{
 const app=await buildServer({databasePath:':memory:',worldMode:true,startRuntime:false});
 try{
  const service=app.worldService,read=()=>service.readSnapshot('default');
  const owner={role:'owner',subjectId:'local-owner',worldIds:['default'],actorIds:['whale'],scopes:['actor:control','build:write']};
  const command={worldId:'default',requestId:'forest-lake',kind:'actor.teleport',payload:{actorId:'whale',templateId:'forest_v1',landmarkId:'summit-lake'}};
  const build=(kind,payload)=>service.execute(owner,{worldId:'default',requestId:crypto.randomUUID(),kind,payload});
  const beforeBuild=read();
  const preview=build('build.preview',{baseRevision:beforeBuild.layoutRevision,ops:[{kind:'scene.create',ref:'spare-room',templateId:'cozy_room_v1',name:'备用房间'}]});
  const {changeId}=build('build.apply',{planId:preview.planId});
  const original=read();
  assert.ok(!original.scenes.some(scene=>scene.templateId==='forest_v1'));
  assert.throws(()=>service.execute({...owner,role:'agent'},command),/UNAUTHORIZED/);
  assert.throws(()=>service.execute(owner,{...command,payload:{...command.payload,landmarkId:'missing'}}),/LANDMARK_NOT_FOUND/);
  assert.deepEqual(read(),original);
  const lake=service.execute(owner,command);
  assert.deepEqual(lake.position,[35,4.8,0]);
  assert.deepEqual(service.execute(owner,command),lake);
  const entrance=service.execute(owner,{...command,requestId:'forest-entrance',payload:{...command.payload,landmarkId:'entrance'}});
  assert.equal(entrance.sceneId,lake.sceneId);
  assert.deepEqual(entrance.position,[-29.8,0,0]);
  const saved=read();
  assert.equal(saved.layoutRevision,original.layoutRevision+1);
  assert.equal(saved.topologyRevision,original.topologyRevision+1);
  assert.deepEqual(saved.scenes.filter(scene=>scene.templateId==='forest_v1').map(scene=>scene.sceneId),[lake.sceneId]);
  assert.deepEqual(saved.scenes.filter(scene=>scene.sceneId!==lake.sceneId),original.scenes);
  assert.deepEqual(saved.portals,original.portals);
  assert.deepEqual(saved.entities,original.entities);
  assert.equal(service.execute(owner,{...command,requestId:'return',payload:{actorId:'whale',sceneId:'yard'}}).sceneId,'yard');
  build('build.undo',{changeId});
  assert.deepEqual(read().scenes.filter(scene=>scene.sceneId!==lake.sceneId),beforeBuild.scenes);
  assert.ok(read().scenes.some(scene=>scene.sceneId===lake.sceneId));
 }finally{await app.close();}
});

test('forest install is atomic and MCP can visit the lookout, lake and boss arena',async()=>{
 const app=await buildServer({databasePath:':memory:',worldMode:true,startRuntime:false});
 const url=await app.listen({host:'127.0.0.1',port:0});
 const client=new Client({name:'forest-test',version:'1'});
 try{
  const service=app.worldService;
  const read=()=>service.readSnapshot('default');
  const principal={role:'owner',subjectId:'local-owner',worldIds:['default'],actorIds:['whale'],scopes:['build:write','actor:control']};
  const dispatch=(kind,payload)=>service.execute(principal,{worldId:'default',requestId:crypto.randomUUID(),kind,payload});
  const original=read();
  const ops=forestConnectionOps(original);
  assert.throws(()=>forestConnectionOps({...original,portals:[...original.portals,{from:ops[1].from,to:{sceneId:'other',slotId:'west'}}]}),/FOREST_GATE_OCCUPIED/);
  const preview=dispatch('build.preview',{baseRevision:original.layoutRevision,ops});
  assert.deepEqual(read().scenes,original.scenes);
  const {createdIds}=dispatch('build.apply',{planId:preview.planId});
  const sceneId=createdIds['forest-exploration'];
  assert.deepEqual(forestConnectionOps(read()),[]);
  assert.deepEqual(read().entities,original.entities);
  let now=Date.now();service.clock=()=>now;
  const grant=app.auth.store.create({actorIds:['whale'],scopes:['world:read','actor:control']});
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',url),{requestInit:{headers:{Authorization:`Bearer ${grant.accessToken}`}}}));
  const call=async(name,args)=>{
   const result=await client.callTool({name,arguments:args});
   assert.ok(!result.isError,JSON.stringify(result));
   return result.structuredContent;
  };
  const observation=await call('world_observe',{sceneId});
  assert.deepEqual(observation.scenes.find(s=>s.sceneId===sceneId).landmarks.map(l=>l.landmarkId),['entrance','fork','lookout','summit-lake','boss-arena']);
  service.transactRuntime('default',({snapshot})=>Object.assign(snapshot.actors[0],{sceneId:'yard',position:[18,0,-8],grounded:true}));
  const actorId='whale';
  let {leaseId,leaseVersion}=await call('actor_take_control',{actorId,requestId:'forest-control'});
  const runtime=new WorldRuntime(service);
  async function move(requestId,target){
   const {actionId}=await call('actor_move',{actorId,leaseId,leaseVersion,requestId,target,gait:'sprint'});
   for(let i=0;read().actions[actionId].status==='running'&&i<230;i++){now+=100;runtime.tick();}
   const result=await call('action_get',{actionId});
   assert.equal(result.status,'completed',JSON.stringify(result));
   return result.result;
  }
  assert.deepEqual((await move('forest-out',{sceneId,landmarkId:'lookout'})).position,[27,4.8,0]);
  assert.deepEqual((await move('forest-lake',{sceneId,landmarkId:'summit-lake'})).position,[35,4.8,0]);
  ({leaseId,leaseVersion}=await call('actor_take_control',{actorId,requestId:'mountain-control'}));
  assert.deepEqual((await move('forest-boss',{sceneId,landmarkId:'boss-arena'})).position,[91,11.2,-9]);
  assert.deepEqual((await move('forest-boss-return',{sceneId,landmarkId:'summit-lake'})).position,[35,4.8,0]);
  assert.equal((await move('forest-return',{sceneId:'yard'})).sceneId,'yard');
  assert.deepEqual(dispatch('actor.teleport',{actorId,sceneId,landmarkId:'summit-lake'}).position,[35,4.8,0]);
  assert.deepEqual(dispatch('actor.teleport',{actorId,sceneId,landmarkId:'entrance'}).position,[-29.8,0,0]);
  assert.equal(dispatch('actor.teleport',{actorId,templateId:'forest_v1',landmarkId:'entrance'}).sceneId,sceneId);
  assert.throws(()=>dispatch('actor.teleport',{actorId,sceneId,landmarkId:'missing'}),/LANDMARK_NOT_FOUND/);
 }finally{await client.close();await app.close();}
});
