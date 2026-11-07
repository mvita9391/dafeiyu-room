import {validLayout} from '../../shared/layout.js';
const PENDING='dafeiyu-bedroom-pending-v1';
export class LayoutSync {
  constructor({restore,notify,sceneId='bedroom',storage=globalThis.localStorage,request=globalThis.fetch?.bind(globalThis)}) {
    Object.assign(this,{restore,notify,storage,request,sceneId});this.pendingKey=sceneId==='bedroom'?PENDING:`dafeiyu-${sceneId}-pending-v1`;this.revision=null;this.pending=null;this.busy=false;this.conflict=false;
  }
  async api(method,body) {
    const response=await this.request(`/api/layout/${this.sceneId}`,{method,headers:body?{'Content-Type':'application/json'}:undefined,
      body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(4000)});
    if(!response.ok){const error=new Error('Save request failed');error.status=response.status;throw error;}
    return response.json();
  }
  remember() {try {if(this.pending)this.storage.setItem(this.pendingKey,JSON.stringify(this.pending));else this.storage.removeItem(this.pendingKey);}catch{}}
  async init(local) {
    try {const pending=JSON.parse(this.storage.getItem(this.pendingKey));if(pending&&validLayout(pending.layout,this.sceneId))this.pending=pending;}catch{}
    try {
      const remote=await this.api('GET');
      if(!Number.isSafeInteger(remote.revision)||remote.revision<0 || (remote.layout!==null&&!validLayout(remote.layout,this.sceneId)))throw new Error('Invalid server save');
      this.revision=remote.revision;
      if(this.pending) {
        this.restore(this.pending.layout);
        if(this.pending.revision!==this.revision && this.revision!==0){this.conflict=true;this.notify('存档冲突：保留本机布局，请先导出备份，再点读取数据库');return;}
        this.pending.revision=this.revision;await this.flush();
      } else if(remote.layout!==null){this.restore(remote.layout);this.notify('已读取数据库存档');}
      else if(local!==null&&validLayout(local,this.sceneId)){this.enqueue(local);await this.flush();}
      else this.notify('数据库已连接，修改布局后自动保存');
    } catch {this.notify('数据库未连接 · 当前使用浏览器备份，可点重试');}
  }
  enqueue(layout) {
    this.pending={layout:JSON.parse(JSON.stringify(layout)),revision:this.pending?.revision??this.revision};this.remember();
    this.notify('正在保存到数据库…');clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),250);
  }
  async useDatabaseVersion() {
    if(this.busy)return;
    try {
      const remote=await this.api('GET');
      if(remote.layout===null||!validLayout(remote.layout,this.sceneId))throw new Error('No valid save');
      if(this.pending)this.storage.setItem(`dafeiyu-${this.sceneId}-conflict-backup-v1`,JSON.stringify(this.pending));
      this.pending=null;this.conflict=false;this.revision=remote.revision;this.remember();
      this.restore(remote.layout);this.notify('已读取数据库版本 · 上一步本机布局可用撤销恢复');
    } catch {this.notify('读取数据库失败，本机布局未更改');}
  }
  async flush() {
    if(this.busy||!this.pending)return;
    if(this.conflict){this.notify('存档冲突：本机已备份，请先导出布局，再点读取数据库');return;}
    this.busy=true;
    try {
      if(this.revision===null){
        const remote=await this.api('GET');
        this.revision=remote.revision;
        if(remote.layout!==null&&this.pending.revision!==remote.revision){this.conflict=true;throw Object.assign(new Error('Conflict'),{status:409});}
      }
      while(this.pending) {
        const saving=this.pending;
        const result=await this.api('PUT',{layout:saving.layout,revision:this.revision});
        this.revision=result.revision;
        if(this.pending===saving)this.pending=null;
        else this.pending.revision=this.revision;
        this.remember();
      }
      this.notify('已保存到数据库 ✓');
    } catch(error){
      if(error.status===409){this.conflict=true;this.notify('存档冲突：本机已备份，请先导出布局，再点读取数据库');}
      else this.notify('数据库保存失败 · 已留浏览器备份，点重试');
    } finally {this.busy=false;}
  }
}

