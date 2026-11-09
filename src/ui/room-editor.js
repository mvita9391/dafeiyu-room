import {appendCatalogPreview} from './catalog-preview.js';
import {releaseLocalAssets} from '../world/local-assets.js';
import {fitYardPool} from '../world/yard-pool.js';
import {footprintCorners,getCatalogEntry,LOCAL_CATEGORIES,listCatalog} from '../../shared/world/catalog.js';
import {surfaceAt} from '../../shared/world/coastal.js';
import {authorHeightRange} from '../../shared/world/author-scenes.js';
import {getTemplate} from '../../shared/world/templates.js';
import {defaultManifest} from '../../shared/world/default-manifest.js';
import * as THREE from 'three';
import { validLayout } from '../../shared/layout.js';
import { LayoutSync, WorldLayoutSync } from './layout-sync.js';
import { FURNITURE, createFurniture } from '../world/props.js';

export const FURNITURE_CATEGORIES = {
  '全部': Object.keys(FURNITURE),
  '街景': ['coastalHouse','shopBuilding','shopVending','shopLamp','shopCar'],
  '睡眠': ['bed','nightstand'],
  '桌椅': ['desk','chair','table'],
  '收纳': ['shelf'],
  '休闲': ['bean','rug'],
  '灯饰绿植': ['lamp','plant','smallPlant'],
  '客厅家具': ['livingSofa','livingTable','livingChair','livingShelf','livingLamp','livingPlant','livingRug'],
  '户外': ['yardPool','yardFarm','yardTree','yardBench','yardLantern','yardFlowers','yardCan','yardSwing','yardPicnicTable','yardUmbrella','yardFlowerBox','yardRoseArch','yardBirdBath'],
};

const STORAGE = 'dafeiyu-bedroom-layout-v1';
export class RoomEditor {
  constructor({ group, scene, camera, canvas, getScene, onToggle, onChange, onOrbit, onClickSound, contexts, worldClient, registry }) {
    Object.assign(this, { group, scene, camera, canvas, getScene, onToggle, onChange, onOrbit, onClickSound });
    this.worldClient=worldClient;this.registry=registry;
    this.active = false; this.history = []; this.selected = null;
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
    this.offset = new THREE.Vector3(); this.defaults = this.snapshot();
    this.outline = new THREE.BoxHelper(new THREE.Object3D(), 0xffd47f);
    this.outline.visible = false; scene.add(this.outline);
    this.contexts=contexts || {room:{group,label:'卧室',sceneId:'bedroom'}};
    for(const ctx of Object.values(this.contexts)) {
      ctx.defaults=ctx.group.children.filter(o=>o.userData.furnitureType).map(o=>({type:o.userData.furnitureType,position:o.position.toArray(),rotation:o.rotation.y,scale:o.scale.toArray()}));
      ctx.history=[];ctx.loading=true;ctx.storageKey=ctx.sceneId==='bedroom'?STORAGE:`dafeiyu-${ctx.sceneId}-layout-v1`;
    }
    {
      const all=listCatalog();
      for(const name of Object.values(LOCAL_CATEGORIES))FURNITURE_CATEGORIES[name]=all.filter(e=>e.category===name&&!e.editorHidden).map(e=>e.type);
      // 「全部」里塞 3000+ 个本地模型会让家具栏卡顿；保留内置家具 + 少量本地模型，完整清单走分类
      const builtin=Object.keys(FURNITURE).filter(t=>!t.startsWith('pf-'));
      const localCapped=Object.keys(FURNITURE).filter(t=>t.startsWith('pf-')).slice(0,60);
      FURNITURE_CATEGORIES['全部']=builtin.concat(localCapped);
    }
    this.buildUI();this.bind();this.setContext(Object.keys(this.contexts)[0]);
    if(worldClient){this.updateWorldContexts();this.onChange?.();return;}
    for(const ctx of Object.values(this.contexts)) {
      let saved=null;
      try{saved=JSON.parse(localStorage.getItem(ctx.storageKey));if(saved!==null)this.restore(saved,ctx);}catch{saved=null;}
      ctx.sync=new LayoutSync({sceneId:ctx.sceneId,
        restore:layout=>{this.restore(layout,ctx);try{localStorage.setItem(ctx.storageKey,JSON.stringify(layout));}catch{}},
        notify:message=>{ctx.message=message;if(this.context===ctx){this.syncMessage=message;this.refreshState();}},
      });
      if(this.context===ctx)this.sync=ctx.sync;
      ctx.sync.init(saved).finally(()=>{ctx.loading=false;if(this.context===ctx)this.toggle.disabled=false;});
    }
    this.onChange?.();
    window.addEventListener('online',()=>Object.values(this.contexts).forEach(ctx=>ctx.sync.flush()));
  }
  updateWorldContexts() {
    {
      const all=listCatalog();
      for(const name of Object.values(LOCAL_CATEGORIES))FURNITURE_CATEGORIES[name]=all.filter(e=>e.category===name&&!e.editorHidden).map(e=>e.type);
      const builtin=Object.keys(FURNITURE).filter(t=>!t.startsWith('pf-'));
      const localCapped=Object.keys(FURNITURE).filter(t=>t.startsWith('pf-')).slice(0,60);
      FURNITURE_CATEGORIES['全部']=builtin.concat(localCapped);
    }
    for(const ctx of Object.values(this.contexts))if(!ctx.sync){ctx.defaults=ctx.group.children.filter(o=>o.userData.furnitureType).map(o=>({entityId:o.userData.entityId,type:o.userData.furnitureType,position:o.position.toArray(),rotation:o.rotation.y,scale:o.scale.toArray()}));ctx.history=[];ctx.loading=false;ctx.sync=new WorldLayoutSync({client:this.worldClient,registry:this.registry,sceneId:ctx.sceneId,preserveDraftOnError:true,notify:message=>{ctx.message=message;if(this.context===ctx){this.syncMessage=message;this.refreshState();}},onRollback:()=>this.select(null),onIdentities:ids=>{for(const object of ctx.group.children){const id=ids[object.userData.draftId];if(id)object.userData.entityId=id;}}});try{if(localStorage.getItem(ctx.sync.key)||localStorage.getItem(ctx.sceneId==='bedroom'?STORAGE:`dafeiyu-${ctx.sceneId}-layout-v1`))ctx.message='发现本机旧布局/草稿 · 仅备份，未覆盖世界';}catch{}}
    if(this.context)this.setContext(this.context.sceneId);
  }
  setContext(key) {
    const ctx=this.contexts[key];if(!ctx)return;
    this.context=ctx;this.group=ctx.group;this.defaults=ctx.defaults;this.history=ctx.history;
    this.sync=ctx.sync;this.syncMessage=ctx.message;this.selected=null;this.outline.visible=false;
    this.toggle.disabled=ctx.loading;
    this.allowedTypes=Object.keys(FURNITURE).filter(type=>!getCatalogEntry(type).editorHidden).filter(type=>this.worldClient?getCatalogEntry(type).sceneKinds.includes(getTemplate(ctx.templateId).kind):(ctx.templateId==='courtyard_v1'||ctx.sceneId==='yard')
      ? type.startsWith('yard') || ['plant','smallPlant','lamp','chair','table'].includes(type)
      : !type.startsWith('yard') && (!!this.worldClient || ctx.sceneId==='living' || !type.startsWith('living')));
    const categoryNav=this.panel.querySelector('.room-edit-categories');
    for(const name of Object.keys(FURNITURE_CATEGORIES))if(![...categoryNav.children].some(button=>button.textContent===name)){
      const button=this.panel.ownerDocument.createElement('button');button.textContent=name;button.onclick=()=>this.showCategory(name);categoryNav.append(button);
    }
    this.panel.querySelector('strong').textContent=`布置${ctx.label}`;
    for(const button of this.panel.querySelector('.room-edit-categories').children)button.hidden=button.textContent!=='全部' && !FURNITURE_CATEGORIES[button.textContent].some(type=>this.allowedTypes.includes(type));
    const category=this.currentCategory||'全部';
    const available=category==='全部'||FURNITURE_CATEGORIES[category]?.some(type=>this.allowedTypes.includes(type));
    this.showCategory?.(available?category:'全部',available);this.refreshState();
  }

