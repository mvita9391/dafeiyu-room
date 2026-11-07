import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LOCAL_ASSET_LABELS,localAssetLabel} from '../shared/world/local-asset-labels.js';
import {registerLocalAssets} from '../shared/world/catalog.js';
import {installLocalAssetRoutes} from '../server/local-assets.js';
import {appendCatalogPreview} from '../src/ui/catalog-preview.js';
import {blockedPublicFile} from '../scripts/check-public.mjs';
import {RoomEditor} from '../src/ui/room-editor.js';

test('changing to an indoor context resets an unavailable outdoor category to All',()=>{
 const category='户外',buttons=['全部',category].map(textContent=>({textContent})),title={},calls=[];
 const contexts={street:{label:'街角',sceneId:'street',templateId:'street_corner_v1',group:{children:[]}},bedroom:{label:'卧室',sceneId:'bedroom',templateId:'cozy_room_v1',group:{children:[]}}};
 const editor=Object.assign(Object.create(RoomEditor.prototype),{contexts,worldClient:{},outline:{},toggle:{},panel:{ownerDocument:{createElement:()=>({})},querySelector:s=>s==='strong'?title:{children:buttons,append:b=>buttons.push(b)}},currentCategory:category,showCategory(name,preserve){this.currentCategory=name;calls.push({name,preserve});},refreshState(){}});
 editor.setContext('street');assert.equal(calls.at(-1).name,category);assert.equal(buttons[1].hidden,false);
 editor.setContext('bedroom');assert.equal(buttons[1].hidden,true);assert.equal(calls.at(-1).name,'全部');assert.equal(calls.at(-1).preserve,false,'fallback must start at top of its new catalog');assert.ok(editor.allowedTypes.length>0);assert.ok(buttons.some(b=>b.textContent==='桌椅'),'missing category buttons are added when metadata changes');
 editor.currentCategory='桌椅';editor.setContext('street');assert.equal(calls.at(-1).name,'桌椅','keep a category still available in the new context');assert.equal(calls.at(-1).preserve,true);
});

test('213 distinct Chinese display names preserve source IDs and map author aliases',()=>{
 const [indoorEntry]=registerLocalAssets({assets:[{type:'town-indoor-test',name:'test',file:'models/town-indoor-test.glb',category:'Props',dimensions:[1,1,1]}]});assert.deepEqual(indoorEntry.sceneKinds,['indoor','outdoor']);
 const labels=Object.values(LOCAL_ASSET_LABELS);assert.equal(labels.length,213);assert.equal(new Set(labels).size,213);assert.ok(labels.every(s=>/[\u4e00-\u9fff]/.test(s)&&!/[a-z]/i.test(s)));
 const asset={type:'town-house-1room-blue',name:'House_1Room_Blue',file:'models/town-house-1room-blue.glb',thumbnail:'thumbnails/town-house-1room-blue.png',category:'Buildings',dimensions:[2,3,4]};
 const before=structuredClone(asset),entry=registerLocalAssets({assets:[asset]})[0];assert.deepEqual(asset,before);assert.equal(entry.label,'蓝色一居小屋');assert.equal(entry.sourceName,asset.name);assert.equal(entry.source.file,asset.file);assert.equal(entry.thumbnailURL,'/api/local-assets/'+asset.thumbnail);
 assert.equal(localAssetLabel({type:'town-author-town-123',baseType:asset.type,editorHidden:true,label:'English'}),'原场景 · 蓝色一居小屋');
 assert.equal(registerLocalAssets({assets:[{...asset,thumbnail:'../../secret.png'}]})[0].thumbnailURL,undefined);
 assert.equal(blockedPublicFile('.cache/town-assets/thumbnails/town-house-1room-blue.png'),true);
 assert.equal(blockedPublicFile('public/images/town-house-1room-blue.png'),true,'private previews cannot be copied into public images');
});

test('thumbnail route authenticates, allowlists and rechecks symlink containment',async()=>{
 const root=mkdtempSync(join(tmpdir(),'town-thumbnails-')),dir=join(root,'package');mkdirSync(join(dir,'thumbnails'),{recursive:true});const good='thumbnails/town-house-1room-blue.png',escape='thumbnails/town-escape.png';const data=Buffer.from('private-thumbnail');writeFileSync(join(dir,good),data);writeFileSync(join(root,'outside.png'),'secret');symlinkSync(join(root,'outside.png'),join(dir,escape));
 const app=Fastify();app.decorate('auth',{resolvePrincipal(req){if(req.headers.authorization!=='Bearer test-owner')throw Error('unauthorized');}});installLocalAssetRoutes(app,dir,{assets:[{thumbnail:good},{thumbnail:escape},{thumbnail:'../outside.png'}]});const get=url=>app.inject({url,headers:{authorization:'Bearer test-owner'}});
 try{assert.equal((await app.inject('/api/local-assets/'+good)).statusCode,401);const ok=await get('/api/local-assets/'+good);assert.equal(ok.statusCode,200);assert.deepEqual(ok.rawPayload,data);assert.equal(ok.headers['content-type'],'image/png');assert.match(ok.headers['cache-control'],/^private/);assert.equal((await get('/api/local-assets/'+escape)).statusCode,404);assert.equal((await get('/api/local-assets/thumbnails/town-not-listed.png')).statusCode,404);assert.equal((await get('/api/local-assets/thumbnails/%2e%2e%2foutside.png')).statusCode,404);
 rmSync(join(dir,good));symlinkSync(join(root,'outside.png'),join(dir,good));assert.equal((await get('/api/local-assets/'+good)).statusCode,404,'changed symlink cannot escape after registration');
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});

test('catalog previews are lazy static images with readable labels and missing-image fallback',()=>{
 const doc={createElement(tag){return{tag,ownerDocument:doc,children:[],append(...nodes){this.children.push(...nodes);for(const n of nodes)n.parent=this;},replaceWith(node){this.parent.children[this.parent.children.indexOf(this)]=node;}};}};
 const button=doc.createElement('button');appendCatalogPreview(button,{label:'蓝色一居小屋',thumbnailURL:'/api/local-assets/thumbnails/town-house-1room-blue.png',local:true});
 const [img,label]=button.children;assert.equal(img.tag,'img');assert.equal(img.loading,'lazy');assert.equal(img.decoding,'async');assert.equal(img.width,88);assert.equal(label.textContent,'蓝色一居小屋');img.onerror();assert.equal(button.children[0].textContent,'图片暂缺');assert.equal(button.children[1],label);
 const missing=doc.createElement('button');appendCatalogPreview(missing,{label:'蓝色一居小屋',local:true});assert.equal(missing.children[0].textContent,'图片暂缺');
});
