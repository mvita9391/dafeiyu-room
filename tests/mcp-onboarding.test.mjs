import test from 'node:test';
import assert from 'node:assert/strict';
import {buildServer} from '../server/app.js';
import {connectionSummary,validateMcpEndpoint} from '../src/ui/agent-connect.js';
const issuer='http://127.0.0.1:5200';
const options={databasePath:':memory:',worldMode:true,startRuntime:false,auth:{localAccess:true}};
test('metadata exposes only configured address; grant names require owner; revoke is CSRF protected',async()=>{
 const app=await buildServer(options);try{
 const before=app.worldService.readSnapshot('default');
 const g=app.auth.store.create({clientName:'私人朋友',actorIds:[before.actors[0].actorId]});
 const publicResult=await app.inject('/api/integrations/mcp');assert.equal(publicResult.statusCode,200);
 const meta=publicResult.json();assert.equal(meta.endpoint,'http://127.0.0.1:5200/mcp');assert.equal(meta.reachability.kind,'local');assert.deepEqual(meta.connectedAgents,[]);assert.equal(meta.health.protocol,'awaiting_client');
 assert.ok(!publicResult.body.includes('私人朋友'));assert.ok(!publicResult.body.includes(g.accessToken));
 const paired=await app.inject({method:'POST',url:'/api/auth/local-session',headers:{host:new URL(issuer).host,origin:issuer},payload:{}});const cookie=paired.headers['set-cookie'].split(';')[0],csrf=paired.json().csrfToken;
 const data=(await app.inject({url:'/api/integrations/mcp',headers:{cookie}})).json();assert.equal(data.connectedAgents[0].status,'authorized');assert.equal(data.connectedAgents[0].clientName,'私人朋友');assert.ok(!JSON.stringify(data).includes(g.subjectId));
 assert.equal(validateMcpEndpoint(data.endpoint),meta.endpoint);assert.deepEqual(app.worldService.readSnapshot('default'),before);
 assert.equal((await app.inject({method:'POST',url:`/api/auth/grants/${g.grantId}/revoke`,headers:{cookie},payload:{}})).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:`/api/auth/grants/${g.grantId}/revoke`,headers:{cookie,'x-csrf-token':csrf},payload:{}})).statusCode,200);assert.throws(()=>app.auth.store.authorize(g.accessToken,'actor:control'),/UNAUTHORIZED/);
 assert.equal((await app.inject({url:'/api/integrations/mcp',headers:{cookie}})).json().connectedAgents[0].status,'revoked');
 }finally{await app.close();}
});
test('remote address comes from configured HTTPS issuer and never claims network verification',async()=>{const app=await buildServer({...options,auth:{...options.auth,issuer:'https://world.example'}});try{const data=(await app.inject('/api/integrations/mcp')).json();assert.equal(data.endpoint,'https://world.example/mcp');assert.equal(data.reachability.kind,'remote');assert.equal(data.reachability.verified,false);assert.equal((await app.inject('/__private/secret.glb')).statusCode,404);}finally{await app.close();}});
test('UI distinguishes offline, incompatible protocol, owner expiry and pending protocol verification',()=>{assert.match(connectionSummary(null),/离线/);assert.match(connectionSummary({health:{service:'ready',protocol:'incompatible'}}),/不兼容/);assert.match(connectionSummary({health:{service:'ready',protocol:'awaiting_client',authorization:'owner_required'}}),/主人会话/);assert.match(connectionSummary({health:{service:'ready',protocol:'awaiting_client',authorization:'owner'}}),/待客户端验证/);});
test('configuration rejects credentials and malformed endpoint',()=>{for(const endpoint of ['http://localhost/mcp?token=secret','https://user:pass@host/mcp','javascript:alert(1)'])assert.throws(()=>validateMcpEndpoint(endpoint),/地址/);});
test('mock DOM panel renders only active grants, copies JSON and revokes using owner CSRF',async()=>{
 const {AgentConnect}=await import('../src/ui/agent-connect.js');
 class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.style={};this.map={};}
 append(...els){this.children.push(...els);}remove(){this.removed=true;}replaceChildren(...els){this.children=els;}setAttribute(){}focus(){}select(){}
 set innerHTML(value){this.html=value;for(const key of ['section','[data-close]','[data-refresh]','[data-connect]','[data-status]','[data-agents]','[data-issued-key]','[data-key-setup]','[data-new-key]','[data-client-name]','[data-name-error]','input'])this.map[key]=new Element('div');}
 querySelector(s){return this.map[s];}querySelectorAll(){return []}
 }
 const document={head:new Element('head'),body:new Element('body'),createElement:t=>new Element(t),addEventListener(){},removeEventListener(){}};
 const calls=[],data={endpoint:'http://127.0.0.1:5200/mcp',health:{service:'ready',protocol:'awaiting_client',authorization:'owner'},reachability:{message:'仅限本机'},connectedAgents:[{grantId:'test-grant',clientName:'<img src=x onerror=alert(1)>',scopes:['world:read'],status:'authorized'}]};let copied;
 const panel=new AgentConnect({document,clipboard:{writeText:async value=>copied=value},session:{read:async()=>({csrfToken:'fixture-csrf'})},request:async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>data};}});
 await panel.open();assert.doesNotMatch(panel.panel.html,/agent-endpoint|data-copy|复制地址/);assert.equal(panel.panel.querySelector('[data-key-setup]').hidden,false);assert.equal(calls.length,1);assert.equal(panel.panel.querySelector('[data-connect]').hidden,true);assert.match(panel.style.textContent,/\[hidden\]\{display:none!important\}/);
 await panel.panel.querySelector('[data-new-key]').onclick();
 assert.equal(panel.panel.querySelector('[data-name-error]').hidden,false);
 assert.match(panel.panel.querySelector('[data-name-error]').textContent,/请输入/);
 assert.equal(calls.length,1);
 panel.panel.querySelector('[data-client-name]').value='测试';
 panel.panel.querySelector('[data-client-name]').oninput();
 assert.equal(panel.panel.querySelector('[data-name-error]').hidden,true);
 const row=panel.panel.querySelector('[data-agents]').children[0];assert.equal(row.children[0].children[0].textContent,data.connectedAgents[0].clientName);
 await row.children[1].onclick();assert.equal(calls[1].url,'/api/auth/grants/test-grant/revoke');assert.equal(calls[1].init.headers['x-csrf-token'],'fixture-csrf');assert.equal(calls[1].init.body,'{}');assert.equal(calls[2].url,'/api/integrations/mcp');
 await panel.panel.querySelector('[data-refresh]').onclick();assert.match(panel.panel.querySelector('[data-status]').textContent,/状态已刷新/);assert.equal(panel.panel.querySelector('[data-refresh]').disabled,false);
 data.connectedAgents[0].status='revoked';
 data.connectedAgents.push({clientName:'expired',status:'expired'});
 await panel.refresh();
 assert.deepEqual(panel.panel.querySelector('[data-agents]').children.map(item=>item.textContent),['还没有伙伴，生成连接 JSON 即可开始连接。']);
 data.health.authorization='owner_required';await panel.refresh();assert.equal(panel.panel.querySelector('[data-connect]').hidden,false);
 panel.session.read=async()=>{throw Error('连接失败测试');};await panel.panel.querySelector('[data-connect]').onclick();assert.equal(panel.panel.querySelector('[data-status]').textContent,'连接失败测试');assert.equal(panel.panel.querySelector('[data-connect]').disabled,false);
 panel.session.read=async()=>{data.health.authorization='owner';return {};};await panel.panel.querySelector('[data-connect]').onclick();assert.equal(panel.panel.querySelector('[data-connect]').hidden,true);assert.match(panel.panel.querySelector('[data-status]').textContent,/主人会话已连接/);
 panel.showApiKey(panel.panel,'dafeiyu_fixture',Date.now()+1000,data.endpoint);
 const keySlot=panel.panel.querySelector('[data-issued-key]');
 const config=keySlot.children.find(item=>item.tagName==='textarea');
 assert.equal(keySlot.hidden,false);
 assert.equal(config.readOnly,true);
 assert.deepEqual(JSON.parse(config.value),{url:data.endpoint,headers:{Authorization:'Bearer dafeiyu_fixture'}});
 await keySlot.children[3].children[0].onclick();
 assert.equal(copied,config.value);
 panel.panel.querySelector('[data-close]').onclick();assert.equal(panel.panel,null);panel.dispose();
});
test('OAuth consent explains local connection and world permissions in Chinese',async()=>{
 const {createHash}=await import('node:crypto');const app=await buildServer(options);try{
 const client=(await app.inject({method:'POST',url:'/oauth/register',payload:{client_name:'<朋友>',redirect_uris:['http://127.0.0.1:9999/cb']}})).json();const q=new URLSearchParams({client_id:client.client_id,redirect_uri:client.redirect_uris[0],response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update('x'.repeat(43)).digest('base64url'),scope:'world:read actor:control build:write'});
 const anonymous=await app.inject('/oauth/authorize?'+q);assert.equal(anonymous.statusCode,401);assert.match(anonymous.body,/请先连接本机游戏/);assert.match(anonymous.headers['content-security-policy'],/frame-ancestors 'none'/);
 const paired=await app.inject({method:'POST',url:'/api/auth/local-session',headers:{host:new URL(issuer).host,origin:issuer},payload:{}}),cookie=paired.headers['set-cookie'].split(';')[0];const consent=await app.inject({url:'/oauth/authorize?'+q,headers:{cookie}});assert.equal(consent.statusCode,200);assert.match(consent.body,/场景建设/);assert.doesNotMatch(consent.body,/message:|voice:/);assert.match(consent.body,/&lt;朋友&gt;/);assert.match(consent.body,/name="csrfToken"/);
 }finally{await app.close();}
});

