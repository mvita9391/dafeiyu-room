import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildServer} from '../server/app.js';
const layout=[{type:'chair',position:[1,0,1],rotation:Math.PI,scale:[1,1,1]}];
test('SQLite persists saves, rejects malformed layouts and stale writes',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'dafeiyu-db-test-'));
 let app;
 try {
  app=await buildServer({databasePath:path.join(dir,'test.sqlite')});
  assert.deepEqual((await app.inject('/api/layout/bedroom')).json().layout,null);
  let result=await app.inject({method:'PUT',url:'/api/layout/bedroom',payload:{layout,revision:0}});
  assert.equal(result.statusCode,200);assert.equal(result.json().revision,1);
  await app.close();app=await buildServer({databasePath:path.join(dir,'test.sqlite')});
  assert.deepEqual((await app.inject('/api/layout/bedroom')).json().layout,layout);
  result=await app.inject({method:'PUT',url:'/api/layout/bedroom',payload:{layout:[],revision:0}});assert.equal(result.statusCode,409);
  for(const bad of [[{...layout[0],type:'__proto__'}],[{...layout[0],position:[99,0,0]}],Array(101).fill(layout[0])]) {
   result=await app.inject({method:'PUT',url:'/api/layout/bedroom',payload:{layout:bad,revision:1}});assert.equal(result.statusCode,400);
  }
  result=await app.inject({method:'PUT',url:'/api/layout/bedroom',headers:{origin:'https://example.com'},payload:{layout,revision:1}});assert.equal(result.statusCode,403);
  result=await app.inject({method:'PUT',url:'/api/layout/bedroom',payload:{layout:[],revision:1}});assert.equal(result.statusCode,200);
  assert.deepEqual((await app.inject('/api/layout/bedroom')).json().layout,[]);
 }finally{if(app)await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('scene layouts are isolated and yard supports expanded coordinates',async()=>{
 const app=await buildServer({databasePath:':memory:'});
 try {
  const yard=[{type:'yardTree',position:[6,0,6],rotation:0,scale:[1,1,1]}];
  assert.equal((await app.inject({method:'PUT',url:'/api/layout/yard',payload:{layout:yard,revision:0}})).statusCode,200);
  assert.equal((await app.inject({method:'PUT',url:'/api/layout/living',payload:{layout,revision:0}})).statusCode,200);
  assert.deepEqual((await app.inject('/api/layout/yard')).json().layout,yard);
  assert.deepEqual((await app.inject('/api/layout/living')).json().layout,layout);
  assert.equal((await app.inject('/api/layout/bedroom')).json().layout,null);
  assert.equal((await app.inject('/api/layout/unknown')).statusCode,404);
 }finally{await app.close();}
});
