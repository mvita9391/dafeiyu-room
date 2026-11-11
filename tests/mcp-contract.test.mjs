import test from 'node:test';import assert from 'node:assert/strict';
import {buildServer} from '../server/app.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
async function fixture(options={}){const {createServer}=await import('node:net');const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const issuer=`http://127.0.0.1:${port}`;const app=await buildServer({databasePath:':memory:',worldMode:true,auth:{issuer,localAccess:true},...options});await app.listen({host:'127.0.0.1',port});const endpoint=issuer+'/mcp';const actorId=app.worldService.readSnapshot('default').actors[0].actorId;const grant=app.auth.store.create({actorIds:[actorId],scopes:['world:read','actor:control','build:write']});return {app,endpoint,grant,actorId};}
test('actual SDK HTTP discovery, strict tools, actor leases, private resource filtering and revoke',async()=>{const f=await fixture();const client=new Client({name:'contract',version:'1'});try{const unauth=await fetch(f.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate'),/resource_metadata/);await client.connect(new StreamableHTTPClientTransport(new URL(f.endpoint),{requestInit:{headers:{Authorization:`Bearer ${f.grant.accessToken}`}}}));const tools=await client.listTools();assert.equal(tools.tools.length,28);assert.ok(tools.tools.find(t=>t.name==='layout_suggest'));const enter=await client.callTool({name:'world_enter',arguments:{}});assert.equal(enter.isError,undefined,JSON.stringify(enter));assert.equal(enter.structuredContent.worldId,'default');const call=(name,args={})=>client.callTool({name,arguments:args});assert.equal((await call('world_enter',{worldId:'other'})).isError,true);assert.equal((await call('actor_move',{actorId:f.actorId,requestId:'bad',leaseId:'fake',leaseVersion:0,target:{sceneId:'yard'}})).isError,true);const acquired=(await call('actor_take_control',{actorId:f.actorId,requestId:'lease'})).structuredContent;assert.ok(acquired.leaseId);assert.equal((await call('world_observe',{camera:20})).isError,true);const resources=await client.listResources();assert.equal(resources.resources.length,4);for(const resource of resources.resources){const r=await client.readResource({uri:resource.uri});assert.doesNotMatch(r.contents[0].text,/accessToken|token_hash|bootstrap|buildPlans|csrfToken/);}f.app.auth.store.revoke(f.grant.grantId);await assert.rejects(()=>client.listTools());}finally{await client.close();await f.app.close();}});
test('stdio adapter SDK discovery/call; closing adapter leaves world running',async()=>{const f=await fixture();const dir=await mkdtemp(path.join(tmpdir(),'world-mcp-test-'));const config=path.join(dir,'credential.json');await writeFile(config,JSON.stringify({endpoint:f.endpoint,accessToken:f.grant.accessToken}),{mode:0o600});const client=new Client({name:'stdio-test',version:'1'});try{await client.connect(new StdioClientTransport({command:process.execPath,args:['scripts/world-mcp-stdio.mjs','--config',config],cwd:process.cwd(),stderr:'pipe'}));assert.equal((await client.listTools()).tools.length,28);assert.match(client.getInstructions(),/world_enter \{\}/);assert.equal((await client.callTool({name:'world_enter',arguments:{}})).structuredContent.worldId,'default');await client.close();assert.equal((await fetch(f.endpoint.replace('/mcp','/api/health'))).status,200);}finally{await client.close();await f.app.close();await rm(dir,{recursive:true,force:true});}});
test('unmodified SDK OAuth discovery/register/PKCE/consent/token flow connects from address only',async()=>{const {createServer}=await import('node:net');const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const issuer=`http://127.0.0.1:${port}`,app=await buildServer({databasePath:':memory:',worldMode:true,auth:{issuer,localAccess:true}});await app.listen({host:'127.0.0.1',port});const paired=await app.inject({method:'POST',url:'/api/auth/local-session',headers:{host:new URL(issuer).host,origin:issuer},payload:{}}),cookie=paired.headers['set-cookie'].split(';')[0],csrf=paired.json().csrfToken;let registration,tokens,verifier,authorization;const provider={redirectUrl:'http://127.0.0.1:9999/callback',clientMetadata:{client_name:'real-sdk-oauth',redirect_uris:['http://127.0.0.1:9999/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']},clientInformation:()=>registration,saveClientInformation:c=>{registration=c;},tokens:()=>tokens,saveTokens:t=>{tokens=t;},saveCodeVerifier:v=>{verifier=v;},codeVerifier:()=>verifier,redirectToAuthorization:u=>{authorization=u;}};const client=new Client({name:'oauth-test',version:'1'}),transport=new StreamableHTTPClientTransport(new URL(issuer+'/mcp'),{authProvider:provider});try{await assert.rejects(()=>client.connect(transport));assert.ok(authorization);const pending=await fetch(authorization,{headers:{cookie}});assert.equal(pending.status,200);const html=await pending.text(),consentId=html.match(/name="consentId" value="([^"]+)"/)[1];const consent=await fetch(issuer+'/oauth/consent',{method:'POST',headers:{cookie,'x-csrf-token':csrf,'content-type':'application/json'},body:JSON.stringify({consentId,approve:true}),redirect:'manual'});assert.equal(consent.status,302);const code=new URL(consent.headers.get('location')).searchParams.get('code');await transport.finishAuth(code);await client.close();await client.connect(new StreamableHTTPClientTransport(new URL(issuer+'/mcp'),{authProvider:provider}));assert.equal((await client.listTools()).tools.length,28);assert.match(client.getInstructions(),/world_enter \{\}/);assert.equal((await client.callTool({name:'world_enter',arguments:{}})).structuredContent.worldId,'default');assert.ok(tokens.refresh_token);assert.deepEqual((await client.callTool({name:'world_enter',arguments:{}})).structuredContent.permissions.scopes,['world:read','actor:control','build:write']);}finally{await client.close();await app.close();}});
test('SDK actions and build tools execute real service transactions; grants filter private resources',async()=>{const f=await fixture(),client=new Client({name:'real-effects',version:'1'});try{await client.connect(new StreamableHTTPClientTransport(new URL(f.endpoint),{requestInit:{headers:{authorization:`Bearer ${f.grant.accessToken}`}}}));const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true,JSON.stringify(r));return r.structuredContent;};const snapshot=await call('world_observe',{});const lease=await call('actor_take_control',{actorId:f.actorId,requestId:'ctrl'});const action=await call('actor_interact',{actorId:f.actorId,leaseId:lease.leaseId,leaseVersion:lease.leaseVersion,requestId:'eat',verb:'eat'});assert.equal((await call('action_get',{actionId:action.actionId})).status,'running');await call('action_cancel',{actionId:action.actionId,requestId:'cancel'});assert.equal((await call('action_get',{actionId:action.actionId})).status,'cancelled');const preview=await call('build_preview',{requestId:'preview',baseRevision:snapshot.layoutRevision,ops:[{kind:'scene.create',ref:'new-room',templateId:'cozy_room_v1',name:'SDK room'}]});const applied=await call('build_apply',{requestId:'apply',planId:preview.planId});assert.equal(applied.layoutRevision,snapshot.layoutRevision+1);const retry=await call('build_apply',{requestId:'apply',planId:preview.planId});assert.equal(retry.changeId,applied.changeId);await call('build_undo',{requestId:'undo',changeId:applied.changeId});const {appendEvent}=await import('../server/world/events.js');appendEvent(f.app.worldService.db,{worldId:'default',kind:'owner_message',subjectId:'other-principal',changeId:'private',data:{text:'private-other-reply'}});const activity=await client.readResource({uri:'world://current/activity'});assert.doesNotMatch(activity.contents[0].text,/private-other-reply/);const readOnly=f.app.auth.store.create({actorIds:[f.actorId],scopes:['world:read']});const restricted=new Client({name:'restricted',version:'1'});try{await restricted.connect(new StreamableHTTPClientTransport(new URL(f.endpoint),{requestInit:{headers:{authorization:`Bearer ${readOnly.accessToken}`}}}));assert.equal((await restricted.callTool({name:'actor_take_control',arguments:{actorId:f.actorId,requestId:'denied'}})).isError,true);assert.equal((await restricted.callTool({name:'action_get',arguments:{actionId:action.actionId}})).isError,true);}finally{await restricted.close();}}finally{await client.close();await f.app.close();}});
test('stdio rotates OAuth credentials after expiry and persists refresh without restarting world',async()=>{const f=await fixture(),dir=await mkdtemp(path.join(tmpdir(),'world-stdio-refresh-')),config=path.join(dir,'credential.json'),client=new Client({name:'refresh-adapter',version:'1'});try{const grant=f.app.auth.store.create({clientId:'adapter-client',actorIds:[f.actorId]}),tokens=f.app.auth.store.issue(grant,{refresh:true}),{hash}=await import('../server/auth/grants.js');const record=f.app.auth.store.get('token',hash(tokens.accessToken));f.app.auth.store.put('token',hash(tokens.accessToken),{...record,expiresAt:0});await writeFile(config,JSON.stringify({endpoint:f.endpoint,accessToken:tokens.accessToken,refreshToken:tokens.refreshToken,clientId:'adapter-client'}),{mode:0o600});await client.connect(new StdioClientTransport({command:process.execPath,args:['scripts/world-mcp-stdio.mjs','--config',config],cwd:process.cwd(),stderr:'pipe'}));assert.equal((await client.listTools()).tools.length,28);const {readFile}=await import('node:fs/promises'),saved=JSON.parse(await readFile(config,'utf8'));assert.notEqual(saved.accessToken,tokens.accessToken);assert.notEqual(saved.refreshToken,tokens.refreshToken);}finally{await client.close();await f.app.close();await rm(dir,{recursive:true,force:true});}});
test('foreign lease credentials are filtered consistently from SDK events, activity resources and HTTP events',async()=>{const f=await fixture(),ownerClient=new Client({name:'lease-owner',version:'1'}),viewerClient=new Client({name:'viewer',version:'1'});try{await ownerClient.connect(new StreamableHTTPClientTransport(new URL(f.endpoint),{requestInit:{headers:{authorization:`Bearer ${f.grant.accessToken}`}}}));const lease=(await ownerClient.callTool({name:'actor_take_control',arguments:{actorId:f.actorId,requestId:'private-lease'}})).structuredContent;for(const actorIds of [[],[f.actorId]]){const viewer=f.app.auth.store.create({actorIds,scopes:['world:read']});await viewerClient.connect(new StreamableHTTPClientTransport(new URL(f.endpoint),{requestInit:{headers:{authorization:`Bearer ${viewer.accessToken}`}}}));const page=await viewerClient.callTool({name:'world_get_events',arguments:{}}),resource=await viewerClient.readResource({uri:'world://current/activity'}),response=await fetch(f.endpoint.replace('/mcp','/api/world/default/events'),{headers:{authorization:`Bearer ${viewer.accessToken}`}});for(const data of [page.structuredContent,resource,await response.json()]){const serialized=JSON.stringify(data);assert.ok(!serialized.includes(lease.leaseId),serialized);assert.ok(!serialized.includes(f.grant.subjectId),serialized);assert.doesNotMatch(serialized,/"leaseVersion"/);}await viewerClient.close();}const own=(await ownerClient.callTool({name:'world_get_events',arguments:{}})).structuredContent;assert.ok(JSON.stringify(own).includes(lease.leaseId));}finally{await viewerClient.close();await ownerClient.close();await f.app.close();}});
test('cancel of an old terminal action never cancels the newer running action',async()=>{const f=await fixture(),client=new Client({name:'cancel-target',version:'1'});try{await client.connect(new StreamableHTTPClientTransport(new URL(f.endpoint),{requestInit:{headers:{authorization:`Bearer ${f.grant.accessToken}`}}}));const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true,JSON.stringify(r));return r.structuredContent;};const lease=await call('actor_take_control',{actorId:f.actorId,requestId:'lease-target'}),args={actorId:f.actorId,leaseId:lease.leaseId,leaseVersion:lease.leaseVersion,verb:'eat'};const a=await call('actor_interact',{...args,requestId:'a'});await call('action_cancel',{actionId:a.actionId,requestId:'cancel-a'});const b=await call('actor_interact',{...args,requestId:'b'});await client.callTool({name:'action_cancel',arguments:{actionId:a.actionId,requestId:'cancel-old-with-fresh-id'}});assert.equal((await call('action_get',{actionId:b.actionId})).status,'running');assert.equal(f.app.worldService.readSnapshot('default').actors[0].actionId,b.actionId);}finally{await client.close();await f.app.close();}});

test('MCP sprint and maneuvers run authoritatively and can be cancelled or taken over',async()=>{
 const f=await fixture({mcpAdvancedActions:true});
 const client=new Client({name:'maneuver-contract',version:'1'});
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL(f.endpoint),{
   requestInit:{headers:{Authorization:`Bearer ${f.grant.accessToken}`}},
  }));
  const call=(name,args)=>client.callTool({name,arguments:args});
  const ok=async(name,args)=>{
   const response=await call(name,args);
   assert.ok(!response.isError,JSON.stringify(response));
   return response.structuredContent;
  };
  const service=f.app.worldService;
  const snapshot=()=>service.readSnapshot('default');
  const reset=(position=[10,0,6.1])=>service.transactRuntime('default',({snapshot})=>{
   Object.assign(snapshot.actors[0],{sceneId:'yard',position,rotation:Math.PI,form:'normal',grounded:true});
  });
  reset();
  const actorId=f.actorId;
  const {leaseId,leaseVersion}=await ok('actor_take_control',{actorId,requestId:'maneuver-control'});
  const args={actorId,leaseId,leaseVersion};
  const poll=async(actionId)=>{
   for(let i=0;i<35;i++){
    const result=await ok('action_get',{actionId});
    if(result.status!=='running')return result;
    await new Promise(resolve=>setTimeout(resolve,80));
   }
   assert.fail('Action did not finish');
  };
  const moved=await ok('actor_move',{...args,requestId:'sprint-move',gait:'sprint',target:{sceneId:'yard',groundPosition:[10,3.1]}});
  assert.equal(snapshot().actions[moved.actionId].gait,'sprint');
  assert.equal((await poll(moved.actionId)).status,'completed');
  for(const [maneuver,gait,distance] of [['flyingKick','walk',1],['flyingKick','sprint',2],['roll',undefined,4],['slide',undefined,5.076],['boxingCombo',undefined,0]]){
   reset();
   const {actionId}=await ok('actor_maneuver',{...args,requestId:`${maneuver}-${gait}`,maneuver,...gait?{gait}:{}});
   const {status,result}=await poll(actionId);
   assert.equal(status,'completed');
   assert.equal(result.blocked,false);
   assert.ok(Math.abs(6.1-result.position[2]-distance)<1e-6);
  }
  reset([21.4,0,6.1]);
  const wall=await ok('actor_maneuver',{...args,requestId:'wall-roll',maneuver:'roll',heading:Math.PI/2});
  assert.equal((await poll(wall.actionId)).result.blocked,true);
  reset();
  const cancelled=await ok('actor_maneuver',{...args,requestId:'cancel-combo',maneuver:'boxingCombo'});
  assert.equal((await ok('action_cancel',{actionId:cancelled.actionId,requestId:'cancel'})).status,'cancelled');
  const expired=await ok('actor_maneuver',{...args,requestId:'expired-combo',maneuver:'boxingCombo'});
  service.transactRuntime('default',({snapshot})=>{snapshot.actors[0].controller.expiresAt=0;});
  assert.equal((await poll(expired.actionId)).result.reason,'lease_expired');
  assert.equal((await call('actor_maneuver',{...args,requestId:'expired-lease',maneuver:'roll'})).isError,true);
  const fresh=await ok('actor_take_control',{actorId,requestId:'fresh-maneuver-control'});
  const takeover=await ok('actor_maneuver',{actorId,leaseId:fresh.leaseId,leaseVersion:fresh.leaseVersion,requestId:'owner-takeover-combo',maneuver:'boxingCombo'});
  service.execute({subjectId:'local-owner',worldIds:['default'],actorIds:[actorId],scopes:['actor:control'],role:'owner'},
   {worldId:'default',requestId:'keyboard-takeover',kind:'control.takeover',payload:{actorId}});
  assert.equal(snapshot().actions[takeover.actionId].result.reason,'control_takeover');
  assert.equal(snapshot().actors[0].maneuver,null);
 }finally{await client.close();await f.app.close();}
});

