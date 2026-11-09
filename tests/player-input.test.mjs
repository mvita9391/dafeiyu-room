import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {migrateWorld} from '../server/storage/migrations.js';
import {WorldService} from '../server/world/service.js';
import {WorldRuntime,createRuntimeHandlers} from '../server/world/runtime.js';
const owner={subjectId:'owner',worldIds:['default'],actorIds:['whale'],scopes:['world:read','actor:control'],role:'owner'};
function setup(){let now=1000,n=0;const db=new DatabaseSync(':memory:');migrateWorld(db);const service=new WorldService(db,{handlers:createRuntimeHandlers(),clock:()=>now});service.transactRuntime('default',({snapshot})=>{snapshot.entities=snapshot.entities.filter(e=>e.protected);snapshot.actors[0].position=[0,0,0];});const run=(kind,payload,principal=owner)=>service.execute(principal,{worldId:'default',requestId:`input-${++n}`,kind,payload});const lease=run('control.takeover',{actorId:'whale'});return {db,service,run,lease,advance:ms=>now+=ms,snapshot:()=>service.getSnapshot(owner,'default'),runtime:new WorldRuntime(service)};}
const frame=(sequence,dtMs=16,direction=[1,0])=>({sequence,dtMs,direction});
test('keyboard prediction and the server allow one extra jump per landing',async()=>{
 const {PlayerController}=await import('../src/core/player-controller.js');
 const s=setup();
 const player=new PlayerController({takeControl:async()=>s.lease,send:payload=>s.run('actor.input',payload)});
 try{
  player.begin(s.snapshot().actors[0]);
  const step=async(jump=false)=>{
   s.advance(50);
   player.step(s.snapshot(),[0,0],.05,jump);
   const predicted=player.sample();
   await player.flush();
   const actual=s.snapshot().actors[0];
   assert.equal(actual.jumpStage,predicted.jumpStage);
   assert.equal(actual.airHeight,predicted.airHeight);
   return actual;
  };
  assert.equal((await step(true)).jumpStage,1);
  assert.equal((await step(true)).jumpStage,1);
  await step();
  const second=await step(true);
  assert.equal(second.jumpStage,2);
  await step();
  const third=await step(true);
  assert.equal(third.jumpStage,2);
  assert.ok(third.verticalVelocity<second.verticalVelocity);
  for(let i=0;i<18&&!player.sample().grounded;i++)await step();
  assert.equal(player.sample().grounded,true);
  assert.equal(player.sample().jumpStage,0);
  assert.equal((await step(true)).jumpStage,1);
 }finally{player.release();s.db.close();}
});
test('owner input is acknowledged exactly once, cannot move autonomously after key release',()=>{const s=setup();try{const payload={actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,frames:[frame(1,50),frame(2,50)]};const result=s.run('actor.input',payload);assert.equal(result.actor.input.sequence,2);assert.ok(Math.abs(result.actor.position[0]-.282)<1e-9);s.run('actor.input',payload);assert.ok(Math.abs(s.snapshot().actors[0].position[0]-.282)<1e-9);s.run('actor.input',{...payload,frames:[frame(3,0,[0,0])]});s.advance(500);s.runtime.tick();assert.equal(s.snapshot().actors[0].pose,'idle');assert.ok(Math.abs(s.snapshot().actors[0].position[0]-.282)<1e-9);}finally{s.db.close();}});
test('input refuses stale lease, missing control permission, non-owner, gaps and excessive simulated time',()=>{const s=setup();try{const payload={actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,frames:[frame(1)]};assert.throws(()=>s.run('actor.input',payload,{...owner,scopes:['world:read']}),/UNAUTHORIZED/);assert.throws(()=>s.run('actor.input',payload,{...owner,role:'agent'}),/UNAUTHORIZED/);assert.throws(()=>s.run('actor.input',{...payload,leaseVersion:0}),/LEASE_INVALID/);assert.throws(()=>s.run('actor.input',{...payload,frames:[frame(2)]}),/INPUT_SEQUENCE/);assert.throws(()=>s.run('actor.input',{...payload,frames:Array.from({length:6},(_,i)=>frame(i+1,50))}),/INPUT_RATE/);assert.equal(s.snapshot().actors[0].position[0],0);}finally{s.db.close();}});
test('prediction responds before an unresolved network request; acknowledgements replay pending frames without rubber banding',async()=>{const {PlayerController}=await import('../src/core/player-controller.js');const s=setup();try{let resolveSend;const player=new PlayerController({takeControl:async()=>s.lease,send:payload=>new Promise(resolve=>resolveSend=()=>resolve(s.run('actor.input',payload)))});player.begin(s.snapshot().actors[0]);player.step(s.snapshot(),[1,0],.016);assert.ok(Math.abs(player.sample().position[0]-.04512)<1e-8);const sending=player.flush();await Promise.resolve();await Promise.resolve();assert.ok(resolveSend);player.step(s.snapshot(),[1,0],.016);const before=player.sample().position[0];resolveSend();await sending;assert.ok(Math.abs(player.sample().position[0]-before)<1e-8);player.reconcile({...s.snapshot().actors[0],input:{...s.snapshot().actors[0].input,sequence:0},position:[-1,0,0]});assert.equal(player.sample().position[0],before);player.stop();const stopped=player.sample().position[0];assert.equal(player.sample().moving,false);assert.equal(player.sample().position[0],stopped);player.release();}finally{s.db.close();}});
test('shared frame movement normalizes diagonal speed and stops at blocking geometry',async()=>{const {advancePlayer}=await import('../shared/world/movement.js');const snapshot={scenes:[{sceneId:'room',templateId:'cozy_room_v1'}],entities:[]};const actor={sceneId:'room',position:[0,0,0],rotation:0};const next=advancePlayer(snapshot,actor,[1,1],50);assert.ok(Math.abs(Math.hypot(next.position[0],next.position[2])-.141)<1e-8);snapshot.entities=[{sceneId:'room',type:'chair',position:[.8,0,0],rotation:0,scale:[1,1,1]}];let result=actor;for(let i=0;i<60;i++)result=advancePlayer(snapshot,result,[1,0],16);assert.ok(result.position[0]<.8);});
test('first input budget includes time spent waiting for control confirmation',()=>{const s=setup();try{s.advance(500);const result=s.run('actor.input',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,frames:Array.from({length:10},(_,i)=>frame(i+1,50))});assert.equal(result.actor.input.sequence,10);assert.ok(Math.abs(result.actor.position[0]-1.41)<1e-9);}finally{s.db.close();}});
test('keyup flushes unsent movement and stop even while the previous request is delayed',async()=>{const {PlayerController}=await import('../src/core/player-controller.js');const s=setup();try{const sent=[];let release;const player=new PlayerController({takeControl:async()=>s.lease,send:async payload=>{sent.push(payload);if(sent.length===1)await new Promise(r=>release=r);return s.run('actor.input',payload);}});player.begin(s.snapshot().actors[0]);player.step(s.snapshot(),[1,0],.016);const first=player.flush();await Promise.resolve();await Promise.resolve();player.step(s.snapshot(),[1,0],.016);player.stop();const keyup=player.flush();release();await Promise.all([first,keyup]);await new Promise(r=>setImmediate(r));assert.equal(player.pending.length,0);assert.equal(s.snapshot().actors[0].input.sequence,3);assert.equal(s.snapshot().actors[0].pose,'idle');assert.ok(Math.abs(s.snapshot().actors[0].position[0]-player.sample().position[0])<1e-9);player.release();}finally{s.db.close();}});
test('multi-second movement stays continuous through delayed confirmations, turns and release',async()=>{const {PlayerController}=await import('../src/core/player-controller.js');const {advancePlayer}=await import('../shared/world/movement.js');const s=setup();try{let complete;const player=new PlayerController({takeControl:async()=>s.lease,send:payload=>new Promise(resolve=>{complete=()=>resolve(s.run('actor.input',payload));})});let expected=s.snapshot().actors[0];player.begin(expected);for(let i=0;i<240;i++){s.advance(16);const direction=i<80?[1,0]:i<160?[0,1]:[-1,0];const snapshot=s.snapshot();player.step(snapshot,direction,.016);expected=advancePlayer(snapshot,expected,direction,16);assert.ok(Math.hypot(...player.sample().position.map((v,j)=>v-expected.position[j]))<1e-8);if(i%6===0)player.flush().catch(()=>{});await Promise.resolve();await Promise.resolve();if(complete&&i%24>=11){const finish=complete;complete=null;finish();await new Promise(r=>setImmediate(r));assert.ok(Math.hypot(...player.sample().position.map((v,j)=>v-expected.position[j]))<1e-8);}}player.stop();const draining=player.drain();for(let i=0;i<10&&player.pending.length;i++){await new Promise(r=>setImmediate(r));if(complete){const finish=complete;complete=null;finish();}}await draining;assert.equal(player.pending.length,0);assert.equal(player.sample().moving,false);assert.ok(Math.hypot(...s.snapshot().actors[0].position.map((v,j)=>v-expected.position[j]))<1e-8);player.release();}finally{s.db.close();}});
test('leaving a persisted seat predicts movement from its ground approach immediately',async()=>{const {PlayerController}=await import('../src/core/player-controller.js');const snapshot={scenes:[{sceneId:'room',templateId:'cozy_room_v1'}],entities:[]};const player=new PlayerController({takeControl:()=>new Promise(()=>{}),send:async()=>{}});player.begin({actorId:'whale',sceneId:'room',position:[0,.54,0],rotation:0,pose:'seated',resting:{approachPosition:[0,0,1]}});player.step(snapshot,[1,0],.016);assert.equal(player.sample().position[1],0);assert.ok(player.sample().position[0]>0);assert.equal(player.sample().position[2],1);player.release();});
test('local authority window: delayed server positions cannot rubber-band the operator',async()=>{
 const {PlayerController}=await import('../src/core/player-controller.js');
 let clock=1000;
 const lease={leaseId:'l1',leaseVersion:1,expiresAt:999999};
 const controller={...lease,subjectId:'owner'};
 const base={actorId:'whale',sceneId:'room',position:[0,0,0],rotation:0,pose:'idle',form:'normal',controller,input:{leaseId:'l1',sequence:0},needs:{hunger:10,energy:90,happiness:70}};
 const snapshot={scenes:[{sceneId:'room',templateId:'cozy_room_v1'}],entities:[]};
 const player=new PlayerController({takeControl:async()=>lease,send:async()=>({}),now:()=>clock});
 player.begin(base);
 await Promise.resolve();await Promise.resolve();
 player.step(snapshot,[1,0],.016); // 本地立刻预测出位移
 const predicted=player.sample().position[0];
 assert.ok(predicted>0);
 // 按住方向键期间：服务端带回旧位置 + 新 ack，位置必须保持本地预测
 player.reconcile({...base,input:{leaseId:'l1',sequence:1},position:[-1,0,0],needs:{hunger:20,energy:80,happiness:60}});
 assert.ok(Math.abs(player.sample().position[0]-predicted)<1e-9,'按住时不被旧位置覆盖');
 assert.equal(player.sample().needs.hunger,20,'非位置字段仍然同步');
 // 松开后 3 秒内同样保护
 player.stop();
 clock+=1000;
 player.reconcile({...base,input:{leaseId:'l1',sequence:2},position:[-2,0,0]});
 assert.ok(Math.abs(player.sample().position[0]-predicted)<1e-9,'松开 1 秒内仍保护');
 clock+=2500; // 超过 3 秒窗口
 player.reconcile({...base,input:{leaseId:'l1',sequence:3},position:[-3,0,0]});
 assert.equal(player.sample().position[0],-3,'窗口结束后才接受服务端位置');
 player.release();
});
test('resuming movement seeds from the last rendered position instead of a stale snapshot',async()=>{
 const {PlayerController}=await import('../src/core/player-controller.js');
 const lease={leaseId:'l1',leaseVersion:1,expiresAt:999999};
 const snapshot={scenes:[{sceneId:'room',templateId:'cozy_room_v1'}],entities:[]};
 const stale={actorId:'whale',sceneId:'room',position:[1,0,0],rotation:0,pose:'idle',form:'normal',controller:{...lease,subjectId:'owner'},input:{leaseId:'l1',sequence:3}};
 const player=new PlayerController({takeControl:async()=>lease,send:async()=>({})});
 // 渲染层已经走到 1.4，但快照还停在 1.0：重新接管时不能跳回 1.0
 player.begin(stale,{sceneId:'room',position:[1.4,0.03,0]});
 assert.ok(Math.abs(player.sample().position[0]-1.4)<1e-9,'从渲染位置继续');
 player.step(snapshot,[1,0],.016);
 assert.ok(player.sample().position[0]>1.4,'继续向前预测');
 player.release();
 // 快照/渲染位置差太远（比如刚传送）时仍以服务端为准
 const far={...stale,position:[5,0,0]};
 const second=new PlayerController({takeControl:async()=>lease,send:async()=>({})});
 second.begin(far,{sceneId:'room',position:[0,0.03,0]});
 assert.equal(second.sample().position[0],5,'距离过大时信服务端');
 second.release();
});
test('movement input cancels any running action: walking wins over sitting/click-to-move',()=>{
 const s=setup();
 try{
  const a=s.snapshot().actors[0];
  const move=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'move',target:{sceneId:a.sceneId,position:[2,0,2]}});
  assert.ok(move.actionId);
  assert.equal(s.snapshot().actors[0].actionId,move.actionId);
  // 走动输入到达：取消进行中的动作并立刻按输入移动
  const before=s.snapshot().actors[0].position;
  const result=s.run('actor.input',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,frames:[frame(1,50)]});
  assert.equal(s.snapshot().actors[0].actionId,null,'动作应被走动取消');
  assert.equal(s.snapshot().actions[move.actionId].status,'cancelled');
  assert.ok(Math.hypot(result.actor.position[0]-before[0],result.actor.position[2]-before[2])>0.1,'输入仍然生效');
  assert.equal(result.actor.pose,'walking');
 }finally{s.db.close();}
});
test('starting from a seat uses the seat exit point, never the collider-blocked seat position',async()=>{
 const {PlayerController}=await import('../src/core/player-controller.js');
 const {advancePlayer}=await import('../shared/world/movement.js');
 const lease={leaseId:'l1',leaseVersion:1,expiresAt:999999};
 const snapshot={scenes:[{sceneId:'bedroom',templateId:'cozy_room_v1'}],entities:[{entityId:'chair',type:'chair',sceneId:'bedroom',position:[0.58,0,-2.18],rotation:Math.PI,scale:[1,1,1]}]};
 const seated={actorId:'whale',sceneId:'bedroom',position:[0.58,0.54,-2.18],rotation:Math.PI,pose:'seated',form:'normal',resting:{entityId:'chair',approachPosition:[1.4,0,-2.18]},controller:{...lease,subjectId:'owner'},input:{leaseId:'l1',sequence:0}};
 // 座位点在椅子碰撞体内：从它出发四个方向都推不动
 const blocked=advancePlayer(snapshot,{...seated},[0,1],16);
 assert.ok(Math.hypot(blocked.position[0]-seated.position[0],blocked.position[2]-seated.position[2])<1e-9);
 const player=new PlayerController({takeControl:async()=>lease,send:async()=>({})});
 // 即使渲染位置停在座位上（seed 指向座位），起算点也必须是离座点
 player.begin(seated,{sceneId:'bedroom',position:[0.58,0.54,-2.18]});
 assert.ok(Math.abs(player.sample().position[0]-1.4)<1e-9,'从离座点开始');
 player.step(snapshot,[0,1],.016);
 assert.ok(player.sample().position[2]>-2.18,'能立刻预测出位移');
 player.release();
});
test('a lost lease is re-acquired and the same input batch is retried instead of erroring',async()=>{
 const {PlayerController}=await import('../src/core/player-controller.js');
 const stale={leaseId:'old',leaseVersion:1,expiresAt:Number.MAX_SAFE_INTEGER};
 const fresh={leaseId:'new',leaseVersion:2,expiresAt:Number.MAX_SAFE_INTEGER};
 const snapshot={scenes:[{sceneId:'room',templateId:'cozy_room_v1'}],entities:[]};
 let sends=0, taken=0;
 const player=new PlayerController({
  takeControl:async()=>{taken+=1;return taken===1?stale:fresh;},
  send:async payload=>{
   sends+=1;
   if(sends===1){const error=new Error('LEASE_INVALID');error.status='LEASE_INVALID';throw error;}
   return {actor:{actorId:'whale',sceneId:'room',position:[0.5,0,0],rotation:0,pose:'walking',form:'normal',controller:{...fresh,subjectId:'owner'},input:{leaseId:'new',sequence:payload.frames.at(-1).sequence}}};
  },
 });
 player.begin({actorId:'whale',sceneId:'room',position:[0,0,0],rotation:0,pose:'idle',form:'normal',controller:{...stale,subjectId:'owner'},input:{leaseId:'old',sequence:0}});
 await Promise.resolve();await Promise.resolve();
 player.step(snapshot,[1,0],.016);
 await player.flush();
 await new Promise(r=>setImmediate(r));
 assert.equal(taken,2,'首次取控制 + 失败后重新取一次');
 assert.equal(sends,2,'第一批用旧租约失败后应重发一次');
 assert.equal(player.active,true,'不应因此中断预测');
 assert.equal(player.lease.leaseId,'new');
 player.release();
});
test('crawl input moves at the crawl speed scale on server and in prediction',async()=>{
 const s=setup();
 try{
  const frames=[{sequence:1,dtMs:50,direction:[1,0],crawl:true},{sequence:2,dtMs:50,direction:[1,0],crawl:true}];
  const result=s.run('actor.input',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,frames});
  const expected=2.82*0.05*2*0.35;
  assert.ok(Math.abs(result.actor.position[0]-expected)<1e-6,'服务端按 0.35 倍速匍匐');
  // 客户端预测同一套参数
  const {PlayerController}=await import('../src/core/player-controller.js');
  const snapshot={scenes:[{sceneId:'room',templateId:'cozy_room_v1'}],entities:[]};
  const player=new PlayerController({takeControl:async()=>s.lease,send:async()=>({})});
  player.begin({actorId:'whale',sceneId:'room',position:[0,0,0],rotation:0,pose:'idle',form:'normal',controller:{...s.lease,subjectId:'owner'},input:{leaseId:s.lease.leaseId,sequence:0}});
  player.step(snapshot,[1,0],.05,false,false,true);
  assert.ok(Math.abs(player.sample().position[0]-2.82*0.05*0.35)<1e-9,'客户端预测也是 0.35 倍速');
  player.release();
 }finally{s.db.close();}
});
test('boxing movement slows prediction and server position, then resumes sprint speed',async()=>{
 const {PlayerController}=await import('../src/core/player-controller.js');
 const s=setup();
 try{
  const player=new PlayerController({takeControl:async()=>s.lease,send:async payload=>s.run('actor.input',payload)});
  player.begin(s.snapshot().actors[0]);
  s.advance(150);
  player.step(s.snapshot(),[1,0],.05,false,true,false,true);
  assert.ok(Math.abs(player.sample().speed-2.115)<1e-9);
  await player.flush();
  assert.ok(Math.abs(s.snapshot().actors[0].position[0]-.10575)<1e-9);
  player.step(s.snapshot(),[1,0],.05,false,true);
  assert.ok(Math.abs(player.sample().speed-5.64)<1e-9);
  await player.flush();
  assert.ok(Math.abs(s.snapshot().actors[0].position[0]-.38775)<1e-9);
  player.release();
 }finally{s.db.close();}
});
test('standing from a seated action freezes prediction until the server places the actor on the floor',async()=>{
 const {PlayerController}=await import('../src/core/player-controller.js');
 const lease={leaseId:'l1',leaseVersion:1,expiresAt:Number.MAX_SAFE_INTEGER};
 const snapshot={scenes:[{sceneId:'bedroom',templateId:'cozy_room_v1'}],entities:[{entityId:'chair',type:'chair',sceneId:'bedroom',position:[0.58,0,-2.18],rotation:Math.PI,scale:[1,1,1]}]};
 const seated={actorId:'whale',sceneId:'bedroom',position:[0.58,0.54,-2.18],rotation:Math.PI,pose:'seated',form:'normal',controller:{...lease,subjectId:'owner'},input:{leaseId:'l1',sequence:0}};
 const player=new PlayerController({takeControl:async()=>lease,send:async()=>({})});
 player.begin(seated,{sceneId:'bedroom',position:[0.58,0.54,-2.18]});
 await Promise.resolve();await Promise.resolve();
 // 坐姿动作还没完成：预测冻结在座位，但输入照常排队
 player.step(snapshot,[0,1],.016);
 assert.ok(Math.abs(player.sample().position[0]-0.58)<1e-9,'冻结时不从椅子碰撞体里预测');
 // 服务端取消坐姿并把角色放到离座点 + 处理输入
 player.reconcile({...seated,pose:'walking',position:[1.4,0,-2.18],input:{leaseId:'l1',sequence:1}});
 assert.ok(Math.abs(player.sample().position[0]-1.4)<1e-9,'解冻后采用服务端离座位置');
 assert.equal(player.frozen,false);
 player.step(snapshot,[0,1],.016);
 assert.ok(player.sample().position[2]>-2.18,'解冻后可以立即继续向前预测');
 player.release();
});

