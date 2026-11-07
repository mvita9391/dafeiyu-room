import test from 'node:test';
import assert from 'node:assert/strict';
import {buildServer} from '../server/app.js';
test('owner entry has no pairing API or generated bootstrap secret',async()=>{const app=await buildServer({databasePath:':memory:',worldMode:true,startRuntime:false,auth:{localAccess:true}});try{assert.equal((await app.inject({method:'POST',url:'/api/auth/pair',payload:{code:'obsolete'}})).statusCode,404);assert.equal(app.auth.store.get('meta','bootstrap'),null);assert.equal(typeof app.auth.owner.pair,'undefined');}finally{await app.close();}});
test('legacy paired metadata permits new browser entry and restart preserves owner sessions, grants and world',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path');
 const dir=await mkdtemp(path.join(tmpdir(),'local-owner-persist-')),databasePath=path.join(dir,'fixture.sqlite'),issuer='http://127.0.0.1:5200';let app;
 const entry=()=>app.inject({method:'POST',url:'/api/auth/local-session',headers:{host:'127.0.0.1:5200',origin:issuer},payload:{}});
 try{
  app=await buildServer({databasePath,worldMode:true,startRuntime:false,auth:{localAccess:true,issuer}});
  app.auth.store.put('meta','paired',{at:1});app.auth.store.put('meta','bootstrap',{hash:'obsolete',expiresAt:1});
  const first=await entry();assert.equal(first.statusCode,200);const cookie=first.headers['set-cookie'].split(';')[0];
  const snapshot=app.worldService.readSnapshot('default'),grant=app.auth.store.create({actorIds:[snapshot.actors[0].actorId]});
  assert.equal((await entry()).statusCode,200);
  await app.close();app=await buildServer({databasePath,worldMode:true,startRuntime:false,auth:{localAccess:true,issuer}});
  assert.equal((await app.inject({url:'/api/auth/session',headers:{cookie}})).statusCode,200);
  assert.equal((await entry()).statusCode,200);assert.equal(app.auth.store.authorize(grant.accessToken).subjectId,grant.subjectId);
  assert.deepEqual(app.worldService.readSnapshot('default'),snapshot);
  assert.equal((await app.inject({method:'POST',url:'/api/auth/pair',payload:{code:'obsolete'}})).statusCode,404);
 }finally{await app?.close();await rm(dir,{recursive:true,force:true});}
});
