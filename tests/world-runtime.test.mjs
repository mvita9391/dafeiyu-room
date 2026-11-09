import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {migrateWorld} from '../server/storage/migrations.js';import {WorldService} from '../server/world/service.js';import {WorldRuntime,createRuntimeHandlers} from '../server/world/runtime.js';
const p={subjectId:'owner',worldIds:['default'],actorIds:['whale'],scopes:['world:read','actor:control'],role:'owner'};
function setup(){let now=1000;const db=new DatabaseSync(':memory:');migrateWorld(db);const service=new WorldService(db,{handlers:createRuntimeHandlers(),clock:()=>now});const runtime=new WorldRuntime(service,{worldId:'default'});let n=0;const run=(kind,payload)=>service.execute(p,{worldId:'default',requestId:`r${++n}`,kind,payload});const lease=run('control.acquire',{actorId:'whale'});return {db,service,runtime,run,lease,tick:()=>{now+=100;runtime.tick();},snapshot:()=>service.getSnapshot(p,'default')};}
test('movement advances at ticks and persists factual completion, retries do not restart',()=>{const s=setup();const a=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'move',target:{sceneId:'bedroom',position:[.05,0,1.1]}});assert.equal(a.status,'running');assert.notEqual(s.snapshot().actors[0].position[2],1.1);for(let i=0;i<30;i++)s.tick();assert.equal(s.snapshot().actions[a.actionId].status,'completed');assert.equal(s.snapshot().actors[0].position[2],1.1);s.db.close();});
test('cancellation and stale leases never complete the interrupted effect',()=>{const s=setup();assert.throws(()=>s.run('action.submit',{actorId:'whale',leaseId:'bad',leaseVersion:0,kind:'move',target:{sceneId:'yard'}}),/LEASE/);const a=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'move',target:{sceneId:'yard'}});s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'cancel'});for(let i=0;i<20;i++)s.tick();assert.equal(s.snapshot().actions[a.actionId].status,'cancelled');assert.equal(s.snapshot().actors[0].sceneId,'bedroom');s.db.close();});
test('navigation rejects occupied goal and routes to linked scenes',()=>{const s=setup();assert.throws(()=>s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'move',target:{sceneId:'bedroom',position:[-2.52,0,-2.32]}}),/BLOCKED/);const a=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'move',target:{sceneId:'living'}});for(let i=0;i<200;i++)s.tick();assert.equal(s.snapshot().actions[a.actionId].status,'completed');assert.equal(s.snapshot().actors[0].sceneId,'living');s.db.close();});
test('white rice changes hunger exactly during execution and stored completion cannot award twice',()=>{const s=setup();const a=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'eat'});const before=s.snapshot().actors[0].needs.hunger;for(let i=0;i<100;i++)s.tick();const after=s.snapshot().actors[0].needs.hunger;assert.equal(s.snapshot().actions[a.actionId].status,'completed');assert.ok(after<before-10);for(let i=0;i<20;i++)s.tick();assert.ok(s.snapshot().actors[0].needs.hunger>=after);s.db.close();});
test('removed interaction target fails, transaction failure rolls runtime back',()=>{const s=setup();const chair=s.snapshot().entities.find(e=>e.type==='bean');const a=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'sit',target:{entityId:chair.entityId,anchorId:'interaction'}});s.service.transactRuntime('default',({snapshot})=>{snapshot.entities=snapshot.entities.filter(e=>e.entityId!==chair.entityId);});s.tick();assert.equal(s.snapshot().actions[a.actionId].status,'failed');s.db.exec("CREATE TRIGGER noevents BEFORE UPDATE ON worlds BEGIN SELECT RAISE(ABORT,'noevents'); END");const before=s.snapshot();assert.throws(()=>s.tick(),/noevents/);assert.deepEqual(s.snapshot(),before);s.db.close();});
test('seat, bed, pool swim and slide execute phases at transformed anchors',()=>{for(const [kind,type,need] of [['sit','bean','happiness'],['sleep','bed','energy'],['swim','yardPool','happiness'],['slide','yardPool','happiness']]){const s=setup();s.service.transactRuntime('default',({snapshot})=>{snapshot.entities=snapshot.entities.filter(e=>e.protected);snapshot.entities.push({entityId:'target',sceneId:'bedroom',type,position:[0,0,-1],rotation:.2,scale:[.5,.5,.5]});snapshot.actors[0].position=[0,0,1];});const before=s.snapshot().actors[0].needs?.[need]??({happiness:70,energy:80})[need];const action=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind,target:{entityId:'target',anchorId:'interaction'}});let saw=false;for(let i=0;i<200;i++){s.tick();const snap=s.snapshot();if(snap.actions[action.actionId].phase==='interacting'){saw=true;if(kind==='swim')assert.equal(snap.actors[0].form,'swim');}}assert.ok(saw);assert.equal(s.snapshot().actions[action.actionId].status,'completed');assert.ok(s.snapshot().actors[0].needs[need]>before);s.db.close();}});
test('restart resumes stored path without offline action simulation; offline needs capped',()=>{const s=setup();const a=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'move',target:{sceneId:'bedroom',position:[.05,0,1.1]}});s.tick();const position=s.snapshot().actors[0].position;const restored=new WorldRuntime(new WorldService(s.db,{handlers:createRuntimeHandlers(),clock:()=>1200}),{worldId:'default'});restored.tick();assert.notDeepEqual(s.snapshot().actors[0].position,position);assert.equal(s.snapshot().actions[a.actionId].status,'running');const offline=new WorldRuntime(new WorldService(s.db,{clock:()=>36000000}),{worldId:'default'});offline.tick();assert.equal(s.snapshot().actions[a.actionId].status,'cancelled');assert.ok(s.snapshot().actors[0].needs.hunger<70);s.db.close();});
test('cached portals are revalidated after restart and cannot cross removed or changed connections',()=>{for(const change of ['remove','relink','blockedLanding']){const s=setup();const action=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'move',target:{sceneId:'living'}});s.service.transactRuntime('default',({snapshot})=>{const leg=snapshot.actions[action.actionId].legs[0];snapshot.actors[0].position=[...leg.portal.departure];leg.path=[];if(change==='remove')snapshot.portals=[];if(change==='relink')snapshot.portals.find(p=>p.portalId===leg.portal.portalId).toSceneId='yard';if(change==='blockedLanding')snapshot.entities.push({entityId:'block-landing',sceneId:'living',type:'table',position:[...leg.portal.landing],rotation:0,scale:[1,1,1]});});s.service.clock=()=>1100;new WorldRuntime(s.service,{worldId:'default'}).tick();assert.equal(s.snapshot().actors[0].sceneId,'bedroom');assert.equal(s.snapshot().actions[action.actionId].status,'failed');s.db.close();}});
test('ground destinations cannot inject flying height',()=>{const s=setup();assert.throws(()=>s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'move',target:{sceneId:'bedroom',position:[.05,100,1.1]}}),/GROUND/);assert.equal(Object.keys(s.snapshot().actions).length,0);s.db.close();});
test('targeted cancellation transaction refuses a different current action and preserves both records',()=>{const s=setup();try{const a=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'eat'});s.service.transactRuntime('default',({snapshot})=>{snapshot.actions.other={...snapshot.actions[a.actionId],actionId:'other'};snapshot.actors[0].actionId='other';});assert.throws(()=>s.run('action.cancel',{actorId:'whale',actionId:a.actionId,leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion}),/ACTION_NOT_CURRENT/);assert.equal(s.snapshot().actions[a.actionId].status,'running');assert.equal(s.snapshot().actions.other.status,'running');assert.equal(s.snapshot().actors[0].actionId,'other');}finally{s.db.close();}});

