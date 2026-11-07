import {listPortalSlots} from '../server/world/build.js';
// Real HTTP/OAuth/SDK journey. Isolated temporary SQLite; no browser or host claims.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {buildServer} from '../server/app.js';
import {WorldRuntime} from '../server/world/runtime.js';

export async function selfCheck(){
 const directory=await mkdtemp(path.join(tmpdir(),'world-journey-'));
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const issuer=`http://127.0.0.1:${port}`,endpoint=new URL(issuer+'/mcp');let app,client,now=Date.now(),sequence=0;
 const start=async()=>{app=await buildServer({databasePath:path.join(directory,'journey.sqlite'),worldMode:true,startRuntime:false,auth:{issuer,localAccess:true}});app.worldService.clock=()=>now;await app.listen({host:'127.0.0.1',port});};
 let registration,tokens,verifier,authorization;
 const provider={redirectUrl:'http://127.0.0.1:9999/callback',clientMetadata:{client_name:'self-check',redirect_uris:['http://127.0.0.1:9999/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']},clientInformation:()=>registration,saveClientInformation:c=>registration=c,tokens:()=>tokens,saveTokens:t=>tokens=t,saveCodeVerifier:v=>verifier=v,codeVerifier:()=>verifier,redirectToAuthorization:u=>authorization=u};
 const connect=async()=>{client=new Client({name:'world-journey',version:'1'});await client.connect(new StreamableHTTPClientTransport(endpoint,{authProvider:provider}));};
 const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});assert.notEqual(result.isError,true,`${name}: ${JSON.stringify(result.structuredContent)}`);return result.structuredContent;};
 const requestId=()=>`journey-${++sequence}`;
 const tickUntil=async actionId=>{const runtime=new WorldRuntime(app.worldService);for(let i=0;i<590;i++){now+=100;runtime.tick();const state=app.worldService.readSnapshot('default').actions[actionId];if(state.status!=='running'){assert.equal(state.status,'completed',JSON.stringify(state));return state;}}throw Error('Action failed to finish within lease');};
 try{
  await start();const paired=await fetch(issuer+'/api/auth/local-session',{method:'POST',headers:{'content-type':'application/json',origin:issuer},body:'{}'});assert.equal(paired.status,200);const cookie=paired.headers.get('set-cookie').split(';')[0],csrf=(await paired.json()).csrfToken;
  client=new Client({name:'world-journey',version:'1'});const transport=new StreamableHTTPClientTransport(endpoint,{authProvider:provider});await assert.rejects(()=>client.connect(transport));assert.ok(authorization);
  const pending=await fetch(authorization,{headers:{cookie}});assert.equal(pending.status,200);const consentId=(await pending.text()).match(/name="consentId" value="([^"]+)"/)[1];
  const approved=await fetch(issuer+'/oauth/consent',{method:'POST',headers:{cookie,'x-csrf-token':csrf,'content-type':'application/json'},body:JSON.stringify({consentId,approve:true}),redirect:'manual'});assert.equal(approved.status,302);await transport.finishAuth(new URL(approved.headers.get('location')).searchParams.get('code'));await client.close();await connect();
  assert.equal((await client.listTools()).tools.length,20);const entered=await call('world_enter');assert.equal(entered.actor.actorId,'whale');assert.deepEqual(entered.permissions.scopes,['world:read','actor:control','build:write']);
  const before=await call('world_observe'),protectedBefore=before.entities.filter(e=>e.protected);assert.ok(protectedBefore.length);
  const exitSlot=listPortalSlots(before,'yard').find(s=>!s.occupied&&!s.blocked&&s.reachable)?.slotId;assert.ok(exitSlot,'Initial yard needs a usable portal slot for self-check');
  const ops=[{kind:'scene.create',ref:'room',templateId:'cozy_room_v1',name:'自检阅读室'},{kind:'scene.create',ref:'garden',templateId:'courtyard_v1',name:'自检花园'},{kind:'portal.link',from:{sceneId:'yard',slotId:exitSlot},to:{sceneId:'garden',slotId:'south'}},{kind:'portal.link',from:{sceneId:'garden',slotId:'east'},to:{sceneId:'room',slotId:'west'}},{kind:'entity.add',ref:'chair',sceneId:'room',type:'chair',position:[-1.5,0,-1.5],rotation:0,scale:[1,1,1]},{kind:'entity.add',ref:'bench',sceneId:'garden',type:'yardBench',position:[-3,0,3],rotation:0,scale:[1,1,1]}];
  const preview=await call('build_preview',{requestId:requestId(),baseRevision:before.layoutRevision,ops});assert.equal((await call('world_observe')).layoutRevision,before.layoutRevision);
  const applied=await call('build_apply',{requestId:requestId(),planId:preview.planId}),ids=applied.createdIds;
  const built=await call('world_observe');assert.deepEqual(built.entities.filter(e=>e.protected),protectedBefore);for(const id of [ids.room,ids.garden])assert.equal(built.scenes.find(s=>s.sceneId===id).status,'active');
  const acquire=()=>call('actor_take_control',{actorId:'whale',requestId:requestId()});let lease=await acquire();
  const move=async sceneId=>{lease=await acquire();const a=await call('actor_move',{actorId:'whale',leaseId:lease.leaseId,leaseVersion:lease.leaseVersion,requestId:requestId(),target:{sceneId}});await tickUntil(a.actionId);assert.equal((await call('action_get',{actionId:a.actionId})).result.sceneId,sceneId);};
  await move(ids.garden);await move(ids.room);
  lease=await acquire();const sit=await call('actor_interact',{actorId:'whale',leaseId:lease.leaseId,leaseVersion:lease.leaseVersion,requestId:requestId(),verb:'sit',targetId:ids.chair});await tickUntil(sit.actionId);assert.equal((await call('action_get',{actionId:sit.actionId})).status,'completed');
  await move(ids.garden);await move('yard');await move('bedroom');
  const events=await call('world_get_events',{limit:500});assert.ok(events.events.some(e=>e.kind==='actor.scene_changed'));await call('world_ack_events',{cursor:events.nextCursor,requestId:requestId()});
  lease=await acquire();const hunger=(await call('world_enter')).actor.needs.hunger;const eat=await call('actor_interact',{actorId:'whale',leaseId:lease.leaseId,leaseVersion:lease.leaseVersion,requestId:requestId(),verb:'eat'});
  await client.close();client=null;await tickUntil(eat.actionId);await app.close();app=null;
  await start();await connect();const resumed=await call('world_enter');assert.equal(resumed.lastConfirmedCursor,events.nextCursor);assert.ok(resumed.unreadCounts.total>0);assert.equal(resumed.actor.sceneId,'bedroom');assert.ok(resumed.actor.needs.hunger<hunger);assert.equal((await call('action_get',{actionId:eat.actionId})).status,'completed');assert.ok((await call('world_observe')).scenes.some(s=>s.sceneId===ids.room));
  const unread=await call('world_get_events',{afterCursor:resumed.lastConfirmedCursor,limit:500});assert.ok(unread.events.some(e=>e.kind==='action.completed'&&e.data.actionId===eat.actionId));await call('world_ack_events',{cursor:unread.nextCursor,requestId:requestId()});assert.equal((await call('world_enter')).lastConfirmedCursor,unread.nextCursor);
  lease=await acquire();const running=await call('actor_interact',{actorId:'whale',leaseId:lease.leaseId,leaseVersion:lease.leaseVersion,requestId:requestId(),verb:'eat'});
  const grants=await fetch(issuer+'/api/auth/grants',{headers:{cookie}});assert.equal(grants.status,200);const grant=(await grants.json()).grants.find(g=>g.clientId===registration.client_id);assert.ok(grant);
  const revoked=await fetch(issuer+`/api/auth/grants/${grant.grantId}/revoke`,{method:'POST',headers:{cookie,'x-csrf-token':csrf,'content-type':'application/json'},body:'{}'});assert.equal(revoked.status,200);await assert.rejects(()=>client.listTools());const final=app.worldService.readSnapshot('default');assert.equal(final.actions[running.actionId].status,'cancelled');assert.equal(final.actors[0].controller,null);
  return {transport:'streamable-http',authorization:'SDK OAuth discovery + PKCE + owner consent',tools:20,scenesCreated:2,completed:'create/link/furnish/travel/return/sit/offline eat/restart/cursor/revoke',limitations:'isolated loopback; deterministic real runtime ticks; no browser audio or third-party host compatibility claim'};
 }finally{await client?.close();await app?.close();await rm(directory,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await selfCheck(),null,2));}catch(error){console.error(error);process.exitCode=1;}}