test('owner issues and rotates a Bearer key tied to an existing grant',async()=>{
 const app=await buildServer(options);
 try{
  const clock=app.auth.store.clock();
  const grant=app.auth.store.create({clientName:'keyed',actorIds:['whale'],scopes:['world:read','actor:control'],expiresAt:clock+5000});
  const session=await app.inject({method:'POST',url:'/api/auth/local-session',headers:{host:'127.0.0.1:5200',origin:'http://127.0.0.1:5200'},payload:{}});
  const cookie=String(session.headers['set-cookie']).split(';')[0];
  const headers={cookie,'x-csrf-token':session.json().csrfToken};
  const url=`/api/auth/grants/${grant.grantId}/key`;
  const issue=()=>app.inject({method:'POST',url,headers,payload:{}});
  assert.equal((await app.inject({method:'POST',url,headers:{cookie},payload:{}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,headers:{authorization:`Bearer ${grant.accessToken}`},payload:{}})).statusCode,401);
  const first=await issue();
  assert.equal(first.statusCode,200);
  assert.equal(first.headers['cache-control'],'no-store');
  const {apiKey,expiresAt}=first.json();
  assert.match(apiKey,/^dafeiyu_[\w-]+$/);
  assert.equal(expiresAt,grant.expiresAt);
  assert.deepEqual(app.auth.store.authenticate(apiKey).scopes,grant.scopes);
  assert.throws(()=>app.auth.store.authorize(apiKey,'build:write'),/UNAUTHORIZED/);
  const list=(await app.inject({url:'/api/integrations/mcp',headers:{cookie}})).json();
  assert.equal(list.connectedAgents[0].hasApiKey,true);
  assert.ok(!JSON.stringify(list).includes(apiKey));
  const second=(await issue()).json().apiKey;
  assert.throws(()=>app.auth.store.authenticate(apiKey),/UNAUTHORIZED/);
  assert.equal(app.auth.store.authenticate(second).grantId,grant.grantId);
  assert.equal(app.auth.store.authenticate(grant.accessToken).grantId,grant.grantId);
  app.auth.store.clock=()=>grant.expiresAt;
  assert.throws(()=>app.auth.store.authenticate(second),/UNAUTHORIZED/);
  assert.equal((await issue()).statusCode,400);
  app.auth.store.clock=()=>clock;
  app.auth.store.revoke(grant.grantId);
  assert.throws(()=>app.auth.store.authenticate(second),/UNAUTHORIZED/);
  assert.equal((await issue()).statusCode,400);
 }finally{await app.close();}
});

