import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {migrateWorld} from '../server/storage/migrations.js';import {WorldService} from '../server/world/service.js';import {appendEvent} from '../server/world/events.js';
const p={subjectId:'one',worldIds:['default'],scopes:['world:read'],actorIds:[],role:'agent'};
const setup=()=>{const db=new DatabaseSync(':memory:');migrateWorld(db);return {db,s:new WorldService(db)}};
test('read does not consume; ack requires every delivered event and stable subject persists',()=>{const {db,s}=setup();for(let i=0;i<3;i++)appendEvent(db,{worldId:'default',kind:'changed',subjectId:null,changeId:null,data:{i}});assert.throws(()=>s.ackEvents(p,{worldId:'default',cursor:1,requestId:'a'}),/NOT_DELIVERED/);s.getEvents(p,{worldId:'default',afterCursor:1});assert.throws(()=>s.ackEvents(p,{worldId:'default',cursor:3,requestId:'a'}),/NOT_DELIVERED/);const first=s.getEvents(p,{worldId:'default',limit:1});assert.deepEqual(s.getEvents(p,{worldId:'default',limit:1}),first);assert.equal(s.resumeSummary(p,'default').lastConfirmedCursor,0);assert.equal(s.ackEvents(p,{worldId:'default',cursor:3,requestId:'a'}).confirmedCursor,3);assert.equal(new WorldService(db).resumeSummary({...p,token:'renewed'},'default').lastConfirmedCursor,3);assert.equal(s.resumeSummary({...p,subjectId:'two'},'default').lastConfirmedCursor,0);assert.throws(()=>s.ackEvents(p,{worldId:'default',cursor:2,requestId:'a'}),/REQUEST_ID_REUSED/);db.close()});
test('empty pages never deliver arbitrary cursor and deleted history reports snapshot reset',()=>{const {db,s}=setup();s.getEvents(p,{worldId:'default',afterCursor:999});assert.throws(()=>s.ackEvents(p,{worldId:'default',cursor:999,requestId:'x'}),/NOT_DELIVERED/);appendEvent(db,{worldId:'default',kind:'changed',subjectId:null,changeId:null,data:{}});s.getEvents(p,{worldId:'default'});db.exec('DELETE FROM events');assert.equal(s.resumeSummary(p,'default').snapshotResetRequired,true);db.close()});
test('world boundaries and retained event gaps cannot confuse delivery highwater',()=>{const {db,s}=setup();const snapshot=s.readSnapshot('default');db.prepare('INSERT INTO worlds VALUES(?,?,?,?)').run('other',1,0,JSON.stringify({...snapshot,worldId:'other'}));const both={...p,worldIds:['default','other']};appendEvent(db,{worldId:'other',kind:'changed',subjectId:null,changeId:null,data:{}});const id=appendEvent(db,{worldId:'default',kind:'changed',subjectId:null,changeId:null,data:{}});s.getEvents(both,{worldId:'other'});assert.throws(()=>s.ackEvents(both,{worldId:'default',cursor:id,requestId:'other-world'}),/NOT_DELIVERED/);assert.equal(s.resumeSummary(p,'default').snapshotResetRequired,false);db.prepare('DELETE FROM events WHERE cursor=?').run(id);assert.equal(s.resumeSummary(p,'default').snapshotResetRequired,true);db.close()});
test('retention gaps block ordinary ack until an authorized snapshot receipt is explicitly confirmed',async()=>{const {db,s}=setup();for(let i=0;i<2;i++)appendEvent(db,{worldId:'default',kind:'changed',subjectId:null,changeId:null,data:{i}});s.getEvents(p,{worldId:'default',afterCursor:1});db.exec('DELETE FROM events WHERE cursor=1');assert.equal(s.resumeSummary(p,'default').snapshotResetRequired,true);assert.throws(()=>s.ackEvents(p,{worldId:'default',cursor:2,requestId:'gap'}),/CURSOR_GAP_UNRECOVERED/);const {createToolCaller}=await import('../server/mcp/tools.js');const call=createToolCaller(s,{resolvePrincipal:()=>p}),entered=await call('world_enter',{});assert.equal(entered.recoverySnapshot.worldId,'default');assert.ok(entered.recoveryToken);assert.equal(entered.recoveryCursor,2);assert.throws(()=>s.ackEvents({...p,subjectId:'foreign'},{worldId:'default',cursor:2,requestId:'steal',recoveryToken:entered.recoveryToken}),/INVALID_RECOVERY_TOKEN/);assert.throws(()=>s.ackEvents(p,{worldId:'default',cursor:999,requestId:'beyond',recoveryToken:entered.recoveryToken}),/INVALID_RECOVERY_TOKEN/);assert.throws(()=>s.ackEvents(p,{worldId:'default',cursor:2,requestId:'forged',recoveryToken:'forged'}),/INVALID_RECOVERY_TOKEN/);const ack=await call('world_ack_events',{cursor:entered.recoveryCursor,requestId:'recover',recoveryToken:entered.recoveryToken});assert.equal(ack.confirmedCursor,2);assert.equal(s.resumeSummary(p,'default').snapshotResetRequired,false);db.close()});
test('snapshot recovery receipts are world-bound and expire without clearing gaps',()=>{const {db,s}=setup();let now=1000;s.clock=()=>now;const snapshot=s.readSnapshot('default');db.prepare('INSERT INTO worlds VALUES(?,?,?,?)').run('other',1,0,JSON.stringify({...snapshot,worldId:'other'}));const both={...p,worldIds:['default','other']};for(const worldId of ['default','other']){appendEvent(db,{worldId,kind:'changed',subjectId:null,changeId:null,data:{}});}db.exec('DELETE FROM events');const receipt=s.snapshotRecovery(both,'default');assert.throws(()=>s.ackEvents(both,{worldId:'other',cursor:receipt.recoveryCursor,requestId:'world',recoveryToken:receipt.recoveryToken}),/INVALID_RECOVERY_TOKEN/);now+=300001;assert.throws(()=>s.ackEvents(both,{worldId:'default',cursor:receipt.recoveryCursor,requestId:'expired',recoveryToken:receipt.recoveryToken}),/INVALID_RECOVERY_TOKEN/);assert.equal(s.resumeSummary(both,'default').snapshotResetRequired,true);db.close()});

