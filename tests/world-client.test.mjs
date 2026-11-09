import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WorldClient} from '../src/core/world-client.js';
import {buildServer} from '../server/app.js';
test('client connects with real server, dispatches one owner lease and replays cursor events without duplicates',async()=>{
 const app=await buildServer({databasePath:':memory:',worldMode:true,auth:{localAccess:true,issuer:'http://127.0.0.1:5200'}});
 let cookie='';const request=async(url,opts={})=>{const r=await app.inject({method:opts.method||'GET',url,headers:{...opts.headers,...(cookie?{cookie}:{})},payload:opts.body});if(r.headers['set-cookie'])cookie=String(r.headers['set-cookie']).split(';')[0];return {ok:r.statusCode<400,status:r.statusCode,json:async()=>r.json()};};
 try{const paired=await request('/api/auth/local-session',{method:'POST',headers:{'content-type':'application/json',host:'127.0.0.1:5200',origin:'http://127.0.0.1:5200'},body:'{}'});assert.equal(paired.status,200);const {csrfToken}=await paired.json();const client=new WorldClient({request,csrfToken,pollMs:0});let events=[];client.onEvent(e=>events.push(e.cursor));await client.connect('default');assert.equal(client.snapshot.scenes.length,4);await client.dispatch({kind:'control.takeover',payload:{actorId:'whale'}});await client.sync();const count=events.length;await client.sync();assert.equal(events.length,count);assert.ok(count>0);assert.equal(client.snapshot.actors[0].controller.subjectId,'local-owner');client.dispose();}finally{await app.close();}
});
test('cursor gap recovers canonical snapshot and does not apply duplicate facts',async()=>{let reads=0;const request=async url=>({ok:true,json:async()=>url.includes('snapshot')?(reads++,{worldId:'default',scenes:[],entities:[],actors:[],portals:[],layoutRevision:reads}):{events:[{cursor:4,kind:'build.applied',data:{}}],nextCursor:4,hasMore:false}});const client=new WorldClient({request,pollMs:0});await client.connect('default');const first=reads;await client.sync();assert.ok(reads>first);assert.equal(client.cursor,4);let seen=0;client.onEvent(()=>seen++);await client.sync();assert.equal(seen,0);client.dispose();});
test('state polling is authenticated and lightweight; editor lock is owner-only and blocks other builders',async()=>{const app=await buildServer({databasePath:':memory:',worldMode:true,startRuntime:false,auth:{localAccess:true,issuer:'http://127.0.0.1:5200'}});try{assert.equal((await app.inject('/api/world/default/state')).statusCode,401);const pair=await app.inject({method:'POST',url:'/api/auth/local-session',headers:{host:new URL('http://127.0.0.1:5200').host,origin:'http://127.0.0.1:5200'},payload:{}});const headers={cookie:pair.headers['set-cookie'].split(';')[0],'x-csrf-token':pair.json().csrfToken};const state=await app.inject({url:'/api/world/default/state',headers});assert.equal(state.statusCode,200);assert.ok(state.json().actors);assert.equal(state.json().entities,undefined);const cmd=(kind,payload)=>app.inject({method:'POST',url:'/api/world/default/commands',headers,payload:{worldId:'default',requestId:crypto.randomUUID(),kind,payload}});assert.equal((await cmd('build.editLock',{sceneId:'bedroom',locked:true})).statusCode,200);assert.equal(app.worldService.readSnapshot('default').scenes[0].editLock.subjectId,'local-owner');const plan={kind:'entity.transform',entityId:'bedroom-2',position:[-2.52,0,-2.32],rotation:0,scale:[1,1,1]};assert.throws(()=>app.worldService.execute({subjectId:'agent',role:'agent',worldIds:['default'],scopes:['build:write']},{worldId:'default',requestId:'blocked',kind:'build.preview',payload:{baseRevision:app.worldService.readSnapshot('default').layoutRevision,ops:[plan]}}),/SCENE_EDIT_LOCKED/);assert.equal((await cmd('build.editLock',{sceneId:'bedroom',locked:false})).statusCode,200);}finally{await app.close();}});
test('release intent during delayed movement submission is drained after move without polling pose',async()=>{const {ActionDispatcher}=await import('../src/core/action-dispatcher.js');let release;const gate=new Promise(r=>release=r),calls=[];const queue=new ActionDispatcher(async kind=>{if(kind==='move')await gate;calls.push(kind);});const move=queue.submit('move');const stop=queue.submit('cancel');release();await Promise.all([move,stop]);assert.deepEqual(calls,['move','cancel']);assert.equal(queue.busy,false);});
test('a delayed pre-takeover state poll cannot replace a newer canonical snapshot',async()=>{let release;const canonical={worldId:'default',layoutRevision:1,topologyRevision:0,scenes:[],entities:[],portals:[],actors:[{actorId:'whale',controller:{leaseVersion:2}}],actions:{}};const client=new WorldClient({pollMs:0,request:async url=>{if(url.endsWith('/state'))return await new Promise(r=>release=()=>r({ok:true,json:async()=>({...canonical,actors:[{actorId:'whale',controller:{leaseVersion:1}}]})}));return {ok:true,json:async()=>canonical};}});client.worldId='default';client.snapshot={...canonical};const old=client.refreshState();await client.refresh();release();await old;assert.equal(client.snapshot.actors[0].controller.leaseVersion,2);client.dispose();});
test('a timed-out command abandons the dead socket and reuses its request ID over HTTP',async()=>{
 const sent=[];
 const ws={close(){this.closed=true;}};
 const client=new WorldClient({pollMs:0,request:async(_url,options)=>{
  sent.push(JSON.parse(options.body));
  return {ok:true,json:async()=>({status:'completed'})};
 }});
 Object.assign(client,{worldId:'default',socket:ws,socketReady:true});
 client.socketCall=async frame=>{sent.push(frame.command);throw Error('SOCKET_TIMEOUT');};
 try{
  const result=await client.dispatch({kind:'actor.teleport',payload:{actorId:'whale',sceneId:'yard'}},{refresh:false});
  assert.equal(result.status,'completed');
  assert.equal(ws.closed,true);
  assert.deepEqual(sent[0],sent[1]);
  assert.equal(client.socketReady,false);
 }finally{client.dispose();}
});

test('an HTTP network failure reports offline and polling restores the connection',async()=>{
 const snapshot={worldId:'default',cursor:0,layoutRevision:0,topologyRevision:0,actors:[],actions:{}};
 let reachable=true;
 const client=new WorldClient({pollMs:0,transport:'http',request:async url=>{
  if(!reachable)throw TypeError('Failed to fetch');
  return {ok:true,json:async()=>url.includes('/events?')?{events:[],nextCursor:0}:snapshot};
 }});
 try{
  await client.connect('default');
  reachable=false;
  await assert.rejects(()=>client.dispatch({kind:'actor.teleport',payload:{actorId:'whale',sceneId:'yard'}}),/Failed to fetch/);
  assert.equal(client.connectionStatus,'offline');
  reachable=true;
  await client.sync();
  assert.equal(client.connectionStatus,'connected');
 }finally{client.dispose();}
});
