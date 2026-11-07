import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LayoutSync} from '../src/ui/layout-sync.js';
import {buildServer} from '../server/app.js';
const layout=[{type:'bed',position:[0,0,0],rotation:0,scale:[1,1,1]}];
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
test('migration, sequential saves, offline retry and conflict recovery',async()=>{
 const app=await buildServer({databasePath:':memory:'});let online=true;
 const request=async(url,options)=>{
  if(!online)throw new Error('Offline');
  const res=await app.inject({url,method:options.method,payload:options.body?JSON.parse(options.body):undefined});
  return {ok:res.statusCode===200,status:res.statusCode,json:async()=>res.json()};
 };
 const store=storage();let restored=null;
 const sync=new LayoutSync({storage:store,request,restore:l=>restored=l,notify:()=>{}});
 try {
  await sync.init(layout);assert.equal(sync.revision,1);assert.equal(sync.pending,null);
  sync.enqueue([]);await sync.flush();assert.equal(sync.revision,2);
  const second=new LayoutSync({storage:storage(),request,restore:l=>restored=l,notify:()=>{}});
  await second.init(layout);assert.deepEqual(restored,[],'empty database layout overrides old browser backup');
  online=false;sync.enqueue(layout);await sync.flush();assert.ok(sync.pending);assert.ok(store.getItem('dafeiyu-bedroom-pending-v1'));
  online=true;await sync.flush();assert.equal(sync.revision,3);
  second.enqueue([]);await second.flush();assert.equal(second.conflict,true);assert.ok(second.pending);
  await second.useDatabaseVersion();assert.equal(second.conflict,false);assert.deepEqual(restored,layout);
 } finally {clearTimeout(sync.timer);await app.close();}
});