test('owner can create a key-only connection without an existing grant or OAuth client',async()=>{
 const app=await buildServer(options);
 try{
  const host='127.0.0.1:5200';
  const owner=await app.inject({method:'POST',url:'/api/auth/local-session',headers:{host,origin:'http://'+host},payload:{}});
  const cookie=String(owner.headers['set-cookie']).split(';')[0];
  const issue=(headers,payload)=>app.inject({method:'POST',url:'/api/auth/grants/key',headers,payload});
  const headers={cookie,'x-csrf-token':owner.json().csrfToken};
  assert.equal((await issue({cookie},{clientName:'测试连接'})).statusCode,403);
  assert.equal((await issue(headers,{clientName:'测试连接',actorIds:['other']})).statusCode,400);
  assert.equal((await issue(headers,{})).statusCode,400);
  assert.equal((await issue(headers,{clientName:'   '})).json().error,'CLIENT_NAME_REQUIRED');
  const response=await issue(headers,{clientName:' 测试连接 '});
  assert.equal(response.statusCode,201);
  assert.equal(response.headers['cache-control'],'no-store');
  const {grantId,apiKey,expiresAt}=response.json();
  const principal=app.auth.store.authorize(apiKey,'actor:control','default','whale');
  assert.equal(principal.grantId,grantId);
  assert.equal(principal.clientName,'测试连接');
  assert.equal(expiresAt,principal.expiresAt);
  for(const kind of ['client','token','refresh'])assert.deepEqual(app.auth.store.list(kind),[]);
  app.auth.store.revoke(grantId);
  assert.throws(()=>app.auth.store.authenticate(apiKey),/UNAUTHORIZED/);
 }finally{await app.close();}
});