test('late lease confirmation splits 256 ms of prediction into ordered batches and retries rate limits',async()=>{
 const {PlayerController}=await import('../src/core/player-controller.js');
 const s=setup();
 let grant;
 const sent=[];
 let errors=0;
 const player=new PlayerController({
  takeControl:()=>new Promise(resolve=>{grant=resolve;}),
  send:payload=>{
   sent.push(payload.frames.map(frame=>frame.sequence));
   assert.ok(payload.frames.reduce((sum,frame)=>sum+frame.dtMs,0)<=100);
   try{return s.run('actor.input',payload);}
   catch(error){
    assert.equal(error.message,'INPUT_RATE_EXCEEDED');
    assert.ok(error.details.retryAfterMs>0);
    errors++;
    s.advance(error.details.retryAfterMs);
    throw error;
   }
  },
 });
 try{
  player.begin(s.snapshot().actors[0]);
  for(let index=0;index<15;index++){s.advance(16);player.step(s.snapshot(),[1,0],.016);}
  const lease=s.run('control.takeover',{actorId:'whale'});
  s.advance(16);
  player.step(s.snapshot(),[1,0],.016);
  player.stop();
  const sending=player.drain();
  grant(lease);
  await sending;
  const actor=s.snapshot().actors[0];
  assert.equal(actor.input.sequence,17);
  assert.equal(actor.pose,'idle');
  assert.ok(Math.abs(actor.position[0]-.256*2.82)<1e-9);
  assert.ok(errors>0);
  assert.deepEqual([...new Set(sent.flat())],Array.from({length:17},(_,i)=>i+1));
 }finally{player.release();s.db.close();}
});

