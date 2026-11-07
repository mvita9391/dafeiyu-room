import test from 'node:test';import assert from 'node:assert/strict';
import {AssetCache} from '../src/core/asset-cache.js';
test('asset cache bounds concurrency, coalesces loads, releases cancelled consumers and evicts idle resources',async()=>{
 let inflight=0,max=0,disposed=[];const cache=new AssetCache({concurrency:2,maxIdle:1,maxBytes:10,load:async key=>{inflight++;max=Math.max(max,inflight);await new Promise(r=>setTimeout(r,5));inflight--;return {key,bytes:6};},dispose:x=>disposed.push(x.key)});
 const a=cache.acquire('a'),a2=cache.acquire('a'),b=cache.acquire('b'),c=cache.acquire('c');a.release();await Promise.all([a.promise,a2.promise,b.promise,c.promise]);assert.equal(max,2);assert.equal(cache.stats.loads,3);a2.release();b.release();c.release();assert.equal(cache.stats.idle,1);assert.equal(disposed.length,2);assert.equal(cache.stats.active,0);
});

test('palette textures share ownership across models and dispose only after last model lease',async()=>{
 const {PalettePool}=await import('../src/core/asset-cache.js');let disposed=[];const pool=new PalettePool(r=>disposed.push(r.id));
 const a=pool.acquire('colors',{id:'one'}),b=pool.acquire('colors',{id:'duplicate'});assert.equal(a.value,b.value);assert.deepEqual(disposed,['duplicate']);a.release();assert.equal(disposed.length,1);b.release();assert.deepEqual(disposed,['duplicate','one']);assert.equal(pool.entries.size,0);
});

test('cancelled queued loads never start and late results immediately release palettes',async()=>{
 let finish;const loaded=[],disposed=[];const palettes=new (await import('../src/core/asset-cache.js')).PalettePool(v=>disposed.push(v));
 const cache=new AssetCache({concurrency:1,load:key=>{loaded.push(key);return new Promise(resolve=>{finish=()=>resolve({key,palette:palettes.acquire('c','palette')});});},dispose:v=>{disposed.push(v.key);v.palette.release();}});
 const a=cache.acquire('running'),b=cache.acquire('queued');a.promise.catch(()=>{});b.promise.catch(()=>{});await Promise.resolve();a.release();b.release();finish();await new Promise(r=>setTimeout(r,5));assert.deepEqual(loaded,['running']);assert.equal(cache.entries.size,0);assert.equal(palettes.entries.size,0);assert.deepEqual(disposed,['running','palette']);
});
