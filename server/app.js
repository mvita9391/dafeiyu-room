import {installAuthorBeach} from './world/author-beach.js';
import {appendAuthorScenes,relocateStreetExits} from './world/author-pack.js';
import {installLocalPackRoutes,recoverLocalPack} from './local-pack-import.js';
import {registerAuthorScene,checkpointAuthorScenes} from '../shared/world/author-scenes.js';
import {registerLocalTemplate,checkpointTemplates} from '../shared/world/templates.js';
import {registerLocalAssets,checkpointCatalog} from '../shared/world/catalog.js';
import {defaultManifest} from '../shared/world/default-manifest.js';
import {BUNDLED_MODEL_DIR,readBundledModels,readLocalAssets,installLocalAssetRoutes} from './local-assets.js';
import {installStreetHomeEntrance} from './world/street-home-feature.js';
import {installStoreLights} from './world/store-lighting.js';
import {installStoreScene} from './world/store-feature.js';
import {installAudio} from './audio/playback.js';
import Fastify from 'fastify';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateWorld } from './storage/migrations.js';
import { WorldService } from './world/service.js';
import { validLayout } from '../shared/layout.js';
import {installAuth} from './auth/routes.js';
import {installMcp} from './mcp/server.js';
import {installWorldSocket} from './world/socket.js';
import {installMcpIntegration} from './integrations/mcp.js';
import {projectSnapshot} from './mcp/resources.js';
import {createRuntimeHandlers,WorldRuntime} from './world/runtime.js';
import {BAIZE_ASSET_URL} from '../shared/world/baize-battle.js';
import {createBuildHandlers} from './world/build.js';

