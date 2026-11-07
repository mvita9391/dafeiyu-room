import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderActivity } from '../src/core/render-activity.js';

test('background mode cancels game and preview frames and wakes each loop once',()=>{
 const queued=new Map();
 let id=0;
 const render=createRenderActivity(true,{
  requestFrame:callback=>{queued.set(++id,callback);return id;},
  cancelFrame:token=>queued.delete(token),
 });
 const runFrame=()=>{
  const callbacks=[...queued.values()];
  queued.clear();
  for(const callback of callbacks)callback(0);
 };
 let game=0,preview=0;
 const stopGame=render.loop(()=>game++);
 const stopPreview=render.loop(()=>preview++);
 runFrame();
 assert.deepEqual([game,preview,queued.size],[1,1,2]);
 render.setActive(false);
 runFrame();
 assert.deepEqual([game,preview,queued.size],[1,1,0]);
 render.setActive(true);
 render.setActive(true);
 runFrame();
 assert.deepEqual([game,preview,queued.size],[2,2,2]);
 stopPreview();
 runFrame();
 assert.deepEqual([game,preview,queued.size],[3,2,1]);
 stopGame();
 assert.equal(queued.size,0);
});
