import {registerAuthorScene} from '../shared/world/author-scenes.js';
import {registerLocalTemplate} from '../shared/world/templates.js';
import {existsSync,readFileSync,statSync,createReadStream,realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {registerLocalAssets} from '../shared/world/catalog.js';
import {localAssetLabel} from '../shared/world/local-asset-labels.js';
const assetSources=new WeakMap();
export const BUNDLED_MODEL_DIR=fileURLToPath(new URL('../resources/polyfork/',import.meta.url));

export function readBundledModels(entities){
 const required=new Set(entities.map(entity=>entity.type).filter(type=>type.startsWith('pf-')));
 if(!required.size)return [];
 const {assets}=readLocalAssets(BUNDLED_MODEL_DIR,{types:required});
 for(const type of required){
  if(!assets.some(asset=>asset.type===type))throw Error(`STARTER_MODEL_MISSING:${type}`);
 }
 return assets;
}

export function readLocalAssets(directory,{types}={}){
 if(!directory||!existsSync(path.join(directory,'manifest.json')))return {version:1,assets:[]};
 const manifest=JSON.parse(readFileSync(path.join(directory,'manifest.json'),'utf8'));
 // Validate before filesystem access; never follow a manifest outside this package.

 const base=realpathSync(directory)+path.sep;
 const assets=manifest.assets.filter(a=>(!types||types.has(a.type))&&/^(models|glb)\/(town|pf)-[a-z0-9-]+\.glb$/.test(a.file)&&existsSync(path.join(directory,a.file))&&realpathSync(path.join(directory,a.file)).startsWith(base)&&statSync(path.join(directory,a.file)).size>20).map(a=>({...a,label:localAssetLabel(a),sourceName:a.sourceName||a.name,...(/^thumbnails\/(town|pf)-[a-z0-9-]+\.(png|webp)$/.test(a.thumbnail||'')?{thumbnailURL:'/api/local-assets/'+a.thumbnail}:{})}));
 for(const asset of assets)assetSources.set(asset,directory);
 registerLocalAssets({assets});
 const authorScenes=['Demo_Beach','Demo_Town'].map(id=>path.join(directory,id+'.json')).filter(existsSync).map(file=>JSON.parse(readFileSync(file,'utf8'))).filter(data=>data.template);for(const data of authorScenes){registerAuthorScene(data);registerLocalAssets({assets:data.authorAssets||[]});if(data.template)registerLocalTemplate(data.template);}
 const guidFile=path.join(directory,'unity-source/guid-index.json');const examples=existsSync(guidFile)?Object.values(JSON.parse(readFileSync(guidFile,'utf8'))).filter(p=>p.endsWith('.unity')).map(p=>({id:path.basename(p,'.unity'),kind:p.endsWith('Demo_Town.unity')?'town':p.endsWith('Demo_Beach.unity')?'beach':'building'})):[];
 return {version:1,assets,authorScenes,examples,...(existsSync(path.join(directory,'coastal-layout.json'))?{sample:JSON.parse(readFileSync(path.join(directory,'coastal-layout.json'),'utf8'))}:{})};
}
export function installLocalAssetRoutes(app,directory,manifest){
 const locateFile=(asset,relative)=>{
  const root=assetSources.get(asset)??directory;
  if(!root)return;
  try{
   const base=realpathSync(root)+path.sep;
   const file=realpathSync(path.join(root,relative));
   if(file.startsWith(base)&&statSync(file).isFile())return file;
  }catch{}
 };
 app.get('/api/local-assets/scenes/:id',async(req,reply)=>{if(app.auth){try{app.auth.resolvePrincipal(req);}catch{return reply.code(401).send({error:'UNAUTHORIZED'});}}if(!directory||!/^Demo_[A-Za-z0-9_-]+$/.test(req.params.id))return reply.code(404).send({error:'SCENE_MISSING'});const file=path.join(directory,req.params.id+'.json');if(!existsSync(file)){const cached=manifest.authorScenes?.find(s=>s.id===req.params.id);return cached||reply.code(404).send({error:'SCENE_MISSING'});}return JSON.parse(readFileSync(file,'utf8'));});
 app.get('/api/local-assets/manifest',async(req,reply)=>{if(app.auth){try{app.auth.resolvePrincipal(req);}catch{return reply.code(401).send({error:'UNAUTHORIZED'});}}return manifest;});
 app.get('/api/local-assets/thumbnails/:file',async(req,reply)=>{
  if(app.auth){try{app.auth.resolvePrincipal(req);}catch{return reply.code(401).send({error:'UNAUTHORIZED'});}}
  const relative=`thumbnails/${req.params.file}`;
  if(!/^thumbnails\/(town|pf)-[a-z0-9-]+\.(png|webp)$/.test(relative))return reply.code(404).send({error:'THUMBNAIL_MISSING'});
  const asset=manifest.assets.find(a=>a.thumbnail===relative);
  // Recheck at request time, including symlinks changed after manifest discovery.
  const file=asset&&locateFile(asset,relative);
  if(!file)return reply.code(404).send({error:'THUMBNAIL_MISSING'});
  return reply.header('Content-Type',relative.endsWith('.webp')?'image/webp':'image/png').header('Cache-Control','private, max-age=3600').header('X-Content-Type-Options','nosniff').send(createReadStream(file));
 });
 app.get('/api/local-assets/models/:file',async(req,reply)=>{
  if(app.auth){try{app.auth.resolvePrincipal(req);}catch{return reply.code(401).send({error:'UNAUTHORIZED'});}}
  const asset=manifest.assets.find(a=>a.file===`models/${req.params.file}`||a.file===`glb/${req.params.file}`);
  const file=asset&&locateFile(asset,asset.file);
  if(!file)return reply.code(404).send({error:'LOCAL_ASSET_MISSING'});
  return reply.header('Content-Type','model/gltf-binary').header('Cache-Control','private, max-age=3600').send(createReadStream(file));
 });
}
