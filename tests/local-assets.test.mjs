import test from 'node:test';
import assert from 'node:assert/strict';
import {registerLocalAssets,getCatalogEntry,listCatalog} from '../shared/world/catalog.js';
import {validateCommand} from '../shared/world/schema.js';
import {createStarterWorld} from '../server/world/starter.js';
const asset={type:'town-test-cottage',name:'Test_Cottage',category:'Buildings',file:'models/town-test-cottage.glb',dimensions:[3,4,2]};
test('local manifest extends authoritative catalog and command validation without bundling models',()=>{
 registerLocalAssets({version:1,assets:[asset]});
 const entry=getCatalogEntry(asset.type);assert.equal(entry.footprint.width,3);assert.equal(entry.footprint.depth,2);assert.equal(entry.source.kind,'local');assert.ok(listCatalog().some(e=>e.type===asset.type));
 assert.equal(validateCommand({worldId:'default',requestId:'test',kind:'build.preview',payload:{baseRevision:0,ops:[{kind:'entity.add',ref:'a',sceneId:'seaside-town',type:asset.type,position:[0,2,0],rotation:0,scale:[1,1,1]}]}}).ok,true);
});
test('unsafe paths and invalid dimensions cannot enter local catalog',()=>{
 assert.throws(()=>registerLocalAssets({assets:[{...asset,type:'town-bad',file:'../secret',dimensions:[-1,2,3]}]}));
});
test('starter export explicitly rejects local assets',()=>{
 assert.throws(()=>createStarterWorld({scenes:[],entities:[{type:asset.type}]}),/LOCAL_ASSETS_NOT_PUBLISHABLE/);
 assert.throws(()=>createStarterWorld({scenes:[{templateId:'local_author_beach_v1'}],entities:[]}),/LOCAL_ASSETS_NOT_PUBLISHABLE/);
});

test('local sample is idempotent and preserves custom transforms and other scenes',async()=>{
 const {installLocalTown}=await import('../server/world/local-town.js');const {COASTAL_ENTITIES}=await import('../shared/world/coastal.js');
 const snapshot={scenes:[{sceneId:'seaside-town'}],entities:[{...structuredClone(COASTAL_ENTITIES[0]),sceneId:'seaside-town',entityId:'seaside-town-1',position:[-3,2,-6]}, {type:'yardFarm',entityId:'farm',sceneId:'yard',position:[1,0,1]}],layoutRevision:1,topologyRevision:1};
 const before=JSON.stringify(snapshot.entities);const service={readSnapshot:()=>snapshot,transactRuntime:(_,fn)=>fn({snapshot,emit:()=>{}})};const manifest={assets:[{...asset,type:'town-house-1room-pink'}],sample:{entities:[{type:'town-unavailable'}],replacements:[{entityId:'seaside-town-1',defaultIndex:0,entity:{type:'town-house-1room-pink'}}]}};
 assert.equal(installLocalTown(service,manifest).installed,true);assert.equal(JSON.stringify(snapshot.entities),before);assert.equal(installLocalTown(service,manifest).installed,false);
});

test('large local scenery is sized for editing and can be resized within shared limits',async()=>{
 const {RoomEditor}=await import('../src/ui/room-editor.js');
 const object={userData:{furnitureType:asset.type},scale:{x:1,setScalar(n){this.x=n;}}};
 const ctx={selected:object,checkpoint(){},constrain(){},save(){},refreshState(){}};
 RoomEditor.prototype.resize.call(ctx,.5);assert.equal(object.scale.x,.5);RoomEditor.prototype.resize.call(ctx,.01);assert.equal(object.scale.x,.01);
});

test('server only serves allowlisted local files and preserves unavailable descriptors after restart',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {buildServer}=await import('../server/app.js');
 const dir=mkdtempSync(join(tmpdir(),'town-assets-test-'));mkdirSync(join(dir,'models'));writeFileSync(join(dir,asset.file),Buffer.alloc(32));writeFileSync(join(dir,'manifest.json'),JSON.stringify({version:1,assets:[asset]}));let app;
 try{app=await buildServer({databasePath:join(dir,'test.sqlite'),localAssetDir:dir});let r=await app.inject('/api/local-assets/manifest');assert.equal(r.json().assets.length,1);assert.equal((await app.inject('/api/local-assets/'+asset.file)).statusCode,200);assert.equal((await app.inject('/api/local-assets/models/secret.glb')).statusCode,404);await app.close();app=null;
 rmSync(join(dir,asset.file));app=await buildServer({databasePath:join(dir,'test.sqlite'),localAssetDir:dir});r=await app.inject('/api/local-assets/manifest');assert.equal(r.json().assets.length,0);assert.equal(r.json().unavailable[0].type,asset.type);assert.equal((await app.inject('/api/local-assets/'+asset.file)).statusCode,404);
 }finally{await app?.close();rmSync(dir,{recursive:true,force:true});}
});