test('saved connection can be viewed by the owner after restart and disappears on revocation',async()=>{
 const {mkdtemp,rm,stat}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'dafeiyu-json-vault-'));
 const filename=join(dir,'game.sqlite');
 let app;
 try{
  app=await buildServer({...options,databasePath:filename});
  const local=await app.inject({method:'POST',url:'/api/auth/local-session',headers:{host:'127.0.0.1:5200',origin:issuer},payload:{}});
  const cookie=String(local.headers['set-cookie']).split(';')[0];
  const headers={cookie,'x-csrf-token':local.json().csrfToken};
  const issued=await app.inject({method:'POST',url:'/api/auth/grants/key',headers,payload:{clientName:'测试 agent'}});
  assert.equal(issued.statusCode,201);
  const {apiKey,grantId}=issued.json();
  const view=`/api/auth/grants/${grantId}/key/view`;
  const record=app.auth.store.list('api_key')[0];
  assert.ok(record.sealed);
  assert.equal(JSON.stringify(record).includes(apiKey),false);
  if(process.platform!=='win32')assert.equal((await stat(filename+'.mcp-json.key')).mode&0o777,0o600);
  await app.close();
  app=await buildServer({...options,databasePath:filename});
  assert.equal((await app.inject({method:'POST',url:view,headers:{cookie},payload:{}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:view,headers:{authorization:`Bearer ${apiKey}`},payload:{}})).statusCode,401);
  const reopened=await app.inject({method:'POST',url:view,headers,payload:{}});
  assert.equal(reopened.statusCode,200);
  assert.equal(reopened.headers['cache-control'],'no-store');
  assert.equal(reopened.json().apiKey,apiKey);
  const grants=(await app.inject({url:'/api/integrations/mcp',headers:{cookie}})).json().connectedAgents;
  assert.equal(grants[0].canViewJson,true);
  assert.equal(JSON.stringify(grants).includes(apiKey),false);
  app.auth.store.revoke(grantId);
  assert.equal((await app.inject({method:'POST',url:view,headers,payload:{}})).statusCode,400);
  assert.equal(app.auth.store.list('api_key').length,0);
 }finally{await app?.close();await rm(dir,{recursive:true,force:true});}
});
