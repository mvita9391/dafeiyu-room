import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {migrateWorld} from '../server/storage/migrations.js';
import {defaultManifest} from '../shared/world/default-manifest.js';
import {WorldService} from '../server/world/service.js';
import {createBuildHandlers} from '../server/world/build.js';

test('published baseline initializes four scenes with the frozen current furniture transforms',()=>{
 const db=new DatabaseSync(':memory:');try{migrateWorld(db);const s=JSON.parse(db.prepare('SELECT snapshot FROM worlds').get().snapshot);assert.deepEqual(s.scenes.map(x=>x.sceneId),['bedroom','living','yard','convenience-store']);assert.equal(s.entities.length,defaultManifest.scenes.flatMap(s=>s.entities).length);assert.deepEqual(s.entities.find(x=>x.sceneId==='bedroom'&&x.type==='lamp').position,[2.8156056539568857,0,-2.9751997140431956]);assert.deepEqual(s.entities.find(x=>x.type==='yardPool').position,[12.61,0,9.59]);assert.equal(s.entities.find(x=>x.type==='yardFarm').plots.length,9);assert.equal(s.actors[0].sceneId,'bedroom');assert.equal(s.actors[0].controller,null);assert.equal(s.actors[0].position[1],0);}finally{db.close();}
});
test('AI construction stays in its save; restarting with newer defaults never overwrites it',()=>{
 const file=new URL('../shared/world/starter-world.json',import.meta.url);const before=readFileSync(file,'utf8');const db=new DatabaseSync(':memory:');try{migrateWorld(db);const svc=new WorldService(db,{handlers:createBuildHandlers()});const p={subjectId:'agent',role:'agent',worldIds:['default'],actorIds:['whale'],scopes:['world:read','build:write']};let n=0;const run=(kind,payload)=>svc.execute(p,{worldId:'default',requestId:`starter-${++n}`,kind,payload});const plan=run('build.preview',{baseRevision:0,ops:[{kind:'scene.create',ref:'ai-room',templateId:'cozy_room_v1',name:'AI的新房间'}]});run('build.apply',{planId:plan.planId});const saved=db.prepare('SELECT snapshot FROM worlds').get().snapshot;const changed=structuredClone(defaultManifest);changed.scenes[0].name='新版默认卧室';assert.equal(migrateWorld(db,{defaultManifest:changed}).imported,false);assert.equal(db.prepare('SELECT snapshot FROM worlds').get().snapshot,saved);assert.equal(JSON.parse(saved).scenes.length,5);assert.equal(readFileSync(file,'utf8'),before);}finally{db.close();}
});
test('an old save can restore the published courtyard without changing other scenes or farm plots',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const old=structuredClone(defaultManifest);
  const courtyard=old.scenes.find(scene=>scene.sceneId==='yard');
  courtyard.entities.find(entity=>entity.type==='yardPool').position=[5.72,0,-5.59];
  courtyard.entities.find(entity=>entity.type==='yardFarm').position=[-5.8,0,-5.45];
  migrateWorld(db,{defaultManifest:old});
  const service=new WorldService(db,{handlers:createBuildHandlers()});
  const owner={subjectId:'owner',role:'owner',worldIds:['default'],scopes:['build:write']};
  const before=service.readSnapshot('default');
  const command={worldId:'default',requestId:'restore-courtyard',kind:'build.resetScene',payload:{sceneId:'yard',baseRevision:before.layoutRevision}};
  assert.throws(()=>service.execute({...owner,role:'agent'},command),/UNAUTHORIZED/);
  const result=service.execute(owner,command);
  assert.deepEqual(service.execute(owner,command),result);
  const after=service.readSnapshot('default');
  const courtyardLayout=after.entities.filter(entity=>entity.sceneId==='yard')
   .map(({type,position,rotation,scale})=>({type,position,rotation,scale}));
  assert.deepEqual(courtyardLayout,defaultManifest.scenes.find(scene=>scene.sceneId==='yard').entities);
  assert.deepEqual(after.entities.filter(entity=>entity.sceneId!=='yard'),before.entities.filter(entity=>entity.sceneId!=='yard'));
  assert.deepEqual(after.portals,before.portals);
  const oldFarm=before.entities.find(entity=>entity.type==='yardFarm'),farm=after.entities.find(entity=>entity.type==='yardFarm');
  assert.equal(farm.entityId,oldFarm.entityId);
  assert.deepEqual(farm.plots,oldFarm.plots);
  assert.notEqual(farm.protectionFingerprint,oldFarm.protectionFingerprint);
  assert.throws(()=>service.execute(owner,{...command,requestId:'stale-reset'}),/REVISION_CONFLICT/);
 }finally{db.close();}
});
test('publisher whitelists only layout fields and excludes runtime identity, credentials and actor state',async()=>{
 const {createStarterWorld}=await import('../server/world/starter.js');const scenes=defaultManifest.scenes.map(s=>({...s,status:'active',editLock:{subjectId:'SECRET'},legacyRevision:88}));const snapshot={worldId:'default',scenes,entities:scenes.flatMap(s=>s.entities.map(e=>({...e,sceneId:s.sceneId,entityId:'private-id',subjectId:'SECRET'}))),portals:defaultManifest.portals,actors:[{controller:'SECRET'}],grants:'SECRET',events:'SECRET'};const seed=createStarterWorld(snapshot);assert.equal(seed.scenes.length,4);assert.ok(!JSON.stringify(seed).includes('SECRET'));assert.ok(!JSON.stringify(seed).includes('private-id'));assert.equal(seed.actors,undefined);assert.equal(seed.scenes[0].editLock,undefined);assert.equal(seed.scenes[0].entities[0].sceneId,undefined);
});
test('release command reads a separate database without modifying its save',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync}=await import('node:child_process');const dir=mkdtempSync(join(tmpdir(),'starter-release-'));try{const file=join(dir,'save.sqlite'),out=join(dir,'starter.json');const db=new DatabaseSync(file);migrateWorld(db);const before=db.prepare('SELECT snapshot FROM worlds').get().snapshot;db.close();execFileSync(process.execPath,['scripts/publish-starter-world.mjs','--database',file,'--output',out],{cwd:new URL('../',import.meta.url),stdio:'pipe'});const after=new DatabaseSync(file,{readOnly:true});try{assert.equal(after.prepare('SELECT snapshot FROM worlds').get().snapshot,before);}finally{after.close();}const seed=JSON.parse(readFileSync(out,'utf8'));assert.equal(seed.scenes.length,4);assert.equal(seed.actors,undefined);assert.equal(seed.scenes.flatMap(s=>s.entities).length,defaultManifest.scenes.flatMap(s=>s.entities).length);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('release exports the four-scene boundary from a save containing private imported scenes',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync}=await import('node:child_process');const dir=mkdtempSync(join(tmpdir(),'starter-private-'));
 try{const file=join(dir,'save.sqlite'),out=join(dir,'starter.json'),db=new DatabaseSync(file);migrateWorld(db);const snapshot=JSON.parse(db.prepare('SELECT snapshot FROM worlds').get().snapshot);snapshot.scenes.push({sceneId:'private-town',templateId:'local_private_v1',status:'active'});snapshot.entities.push({sceneId:'private-town',type:'town-private-model'});const before=JSON.stringify(snapshot);db.prepare('UPDATE worlds SET snapshot=?').run(before);db.close();execFileSync(process.execPath,['scripts/publish-starter-world.mjs','--database',file,'--output',out],{stdio:'pipe'});const text=readFileSync(out,'utf8');assert.equal(JSON.parse(text).scenes.length,4);assert.ok(!text.includes('private'));const saved=new DatabaseSync(file,{readOnly:true});try{assert.equal(saved.prepare('SELECT snapshot FROM worlds').get().snapshot,before);}finally{saved.close();}}finally{rmSync(dir,{recursive:true,force:true});}
});