test('local sample protects relocated default IDs using authoritative rotated footprints',async()=>{
 const {installLocalTown}=await import('../server/world/local-town.js');const {COASTAL_ENTITIES}=await import('../shared/world/coastal.js');
 const customized={...structuredClone(COASTAL_ENTITIES[0]),entityId:'seaside-town-1',sceneId:'seaside-town',position:[3.8,2,-9],rotation:.3};
 const s={scenes:[{sceneId:'seaside-town'}],entities:[customized],layoutRevision:0,topologyRevision:0};const sample={entities:[{type:asset.type,position:[3.8,2,-9],rotation:0,scale:[1,1,1]}]};
 const service={readSnapshot:()=>s,transactRuntime:(_,fn)=>fn({snapshot:s,emit(){}})};
 installLocalTown(service,{assets:[asset],sample});assert.deepEqual(s.entities,[customized]);
});

test('partial author scene loss merges and persists cached scene IDs across independent restarts',async()=>{
 const{mkdtempSync,mkdirSync,writeFileSync,rmSync}=await import('node:fs');const{tmpdir}=await import('node:os');const{join}=await import('node:path');const{execFileSync}=await import('node:child_process');const{getTemplate}=await import('../shared/world/templates.js');const dir=mkdtempSync(join(tmpdir(),'town-partial-scenes-'));mkdirSync(join(dir,'models'));writeFileSync(join(dir,asset.file),Buffer.alloc(32));writeFileSync(join(dir,'manifest.json'),JSON.stringify({assets:[asset]}));for(const id of ['Beach','Town'])writeFileSync(join(dir,`Demo_${id}.json`),JSON.stringify({id:`Demo_${id}`,records:[],surfaces:[],authorAssets:[],template:{...getTemplate('courtyard_v1'),templateId:`local_restore_${id.toLowerCase()}`,authorSceneId:`Demo_${id}`,version:1}}));
 const launch=()=>JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`import{buildServer}from${JSON.stringify(new URL('../server/app.js',import.meta.url).href)};import{getTemplate}from${JSON.stringify(new URL('../shared/world/templates.js',import.meta.url).href)};const a=await buildServer({databasePath:${JSON.stringify(join(dir,'save.sqlite'))},localAssetDir:${JSON.stringify(dir)}});const m=(await a.inject('/api/local-assets/manifest')).json();console.log(JSON.stringify({ids:m.authorScenes.map(s=>s.id).sort(),town:getTemplate('local_restore_town').version,beach:getTemplate('local_restore_beach').version}));await a.close();`],{encoding:'utf8'}));
 try{assert.equal(launch().town,1);rmSync(join(dir,'Demo_Town.json'));const beach=JSON.parse((await import('node:fs')).readFileSync(join(dir,'Demo_Beach.json')));beach.template.version=2;writeFileSync(join(dir,'Demo_Beach.json'),JSON.stringify(beach));const partial=launch();assert.deepEqual(partial.ids,['Demo_Beach','Demo_Town']);assert.equal(partial.beach,2,'disk wins');rmSync(join(dir,'Demo_Beach.json'));assert.deepEqual(launch(),partial,'merged cache survives a second independent process');}finally{rmSync(dir,{recursive:true,force:true});}
});

test('polyfork local assets register with new categories and serve under pf- prefix',async()=>{
 const pf={type:'pf-cueca-musician-d71a2e',name:'Cueca Musician',category:'Characters',file:'models/pf-cueca-musician-d71a2e.glb',dimensions:[1.6,1.7,.9]};
 registerLocalAssets({version:1,assets:[pf]});
 const entry=getCatalogEntry(pf.type);assert.equal(entry.category,'角色');assert.equal(entry.label,'Cueca Musician');assert.equal(entry.footprint.width,1.6);
 const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {buildServer}=await import('../server/app.js');
 const dir=mkdtempSync(join(tmpdir(),'pf-assets-test-'));mkdirSync(join(dir,'models'));mkdirSync(join(dir,'thumbnails'));
 writeFileSync(join(dir,pf.file),Buffer.alloc(32));writeFileSync(join(dir,'thumbnails/pf-cueca-musician-d71a2e.png'),Buffer.from([0x89,0x50,0x4e,0x47]));
 writeFileSync(join(dir,'manifest.json'),JSON.stringify({version:1,assets:[{...pf,thumbnail:'thumbnails/pf-cueca-musician-d71a2e.png'}]}));
 let app;
 try{app=await buildServer({databasePath:join(dir,'test.sqlite'),localAssetDir:dir});
  const manifest=(await app.inject('/api/local-assets/manifest')).json();assert.equal(manifest.assets.length,1);assert.equal(manifest.assets[0].thumbnailURL,'/api/local-assets/thumbnails/pf-cueca-musician-d71a2e.png');
  assert.equal((await app.inject('/api/local-assets/'+pf.file)).statusCode,200);
  assert.equal((await app.inject('/api/local-assets/thumbnails/pf-cueca-musician-d71a2e.png')).statusCode,200);
  assert.equal((await app.inject('/api/local-assets/models/pf-missing.glb')).statusCode,404);
 }finally{await app?.close();rmSync(dir,{recursive:true,force:true});}
});