export async function buildServer({ databasePath, serveStatic = false, logger = false, worldMode = false, resolvePrincipal, worldHandlers = {}, auth = {}, mcpExtensions = {}, mcpAdvancedActions = false, startRuntime = true, localAssetDir, baizeAssetPath, localPackOptions = {} } = {}) {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const defaultAssetDirs=databasePath===':memory:'?[]:[process.env.WORLD_LOCAL_ASSET_DIR,path.join(root,'.cache/town-assets')].filter(Boolean);
  const assetDirectory=localAssetDir!==undefined?localAssetDir:(defaultAssetDirs.find(dir=>existsSync(path.join(dir,'manifest.json')))||defaultAssetDirs[0]||null);
  const filename=databasePath || path.join(root,'data','game.sqlite');
  const companionDirectory=path.join(assetDirectory?path.dirname(assetDirectory):path.join(root,'.cache'),'companions');
  const bundledBaize='resources/character/models/baize.glb';
  const companionPath=baizeAssetPath??[
    ...(filename!==':memory:'?[path.join(companionDirectory,'baize.glb')]:[]),
    path.join(root,bundledBaize),
    path.join(root,'dist',bundledBaize),
  ].find(file=>existsSync(file));
  const baizeEnabled=Boolean(companionPath&&existsSync(companionPath));
  if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS layouts (id TEXT PRIMARY KEY, layout TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)');
  const cachedImport=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='local_asset_catalog'").get()?db.prepare('SELECT manifest FROM local_asset_catalog WHERE id=1').get():null;
  recoverLocalPack(assetDirectory,cachedImport?JSON.parse(cachedImport.manifest).importJobId:undefined);
  const starterModels=worldMode?readBundledModels(defaultManifest.scenes.flatMap(scene=>scene.entities)):[];
  const required=new Set(starterModels.map(asset=>asset.type));
  const mergeStarterModels=manifest=>{
    registerLocalAssets({assets:starterModels});
    return {...manifest,assets:[...manifest.assets.filter(asset=>!required.has(asset.type)),...starterModels]};
  };
  const hasLocalManifest=assetDirectory&&existsSync(path.join(assetDirectory,'manifest.json'));
  const useBundledLibrary=filename!==':memory:'&&!hasLocalManifest&&(worldMode||localAssetDir===undefined);
  const loadedManifest=readLocalAssets(useBundledLibrary?BUNDLED_MODEL_DIR:assetDirectory);
  const localManifest=mergeStarterModels(loadedManifest);
  if(assetDirectory||db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='local_asset_catalog'").get()){
    db.exec('CREATE TABLE IF NOT EXISTS local_asset_catalog (id INTEGER PRIMARY KEY, manifest TEXT NOT NULL)');
    const saved=db.prepare('SELECT manifest FROM local_asset_catalog WHERE id=1').get();
    const stored=saved?JSON.parse(saved.manifest):{};const previous=stored.assets||[];
    localManifest.authorScenes=[...new Map([...(stored.authorScenes||[]),...(localManifest.authorScenes||[])].map(scene=>[scene.id,scene])).values()];
    for(const data of localManifest.authorScenes||[]){registerAuthorScene(data);registerLocalAssets({assets:data.authorAssets||[]});if(data.template)registerLocalTemplate(data.template);}
    const available=new Set(localManifest.assets.map(a=>a.type));
    localManifest.unavailable=previous.filter(a=>!available.has(a.type));
    registerLocalAssets({assets:localManifest.unavailable});
    if(!useBundledLibrary&&loadedManifest.assets.length)db.prepare('INSERT OR REPLACE INTO local_asset_catalog VALUES (1,?)').run(JSON.stringify({assets:[...loadedManifest.assets,...localManifest.unavailable],authorScenes:localManifest.authorScenes||[],...(stored.importJobId?{importJobId:stored.importJobId}:{})}));
  }
  if(worldMode)migrateWorld(db);
  const migrated=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='worlds'").get() && db.prepare('SELECT 1 FROM worlds LIMIT 1').get());
  const worldService=migrated?new WorldService(db,{handlers:{...createRuntimeHandlers({baizeEnabled}),...createBuildHandlers(),...worldHandlers},memoryPosition:filename!==':memory:'}):null;
  worldService?.startMemoryRuntime();
  if(worldMode&&worldService){installStoreScene(worldService);installStoreLights(worldService);installStreetHomeEntrance(worldService);installAuthorBeach(worldService,localManifest);relocateStreetExits(worldService);}
  const app=Fastify({logger,bodyLimit:6*1024*1024});
  app.decorate('worldService',worldService);
  const authService=worldService?installAuth(app,db,worldService,{...auth,apiKeyPath:filename===':memory:'?undefined:filename+'.mcp-json.key'}):null;
  app.decorate('auth',authService);
  installLocalAssetRoutes(app,assetDirectory,localManifest);
  installLocalPackRoutes(app,{directory:assetDirectory,manifest:localManifest,importerOptions:localPackOptions,
    activate:(directory,importJobId)=>{
      const restore=[checkpointCatalog(),checkpointTemplates(),checkpointAuthorScenes()];
      try{
      const imported=readLocalAssets(directory);
      const fresh=mergeStarterModels(imported);
      db.exec('CREATE TABLE IF NOT EXISTS local_asset_catalog (id INTEGER PRIMARY KEY, manifest TEXT NOT NULL)');
      const result=worldService.transactRuntime('default',({snapshot,emit})=>{
        const scenes=appendAuthorScenes(snapshot,fresh);
        db.prepare('INSERT OR REPLACE INTO local_asset_catalog VALUES (1,?)').run(JSON.stringify({assets:imported.assets,authorScenes:imported.authorScenes,importJobId}));
        if(scenes.some(s=>s.status==='added'))emit('world.local_pack_installed',{packId:'cartoon-town',scenes});
        return {models:fresh.assets.length,scenes};
      });
      Object.keys(localManifest).forEach(key=>delete localManifest[key]);Object.assign(localManifest,fresh);
      return result;
      }catch(error){for(const undo of restore)undo();throw error;}
    },rollback:()=>{readLocalAssets(assetDirectory);},
  });
  if(authService){const audio=installAudio(app,authService);app.decorate('audioPlayback',audio);mcpExtensions={audio_play:({principal,worldId,args})=>audio.play(principal,worldId,args),audio_get_status:({principal,worldId,args})=>audio.public(audio.get(principal,worldId,args.playbackId)),audio_stop:({principal,worldId,args})=>audio.stop(principal,worldId,args.playbackId),...mcpExtensions};installMcp(app,worldService,authService,{extensions:mcpExtensions,advancedActions:mcpAdvancedActions});installMcpIntegration(app,authService);}
  if(worldService&&authService)installWorldSocket(app,{worldService,authService,resolvePrincipal});
  const runtime=worldService&&startRuntime?new WorldRuntime(worldService).start():null;
  app.addHook('onClose',async()=>{
    runtime?.stop();
    try{worldService?.flushRuntime();}finally{db.close();}
  });
  // Local single-player service: disallow cross-origin browser writes.
  app.addHook('onRequest',async(req,reply)=>{
    if(['POST','PUT','DELETE','PATCH'].includes(req.method) && req.headers.origin) {
      try { if(new URL(req.headers.origin).host!==req.headers.host)return reply.code(403).send({error:'Origin not allowed'}); }
      catch {return reply.code(403).send({error:'Origin not allowed'});}
    }
  });
  app.get('/api/health',async()=>({ok:true}));
  const read=db.prepare('SELECT layout, revision, updated_at FROM layouts WHERE id=?');
  app.get('/api/layout/:scene',async(req,reply)=>{
    if(!['bedroom','living','yard'].includes(req.params.scene))return reply.code(404).send({error:'Unknown scene'});
    if(authService&&!resolvePrincipal){try{authService.resolvePrincipal(req);}catch{return reply.code(401).send({error:'UNAUTHORIZED'});}}
    const row=read.get(req.params.scene);
    return row?{layout:JSON.parse(row.layout),revision:row.revision,updatedAt:row.updated_at}:{layout:null,revision:0,updatedAt:null};
  });
  app.put('/api/layout/:scene',async(req,reply)=>{
    if(!['bedroom','living','yard'].includes(req.params.scene))return reply.code(404).send({error:'Unknown scene'});
    if(authService&&!resolvePrincipal){try{authService.resolvePrincipal(req);}catch(error){return reply.code(error.message==='CSRF_REQUIRED'?403:401).send({error:error.message,...(error.details?{details:error.details}:{})});}}
    const {layout,revision}=req.body||{};
    if(!validLayout(layout,req.params.scene)||!Number.isSafeInteger(revision)||revision<0)return reply.code(400).send({error:'Invalid layout or revision'});
    if(migrated)return reply.code(409).send({error:'WORLD_MIGRATED',status:'draft',draft:{sceneId:req.params.scene,layout,legacyRevision:revision},message:'旧布局仅保留为待合并草稿，请通过世界建设预览提交。'});
    const updatedAt=new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      const current=read.get(req.params.scene);
      if((current?.revision||0)!==revision){db.exec('ROLLBACK');return reply.code(409).send({error:'Layout changed in another window'});}
      db.prepare('INSERT INTO layouts(id,layout,revision,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET layout=excluded.layout,revision=excluded.revision,updated_at=excluded.updated_at')
        .run(req.params.scene,JSON.stringify(layout),revision+1,updatedAt);
      db.exec('COMMIT');return {revision:revision+1,updatedAt};
    } catch(error){db.exec('ROLLBACK');throw error;}
  });
  if(worldService){
    const principal=async req=>resolvePrincipal?await resolvePrincipal(req):authService.resolvePrincipal(req);
    const failure=(reply,error)=>reply.code(error.message==='CSRF_REQUIRED'?403:error.message==='UNAUTHORIZED'?401:error.message==='WORLD_NOT_FOUND'?404:400).send({error:error.message,...(error.details?{details:error.details}:{})});
    app.get(BAIZE_ASSET_URL,async(req,reply)=>{
      try{
        if((await principal(req)).role!=='owner')throw Error('UNAUTHORIZED');
        if(!companionPath||!existsSync(companionPath))return reply.code(404).send({error:'COMPANION_UNAVAILABLE'});
        return reply.type('model/gltf-binary').header('cache-control','private, max-age=3600').send(createReadStream(companionPath));
      }catch(error){return failure(reply,error);}
    });
    app.get('/api/world/:id/snapshot',async(req,reply)=>{try{const p=await principal(req);const snapshot=worldService.getSnapshot(p,req.params.id);/* 两个读取都是同步的，单线程下不会插入写入，cursor 与快照一致 */return {...projectSnapshot(snapshot,p),cursor:worldService.latestCursor(p,req.params.id)};}catch(error){return failure(reply,error);}});
    app.get('/api/world/:id/state',async(req,reply)=>{try{const p=await principal(req);const s=projectSnapshot(worldService.getSnapshot(p,req.params.id),p);const liveActions=Object.fromEntries(Object.entries(s.actions||{}).filter(([,action])=>['running','queued'].includes(action.status)));return {worldId:s.worldId,layoutRevision:s.layoutRevision,topologyRevision:s.topologyRevision,actors:s.actors,actions:liveActions};}catch(error){return failure(reply,error);}});
    app.get('/api/world/:id/events',async(req,reply)=>{try{const principalValue=await principal(req);const after=req.query.after;const afterCursor=after==='latest'?worldService.latestCursor(principalValue,req.params.id):Number(after??0);return worldService.getEvents(principalValue,{worldId:req.params.id,afterCursor,limit:Number(req.query.limit??100)});}catch(error){return failure(reply,error);}});
    app.post('/api/world/:id/commands',async(req,reply)=>{try{if(req.body?.worldId!==req.params.id)throw Error('WORLD_ID_MISMATCH');return worldService.execute(await principal(req),req.body);}catch(error){return failure(reply,error);}});
  }
  if(serveStatic && existsSync(path.join(root,'dist','index.html'))) {
    await app.register((await import('@fastify/static')).default,{root:path.join(root,'dist')});
  }
  return app;
}