test('continuous owner movement retargets without cancelling or resetting pose',()=>{const s=setup();s.service.transactRuntime('default',({snapshot})=>{snapshot.entities=snapshot.entities.filter(e=>e.protected);snapshot.actors[0].position=[0,0,0];});const payload={actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'move'};const first=s.run('action.submit',{...payload,target:{sceneId:'bedroom',position:[0,0,1]}});s.tick();const second=s.run('action.submit',{...payload,target:{sceneId:'bedroom',position:[0,0,2]}});assert.equal(second.actionId,first.actionId);assert.equal(s.snapshot().actors[0].pose,'walking');const before=s.snapshot().actors[0].position[2];s.tick();assert.ok(Math.abs(s.snapshot().actors[0].position[2]-before-.282)<1e-8);s.db.close();});

test('walking retains the original 2.82 metres per second pace',()=>{const s=setup();s.service.transactRuntime('default',({snapshot})=>{snapshot.entities=snapshot.entities.filter(e=>e.protected);snapshot.actors[0].position=[0,0,-1];});s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'move',target:{sceneId:'bedroom',position:[0,0,2.5]}});for(let i=0;i<10;i++)s.tick();assert.ok(Math.abs(s.snapshot().actors[0].position[2]+1-2.82)<1e-8);s.db.close();});
test('desk chair has a reachable alternative approach and faces its furniture rotation',()=>{const s=setup();try{const chair=s.snapshot().entities.find(e=>e.type==='chair');const a=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'sit',target:{entityId:chair.entityId,anchorId:'approach'}});let seated;for(let i=0;i<150;i++){s.tick();const actor=s.snapshot().actors[0];if(actor.pose==='seated'){seated=actor;break;}}assert.ok(seated);assert.equal(seated.rotation,chair.rotation);assert.ok(Math.abs(seated.position[1]-.54)<1e-8);s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'cancel'});const position=s.snapshot().actors[0].position;assert.notEqual(position[1],.54);assert.equal(s.snapshot().actions[a.actionId].status,'cancelled');}finally{s.db.close();}});
test('eating stays at the current position instead of walking to the template spawn',()=>{const s=setup();try{s.service.transactRuntime('default',({snapshot})=>{snapshot.entities=snapshot.entities.filter(e=>e.protected);snapshot.actors[0].position=[-.7,0,.2];});const result=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'eat'});for(let i=0;i<4;i++)s.tick();assert.equal(s.snapshot().actors[0].pose,'eating');assert.deepEqual(s.snapshot().actors[0].position,[-.7,0,.2]);assert.equal(s.snapshot().actions[result.actionId].status,'running');}finally{s.db.close();}});
test('completed sitting persists beyond its action timer and lease, then movement stands safely',()=>{const s=setup();try{const chair=s.snapshot().entities.find(e=>e.type==='chair');const payload={actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion};const result=s.run('action.submit',{...payload,kind:'sit',target:{entityId:chair.entityId,anchorId:'approach'}});for(let i=0;i<150;i++)s.tick();let a=s.snapshot().actors[0];assert.equal(s.snapshot().actions[result.actionId].status,'completed');assert.equal(a.pose,'seated');assert.equal(a.actionId,null);assert.equal(a.resting.entityId,chair.entityId);const position=[...a.position];const restored=new WorldRuntime(new WorldService(s.db,{handlers:createRuntimeHandlers(),clock:()=>500000}),{worldId:'default'});restored.tick();a=s.snapshot().actors[0];assert.equal(a.pose,'seated');assert.deepEqual(a.position,position);const lease=s.run('control.takeover',{actorId:'whale'});assert.equal(s.snapshot().actors[0].pose,'idle');assert.equal(s.snapshot().actors[0].position[1],0);s.run('actor.input',{actorId:'whale',leaseId:lease.leaseId,leaseVersion:lease.leaseVersion,frames:[{sequence:1,dtMs:16,direction:[1,0]}]});assert.equal(s.snapshot().actors[0].position[1],0);}finally{s.db.close();}});
test('one rice bowl restores 50 fullness and ten seconds of actual sleep fills energy',()=>{
 for(const kind of ['eat','sleep']){const s=setup();try{
  s.service.transactRuntime('default',({snapshot})=>{snapshot.actors[0].needs={hunger:90,energy:0,happiness:70};});
  const bed=s.snapshot().entities.find(e=>e.type==='bed');
  const result=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind,...(kind==='sleep'?{target:{entityId:bed.entityId,anchorId:'approach'}}:{})});
  let start;for(let i=0;i<300;i++){s.tick();if(s.snapshot().actions[result.actionId].phase==='interacting'){start=s.snapshot().actors[0].needs;break;}}
  assert.ok(start);const duration=kind==='sleep'?100:30;
  for(let i=0;i<duration-1;i++)s.tick();assert.equal(s.snapshot().actions[result.actionId].status,'running');
  s.tick();const end=s.snapshot();assert.equal(end.actions[result.actionId].status,'completed');
  if(kind==='sleep')assert.equal(end.actors[0].needs.energy,100);
  else assert.ok(Math.abs(end.actors[0].needs.hunger-Math.max(0,start.hunger-50))<1e-8);
 }finally{s.db.close();}}
});
test('slide completes in the water, survives idle ticks and permits swimming to shore',()=>{
 const s=setup();try{
  s.service.transactRuntime('default',({snapshot})=>{snapshot.entities=[...snapshot.entities.filter(e=>e.protected),{entityId:'pool-test',sceneId:'yard',type:'yardPool',position:[0,0,0],rotation:0,scale:[1,1,1]}];Object.assign(snapshot.actors[0],{sceneId:'yard',position:[-5,0,0]});});
  const result=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'slide',target:{entityId:'pool-test',anchorId:'approach'}});
  for(let i=0;i<160&&s.snapshot().actions[result.actionId].status==='running';i++)s.tick();
  let a=s.snapshot().actors[0];assert.equal(s.snapshot().actions[result.actionId].status,'completed');assert.equal(a.form,'swim');assert.equal(a.pose,'swimming');assert.ok(a.position[0]>-2.4&&a.position[0]<2.4);
  const landed=[...a.position];for(let i=0;i<10;i++)s.tick();a=s.snapshot().actors[0];assert.equal(a.form,'swim');assert.deepEqual(a.position,landed);
  const lease=s.run('control.takeover',{actorId:'whale'});let sequence=0;
  for(let i=0;i<30;i++){s.tick();s.run('actor.input',{actorId:'whale',leaseId:lease.leaseId,leaseVersion:lease.leaseVersion,frames:[{sequence:++sequence,dtMs:50,direction:[1,0]},{sequence:++sequence,dtMs:50,direction:[1,0]}]});}
  a=s.snapshot().actors[0];assert.ok(a.position[0]>2.4);assert.equal(a.form,'normal');
 }finally{s.db.close();}
});
test('owner scene teleport arrives immediately at a safe spawn and rejects agent or missing scenes',()=>{const s=setup();try{const command={actorId:'whale',sceneId:'yard'};s.run('actor.teleport',command);const a=s.snapshot().actors[0];assert.equal(a.sceneId,'yard');assert.equal(a.actionId,null);assert.equal(a.moving,false);const before=s.snapshot();assert.throws(()=>s.run('actor.teleport',{...command,sceneId:'missing'}),/SCENE_NOT_FOUND/);assert.deepEqual(s.snapshot(),before);assert.throws(()=>s.service.execute({...p,role:'agent'},{worldId:'default',requestId:'agent-teleport',kind:'actor.teleport',payload:command}),/UNAUTHORIZED/);}finally{s.db.close();}});
test('scene-only movement and teleport stop at the destination entrance without walking to its centre',()=>{for(const teleport of [false,true]){const s=setup();try{if(teleport)s.run('actor.teleport',{actorId:'whale',sceneId:'yard'});else s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'move',target:{sceneId:'yard'}});for(let i=0;i<200;i++)s.tick();const actor=s.snapshot().actors[0];assert.equal(actor.sceneId,'yard');assert.ok(actor.position[0]<-5,'yard arrival stays beside the house entrance');assert.equal(actor.actionId,null);const position=[...actor.position];for(let i=0;i<20;i++)s.tick();assert.deepEqual(s.snapshot().actors[0].position,position,'arrival must not leave residual walking');}finally{s.db.close();}}});

