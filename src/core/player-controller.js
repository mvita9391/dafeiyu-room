import {advancePlayer,inputSpeedScale} from '../../shared/world/movement.js';
const MAX_BATCH_MS=100;
const MAX_BATCH_FRAMES=120;
const MAX_RATE_RETRIES=4;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Pending inputs, rather than predicted positions, are replayed after each ack.
export class PlayerController {
 constructor({takeControl,send,onError=()=>{},onRelease=null,now=()=>performance.now(),holdMs=3000}){
  Object.assign(this,{takeControl,send,onError,onRelease,now,holdMs});
  this.generation=0;this.active=false;this.pending=[];
  this.holdUntil=0; // 本地操作权保护窗口：窗口内不接受服务端位置覆盖
 }
 begin(actor,seed=null){
  if(this.active)return;
  this.active=true;this.generation++;
  // 坐姿动作还没完成（resting 未写入）时，客户端不知道离座落脚点，先冻结预测，
  // 等服务的取消动作把位置落到离座点再解除 —— 否则会卡在椅子碰撞体里。
  this.frozen=(actor.pose==='seated'&&!actor.resting)||actor.pose==='tree-climbing';
  this.state={...actor,position:this.startPosition(actor,seed),pose:this.frozen?actor.pose:(actor.form==='swim'?'swimming':'idle'),resting:null,moving:false,speed:0,form:actor.form||'normal'};
  this.pending=[];this.sequence=0;this.ack=0;this.lease=null;this.held=false;
  const generation=this.generation;
  this.ready=Promise.resolve(this.takeControl()).then(lease=>{if(generation!==this.generation)return;this.lease=lease;return lease;});
  this.ready.catch(error=>this.fail(error,generation));
 }
 /** 起始位置：优先沿用上一帧渲染位置，避免快照落后导致一按方向键就回跳 */
 startPosition(actor,seed){
  const base=actor.resting?.approachPosition||actor.position;
  // 坐着/躺着时座位点在椅子碰撞体内部，客户端从这个点预测会被完全卡住（四个方向都不动），
  // 所以只要还在 resting，就从离座的落脚点起算，忽略渲染位置。
  if(actor.resting)return [...base];
  if(!seed||seed.sceneId!==actor.sceneId||!Array.isArray(seed.position))return [...base];
  const [x,,z]=seed.position;
  if(!Number.isFinite(x)||!Number.isFinite(z))return [...base];
  if(Math.hypot(x-base[0],z-base[2])>2.5)return [...base];
  return [x,base[1],z];
 }
 step(snapshot,direction,dt,jump=false,sprint=false,crawl=false,boxing=false){
  if(!this.active)return;
  this.snapshot=snapshot;this.held=!!Math.hypot(...direction);
  if(this.held)this.holdUntil=this.now()+this.holdMs;
  const input={sequence:++this.sequence,dtMs:Math.min(50,Math.max(0,dt*1000)),direction,...jump?{jump:true}:{},...sprint?{sprint:true}:{},...crawl?{crawl:true}:{},...boxing?{boxing:true}:{}};
  this.pending.push(input);
  if(!this.frozen)this.state=advancePlayer(snapshot,this.state,direction,input.dtMs,input.jump,inputSpeedScale(input));
  // A disconnected tab must not accumulate an unbounded speculative world.
  if(this.pending.reduce((sum,f)=>sum+f.dtMs,0)>1000)this.fail(Error('移动同步超时，请重试'),this.generation);
 }
 stop(){if(!this.active)return;this.holdUntil=this.now()+this.holdMs;this.held=false;this.state={...this.state,moving:false,speed:0,pose:this.state.form==='swim'?'swimming':'idle'};if(this.pending.at(-1)?.dtMs!==0)this.pending.push({sequence:++this.sequence,dtMs:0,direction:[0,0]});}
 reconcile(actor){
  if(!this.active||!this.lease)return;
  if(actor.controller&&actor.controller.leaseVersion<this.lease.leaseVersion)return;
  if(actor.sceneId!==this.state.sceneId||actor.controller?.leaseId!==this.lease.leaseId||actor.controller?.leaseVersion!==this.lease.leaseVersion){this.release();return;}
  this.lease={...this.lease,expiresAt:actor.controller.expiresAt};
  const ack=actor.input?.leaseId===this.lease.leaseId?actor.input.sequence:0;
  if(ack<this.ack)return;
  // Polls from before a manual command can be older than its direct response.
  if(ack===this.ack)return;
  // 本地操作权保护：正在按键，或松开后的 holdMs 内，服务端位置不回写，
  // 否则被延迟确认的旧位置会把角色弹回去（只同步姿态/需求等非位置字段）。
  // 冻结状态解除时直接采用服务端离座后的位置（不套本地保护），再重放未确认输入
  const justUnfroze = this.frozen && actor.pose !== 'seated' && actor.pose !== 'tree-climbing';
  if (justUnfroze) this.frozen = false;
  const frozen = this.frozen;
  const protectedByLocal = !frozen && !justUnfroze && (this.held || this.now() < this.holdUntil);
  const localPosition=this.state.position? [...this.state.position]:null;
  const localRotation=this.state.rotation;
  const localMotion={moving:this.state.moving,speed:this.state.speed,pose:this.state.pose};
  this.ack=ack;this.pending=this.pending.filter(input=>input.sequence>ack);
  if(frozen){this.state={...actor,moving:false,speed:0,pose:this.state.pose};return;}
  this.state={...actor,position:[...actor.position]};
  for(const input of this.pending)this.state=advancePlayer(this.snapshot,this.state,input.direction,input.dtMs,input.jump,inputSpeedScale(input));
  if(protectedByLocal&&localPosition){
   this.state.position=localPosition;this.state.rotation=localRotation;
   // 服务端 actor 在纯键盘移动时不带 moving/pose，保护窗口内沿用本地运动状态，
   // 否则人物在滑行却播放待机动画。
   if(this.held){this.state.moving=localMotion.moving;this.state.speed=localMotion.speed;this.state.pose=localMotion.pose;}
  }
  if(!this.held)this.state={...this.state,moving:false,speed:0,pose:this.state.form==='swim'?'swimming':'idle'};
 }
 sample(){return this.active?this.state:null;}
 batch(){
  let duration=0;
  const frames=[];
  for(const frame of this.pending){
   if(frames.length===MAX_BATCH_FRAMES||duration+frame.dtMs>MAX_BATCH_MS+1e-6)break;
   frames.push(frame);
   duration+=frame.dtMs;
  }
  return frames;
 }
 async sendBatch(lease,frames,generation){
  for(let retries=0;this.active&&generation===this.generation;retries++){
   try{return await this.send({actorId:this.state.actorId,leaseId:lease.leaseId,leaseVersion:lease.leaseVersion,frames});}
   catch(error){
    const wait=error.details?.retryAfterMs;
    if(error.message!=='INPUT_RATE_EXCEEDED'||!Number.isFinite(wait)||wait<=0||wait>MAX_BATCH_MS||retries>=MAX_RATE_RETRIES)throw error;
    await delay(wait+4);
   }
  }
 }
 flush(){
  if(this.running)return this.running;
  if(!this.active||!this.pending.length)return Promise.resolve();
  const generation=this.generation;
  const run=(async()=>{
   let lease=await this.ready;if(!lease||!this.active||generation!==this.generation)return;
   let result;
   try{result=await this.sendBatch(lease,this.batch(),generation);}
   catch(error){
    // 租约过期/被接管（常见于切后台、长时间不动）：自动重新取得控制并重发一次，而不是直接弹错误
    if(!/LEASE_(INVALID|BUSY|EXPIRED)/.test(String(error?.status||error?.message||''))||!this.active||generation!==this.generation)throw error;
    this.ready=Promise.resolve(this.takeControl()).then(next=>{if(this.active&&generation===this.generation)this.lease=next;return next;});
    this.ready.catch(()=>{});
    const next=await this.ready;
    if(!next||!this.active||generation!==this.generation)return;
    if(next.leaseId!==lease.leaseId){
     this.ack=0;
     this.sequence=0;
     this.pending=this.pending.map(frame=>({...frame,sequence:++this.sequence}));
    }
    result=await this.sendBatch(next,this.batch(),generation);
   }
   if(result&&this.active&&generation===this.generation)this.reconcile(result.actor);
  })();
  this.running=run.catch(error=>{this.fail(error,generation);throw error;}).finally(()=>{this.running=null;if(this.active&&this.pending.length&&(!this.held||this.pending.reduce((sum,frame)=>sum+frame.dtMs,0)>MAX_BATCH_MS))this.flush().catch(()=>{});});
  return this.running;
 }
 async drain(){while(this.active&&this.pending.length)await this.flush();}
 fail(error,generation){if(generation!==this.generation)return;this.release();this.onError(error);}
 release(){
  // 任何释放路径都把最后一帧预测位置交给渲染层，避免回落到延迟采样时往后跳
  const last=this.state;
  this.frozen=false;
  this.active=false;this.generation++;this.pending=[];this.held=false;
  if(last&&this.onRelease)this.onRelease(last);
 }
}
