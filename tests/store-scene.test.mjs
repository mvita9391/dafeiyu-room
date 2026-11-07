import test from 'node:test';import assert from 'node:assert/strict';import {getTemplate} from '../shared/world/templates.js';import {cameraPolicyFor} from '../shared/world/policies.js';import {STORE_SCENE} from '../shared/world/store-scene.js';import {getCatalogEntry} from '../shared/world/catalog.js';
test('night street has an outdoor camera and every store asset is a validated catalog entry',()=>{const t=getTemplate(STORE_SCENE.templateId);assert.equal(t.kind,'outdoor');assert.equal(cameraPolicyFor(t.templateId).horizontalRotation,true);for(const e of STORE_SCENE.entities){const entry=getCatalogEntry(e.type);assert.ok(entry.sceneKinds.includes('outdoor'));assert.ok(entry.footprint.width>0);}});
import {DatabaseSync} from 'node:sqlite';import {migrateWorld} from '../server/storage/migrations.js';import {WorldService} from '../server/world/service.js';import {installStoreScene} from '../server/world/store-feature.js';import {STORE_SCENE_ID} from '../shared/world/store-scene.js';import {sceneRoute,walkable} from '../shared/world/navigation.js';
test('the expanded street has walkable parking and plaza aisles, solid props, and reachable exits',async()=>{
 const {findPath}=await import('../shared/world/navigation.js');
 const db=new DatabaseSync(':memory:');
 try{
  migrateWorld(db);
  const snapshot=new WorldService(db).readSnapshot('default');
  const template=getTemplate(STORE_SCENE.templateId);
  for(const destination of [[10,0,7.6],[9.8,0,-2.4],...template.portalSlots.map(slot=>slot.landing)]){
   assert.deepEqual(findPath(snapshot,STORE_SCENE_ID,template.spawn,destination).at(-1),destination);
  }
  assert.equal(walkable(snapshot,STORE_SCENE_ID,[9.1,0,10.65]),false);
  assert.equal(walkable(snapshot,STORE_SCENE_ID,[6.95,0,4.95]),false);
 }finally{db.close();}
});
test('upgrade adds one store and rewires living door once, preserving all prior furniture and subsequent edits',()=>{
 const db=new DatabaseSync(':memory:');try{migrateWorld(db);const service=new WorldService(db);service.transactRuntime('default',({snapshot:s})=>{s.scenes=s.scenes.filter(x=>x.sceneId!==STORE_SCENE_ID);s.entities=s.entities.filter(x=>x.sceneId!==STORE_SCENE_ID);s.portals=s.portals.filter(x=>x.fromSceneId!==STORE_SCENE_ID&&x.toSceneId!==STORE_SCENE_ID);s.portals.push({portalId:'legacy-living-yard',kind:'legacy',fromSceneId:'living',toSceneId:'yard'});});
 const before=structuredClone(service.readSnapshot('default').entities);assert.equal(installStoreScene(service).installed,true);let s=service.readSnapshot('default');assert.deepEqual(s.entities.filter(x=>x.sceneId!==STORE_SCENE_ID),before);assert.equal(sceneRoute(s,'living',STORE_SCENE_ID).length,1);assert.equal(sceneRoute(s,STORE_SCENE_ID,'living').length,1);assert.ok(!s.portals.some(p=>p.fromSceneId==='living'&&p.toSceneId==='yard'));for(const leg of sceneRoute(s,'living',STORE_SCENE_ID)){assert.ok(walkable(s,leg.fromSceneId,leg.departure));assert.ok(walkable(s,leg.toSceneId,leg.landing));}
 service.transactRuntime('default',({snapshot:s})=>{s.entities.find(e=>e.sceneId===STORE_SCENE_ID).rotation=.1;});const edited=JSON.stringify(service.readSnapshot('default'));assert.equal(installStoreScene(service).installed,false);assert.equal(JSON.stringify(service.readSnapshot('default')),edited);
 }finally{db.close();}
});
test('store assets and default geometry satisfy construction rules',async()=>{
 const {validateSpatial}=await import('../server/world/spatial.js');const db=new DatabaseSync(':memory:');try{migrateWorld(db);const s=new WorldService(db).readSnapshot('default');const before={...s,entities:s.entities.filter(e=>e.sceneId!==STORE_SCENE_ID)};assert.doesNotThrow(()=>validateSpatial(before,s));}finally{db.close();}
 const THREE=await import('three');const {STORE_FURNITURE,buildStoreStreet}=await import('../src/world/convenience-store.js');for(const [type,asset]of Object.entries(STORE_FURNITURE)){const root=asset.make(),bounds=new THREE.Box3().setFromObject(root),entry=getCatalogEntry(type);assert.ok(Number.isFinite(bounds.max.y)&&bounds.max.y>1,type);assert.ok(bounds.max.x<=entry.footprint.width/2+.02&&bounds.min.x>=-entry.footprint.width/2-.02,type+' footprint x');assert.ok(bounds.max.z<=entry.footprint.depth/2+.02&&bounds.min.z>=-entry.footprint.depth/2-.02,type+' footprint z');}assert.ok(buildStoreStreet().children.length>20);
});
test('actual runtime completes living-to-store and store-to-living trips',async()=>{
 const {WorldRuntime,createRuntimeHandlers}=await import('../server/world/runtime.js');const db=new DatabaseSync(':memory:');let now=1000,n=0;try{migrateWorld(db);const service=new WorldService(db,{handlers:createRuntimeHandlers(),clock:()=>now});const runtime=new WorldRuntime(service);const principal={subjectId:'owner',role:'owner',worldIds:['default'],actorIds:['whale'],scopes:['world:read','actor:control']};const run=(kind,payload)=>service.execute(principal,{worldId:'default',requestId:`store-route-${++n}`,kind,payload});service.transactRuntime('default',({snapshot})=>Object.assign(snapshot.actors[0],{sceneId:'living',position:[2.35,0,-2.8]}));const lease=run('control.takeover',{actorId:'whale'});
 for(const sceneId of [STORE_SCENE_ID,'living']){const result=run('action.submit',{actorId:'whale',leaseId:lease.leaseId,leaseVersion:lease.leaseVersion,kind:'move',target:{sceneId}});for(let i=0;i<400&&service.readSnapshot('default').actions[result.actionId].status==='running';i++){now+=100;runtime.tick();}const snapshot=service.readSnapshot('default');assert.equal(snapshot.actions[result.actionId].status,'completed');assert.equal(snapshot.actors[0].sceneId,sceneId);}
 }finally{db.close();}
});
test('extra street lighting installs once without moving existing furniture, fresh defaults do not duplicate',async()=>{
 const {installStoreLights}=await import('../server/world/store-lighting.js');const {STORE_EXTRA_LIGHTS}=await import('../shared/world/store-scene.js');const db=new DatabaseSync(':memory:');try{migrateWorld(db);const service=new WorldService(db);assert.equal(installStoreLights(service).added,0);service.transactRuntime('default',({snapshot})=>{delete snapshot.features.storeLightingV1;snapshot.entities=snapshot.entities.filter(e=>!(e.sceneId===STORE_SCENE_ID&&STORE_EXTRA_LIGHTS.some(x=>JSON.stringify(x.position)===JSON.stringify(e.position))));});const before=structuredClone(service.readSnapshot('default').entities);assert.equal(installStoreLights(service).added,4);let s=service.readSnapshot('default');assert.deepEqual(s.entities.slice(0,before.length),before);assert.equal(s.entities.filter(e=>e.sceneId===STORE_SCENE_ID&&e.type==='shopLamp').length,before.filter(e=>e.sceneId===STORE_SCENE_ID&&e.type==='shopLamp').length+4);const saved=JSON.stringify(s);assert.equal(installStoreLights(service).added,0);assert.equal(JSON.stringify(service.readSnapshot('default')),saved);}finally{db.close();}
});