test('climbing a scaled and rotated tree returns to the same safe ground point',()=>{
 const s=setup();
 try{
  s.service.transactRuntime('default',({snapshot})=>{
   snapshot.entities=snapshot.entities.filter(e=>e.sceneId!=='yard'||e.protected);
   snapshot.entities.push({entityId:'tree-test',sceneId:'yard',type:'yardTree',position:[8,0,2],rotation:Math.PI/2,scale:[1.4,1.4,1.4]});
   Object.assign(snapshot.actors[0],{sceneId:'yard',position:[11,0,2]});
  });
  const token={actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion};
  const start=()=>s.run('action.submit',{...token,kind:'climbTree',target:{entityId:'tree-test',anchorId:'approach'}});
  const {actionId}=start();
  const phases=new Set();
  let peak=0;
  for(let i=0;i<70;i++){
   s.tick();
   const a=s.snapshot().actors[0];
   if(a.pose==='tree-climbing'){phases.add(a.climbMotion);peak=Math.max(peak,a.position[1]);}
  }
  assert.deepEqual([...phases],[0,1,-1]);
  assert.ok(peak>1.4);
  const snapshot=s.snapshot(),result=snapshot.actions[actionId];
  assert.equal(result.status,'completed');
  assert.deepEqual(snapshot.actors[0].position,result.approachPosition);
  const next=start();
  for(let i=0;i<13;i++)s.tick();
  assert.ok(s.snapshot().actors[0].position[1]>.25);
  s.run('action.submit',{...token,kind:'cancel'});
  assert.equal(s.snapshot().actions[next.actionId].status,'cancelled');
  assert.deepEqual(s.snapshot().actors[0].position,result.approachPosition);
 }finally{s.db.close();}
});