test('fresh game with no local pack loads the frozen layouts and serves their bundled models',async()=>{
 const {buildServer}=await import('../server/app.js');
 const {createHash}=await import('node:crypto');
 const app=await buildServer({databasePath:':memory:',worldMode:true,startRuntime:false,localAssetDir:null,auth:{localAccess:true}});
 try{
  const fresh=app.worldService.readSnapshot('default');
  for(const scene of defaultManifest.scenes){
   const objects=fresh.entities.filter(entity=>entity.sceneId===scene.sceneId)
    .map(({type,position,rotation,scale})=>({type,position,rotation,scale}));
   assert.deepEqual(objects,scene.entities);
  }
  assert.deepEqual(fresh.portals,defaultManifest.portals);
  const owner=await app.inject({method:'POST',url:'/api/auth/local-session',
   headers:{host:'127.0.0.1:5200',origin:'http://127.0.0.1:5200'},payload:{}});
  const headers={cookie:String(owner.headers['set-cookie']).split(';')[0]};
  const manifest=(await app.inject({url:'/api/local-assets/manifest',headers})).json();
  const required=new Set(defaultManifest.scenes.flatMap(scene=>scene.entities).map(entity=>entity.type).filter(type=>type.startsWith('pf-')));
  assert.ok(required.size>0);
  for(const type of required){
   const asset=manifest.assets.find(model=>model.type===type);
   assert.ok(asset);
   const model=await app.inject({url:'/api/local-assets/models/'+asset.file.split('/').at(-1),headers});
   assert.equal(model.statusCode,200);
   assert.equal(createHash('sha256').update(model.rawPayload).digest('hex'),asset.sha256);
   assert.equal((await app.inject({url:'/api/local-assets/'+asset.thumbnail,headers})).statusCode,200);
  }
 }finally{await app.close();}
});