test('movement receipts deduplicate within ten minutes and expired input cannot apply twice',()=>{
 const s=setup();
 try{
  const principal=owner;
  const input={kind:'actor.input',worldId:'default',requestId:'movement-id',payload:{
   actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,frames:[frame(1,50)],
  }};
  const first=s.service.execute(principal,input);
  assert.deepEqual(s.service.execute(principal,input),first);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM movement_receipts').get().n,1);
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM command_results WHERE request_id='movement-id'").get().n,0);
  // Keep the lease current while the receipt expires.
  for(let i=0;i<67;i++){s.advance(9_000);s.run('control.renew',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion});}
  const running=s.run('action.submit',{actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion,kind:'maneuver',maneuver:'boxingCombo'});
  const expired=s.service.execute(principal,input);
  assert.equal(s.snapshot().actions[running.actionId].status,'running');
  assert.equal(expired.actor.position[0],first.actor.position[0]);
  assert.equal(expired.actor.input.sequence,1);
 }finally{s.db.close();}
});

test('holding a movement key wakes up and adopts the walkable bedside position',async()=>{
 const {PlayerController}=await import('../src/core/player-controller.js');
 const {walkable}=await import('../shared/world/navigation.js');
 const s=setup();
 try{
  s.service.transactRuntime('default',({snapshot})=>{
   snapshot.entities.push({entityId:'test-bed',sceneId:'bedroom',type:'bed',position:[0,0,-1.8],rotation:0,scale:[.65,.65,.65]});
  });
  const token={actorId:'whale',leaseId:s.lease.leaseId,leaseVersion:s.lease.leaseVersion};
  s.run('action.submit',{...token,kind:'sleep',target:{entityId:'test-bed',anchorId:'approach'}});
  for(let i=0;i<50&&s.snapshot().actors[0].pose!=='sleeping';i++){s.advance(100);s.runtime.tick();}
  const asleep=s.snapshot().actors[0];
  assert.equal(asleep.pose,'sleeping');
  const player=new PlayerController({
   takeControl:async()=>s.run('control.takeover',{actorId:'whale'}),
   send:async payload=>s.run('actor.input',payload),
  });
  player.begin(asleep,{sceneId:asleep.sceneId,position:asleep.position});
  player.step(s.snapshot(),[1,0],.05);
  await player.flush();
  const standing=player.sample();
  assert.equal(standing.position[1],0);
  assert.ok(walkable(s.snapshot(),'bedroom',standing.position));
  player.step(s.snapshot(),[1,0],.05);
  assert.ok(player.sample().position[0]>standing.position[0]);
 }finally{s.db.close();}
});