test('compacting duplicate checkpoints preserves delivered cursors, the world head and real gap detection',async()=>{
 const {compactCheckpoints}=await import('../server/storage/checkpoint-cleanup.js');
 const {db,s}=setup();
 try{
  const checkpoint=(x,hunger)=>appendEvent(db,{worldId:'default',kind:'runtime.checkpoint',subjectId:null,changeId:null,
   data:{actors:[{actorId:'whale',sceneId:'yard',position:[x,0,0],pose:'idle',needs:{hunger}}]}});
  const first=checkpoint(0,30);
  const alreadyDelivered=checkpoint(0,31);
  s.getEvents(p,{worldId:'default'});
  const unseen=checkpoint(0,32);
  const changed=checkpoint(1,32);
  const head=checkpoint(1,33);
  const before=s.readSnapshot('default');
  assert.deepEqual(compactCheckpoints(db),{removed:2,kept:3});
  assert.deepEqual(compactCheckpoints(db),{removed:0,kept:3});
  assert.deepEqual(s.readSnapshot('default'),before);
  assert.equal(s.cursor('default'),head);
  assert.equal(s.resumeSummary(p,'default').snapshotResetRequired,false);
  assert.equal(s.ackEvents(p,{worldId:'default',cursor:alreadyDelivered,requestId:'pre-cleanup'}).confirmedCursor,alreadyDelivered);
  assert.deepEqual(s.getEvents(p,{worldId:'default',afterCursor:alreadyDelivered}).events.map(event=>event.cursor),[changed,head]);
  assert.throws(()=>s.ackEvents(p,{worldId:'default',cursor:unseen,requestId:'never-delivered'}),/NOT_DELIVERED/);
  db.prepare('DELETE FROM events WHERE cursor=?').run(changed);
  assert.equal(s.resumeSummary(p,'default').snapshotResetRequired,true);
  assert.ok(first<alreadyDelivered);
 }finally{db.close();}
});