test('MCP exposes double jump, random dance, standing kicks and all eight spell slots',async()=>{
 const f=await fixture({startRuntime:false,mcpAdvancedActions:true}),client=new Client({name:'extended-maneuvers',version:'1'});
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL(f.endpoint),{
   requestInit:{headers:{Authorization:`Bearer ${f.grant.accessToken}`}},
  }));
  const call=(name,args)=>client.callTool({name,arguments:args});
  const ok=async(name,args)=>{
   const response=await call(name,args);
   assert.ok(!response.isError,JSON.stringify(response));
   return response.structuredContent;
  };
  const service=f.app.worldService;
  let now=Date.now();
  service.clock=()=>now;
  const {WorldRuntime}=await import('../server/world/runtime.js');
  const runtime=new WorldRuntime(service);
  const tick=()=>{now+=100;runtime.tick();};
  const snapshot=()=>service.readSnapshot('default');
  service.transactRuntime('default',({snapshot})=>{
   Object.assign(snapshot.actors[0],{sceneId:'yard',position:[10,0,6.1],rotation:Math.PI});
  });
  const actorId=f.actorId;
  const {leaseId,leaseVersion}=await ok('actor_take_control',{actorId,requestId:'extended-control'});
  const args={actorId,leaseId,leaseVersion};
  const submit=(maneuver,requestId,extra={})=>ok('actor_maneuver',{...args,maneuver,requestId,...extra});
  const capabilities=(await ok('world_enter',{})).capabilities;
  assert.equal(capabilities.spellSlots.length,8);
  for(const name of ['doubleJump','dance','kickCombo','spell'])assert.ok(capabilities.maneuvers.includes(name));
  const jump=await submit('doubleJump','double');
  const stages=new Set();
  for(let i=0;i<12;i++){tick();stages.add(snapshot().actors[0].jumpStage);}
  assert.ok(stages.has(1)&&stages.has(2));
  assert.equal(snapshot().actions[jump.actionId].status,'completed');
  assert.deepEqual(snapshot().actors[0].position,[10,0,6.1]);
  const dance=await submit('dance','dance');
  assert.match(snapshot().actors[0].maneuver.clip,/^HumanSp(DancingTwerk|HipHopDancing)$/);
  assert.equal((await ok('action_cancel',{actionId:dance.actionId,requestId:'cancel-dance'})).status,'cancelled');
  const kicks=await submit('kickCombo','kicks');
  for(let i=0;i<55;i++)tick();
  assert.equal(snapshot().actions[kicks.actionId].status,'completed');
  assert.deepEqual(snapshot().actors[0].position,[10,0,6.1]);
  assert.equal((await call('actor_maneuver',{...args,maneuver:'spell',slot:9,requestId:'bad-slot'})).isError,true);
  assert.equal((await call('actor_maneuver',{...args,maneuver:'roll',slot:1,requestId:'wrong-slot'})).isError,true);
  const cancelled=await submit('spell','cancelled-spell',{slot:1});
  await ok('action_cancel',{actionId:cancelled.actionId,requestId:'cancel-spell'});
  assert.equal(snapshot().actors[0].lastSpellCast,undefined);
  for(let slot=1;slot<=8;slot++){
   const cast=await submit('spell',`spell-${slot}`,{slot,groundPosition:[10,3.1]});
   assert.equal(snapshot().actions[cast.actionId].spell.slot,slot);
   for(let i=0;i<5;i++)tick();
   const result=await ok('action_get',{actionId:cast.actionId});
   assert.equal(result.status,'completed');
   assert.equal(result.result.spell.slot,slot);
   assert.equal(snapshot().actors[0].lastSpellCast.actionId,cast.actionId);
   assert.deepEqual(await submit('spell',`spell-${slot}`,{slot,groundPosition:[10,3.1]}),cast);
  }
  assert.equal((await call('actor_maneuver',{...args,maneuver:'spell',slot:8,requestId:'still-cooling'})).isError,true);
 }finally{await client.close();await f.app.close();}
});

