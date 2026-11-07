import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldLayoutSync} from '../src/ui/layout-sync.js';
function fixture(){
 const entity={entityId:'chair-1',sceneId:'bedroom',type:'chair',position:[0,0,0],rotation:0,scale:[1,1,1]};
 let rollbacks=0,applied=0;
 const client={snapshot:{layoutRevision:1,entities:[entity]},async dispatch(command){if(command.kind==='build.preview')return {planId:'plan'};if(command.kind==='build.apply')return {changeId:'change',createdIds:{}};},async refresh(){}};
 const registry={scenes:new Map([['bedroom',{draft:false}]]),applySnapshot(){applied++;}};
 const sync=new WorldLayoutSync({client,registry,sceneId:'bedroom',notify(){},storage:{setItem(){},removeItem(){}},onRollback(){rollbacks++;}});
 return {sync,entity,client,registry,rollbacks:()=>rollbacks,applied:()=>applied};
}
test('selection-only click and successful transform save never invoke deselection rollback',async()=>{
 for(const rotation of [0,Math.PI/12]){const f=fixture();f.sync.enqueue([{...f.entity,rotation}]);await f.sync.flush();assert.equal(f.rollbacks(),0);assert.equal(f.sync.pending,null);assert.equal(f.registry.scenes.get('bedroom').draft,false);assert.equal(f.applied(),1);}
});
test('rejected edit and explicit database restore still invoke rollback',async()=>{
 const f=fixture();f.client.dispatch=async()=>{throw Error('PLACEMENT_BLOCKED');};f.sync.enqueue([{...f.entity,rotation:1}]);await f.sync.flush();assert.equal(f.rollbacks(),1);assert.equal(f.sync.error.message,'PLACEMENT_BLOCKED');await f.sync.useDatabaseVersion();assert.equal(f.rollbacks(),2);
});
test('manual editor preserves rejected placement as editable preview, then commits a corrected position',async()=>{
 const f=fixture();f.sync.preserveDraftOnError=true;let reject=true;f.client.dispatch=async command=>{if(reject)throw Error('SPAWN_BLOCKED');return command.kind==='build.preview'?{planId:'p'}:{changeId:'c',createdIds:{}};};
 f.sync.enqueue([{...f.entity,position:[1,0,1]}]);await f.sync.flush();assert.equal(f.rollbacks(),0);assert.equal(f.registry.scenes.get('bedroom').draft,true);assert.ok(f.sync.pending);assert.match(f.sync.message,/出生.*家具已保留/);
 reject=false;f.sync.enqueue([{...f.entity,position:[-2,0,0]}]);await f.sync.flush();assert.equal(f.sync.pending,null);assert.equal(f.registry.scenes.get('bedroom').draft,false);assert.equal(f.sync.error,null);
});