// Migrated worlds never replay old layouts. A local backup is a draft, and every
// edit is validated by the same preview/apply transaction used by MCP.
export class WorldLayoutSync {
  constructor({client,registry,sceneId,notify,storage=globalThis.localStorage,onRollback,onIdentities,preserveDraftOnError=false}){Object.assign(this,{client,registry,sceneId,notify,storage,onRollback,onIdentities,preserveDraftOnError});this.identities=new Map();this.notify=message=>{this.message=message;notify(message);};this.error=null;this.key=`dafeiyu-world-draft-${sceneId}`;this.busy=false;}
  enqueue(layout){for(const entry of layout){if(!entry.entityId){entry.draftId??=`draft-${crypto.randomUUID()}`;entry.entityId=this.identities.get(entry.draftId);}}this.error=null;this.pending={layout:structuredClone(layout),baseRevision:this.client.snapshot.layoutRevision,ops:this.operations(layout),baseEntities:structuredClone(this.client.snapshot.entities.filter(e=>e.sceneId===this.sceneId))};this.registry.scenes.get(this.sceneId).draft=true;try{this.storage.setItem(this.key,JSON.stringify(this.pending));}catch{}this.notify('预览草稿 · 正在校验…');clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),350);}
  operations(layout,before=this.client.snapshot.entities.filter(e=>e.sceneId===this.sceneId)){const ids=new Set(layout.map(e=>e.entityId).filter(Boolean)),ops=[];for(const e of before)if(!ids.has(e.entityId))ops.push({kind:'entity.remove',entityId:e.entityId});for(const [i,e]of layout.entries()){const transform={position:e.position,rotation:e.rotation,scale:e.scale},old=before.find(x=>x.entityId===e.entityId);if(old){if(JSON.stringify([old.position,old.rotation,old.scale])!==JSON.stringify([e.position,e.rotation,e.scale]))ops.push({kind:'entity.transform',entityId:old.entityId,...transform});}else ops.push({kind:'entity.add',ref:e.draftId,sceneId:this.sceneId,type:e.type,...transform});}return ops;}
  async flush(){clearTimeout(this.timer);if(this.busy||!this.pending)return;this.busy=true;const pending=this.pending;try{const ops=pending.ops;if(ops.length){const preview=await this.client.dispatch({kind:'build.preview',payload:{baseRevision:pending.baseRevision,ops}});const result=await this.client.dispatch({kind:'build.apply',payload:{planId:preview.planId}});this.lastChangeId=result.changeId;for(const [ref,id]of Object.entries(result.createdIds||{}))this.identities.set(ref,id);this.onIdentities?.(result.createdIds||{});if(this.pending!==pending){const next=this.pending;const createdIds=Object.values(result.createdIds||{});for(const entry of next.layout){if(entry.draftId&&this.identities.has(entry.draftId))entry.entityId=this.identities.get(entry.draftId);}const knownIds=new Set([...next.baseEntities.map(e=>e.entityId),...createdIds]);next.baseEntities=this.client.snapshot.entities.filter(e=>e.sceneId===this.sceneId&&knownIds.has(e.entityId));next.ops=this.operations(next.layout,next.baseEntities);next.baseRevision=this.client.snapshot.layoutRevision;this.storage.setItem(this.key,JSON.stringify(next));}}if(this.pending===pending){this.pending=null;this.storage.removeItem(this.key);this.registry.scenes.get(this.sceneId).draft=false;this.registry.applySnapshot(this.client.snapshot);}this.error=null;this.notify('已通过世界校验并保存 ✓');}catch(error){this.error=error;this.registry.scenes.get(this.sceneId).draft=!!this.preserveDraftOnError;await this.client.refresh().catch(()=>{});if(error.message==='REVISION_CONFLICT'&&this.pending){this.pending.baseRevision=this.client.snapshot.layoutRevision;this.storage.setItem(this.key,JSON.stringify(this.pending));}this.registry.applySnapshot(this.client.snapshot);if(!this.preserveDraftOnError)this.onRollback?.();const reason=placementErrorMessage(error.message);this.notify(this.preserveDraftOnError?`尚未保存：${reason} · 家具已保留，请挪动后重新放置`:`草稿未提交：${error.message} · 画面已恢复，可重试`);}finally{this.busy=false;this.notify(this.message);if(this.pending&&this.pending!==pending)await this.flush();}}
  async useDatabaseVersion(){this.pending=null;this.error=null;this.registry.scenes.get(this.sceneId).draft=false;await this.client.refresh();this.registry.applySnapshot(this.client.snapshot);this.onRollback?.();this.notify('已读取世界版本；本机草稿仍保留备份');}
  async undo(){if(!this.lastChangeId)return;try{await this.client.dispatch({kind:'build.undo',payload:{changeId:this.lastChangeId}});this.lastChangeId=null;this.registry.applySnapshot(this.client.snapshot);this.notify('已撤销世界建设');}catch(error){this.notify(`撤销未执行：${error.message}`);}}
}

export function placementErrorMessage(code){return ({RESERVED_ZONE:'这里只能在开放地块里摆放，不能占用道路、坡道或海岸',INVALID_GROUND_HEIGHT:'家具需要放在平整地面上',STATIC_COLLISION:'与固定建筑或院墙重叠',SPAWN_BLOCKED:'挡住了出生或入场位置',ENTITY_COLLISION:'与已有家具重叠',ACTOR_BLOCKED:'挡住了角色',PROTECTED_AREA:'占用了受保护的农田区域',PORTAL_BLOCKED:'挡住了门口通道',PATH_BLOCKED:'挡住了场景通路',OUT_OF_BOUNDS:'超出了场景边界',REVISION_CONFLICT:'场景已被其他操作更新，请重试',SCENE_EDIT_LOCKED:'当前场景正在被其他用户编辑'})[code]||code;}