test('MCP tasks run to a destination and attack a discovered target without aiming inputs',async()=>{
 const f=await fixture({startRuntime:false}),client=new Client({name:'task-contract',version:'1'});
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL(f.endpoint),{requestInit:{headers:{Authorization:`Bearer ${f.grant.accessToken}`}}}));
  const call=async(name,args)=>{
   const response=await client.callTool({name,arguments:args});
   assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent;
  };
  const service=f.app.worldService;
  let now=Date.now();service.clock=()=>now;
  const {WorldRuntime}=await import('../server/world/runtime.js');
  const runtime=new WorldRuntime(service);
  const read=()=>service.readSnapshot('default');
  const tick=()=>{now+=100;runtime.tick();};
  service.transactRuntime('default',({snapshot})=>Object.assign(snapshot.actors[0],{sceneId:'yard',position:[3,0,5],grounded:true}));
  const actorId=f.actorId;
  const {leaseId,leaseVersion}=await call('actor_take_control',{actorId,requestId:'task-control'});
  const token={actorId,leaseId,leaseVersion};
  const finish=async actionId=>{
   for(let i=0;i<220&&read().actions[actionId].status==='running';i++)tick();
   const action=await call('action_get',{actionId});assert.equal(action.status,'completed',JSON.stringify(action));return action;
  };
  const sequence=await call('actor_run_sequence',{...token,requestId:'sequence',target:{sceneId:'yard',groundPosition:[3,3]},maneuvers:['kickCombo','doubleJump']});
  const sequenceDone=await finish(sequence.actionId);
  assert.deepEqual(sequenceDone.result.position,[3,0,3]);
  assert.deepEqual(sequenceDone.result.completedManeuvers,['kickCombo','doubleJump']);
  const target=(await call('world_observe',{sceneId:'yard'})).combatTargets[1];
  assert.equal(target.targetId,'yard-dummy-2');
  service.transactRuntime('default',({snapshot})=>{snapshot.actors[0].position=[target.position[0]-12,0,target.position[2]];});
  const attack=await call('actor_attack_target',{...token,requestId:'attack',targetId:target.targetId});
  const start=read().actors[0].position;
  const attackDone=await finish(attack.actionId);
  assert.notDeepEqual(attackDone.result.position,start);
  assert.equal(attackDone.result.hits,1);
  assert.ok(attackDone.result.lastHit.damage>0);
  for(let i=0;i<55;i++)tick();
  const nextAttack=await call('actor_attack_target',{...token,requestId:'attack-next-skill',targetId:target.targetId});
  const nextDone=await finish(nextAttack.actionId);
  assert.notEqual(nextDone.result.lastHit.spell,attackDone.result.lastHit.spell);
  const frost=await call('actor_attack_target',{...token,requestId:'attack-with-frost',targetId:target.targetId,spell:'frost'});
  assert.equal((await finish(frost.actionId)).result.lastHit.spell,'frost');
  const repeat=await call('actor_attack_target',{...token,requestId:'repeat',targetId:target.targetId,continuous:true});
  for(let i=0;i<100&&read().actions[repeat.actionId].task.hits<2;i++)tick();
  assert.ok(read().actions[repeat.actionId].task.hits>=2);
  assert.equal((await call('action_cancel',{actionId:repeat.actionId,requestId:'cancel-repeat'})).status,'cancelled');
  assert.equal(read().actors[0].actionId,null);
  const takeover=await call('actor_attack_target',{...token,requestId:'takeover-attack',targetId:target.targetId});
  tick();
  service.execute({subjectId:'local-owner',role:'owner',worldIds:['default'],actorIds:[actorId],scopes:['actor:control']},
   {worldId:'default',requestId:'interrupt-task',kind:'control.takeover',payload:{actorId}});
  const interrupted=await call('action_get',{actionId:takeover.actionId});
  assert.equal(interrupted.result.reason,'control_takeover');
  assert.equal(read().actors[0].maneuver,null);
 }finally{await client.close();await f.app.close();}
});

test('default MCP discovery exposes task tools and disables direct maneuvers and jumps',async()=>{
 const f=await fixture({startRuntime:false}),client=new Client({name:'default-action-discovery',version:'1'});
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL(f.endpoint),{requestInit:{headers:{Authorization:`Bearer ${f.grant.accessToken}`}}}));
  const names=(await client.listTools()).tools.map(tool=>tool.name);
  for(const name of ['actor_run_sequence','actor_attack_target','actor_move','actor_interact'])assert.ok(names.includes(name));
  for(const name of ['actor_maneuver','actor_jump'])assert.ok(!names.includes(name),name);
  const {structuredContent:{capabilities}}=await client.callTool({name:'world_enter',arguments:{}});
  assert.deepEqual(capabilities.tools,names);
  assert.equal(capabilities.spellSlots,undefined);
  assert.ok(!capabilities.maneuvers.includes('spell'));
  for(const name of ['actor_maneuver','actor_jump']){
   const result=await client.callTool({name,arguments:{}});
   assert.equal(result.isError,true);
   assert.match(result.content[0].text,/not found/i);
  }
 }finally{await client.close();await f.app.close();}
});
