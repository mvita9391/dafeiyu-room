import test from 'node:test';
import assert from 'node:assert/strict';
import {buildServer} from '../server/app.js';
import http from 'node:http';
import {OwnerSession} from '../src/ui/owner-session.js';
const issuer='http://127.0.0.1:5200';
const fixture=auth=>buildServer({databasePath:':memory:',worldMode:true,startRuntime:false,auth:{issuer,...auth}});
test('local entry renews browser access after connection without resetting sessions or grants',async()=>{
 const app=await fixture({localAccess:true});await app.listen({host:'127.0.0.1',port:0});const url=`http://127.0.0.1:${app.server.address().port}`;
 const request=(path,headers={},body)=>new Promise((resolve,reject)=>{const req=http.request(url+path,{method:body?'POST':'GET',headers:{host:'127.0.0.1:5200',...headers,...(body?{'content-type':'application/json'}:{})}},r=>{let data='';r.on('data',v=>data+=v);r.on('end',()=>resolve({status:r.statusCode,headers:{get:key=>Array.isArray(r.headers[key])?r.headers[key][0]:r.headers[key]},json:async()=>JSON.parse(data)}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
 try{
 const paired=await app.inject({method:'POST',url:'/api/auth/local-session',headers:{host:new URL(issuer).host,origin:issuer},payload:{}});const oldCookie=paired.headers['set-cookie'].split(';')[0];const grant=app.auth.store.create({scopes:['world:read']});
 assert.equal((await request('/api/auth/status')).status,200);assert.equal((await (await request('/api/auth/status')).json()).localEntryAvailable,true);
 const entry=await request('/api/auth/local-session',{origin:issuer},{});assert.equal(entry.status,200);const cookie=entry.headers.get('set-cookie');assert.match(cookie,/HttpOnly; SameSite=Lax/);const csrf=(await entry.json()).csrfToken;
 assert.equal((await request('/api/auth/session',{cookie})).status,200);assert.equal((await request('/api/auth/session',{cookie:oldCookie})).status,200);assert.equal(app.auth.store.authorize(grant.accessToken).subjectId,grant.subjectId);
 assert.equal((await request('/api/auth/grants',{cookie},{})).status,403);assert.equal((await request('/api/auth/grants',{cookie,'x-csrf-token':csrf},{clientName:'local',scopes:['world:read']})).status,200);
 assert.equal((await request('/api/world/default/snapshot')).status,401);assert.equal((await request('/mcp',{},{})).status,401);
 assert.equal((await request('/api/auth/local-session',{'sec-fetch-site':'same-origin'},{})).status,200);
 for(const headers of [{},{origin:'http://evil.example'},{origin:'http://localhost:5200'},{origin:issuer,host:'evil.example'},{'sec-fetch-site':'same-site'},{origin:'null'},{origin:'https://127.0.0.1:5200'},{origin:issuer,'sec-fetch-site':'cross-site'}])assert.notEqual((await request('/api/auth/local-session',headers,{})).status,200,JSON.stringify(headers));
 assert.equal((await app.inject({method:'POST',url:'/api/auth/local-session',remoteAddress:'192.0.2.1',headers:{host:'127.0.0.1:5200',origin:issuer,'x-forwarded-for':'127.0.0.1'},payload:{}})).statusCode,401);
 }finally{await app.close();}
});
test('local entry is opt in and remote issuers never enable it behind a loopback proxy',async()=>{for(const auth of [{},{localAccess:true,issuer:'https://game.example'}]){const app=await fixture(auth);try{assert.equal((await app.inject('/api/auth/status')).json().localEntryAvailable,false);assert.equal((await app.inject({method:'POST',url:'/api/auth/local-session',headers:{host:new URL(auth.issuer||issuer).host,origin:auth.issuer||issuer},payload:{}})).statusCode,401);}finally{await app.close();}}});
test('owner read enters locally on missing cookie and reuses the resulting session',async()=>{let loggedIn=false;const calls=[];const session={csrfToken:'csrf',role:'owner'};const owner=new OwnerSession({request:async(url,options={})=>{calls.push(url);if(url==='/api/auth/status')return {ok:true,json:async()=>({localEntryAvailable:true})};if(url==='/api/auth/local-session'){assert.equal(options.credentials,'same-origin');loggedIn=true;return {ok:true,json:async()=>({})};}return {ok:loggedIn,status:loggedIn?200:401,json:async()=>session};}});assert.deepEqual(await owner.read(),session);assert.deepEqual(await owner.ensure(),session);assert.equal(calls.filter(p=>p==='/api/auth/local-session').length,1);});
test('remote owner read explains unsupported login without trying local entry',async()=>{const calls=[];const owner=new OwnerSession({request:async url=>{calls.push(url);return url==='/api/auth/status'?{ok:true,json:async()=>({localEntryAvailable:false})}:{ok:false,status:401};}});await assert.rejects(()=>owner.read(),/远程主人登录尚未支持/);assert.deepEqual(calls,['/api/auth/session','/api/auth/status']);});
test('initial discovery outage offers retry without a code form and recovers locally',async()=>{
 const previous=globalThis.document;let panel,attempts=0,loggedIn=false;
 class Element{constructor(){this.style={};this.nodes=new Map();}set innerHTML(html){this.html=html;}querySelector(selector){if(!this.nodes.has(selector))this.nodes.set(selector,new Element());return this.nodes.get(selector);}remove(){this.removed=true;}}
 globalThis.document={createElement:()=>panel=new Element(),body:{append(){}}};
 const session={role:'owner',csrfToken:'retry'};
 const owner=new OwnerSession({request:async url=>{if(url==='/api/auth/status'){if(++attempts===1)throw Error('offline');return {ok:true,json:async()=>({localEntryAvailable:true})};}if(url==='/api/auth/local-session'){loggedIn=true;return {ok:true};}return {ok:loggedIn,status:loggedIn?200:401,json:async()=>session};}});
 try{const pending=owner.ensure();await new Promise(resolve=>setImmediate(resolve));assert.match(panel.html,/data-retry/);assert.doesNotMatch(panel.html,/<form|<input|配对/);assert.equal(typeof owner.pair,'undefined');assert.equal(typeof panel.querySelector('[data-retry]').onclick,'function');await panel.querySelector('[data-retry]').onclick();assert.deepEqual(await pending,session);assert.equal(attempts,2);assert.equal(panel.removed,true);}finally{globalThis.document=previous;}
});