test('idle checkpoints skip passive needs drift and record a position or pose change',async()=>{
 const {recordCheckpoint}=await import('../server/world/checkpoints.js');
 const snapshot={worldId:'default',runtime:{},actors:[{actorId:'whale',sceneId:'yard',position:[0,0,0],pose:'idle',needs:{hunger:30,energy:80,happiness:70}}]};
 const queries=[];
 const db={prepare:sql=>({run:()=>queries.push(sql),get:()=>undefined})};
 const events=[];
 const record=now=>recordCheckpoint(snapshot,now,db,(kind,data)=>events.push({kind,data:structuredClone(data)}));
 record(1000);
 snapshot.actors[0].needs.hunger=31;
 record(61_000);
 assert.equal(events.length,1);
 assert.equal(queries.length,2,'receipt pruning still runs during idle');
 snapshot.actors[0].position[0]=1;
 record(121_000);
 snapshot.actors[0].pose='seated';
 record(181_000);
 assert.deepEqual(events.map(event=>event.data.actors[0].pose),['idle','idle','seated']);
});

test('real-time position and input receipts stay in memory, with bedroom spawn after restart',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  migrateWorld(db);
  let now=1000;
  const open=()=>{
   const service=new WorldService(db,{handlers:createRuntimeHandlers(),clock:()=>now,memoryPosition:true});
   service.startMemoryRuntime();
   return service;
  };
  let service=open();
  const runtime=new WorldRuntime(service);
  const saved=()=>JSON.parse(db.prepare("SELECT snapshot FROM worlds WHERE world_id='default'").get().snapshot);
  const actor=()=>service.readSnapshot('default').actors[0];
  db.exec('CREATE TABLE writes (n INTEGER); INSERT INTO writes VALUES(0); CREATE TRIGGER count_writes AFTER UPDATE ON worlds BEGIN UPDATE writes SET n=n+1; END;');
  const writes=()=>db.prepare('SELECT n FROM writes').get().n;
  const tick=()=>{now+=100;runtime.tick();};
  runtime.tick();
  const initialWrites=writes();
  const initialNeeds=saved().actors[0].needs;
  for(let i=0;i<700;i++)tick();
  assert.equal(writes(),initialWrites);
  assert.ok(actor().needs.hunger>initialNeeds.hunger);
  assert.equal(saved().actors[0].position,undefined);
  const owner={role:'owner',subjectId:'buffer-owner',worldIds:['default'],actorIds:['whale'],scopes:['actor:control']};
  const run=(kind,requestId,payload)=>service.execute(owner,{kind,requestId,payload,worldId:'default'});
  run('actor.teleport','yard',{actorId:'whale',sceneId:'yard'});
  assert.equal(actor().sceneId,'yard');
  assert.equal(saved().actors[0].sceneId,undefined);
  const lease=run('control.takeover','take',{actorId:'whale'});
  const access={actorId:'whale',leaseId:lease.leaseId,leaseVersion:lease.leaseVersion};
  const input=sequence=>run('actor.input',`move-${sequence}`,{...access,frames:[{sequence,dtMs:20,direction:[1,0]}]});
  const beforeMovement=writes();
  const first=input(1);
  assert.deepEqual(input(1),first);
  for(let index=2;index<=65;index++){now+=1000;input(index);}
  assert.equal(writes(),beforeMovement);
  assert.equal(actor().input.sequence,65);
  assert.equal(db.prepare('SELECT count(*) n FROM movement_receipts').get().n,0);
  const pending=run('action.submit','leave-running',{...access,kind:'eat'});
  service.flushRuntime();
  assert.equal(saved().actors[0].position,undefined);
  assert.equal(saved().actors[0].input,undefined);
  service=open();
  assert.equal(actor().sceneId,'bedroom');
  assert.equal(actor().controller,null);
  assert.ok(Array.isArray(actor().position));
  assert.equal(service.readSnapshot('default').actions[pending.actionId].result.reason,'server_restart');
  assert.throws(()=>input(65),/LEASE_INVALID/);
  const checkpoint=JSON.parse(db.prepare("SELECT data FROM events WHERE kind='runtime.checkpoint' LIMIT 1").get().data);
  assert.equal(checkpoint.actors[0].position,undefined);
 }finally{db.close();}
});

