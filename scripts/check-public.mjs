import fs from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(fs.readFileSync(new URL('../resources/character/manifest.json',import.meta.url),'utf8'));
const audioManifest=JSON.parse(fs.readFileSync(new URL('../resources/audio/manifest.json',import.meta.url),'utf8'));
const polyforkManifest=JSON.parse(fs.readFileSync(new URL('../resources/polyfork/manifest.json',import.meta.url),'utf8'));
const polyforkFiles=new Set(['manifest.json','LICENSE.md','CREDITS.md',
 ...polyforkManifest.assets.flatMap(asset=>[asset.file,asset.thumbnail])].map(file=>'resources/polyfork/'+file));
const approved=new Map([...manifest.files,...audioManifest.files.map(f=>({...f,runtime:true}))].map(f=>[f.path,f]));
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const desktopSources=new Set([
 'desktop/.gitignore','desktop/README.md','desktop/docs/DESKTOP.md',
 'desktop/electron-builder.yml','desktop/launch.mjs','desktop/main.cjs','desktop/package.json',
 'desktop/paths.cjs','desktop/preload.cjs','desktop/probe.cjs','desktop/scripts/package.mjs',
 'desktop/test/desktop-paths.test.mjs',
]);
export function blockedPublicFile(file){
 const p=file.replaceAll('\\','/');
 if(approved.has(p))return false;
 if(p.startsWith('resources/polyfork/'))return !polyforkFiles.has(p);
 if(p==='.npmrc')return true;
 if(p.startsWith('01_无尾人物/'))return true;
 if(p.startsWith('desktop/'))return !desktopSources.has(p);
 if(p.startsWith('resources/character/')&&p!=='resources/character/manifest.json')return true;
 return /\.(unitypackage|fbx|prefab|unity|glb|gltf|blend\d*|pem|key|p12|pfx|sqlite(?:-wal|-shm)?|db(?:-wal|-shm)?|bin|gguf|onnx|safetensors|pt|pth|wav|mp3|ogg|webm|m4a|woff2?|ttf|otf)$/i.test(p)
  || /(^|\/)(data|模型|assets|shots|qa|scratch|temp|tmp|\.superpowers|\.cache|\.town-import-jobs|voices|models|recordings)(\/|$)/i.test(p)
  || /(^|\/)(\.env[^/]*|character\.local\.json|(?:credentials?|tokens?|secrets?)(?:[._-][^/]*)?)(\/|$)/i.test(p)
  || /(^|\/)town-[a-z0-9-]+\.png$/i.test(p)
  || /^public\/characters(\/|$)/.test(p);
}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
export function checkPublic(){
 for(const entry of audioManifest.files){if(!/^resources\/audio\/(?:[a-z0-9-]+\.mp3|action-[a-z0-9-]+\.wav)$/.test(entry.path)||createHash('sha256').update(fs.readFileSync(entry.path)).digest('hex')!==entry.sha256)throw Error('Invalid approved audio: '+entry.path);}
 for(const entry of manifest.files){
  if(!/^resources\/character\/models\/[^/]+\.glb$/.test(entry.path)||/(before-author|secrets?|tokens?|credentials?)/i.test(entry.path))throw Error('Invalid approved resource: '+entry.path);
  if(createHash('sha256').update(fs.readFileSync(entry.path)).digest('hex')!==entry.sha256)throw Error('Resource digest mismatch: '+entry.path);
 }
 for(const entry of polyforkManifest.assets){
  if(!/^pf-[a-z0-9-]+$/.test(entry.type)||entry.file!==`glb/${entry.type}.glb`||entry.thumbnail!==`thumbnails/${entry.type}.webp`)throw Error('Invalid polyfork asset: '+entry.file);
  if(createHash('sha256').update(fs.readFileSync('resources/polyfork/'+entry.file)).digest('hex')!==entry.sha256)throw Error('Polyfork digest mismatch: '+entry.file);
  if(createHash('sha256').update(fs.readFileSync('resources/polyfork/'+entry.thumbnail)).digest('hex')!==entry.thumbnailSha256)throw Error('Polyfork thumbnail digest mismatch: '+entry.thumbnail);
 }
 const gitFiles=(...args)=>execFileSync('git',['ls-files',...args,'-z']).toString().split('\0').filter(Boolean);
 const deleted=new Set(gitFiles('--deleted'));
 const candidates=new Set(gitFiles('--cached','--others','--exclude-standard').filter(file=>!deleted.has(file)));
 const staged=execFileSync('git',['diff','--cached','--name-only','--diff-filter=ACMR','-z']).toString().split('\0').filter(Boolean);
 const bad=[...new Set([...candidates,...staged])].filter(blockedPublicFile);
 if(bad.length)throw Error('Private/scratch files eligible for commit: '+bad.join(', '));
 for(const file of [...approved.keys(),...polyforkFiles,...desktopSources,'docs/DESKTOP.md','docs/THREEJS-SKILLS.md','docs/MCP-ADVANCED-ACTIONS.md','public/licenses/elemental-sandbox.txt','public/licenses/webgl-noise.txt']){
  if(!candidates.has(file)||!fs.statSync(file,{throwIfNoEntry:false})?.isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('Missing public file: '+file);
 }
 for(const file of walk('dist')){
  // Vite's generated assets directory is expected; inspect its contents, not the directory name.
  const relative=file.replace(/^dist\//,'');
  const entry=approved.get(relative);
  if(polyforkFiles.has(relative))throw Error('Server-only asset copied into web build: '+file);
  if(entry){if(!entry.runtime||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==entry.sha256)throw Error('Unexpected build resource: '+file);continue;}
  if(blockedPublicFile(file.replace(/^dist\/assets\//,'dist/'))||file.includes('/characters/'))throw Error('Private build asset: '+file);
  if(/\.(json)$/.test(file)&&/\"type\"\s*:\s*\"town-/.test(fs.readFileSync(file,'utf8')))throw Error('Local layout in build: '+file);
  if(/\.(js|html|json|css)$/.test(file)&&/\/Volumes\/|\/Users\/|__private\/models\//.test(fs.readFileSync(file,'utf8')))throw Error('Private path in build: '+file);
 }
 for(const entry of [...approved.values()].filter(f=>f.runtime))if(!fs.existsSync(path.join('dist',entry.path)))throw Error('Missing runtime resource: '+entry.path);
 console.log('PASS: tracked files, commit candidates and production build respect the public resource inventory');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)checkPublic();
