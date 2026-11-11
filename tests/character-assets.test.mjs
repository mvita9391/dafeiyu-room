import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {resolveConfig} from 'vite';
import {blockedPublicFile} from '../scripts/check-public.mjs';
import {buildServer} from '../server/app.js';
import {BAIZE_ASSET_URL} from '../shared/world/baize-battle.js';
test('bundled character manifest authorizes only exact resources and runtime selection is portable',async()=>{
 const manifest=JSON.parse(fs.readFileSync('resources/character/manifest.json','utf8'));
 assert.deepEqual(manifest.files.map(f=>f.path),['resources/character/models/Dafeiyu.glb','resources/character/models/baize.glb','resources/character/models/fish-bowl.glb','resources/character/models/fish-bowl-anims.glb']);
 assert.ok(manifest.files.every(f=>f.runtime===true));
 for(const f of manifest.files){assert.equal(createHash('sha256').update(fs.readFileSync(f.path)).digest('hex'),f.sha256);assert.equal(blockedPublicFile(f.path),false,f.path);}
 for(const p of ['resources/character/models/unknown.glb','resources/character/models/Whale_Maid_Lively.glb','resources/character/characters/whale-maid-paper.png','resources/character/models/Whale_Maid_Lively.blend1','resources/character/models/secrets.json'])assert.equal(blockedPublicFile(p),true,p);
 for(const command of ['serve','build']){const c=await resolveConfig({configFile:'vite.config.js'},command);const plugin=c.plugins.find(p=>p.name==='bundled-character');assert.ok(plugin);const config=JSON.parse(plugin.load('\0virtual:character-config').replace('export default ',''));assert.equal(config.defaultCharacter,'dafeiyu');assert.match(config.modelBase,/^\.\/resources\/character\/models\/$/);assert.ok(!JSON.stringify(config).includes('__private'));}
});

test('a world without local assets serves the bundled Baize model',async()=>{
 const app=await buildServer({databasePath:':memory:',worldMode:true,startRuntime:false,localAssetDir:null,resolvePrincipal:()=>({role:'owner'})});
 try{
  const response=await app.inject(BAIZE_ASSET_URL);
  assert.equal(response.statusCode,200);
  assert.equal(response.headers['content-type'],'model/gltf-binary');
  const manifest=JSON.parse(fs.readFileSync('resources/character/manifest.json','utf8'));
  const model=manifest.files.find(file=>file.path==='resources/character/models/baize.glb');
  assert.equal(response.rawPayload.length,model.bytes);
  assert.equal(createHash('sha256').update(response.rawPayload).digest('hex'),model.sha256);
 }finally{await app.close();}
});