  items() { return this.group.children.filter(o => o.userData.furnitureType); }
  snapshot() { const visible=this.items().map(o => ({ type:o.userData.furnitureType,
    position:o.position.toArray(), rotation:o.rotation.y, scale:o.scale.toArray(),...(this.worldClient?{entityId:o.userData.entityId,draftId:o.userData.draftId??(o.userData.draftId=`draft-${crypto.randomUUID()}`)}:{} ) }));
    if(this.worldClient&&this.context?.templateId&&getTemplate(this.context.templateId).progressiveEntities){const ids=new Set(visible.map(e=>e.entityId));for(const e of this.worldClient.snapshot.entities)if(e.sceneId===this.context.sceneId&&!ids.has(e.entityId)&&!this.registry.entities.has(e.entityId))visible.push(structuredClone(e));}return visible; }
  validate(data) {
    const {templateId,sceneId='bedroom'}=this.context||{};
    if(templateId==='coastal_town_v1'||templateId?.startsWith('local_'))return Array.isArray(data)&&data.every(o=>o.position.every(Number.isFinite));
    return validLayout(data,sceneId,templateId?getTemplate(templateId).bounds:undefined);
  }
  restore(data, ctx=this.context) {
    const {templateId,sceneId='bedroom'}=ctx||{};
    if(templateId!=='coastal_town_v1'&&!templateId?.startsWith('local_')&&!validLayout(data,sceneId,templateId?getTemplate(templateId).bounds:undefined))throw new Error('Invalid layout');
    const target=ctx?.group || this.group;
    if(!ctx || ctx===this.context)this.select(null);
    for(const o of target.children.filter(o=>o.userData.furnitureType)){releaseLocalAssets(o);target.remove(o);}
    for (const entry of data) {
      const o=createFurniture(entry.type); o.position.fromArray(entry.position);
      o.userData.entityId=entry.entityId;o.userData.draftId=entry.draftId;o.rotation.y=entry.rotation; o.scale.fromArray(entry.scale);fitYardPool(o);target.add(o);
    }
    this.onChange?.();
  }
  checkpoint() { if(this.worldClient)this.registry.scenes.get(this.context.sceneId).draft=true;this.history.push(this.snapshot()); if(this.history.length>30)this.history.shift(); }
  save() {
    this.onChange?.();
    this.sync?.enqueue(this.snapshot());
    try { localStorage.setItem(this.context?.storageKey || STORAGE,JSON.stringify(this.snapshot())); this.status.textContent=this.worldClient?'编辑草稿已备份 · 正在提交世界校验':'布局已保存在本机 · 拖动移动，滚轮旋转家具 · 右键打开菜单'; }
    catch { this.status.textContent='浏览器无法保存，请导出布局备份。'; }
  }
  buildUI() {
    const style=document.createElement('style');
    style.textContent=`
      .room-reset-dialog{box-sizing:border-box;width:min(540px,92vw);border:2px solid #b53131;border-radius:18px;padding:25px;background:#fff7ef;color:#503735;font:14px/1.7 system-ui;box-shadow:0 18px 90px #3008}
      .room-reset-dialog::backdrop{background:#281415b8;backdrop-filter:blur(4px)}.room-reset-dialog h2{margin:0 0 12px;color:#a61e25;font-size:21px}.room-reset-dialog #room-reset-warning{padding:14px;border:1px solid #e3aaa5;border-radius:10px;background:#ffe9e5}.room-reset-dialog strong{color:#a61e25}.room-reset-dialog p{margin:8px 0}.room-reset-dialog label{display:block;margin-top:16px;font-weight:600}.room-reset-dialog input{box-sizing:border-box;display:block;width:100%;margin-top:7px;padding:11px;border:1px solid #bd8a83;border-radius:8px;font:inherit}.room-reset-dialog footer{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap}.room-reset-dialog button{padding:10px 14px;border:1px solid #baaaa0;border-radius:9px;background:#fff;color:#51454a;font:inherit;cursor:pointer}.room-reset-dialog [data-confirm]{background:#b3262d;border-color:#b3262d;color:white}.room-reset-dialog [data-confirm]:disabled{opacity:.4;cursor:not-allowed}
      .room-edit-state{position:fixed;left:50%;bottom:94px;transform:translateX(-50%);z-index:38;width:max-content;max-width:90vw;box-sizing:border-box;padding:10px 16px;border-radius:14px;background:#faf1e5f2;color:#51454a;box-shadow:0 6px 24px #0004;font:13px system-ui;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
      .room-edit-state button{cursor:pointer;border:1px solid #bfae9d;border-radius:9px;padding:7px 10px;background:#fff9ee;color:#51454a}.room-edit-state small{display:block;margin-top:4px}
      .room-edit-toggle{position:fixed;right:calc(max(24px,env(safe-area-inset-right)) + 54px);top:max(24px,env(safe-area-inset-top));z-index:35}
      #actions .room-edit-toggle{position:static}
      .room-edit-panel{position:fixed;top:78px;left:50%;transform:translateX(-50%);width:min(820px,94vw);z-index:36;background:#faf1e5f5;color:#453b40;border:1px solid #fff9;border-radius:20px;padding:14px;box-shadow:0 12px 40px #0004;font:14px system-ui}
      @media (max-width:520px){.room-edit-panel{top:max(114px,calc(env(safe-area-inset-top) + 96px))}}
      .room-edit-state[hidden],.room-edit-panel[hidden],.room-edit-menu[hidden]{display:none}
      .room-edit-panel header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.room-edit-panel strong{margin-right:0}
      .room-edit-panel header{position:relative;padding-right:46px;min-height:36px}
      .room-edit-panel header .room-edit-minimize{position:absolute;top:0;right:0;display:grid;place-items:center;width:36px;height:36px;padding:0;font-size:22px;line-height:1}
      .room-edit-panel.is-placement{width:min(320px,calc(100vw - 60px))}
      .room-edit-panel.is-placement header{margin-bottom:0}
      .room-edit-panel.is-placement > :not(header),.room-edit-panel.is-placement header > :not(strong):not(.room-edit-minimize){display:none}
      .room-edit-categories{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
      .room-edit-search{display:flex;gap:6px;align-items:center;flex:1 1 220px;min-width:180px;max-width:520px;margin:0 6px}
      .room-edit-search input{flex:1;min-width:0;padding:8px 12px;border:1px solid #bfae9d;border-radius:10px;background:#fff9ee;color:#51454a;font:inherit}
      .room-edit-search input:focus{outline:2px solid #c9a876;outline-offset:1px}
      .room-edit-search button{padding:7px 11px;border:1px solid #bfae9d;border-radius:10px;background:#fff9ee;color:#51454a;font:inherit;cursor:pointer}
      .room-edit-categories button[aria-pressed="true"]{background:#d8b790;border-color:#9c744e}
      .room-edit-catalog{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:min(34vh,300px);overflow-y:scroll;overscroll-behavior:contain;scrollbar-gutter:stable;padding:4px 10px 8px 0;scrollbar-width:auto;scrollbar-color:#a17c56 #e8d9c6}
      .room-edit-catalog::-webkit-scrollbar{width:10px}.room-edit-catalog::-webkit-scrollbar-track{background:#e8d9c6;border-radius:8px}.room-edit-catalog::-webkit-scrollbar-thumb{background:#a17c56;border-radius:8px}
      .room-edit-scroll-hint{font-size:12px;color:#776a68;margin:4px 0}
      .room-edit-panel button,.room-edit-menu button{border:1px solid #bfae9d;background:#fff9ee;color:#51454a;padding:9px 13px;border-radius:12px;cursor:pointer;font:inherit}
      .room-edit-toggle[aria-pressed="true"]{background:color-mix(in srgb,var(--accent,#5b7cfa) 82%,#000);border-color:transparent;color:#fff;font-weight:700;box-shadow:0 4px 14px #172c7566}
      .room-edit-toggle[aria-pressed="true"]:hover:not(:disabled){background:color-mix(in srgb,var(--accent,#5b7cfa) 73%,#000)}
      .room-edit-toggle[aria-pressed="true"]:disabled{opacity:.65;cursor:default}
      .room-edit-catalog button{flex:0 0 76px;display:grid;gap:5px;justify-items:center}.room-edit-catalog .catalog-icon{font-size:25px}.room-edit-catalog .catalog-preview{width:88px;height:88px;object-fit:contain;border-radius:8px;background:#f7f2e9}.room-edit-catalog .catalog-label{font-size:12px;line-height:1.4;white-space:normal;overflow-wrap:anywhere;min-height:2.8em}.room-edit-catalog .catalog-missing{display:grid;place-items:center;font-size:12px;color:#89745f}
      .room-edit-panel footer{font-size:12px;color:#776a68;margin-top:8px}.room-edit-menu{position:fixed;z-index:50;padding:6px;display:grid;gap:4px;border-radius:14px;background:#faf1e5;box-shadow:0 8px 28px #0005}.room-edit-menu button{text-align:left}
      .room-edit-panel button:hover,.room-edit-menu button:hover{background:#f3dcc0}.room-edit-panel button:focus-visible{outline:3px solid #b1834a}
    `; document.head.append(style);
    this.toggle=document.createElement('button');this.toggle.className='room-edit-toggle toolbar-action';this.toggle.textContent='🪑 布置房间';this.toggle.onclick=()=>this.setActive(!this.active);document.body.append(this.toggle);
    this.stateBar=document.createElement('div');this.stateBar.className='room-edit-state';this.stateBar.hidden=true;
    this.stateText=document.createElement('div');this.stateText.setAttribute('role','status');
    this.panelToggle=document.createElement('button');this.panelToggle.textContent='展开家具栏';
    this.panelToggle.setAttribute('aria-controls','room-edit-panel');
    this.panelToggle.onclick=()=>{
      this.panelCollapsed=false;
      this.select(null);
      this.minimizeButton.focus();
    };
    this.retrySave=document.createElement('button');this.retrySave.textContent='重试保存';
    this.retrySave.onclick=()=>this.sync?.flush();
    this.loadDatabase=document.createElement('button');this.loadDatabase.textContent='读取数据库';this.loadDatabase.hidden=true;
    this.loadDatabase.onclick=()=>{this.checkpoint();this.sync?.useDatabaseVersion();};
    this.smallerButton=document.createElement('button');this.smallerButton.textContent='缩小';this.smallerButton.onclick=()=>this.resize(.9);
    this.largerButton=document.createElement('button');this.largerButton.textContent='放大';this.largerButton.onclick=()=>this.resize(1.1);
    this.stateBar.append(this.stateText,this.smallerButton,this.largerButton,this.panelToggle,this.retrySave,this.loadDatabase);document.body.append(this.stateBar);
    this.panel=document.createElement('section');this.panel.id='room-edit-panel';this.panel.className='room-edit-panel';this.panel.hidden=true;
    this.panel.innerHTML='<header><strong>布置卧室</strong><div class="room-edit-search"><input type="search" placeholder="搜索模型名字…" aria-label="搜索模型名字" autocomplete="off"><button type="button" data-action="clear-search" hidden>清除</button></div><button data-action="undo">撤销</button><button data-action="export">导出布局</button><button class="room-edit-minimize" type="button" aria-label="保存并收起家具栏" title="保存并收起家具栏">−</button></header><nav class="room-edit-categories" aria-label="家具分类"></nav><div class="room-edit-scroll-hint">家具目录 · 在此滚轮上下浏览 ↓</div><div class="room-edit-catalog" tabindex="0" aria-label="可滚动家具目录"></div><footer role="status"></footer>';
    document.body.append(this.panel);this.status=this.panel.querySelector('footer');
    const catalog=this.panel.querySelector('.room-edit-catalog');
    const categories=this.panel.querySelector('.room-edit-categories');
    const hint=this.panel.querySelector('.room-edit-scroll-hint');
    const defaultHint='家具目录 · 在此滚轮上下浏览 ↓';
    const search=this.panel.querySelector('.room-edit-search input');
    const clearSearch=this.panel.querySelector('[data-action="clear-search"]');
    let baseCategory='全部';
    const MAX_RESULTS=240;
    const renderTypes=(types)=>{
      catalog.replaceChildren();
      for(const type of types) {
        const meta=FURNITURE[type];if(!meta)continue;
        const button=document.createElement('button');
        appendCatalogPreview(button,meta);
        button.onclick=()=>{this.add(type);if(this.selected)this.minimizeButton.focus();};button.title=type;catalog.append(button);
      }
    };
    const showCategory=(name,preserve=false)=>{
      const scroll=preserve?catalog.scrollTop:0;this.currentCategory=name;baseCategory=name;
      for(const button of categories.children) button.setAttribute('aria-pressed',String(button.textContent===name));
      const all=this.allowedTypes || Object.keys(FURNITURE);
      const everyType=Object.keys(FURNITURE);
      const cappedAll=[...everyType.filter(type=>!type.startsWith('pf-')),...everyType.filter(type=>type.startsWith('pf-')).slice(0,60)];
      const list=name==='全部'?cappedAll:(FURNITURE_CATEGORIES[name]||[]);
      renderTypes(list.filter(type=>all.includes(type)));
      search.value='';clearSearch.hidden=true;hint.textContent=defaultHint;
      catalog.scrollTop=scroll;
    };
    const runSearch=()=>{
      const query=search.value.trim().toLowerCase();
      clearSearch.hidden=!query;
      if(!query){showCategory(baseCategory);return;}
      const all=this.allowedTypes || Object.keys(FURNITURE);
      const matched=all.filter(type=>{
        const meta=FURNITURE[type];if(!meta)return false;
        return String(meta.label||'').toLowerCase().includes(query)||String(type).toLowerCase().includes(query);
      });
      this.currentCategory='搜索';
      for(const button of categories.children) button.setAttribute('aria-pressed','false');
      renderTypes(matched.slice(0,MAX_RESULTS));
      hint.textContent=`搜索「${query}」· ${matched.length} 个结果`+(matched.length>MAX_RESULTS?`（显示前 ${MAX_RESULTS} 个）`:'');
      catalog.scrollTop=0;
    };
    search.addEventListener('input',runSearch);
    search.addEventListener('keydown',event=>{
      if(event.key==='Escape'){search.value='';runSearch();search.blur();}
    });
    clearSearch.addEventListener('click',()=>{search.value='';runSearch();search.focus();});
    for(const name of Object.keys(FURNITURE_CATEGORIES)) {
      const button=document.createElement('button');button.textContent=name;
      button.onclick=()=>showCategory(name);categories.append(button);
    }
    this.showCategory=showCategory;this.runSearch=runSearch;showCategory('全部');
    this.minimizeButton=this.panel.querySelector('.room-edit-minimize');
    this.minimizeButton.onclick=()=>{
      this.panelCollapsed=true;
      if(this.dragging)this.finishDrag();
      else this.save();
      void this.sync?.flush();
      this.refreshState();
      this.panelToggle.focus();
    };
    this.panel.querySelector('[data-action="undo"]').onclick=()=>this.undo();
    this.panel.querySelector('[data-action="export"]').onclick=()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(this.snapshot(),null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=`大肥鱼${this.context?.label || '卧室'}布局.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    this.menu=document.createElement('div');this.menu.className='room-edit-menu';this.menu.hidden=true;
    for(const [label,action] of [['↻ 旋转 90°',()=>this.rotate()],['⧉ 复制',()=>this.duplicate()],['删除家具',()=>this.remove()]]) {
      const button=document.createElement('button');button.textContent=label;button.onclick=()=>{action();this.menu.hidden=true;};this.menu.append(button);
    }document.body.append(this.menu);
  }
  canReset() {
    const context=this.context;
    return Boolean(context&&!context.loading&&(!this.worldClient||
      defaultManifest.scenes.some(scene=>scene.sceneId===context.sceneId&&scene.templateId===context.templateId)));
  }
  async requestReset() {
    if(this.resetPending||!this.context||this.context.loading)return false;
    this.resetPending=true;const context=this.context;
    const baseRevision=this.worldClient?.snapshot.layoutRevision;
    try{
      if(!await this.confirmReset()||this.context!==context)return false;
      if(this.worldClient){
        if(this.sync.busy||this.sync.pending||this.dragging)throw Error('LAYOUT_SAVE_PENDING');
        await this.worldClient.dispatch({kind:'build.resetScene',payload:{sceneId:context.sceneId,baseRevision}});
        this.sync.lastChangeId=null;
        this.select(null);
        return true;
      }
      if(!this.active)await this.setActive(true);
      if(this.context!==context||!this.active)return false;
      this.select(null);
      this.checkpoint();this.restore(this.defaults);this.save();
      return true;
    }finally{this.resetPending=false;}
  }
  confirmReset() {
    const dialog=document.createElement('dialog');dialog.className='room-reset-dialog';
    dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-labelledby','room-reset-title');dialog.setAttribute('aria-describedby','room-reset-warning');
    const source=this.worldClient?'当前游戏版本随附的默认布局':'本次打开游戏时载入的布局';
    dialog.innerHTML=`<h2 id="room-reset-title">⚠ 危险操作：恢复默认布局</h2><p data-scene></p><div id="room-reset-warning"><strong>当前自定义家具和摆放修改将被替换！</strong><p>恢复到${source}，并在校验通过后覆盖当前场景的数据库存档。其他场景不受影响。</p><p>请先取消并使用「导出布局」备份，不要依赖撤销来恢复。</p></div><label>确认继续，请输入「恢复默认」<input data-ack autocomplete="off" spellcheck="false" placeholder="恢复默认"></label><footer><button data-cancel type="button">取消，保留当前布置</button><button data-confirm type="button" disabled>确认覆盖当前布局</button></footer>`;
    dialog.addEventListener('keydown',event=>event.stopPropagation());
    dialog.querySelector('[data-scene]').textContent=`操作范围：${this.context?.label||'当前场景'}`;
    document.body.append(dialog);const input=dialog.querySelector('[data-ack]'),confirm=dialog.querySelector('[data-confirm]'),cancel=dialog.querySelector('[data-cancel]');
    return new Promise(resolve=>{const finish=value=>{dialog.close();dialog.remove();resolve(value);};input.oninput=()=>{confirm.disabled=input.value.trim()!=='恢复默认';};confirm.onclick=()=>{if(input.value.trim()==='恢复默认')finish(true);};cancel.onclick=()=>finish(false);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});dialog.showModal();cancel.focus();});
  }
  async setActive(value) {
    if(this.worldClient&&!value){this.finishDrag();this.save();await this.sync.flush();if(this.sync.pending){if(!this.sync.error)this.syncMessage='正在保存，请稍候再完成布置';this.refreshState();return;}}
    if(this.worldClient){try{await this.worldClient.dispatch({kind:'build.editLock',payload:{sceneId:this.context.sceneId,locked:value}});if(value){await this.worldClient.dispatch({kind:'control.takeover',payload:{actorId:this.worldClient.snapshot.actors[0].actorId}});this.lockTimer=setInterval(()=>this.worldClient.dispatch({kind:'build.editLock',payload:{sceneId:this.context.sceneId,locked:true}}).catch(()=>this.setActive(false)),30000);}else{clearInterval(this.lockTimer);await this.sync.flush();}}catch(error){this.status.textContent=`无法切换编辑：${error.message}`;return;}}
    this.active=value;this.panelCollapsed=false;this.menu.hidden=true;
    this.toggle.textContent=value?'✓ 完成布置':'🪑 布置房间';
    this.toggle.setAttribute('aria-pressed',String(value));this.canvas.style.cursor=value?'grab':'';
    if(!value){this.finishDrag();this.select(null);if(!this.worldClient)this.save();}
    this.refreshState();
    this.onToggle?.(value);this.status.textContent='点选家具后拖动 · 滚轮每格旋转 15° · 右键菜单 · R 旋转 · Ctrl/Cmd+Z 撤销';
  }
  select(object) {
    this.selected=object;
    this.outline.visible=!!object;
    if(object)this.outline.setFromObject(object);
    this.refreshState();
  }
  refreshState() {
    if(this.panel){
      this.panel.hidden=!this.active || !!this.panelCollapsed;
      this.panel.classList.toggle('is-placement',!!this.selected);
    }
    if(!this.stateBar)return;
    this.stateBar.hidden=!this.active;
    if(this.retrySave){this.retrySave.hidden=this.worldClient?!(this.sync?.pending&&this.sync?.error):!/失败|未连接/.test(this.syncMessage || '');this.retrySave.disabled=!!this.sync?.busy;}
    if(this.loadDatabase)this.loadDatabase.hidden=!this.sync?.conflict;
    if(this.smallerButton)this.smallerButton.hidden=this.largerButton.hidden=!this.selected?.userData.furnitureType?.startsWith('town-');
    const label=this.selected ? FURNITURE[this.selected.userData.furnitureType].label : '未选中家具';
    this.stateText.replaceChildren();
    const title=document.createElement('strong');title.textContent=`${this.context?.label || '卧室'}编辑 · ${label}`;
    const help=document.createElement('small');help.textContent=this.selected
      ? '拖动摆放 · 滚轮旋转家具 · 右键轻点菜单 · 按住右键拖动转镜头'
      : 'WASD 平移镜头 · 按住右键拖动转镜头 · 户外滚轮缩放 · Esc 完成';
    const saved=document.createElement('small');saved.textContent=(this.selected&&getCatalogEntry(this.selected.userData.furnitureType).localCategory==='Floor'?'景观地形仅作装饰，不提供可行走的叠层表面。 ':'')+(this.selected?.userData.assetState==='loading'?'模型加载中 · 选中及摆放位置已保留。 ':['failed','missing'].includes(this.selected?.userData.assetState)?'模型文件缺失或加载失败 · 可删除此占位。 ':'')+(this.syncMessage||'正在连接数据库…');
    this.stateText.append(title,help,saved);
    this.panelToggle.hidden=!this.selected&&!this.panelCollapsed;
    this.panelToggle.setAttribute('aria-expanded',String(this.active&&this.panelToggle.hidden));
  }
  ground(e) {
    const rect=this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),this.camera);
    if((this.context?.templateId==='coastal_town_v1'||this.context?.templateId==='forest_v1'||this.context?.templateId?.startsWith('local_'))){const template=getTemplate(this.context.templateId),range=authorHeightRange(template.authorSceneId)||[-2,4],ray=this.ray.ray;if(ray.direction.y>=0)return null;const down=-ray.direction.y,start=Math.max(0,(ray.origin.y-range[1]-.1)/down),end=(ray.origin.y-range[0]+.1)/down;for(let t=start;t<=end;t+=.04){const p=ray.at(t,new THREE.Vector3()),s=surfaceAt(template,p.x,p.z);if(s&&p.y<=s.height)return new THREE.Vector3(p.x,s.height,p.z);}return null;}return this.ray.ray.intersectPlane(this.plane,new THREE.Vector3());
  }
  pick(e) {
    this.ground(e);this.group.updateMatrixWorld(true);
    const hits=this.ray.intersectObjects(this.items(),true);
    for(const hit of hits){let o=hit.object;while(o&&o.parent!==this.group)o=o.parent;if(o?.userData.furnitureType&&!o.userData.protected)return o;}
    return null;
  }
  constrain(o) {
    const bounds=this.context?.bounds || {x0:-3.38,x1:3.38,z0:-3.38,z1:3.38};
    fitYardPool(o);
    o.position.x=THREE.MathUtils.clamp(o.position.x,bounds.x0,bounds.x1);
    o.position.z=THREE.MathUtils.clamp(o.position.z,bounds.z0,bounds.z1);
    o.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(o);
    for(const axis of ['x','z']) {
      if(b.min[axis]<bounds[axis+'0'])o.position[axis]+=bounds[axis+'0']-b.min[axis];
      if(b.max[axis]>bounds[axis+'1'])o.position[axis]-=b.max[axis]-bounds[axis+'1'];
    }
    if(o.userData.furnitureType==='yardPool'){
      const corners=footprintCorners({type:'yardPool',position:[0,0,0],rotation:o.rotation.y,scale:o.scale.toArray()});
      // Match the server's footprint, with a tiny margin for rounding at the fence.
      for(const [i,axis] of ['x','z'].entries()){
        const offsets=corners.map(point=>point[i]);
        const min=bounds[axis+'0']-Math.min(...offsets)+1e-6;
        const max=bounds[axis+'1']-Math.max(...offsets)-1e-6;
        o.position[axis]=THREE.MathUtils.clamp(o.position[axis],min,max);
      }
    }
    if((this.context?.templateId==='coastal_town_v1'||this.context?.templateId==='forest_v1'||this.context?.templateId?.startsWith('local_'))){const surface=surfaceAt(getTemplate(this.context.templateId),o.position.x,o.position.z);if(surface)o.position.y=surface.height+(getCatalogEntry(o.userData.furnitureType).authorOffsetY||0);}this.outline.setFromObject(o);
  }
  add(type) {
    if(this.snapshot().length>=(this.context?.templateId?getTemplate(this.context.templateId).maxEntities||100:100)){this.status.textContent='家具数量已达当前场景上限';return;}
    this.checkpoint();const o=createFurniture(type);o.addEventListener('assetstate',()=>{if(this.selected===o){this.outline.setFromObject(o);this.refreshState();}});o.position.set(0,0,.3);
    if(this.worldClient&&this.camera&&this.ray){this.ray.setFromCamera(new THREE.Vector2(0,0),this.camera);const point=this.ray.ray.intersectPlane(this.plane,new THREE.Vector3());if(point)o.position.set(point.x,0,point.z);}
    if(type.startsWith('town-')){const f=getCatalogEntry(type).footprint;o.scale.setScalar(Math.min(1,3.2/Math.max(f.width,f.depth)));}
    this.group.add(o);this.select(o);this.constrain(o);
    if(this.worldClient){this.syncMessage='待放置 · 拖动家具松手保存，或点弹窗右上角「−」';this.refreshState();}else this.save();
  }
  resize(factor){
    if(!this.selected)return;
    this.checkpoint();
    const {min,max,uniform}=getCatalogEntry(this.selected.userData.furnitureType).scale;
    const scale=this.selected.scale;
    if(uniform)scale.setScalar(THREE.MathUtils.clamp(scale.x*factor,min,max));
    else {
      const {x,y,z}=scale;
      scale.multiplyScalar(THREE.MathUtils.clamp(factor,min/Math.min(x,y,z),max/Math.max(x,y,z)));
    }
    this.constrain(this.selected);this.save();this.refreshState();
  }
  rotate(angle=Math.PI/2, checkpoint=true){if(!this.selected)return;if(checkpoint)this.checkpoint();this.selected.rotation.y+=angle;this.constrain(this.selected);this.save();}
  duplicate(){if(!this.selected||this.snapshot().length>=(this.context?.templateId?getTemplate(this.context.templateId).maxEntities||100:100))return;const source=this.selected;this.add(source.userData.furnitureType);this.selected.position.copy(source.position).add(new THREE.Vector3(.4,0,.4));this.selected.rotation.copy(source.rotation);this.selected.scale.copy(source.scale);this.constrain(this.selected);this.save();}
  remove(){if(!this.selected)return;this.checkpoint();releaseLocalAssets(this.selected);this.group.remove(this.selected);this.select(null);this.save();}
  undo(){if(this.worldClient){this.sync.undo();return;}const previous=this.history.pop();if(previous){this.restore(previous);this.save();}}
  finishDrag(){if(this.dragging){this.dragging=false;this.save();}this.canvas.style.cursor=this.active?'grab':'';}
  bind() {
    const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
    let orbit=null;
    const finishOrbit=()=>{
      const gesture=orbit;orbit=null;
      if(!gesture)return;
      this.canvas.style.cursor=this.active?'grab':'';
      if(this.canvas.hasPointerCapture(gesture.pointerId))this.canvas.releasePointerCapture(gesture.pointerId);
      return gesture;
    };
    const openMenu=e=>{
      this.select(this.pick(e));if(!this.selected)return;
      this.onClickSound?.();
      this.menu.hidden=false;this.menu.style.left=`${Math.min(e.clientX,innerWidth-170)}px`;this.menu.style.top=`${Math.min(e.clientY,innerHeight-150)}px`;
    };
    this.canvas.addEventListener('wheel',e=>{
      if(!this.active || !this.selected || !e.deltaY)return;
      consume(e);
      const now=performance.now();
      const newGesture=!this.lastWheelAt || now-this.lastWheelAt>300 || this.wheelObject!==this.selected;
      if(newGesture){this.wheelDelta=0;this.checkpoint();}
      this.wheelObject=this.selected;this.lastWheelAt=now;
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?400:1);
      this.wheelDelta=(this.wheelDelta||0)+delta;
      const steps=Math.trunc(this.wheelDelta/40);
      if(steps){this.wheelDelta-=steps*40;this.rotate(steps*Math.PI/12,false);}
    },{passive:false});
    this.canvas.addEventListener('pointerdown',e=>{
      if(!this.active)return;
      if(e.button===2){
        consume(e);this.menu.hidden=true;
        if(this.dragging)return;
        orbit={pointerId:e.pointerId,x:e.clientX,y:e.clientY,dragged:false};
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      if(e.button!==0||orbit)return;
      const object=this.pick(e);this.menu.hidden=true;
      if(object){consume(e);this.onClickSound?.();this.checkpoint();this.select(object);this.dragging=true;this.pointerId=e.pointerId;
        this.offset.copy(object.position).sub(this.ground(e));this.canvas.setPointerCapture(e.pointerId);this.canvas.style.cursor='grabbing';}
      else this.select(null);
    },true);
    this.canvas.addEventListener('pointermove',e=>{
      if(orbit?.pointerId===e.pointerId){
        consume(e);
        if(!this.active||!(e.buttons&2)){finishOrbit();return;}
        const dx=e.clientX-orbit.x,dy=e.clientY-orbit.y;
        if(!orbit.dragged&&Math.hypot(dx,dy)<5)return;
        orbit.dragged=true;orbit.x=e.clientX;orbit.y=e.clientY;
        this.canvas.style.cursor='none';
        this.onOrbit?.(dx,dy);
        return;
      }
      if(!this.active||!this.dragging)return;consume(e);const point=this.ground(e);if(!point)return;
      const y=this.selected.position.y;this.selected.position.copy(point.add(this.offset));this.selected.position.y=y;this.constrain(this.selected);
    },true);
    this.canvas.addEventListener('pointerup',e=>{
      if(orbit?.pointerId===e.pointerId&&e.button===2){
        consume(e);
        if(!finishOrbit().dragged&&this.active)openMenu(e);
      }else if(this.active&&this.dragging){consume(e);this.finishDrag();}
    },true);
    const cancelDrag=()=>{finishOrbit();this.finishDrag();};
    this.canvas.addEventListener('pointercancel',cancelDrag,true);
    this.canvas.addEventListener('lostpointercapture',cancelDrag,true);
    window.addEventListener('blur',finishOrbit);
    this.canvas.addEventListener('contextmenu',e=>{
      if(!this.active)return;
      consume(e);
      if(e.button!==2&&!orbit)openMenu(e);
    });
    window.addEventListener('keydown',e=>{
      if(!this.active||this.resetPending||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
      if(e.code==='Escape'){e.preventDefault();this.setActive(false);}
      if(e.code==='KeyR'){consume(e);this.rotate();}
      if(e.code==='Delete'||e.code==='Backspace'){consume(e);this.remove();}
      if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){consume(e);this.undo();}
    },true);
  }
}
