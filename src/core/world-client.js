// 世界传输层：默认用一条 WebSocket 承载推送（事件 + 10Hz 状态）与命令上行；
// HTTP 事件日志保留为兜底，socket 不可用或断开时自动回落，断线期间游戏仍可操作。
const TRANSPORT_AUTO = 'auto';
const TRANSPORT_HTTP = 'http';

export class WorldClient {
  constructor({request=globalThis.fetch?.bind(globalThis),csrfToken='',pollMs=200,prepareSnapshot=async()=>{},transport=TRANSPORT_AUTO,socketUrl=null}={}) {
    Object.assign(this,{request,csrfToken,pollMs,prepareSnapshot,transport,socketUrl});
    this.readVersion=0;this.appliedVersion=0;this.cursor=0;
    this.listeners=new Set();this.snapshotListeners=new Set();this.statusListeners=new Set();
    this.disposed=false;
    this.socket=null;this.socketPending=new Map();this.socketRetry=0;this.socketTimer=null;this.httpFallback=false;
  }
  onEvent(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  onSnapshot(fn){this.snapshotListeners.add(fn);return()=>this.snapshotListeners.delete(fn);}
  onStatus(fn){this.statusListeners.add(fn);return()=>this.statusListeners.delete(fn);}
  status(value){if(this.connectionStatus===value)return;this.connectionStatus=value;for(const fn of this.statusListeners)fn(value);}
  async api(path,body,{timeoutMs=5000}={}){const response=await this.request(path,{credentials:'same-origin',...(body?{method:'POST',headers:{'content-type':'application/json','x-csrf-token':this.csrfToken},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeoutMs)});const result=await response.json();if(!response.ok){const error=Object.assign(new Error(result.error?.message||result.message||result.error||`HTTP ${response.status}`),{status:response.status,details:result.error?.details||result.details});throw error;}return result;}
  async refresh(){const version=++this.readVersion;const snapshot=await this.api(`/api/world/${encodeURIComponent(this.worldId)}/snapshot`);await this.prepareSnapshot(snapshot);if(this.disposed||version<this.appliedVersion)return this.snapshot;this.appliedVersion=version;this.snapshot=snapshot;for(const fn of this.snapshotListeners)fn(snapshot);return snapshot;}
  async refreshState(){const version=++this.readVersion;const state=await this.api(`/api/world/${encodeURIComponent(this.worldId)}/state`);if(this.disposed||version<this.appliedVersion)return this.snapshot;if(state.layoutRevision!==this.snapshot.layoutRevision||state.topologyRevision!==this.snapshot.topologyRevision)return this.refresh();this.appliedVersion=version;this.snapshot={...this.snapshot,actors:state.actors,actions:state.actions};for(const fn of this.snapshotListeners)fn(this.snapshot);return this.snapshot;}
  async connect(worldId){
    this.worldId=worldId;this.disposed=false;
    if(await this.openSocket()){this.stopHttpFallback();return this.snapshot;}
    // socket 不可用：保持原 HTTP 路径（快照自带游标，不回放历史）
    await this.refresh();
    if(Number.isSafeInteger(this.snapshot?.cursor))this.cursor=Math.max(this.cursor,this.snapshot.cursor);
    else await this.skipHistory();
    await this.sync();
    if(this.socketSupported())this.scheduleReconnect();
    return this.snapshot;
  }
  /** 首连直接从最新游标开始，不重放历史事件（快照已经包含完整状态） */
  async skipHistory(){try{const page=await this.api(`/api/world/${encodeURIComponent(this.worldId)}/events?after=latest&limit=1`);this.cursor=Math.max(this.cursor,page.nextCursor||0);}catch{}return this.cursor;}
  async sync(){if(this.disposed)return;if(this.socket&&this.socket.readyState===1)return;if(this.syncing)return this.syncing;clearTimeout(this.timer);this.syncing=(async()=>{try{let page;do{page=await this.api(`/api/world/${encodeURIComponent(this.worldId)}/events?after=${this.cursor}&limit=100`);if(page.resetRequired||page.cursorExpired){this.cursor=page.nextCursor||0;await this.refresh();break;}for(const event of page.events||[]){if(event.cursor<=this.cursor)continue;if(event.cursor>this.cursor+1)await this.refresh();this.cursor=event.cursor;for(const fn of this.listeners)fn(event);}this.cursor=Math.max(this.cursor,page.nextCursor||0);}while(page.hasMore&&!this.disposed);await this.refreshState();this.status('connected');}catch(error){this.status(error.status===401?'unauthorized':'offline');throw error;}finally{this.syncing=null;if(this.pollMs&&!this.disposed&&!(this.socket&&this.socket.readyState===1))this.timer=setTimeout(()=>this.sync().catch(()=>{}),this.connectionStatus==='connected'?this.pollMs:1500);}})();return this.syncing;}
  async dispatch(command,{refresh=true}={}){
    if(!this.worldId)throw Error('WORLD_NOT_CONNECTED');
    const complete={...command,worldId:this.worldId,requestId:command.requestId||crypto.randomUUID()};
    if(this.socket&&this.socket.readyState===1){
      let ack;
      try{ack=await this.socketCall({type:'dispatch',command:complete});}
      catch(error){if(!['SOCKET_CLOSED','SOCKET_TIMEOUT'].includes(error.message))throw error;}
      if(ack){
        if(!ack.ok){const error=Object.assign(new Error(ack.error?.message||'COMMAND_FAILED'),{status:ack.error?.code,details:ack.error?.details});throw error;}
        // 驱动方自己的位移通过 ack 回来，不必等广播
        if(ack.result?.actor)this.mergeActor(ack.result.actor);
        if(refresh)await this.socketSnapshot();
        return ack.result;
      }
      // 通道断在半路：回落 HTTP；requestId 相同，服务端幂等
    }
    const result=await this.api(`/api/world/${encodeURIComponent(this.worldId)}/commands`,complete);
    if(refresh)await this.refresh();
    return result;
  }
  dispose(){this.disposed=true;clearTimeout(this.timer);clearTimeout(this.socketTimer);this.timer=null;this.socketTimer=null;this.rejectPending(Error('DISPOSED'));try{this.socket?.close();}catch{}this.socket=null;this.listeners.clear();this.snapshotListeners.clear();this.statusListeners.clear();}

  /* ---------------- 实时通道 ---------------- */
  socketSupported(){
    if(this.transport===TRANSPORT_HTTP)return false;
    if(typeof WebSocket==='undefined')return false;
    return Boolean(this.socketUrl||typeof location!=='undefined');
  }
  socketTarget(){
    if(this.socketUrl)return this.socketUrl;
    const proto=location.protocol==='https:'?'wss:':'ws:';
    return `${proto}//${location.host}/api/world/${encodeURIComponent(this.worldId)}/socket?csrf=${encodeURIComponent(this.csrfToken)}`;
  }
  openSocket(){
    if(!this.socketSupported())return Promise.resolve(false);
    if(this.socket&&this.socket.readyState===1)return Promise.resolve(true);
    return new Promise((resolve)=>{
      let settled=false;
      let ws;
      try{ws=new WebSocket(this.socketTarget());}catch{resolve(false);return;}
      this.socket=ws;
      const finish=(ok)=>{if(settled)return;settled=true;clearTimeout(guard);if(!ok&&this.socket===ws)this.socket=null;resolve(ok);};
      const guard=setTimeout(()=>finish(false),5000);
      ws.onmessage=(event)=>{
        let frame;try{frame=JSON.parse(event.data);}catch{return;}
        this.handleFrame(frame).then(()=>{if(frame.type==='hello'){this.socketRetry=0;finish(true);}}).catch(()=>{});
      };
      ws.onerror=()=>{if(!settled)finish(false);};
      ws.onclose=()=>{this.onSocketClosed(ws);finish(false);};
    });
  }
  async handleFrame(frame){
    if(frame?.type==='hello'||frame?.type==='snapshot'){
      await this.adoptSnapshot(frame.snapshot,frame.cursor);
      if(frame.id)this.resolvePending(frame.id,{ok:true,frame});
      if(frame.type==='hello')this.status('connected');
      return;
    }
    if(frame?.type==='tick'){
      if(!this.snapshot)return;
      this.snapshot={...this.snapshot,layoutRevision:frame.layoutRevision,topologyRevision:frame.topologyRevision,actors:frame.actors,actions:frame.actions||{}};
      for(const fn of this.snapshotListeners)fn(this.snapshot);
      return;
    }
    if(frame?.type==='event'){
      const event=frame.event;if(!event||event.cursor<=this.cursor)return;
      if(event.cursor>this.cursor+1)this.refresh().catch(()=>{});
      this.cursor=event.cursor;
      for(const fn of this.listeners)fn(event);
      return;
    }
    if(frame?.type==='ack')this.resolvePending(frame.id,frame);
  }
  async adoptSnapshot(snapshot,cursor){
    if(!snapshot)return;
    const version=++this.readVersion;
    await this.prepareSnapshot(snapshot);
    if(this.disposed||version<this.appliedVersion)return;
    this.appliedVersion=version;
    this.snapshot=snapshot;
    if(Number.isSafeInteger(cursor))this.cursor=Math.max(this.cursor,cursor);
    else if(Number.isSafeInteger(snapshot.cursor))this.cursor=Math.max(this.cursor,snapshot.cursor);
    for(const fn of this.snapshotListeners)fn(this.snapshot);
  }
  socketSend(frame){
    if(!this.socket||this.socket.readyState!==1)return false;
    try{this.socket.send(JSON.stringify(frame));return true;}catch{return false;}
  }
  socketCall(frame,ms=5000){
    return new Promise((resolve,reject)=>{
      const id=frame.id||crypto.randomUUID();
      const timer=setTimeout(()=>{this.socketPending.delete(id);reject(Error('SOCKET_TIMEOUT'));},ms);
      this.socketPending.set(id,{resolve,reject,timer});
      if(!this.socketSend({...frame,id})){clearTimeout(timer);this.socketPending.delete(id);reject(Error('SOCKET_CLOSED'));}
    });
  }
  resolvePending(id,payload){
    const waiter=this.socketPending.get(id);if(!waiter)return;
    this.socketPending.delete(id);clearTimeout(waiter.timer);waiter.resolve(payload);
  }
  rejectPending(error){
    for(const [,waiter] of this.socketPending){clearTimeout(waiter.timer);waiter.reject(error);}
    this.socketPending.clear();
  }
  mergeActor(actor){
    if(!actor||!this.snapshot)return;
    const actors=this.snapshot.actors.map((item)=>item.actorId===actor.actorId?{...item,...actor}:item);
    this.snapshot={...this.snapshot,actors};
    for(const fn of this.snapshotListeners)fn(this.snapshot);
  }
  async socketSnapshot(){const ack=await this.socketCall({type:'snapshot'});return ack.frame?.snapshot??this.snapshot;}
  onSocketClosed(ws){
    if(this.socket!==ws)return;
    this.socket=null;
    this.rejectPending(Error('SOCKET_CLOSED'));
    if(this.disposed)return;
    this.status('offline');
    this.startHttpFallback();
    this.scheduleReconnect();
  }
  startHttpFallback(){
    if(this.httpFallback)return;
    this.httpFallback=true;
    if(this.pollMs&&!this.timer)this.timer=setTimeout(()=>this.sync().catch(()=>{}),0);
  }
  stopHttpFallback(){
    this.httpFallback=false;
    clearTimeout(this.timer);this.timer=null;
    if(this.snapshot)this.status('connected');
  }
  scheduleReconnect(){
    if(this.disposed)return;
    clearTimeout(this.socketTimer);
    const delay=Math.min(15000,1000*2**Math.min(this.socketRetry,4));
    this.socketRetry+=1;
    this.socketTimer=setTimeout(async()=>{
      if(this.disposed)return;
      if(await this.openSocket())this.stopHttpFallback();
      else this.scheduleReconnect();
    },delay);
  }
}