test('owner control expires after ten idle seconds and MCP still receives a minute',()=>{
 const s=setup();
 try{
  const agent={...p,subjectId:'agent',role:'agent'};
  const acquire=()=>s.service.execute(agent,{worldId:'default',requestId:'agent-after-owner',kind:'control.acquire',payload:{actorId:'whale'}});
  const token={actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion};
  s.service.clock=()=>5000;
  s.run('actor.input',{...token,frames:[{sequence:1,dtMs:16,direction:[0,0]}]});
  s.service.clock=()=>14999;
  assert.throws(acquire,/LEASE_BUSY/);
  s.service.clock=()=>15000;
  assert.equal(acquire().expiresAt,75000);
 }finally{s.db.close();}
});

test('computer interaction seats the owner facing the bedroom desk and clears on movement',()=>{
 const s=setup();
 try{
  const scene=s.snapshot().entities.filter(e=>e.sceneId==='bedroom');
  const chair=scene.find(e=>e.type==='chair'),desk=scene.find(e=>e.type==='desk');
  const token={actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion};
  const result=s.run('action.submit',{...token,kind:'computer',target:{entityId:chair.entityId,anchorId:'approach'}});
  for(let i=0;i<90&&s.snapshot().actions[result.actionId].status==='running';i++)s.tick();
  const seated=s.snapshot().actors[0];
  assert.equal(seated.pose,'seated');
  assert.equal(seated.computerDeskId,desk.entityId);
  assert.equal(seated.rotation,Math.atan2(desk.position[0]-chair.position[0],desk.position[2]-chair.position[2]));
  assert.equal(s.snapshot().actions[result.actionId].status,'completed');
  s.run('actor.input',{...token,frames:[{sequence:1,dtMs:16,direction:[1,0]}]});
  const standing=s.snapshot().actors[0];
  assert.equal(standing.computerDeskId,undefined);
  assert.equal(standing.position[1],0);
 }finally{s.db.close();}
});
