import {ownerSession} from './owner-session.js';
const scopeNames={'world:read':'观察世界','actor:control':'角色行动','build:write':'场景建设','audio:play':'播放智能体提供的语音（无需麦克风）'};
export function connectionSummary(data){
 if(!data||data.health?.service!=='ready')return '世界服务离线，请确认游戏服务已启动。';
 if(data.health.protocol==='incompatible')return 'MCP 协议不兼容，请更新客户端或使用高级 stdio 适配器。';
 if(data.health.authorization==='owner_required')return '主人会话已失效，请打开本机游戏重新连接。';
 return '服务已启动 · 协议待客户端验证';
}
export function validateMcpEndpoint(endpoint){
 let u;try{u=new URL(endpoint);}catch{throw Error('MCP 地址无效');}
 if(u.username||u.password||u.search||u.hash||u.pathname!=='/mcp'||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('MCP 地址必须是无凭证的服务地址');
 return u.href;
}
export class AgentConnect {
 constructor({document=globalThis.document,request=globalThis.fetch?.bind(globalThis),session=ownerSession,clipboard=globalThis.navigator?.clipboard}={}){
  Object.assign(this,{document,request,session,clipboard});
  const style=document.createElement('style');style.textContent=styles;document.head.append(style);this.style=style;
 }
 async open({onClose}={}){
  if(this.panel){this.panel.querySelector('[data-close]').focus();return;}
  const d=this.document,panel=d.createElement('div');panel.className='agent-connect-backdrop';
  panel.innerHTML=`<section class="agent-connect-card" role="dialog" aria-modal="true" aria-labelledby="agent-connect-title" tabindex="-1"><header><div><span class="agent-eyebrow">让世界多一个伙伴</span><h2 id="agent-connect-title">连接智能体</h2></div><button class="agent-icon" data-close aria-label="关闭连接面板">×</button></header><div class="agent-control-notice"><strong>停手 10 秒后让出角色控制权</strong><p>角色动作结束后开始计时。想接管时，按 WASD 即可。</p></div><p class="agent-intro">生成连接 JSON 后，复制并粘贴到支持 HTTP MCP 的客户端。</p><div data-key-setup hidden><label class="agent-key-label" for="agent-client-name">接入的 agent 名称</label><div class="agent-address"><input id="agent-client-name" data-client-name required aria-describedby="agent-name-error" placeholder="请输入名称" maxlength="100" autocomplete="off"><button class="btn" data-new-key type="button">生成连接 JSON</button></div><p id="agent-name-error" class="agent-field-error" data-name-error role="alert" hidden></p></div><div data-issued-key hidden></div><div class="agent-health" role="status" data-status>正在检查服务…</div><div class="agent-section-heading"><h3>已授权的伙伴</h3><button class="agent-link" data-refresh>刷新状态</button></div><p class="agent-muted">授权表示可以访问世界，不代表智能体此刻在线。</p><div data-agents></div><button class="btn" data-connect hidden>重新连接主人会话</button><details><summary>接入说明与高级选项</summary><p>默认授权：观察世界、角色行动、场景建设。智能体从工具说明获取规则，无需额外填写游戏提示词。</p><p>仅支持 stdio 的客户端：使用本项目适配器 <code>npm run mcp:stdio -- --config &lt;凭证文件&gt;</code>。凭证文件由主人单独签发，权限设为 0600；不能把令牌放进 MCP 地址。详见仓库 <code>docs/MCP-QUICKSTART.md</code>。</p><p>关闭网页后，服务仍可完成已接受的动作；自主决策和唤醒由你的智能体客户端负责。</p></details></section>`;
  this.panel=panel;this.issuedGrantId=null;d.body.append(panel);const card=panel.querySelector('section');
  const close=()=>{panel.remove();this.panel=null;d.removeEventListener('keydown',this.onKey);onClose?.();};
  panel.querySelector('[data-close]').onclick=close;panel.onclick=e=>{if(e.target===panel)close();};
  this.onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Tab'){const all=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea,summary')].filter(item=>!item.closest('[hidden]')),first=all[0],last=all.at(-1);if(e.shiftKey&&d.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&d.activeElement===last){e.preventDefault();first.focus();}}};d.addEventListener('keydown',this.onKey);card.focus();
  panel.querySelector('[data-refresh]').onclick=async()=>{const button=panel.querySelector('[data-refresh]');button.disabled=true;button.textContent='刷新中…';panel.querySelector('[data-status]').textContent='正在刷新授权状态…';try{await this.refresh();if(this.panel===panel&&this.data)panel.querySelector('[data-status]').textContent=connectionSummary(this.data)+' · 状态已刷新';}finally{button.disabled=false;button.textContent='刷新状态';}};
  panel.querySelector('[data-connect]').onclick=async()=>{const button=panel.querySelector('[data-connect]');button.disabled=true;button.textContent='正在重新连接…';try{await this.session.read();if(this.panel===panel){await this.refresh();panel.querySelector('[data-status]').textContent='主人会话已连接 · 可以查看和管理授权';}}catch(error){panel.querySelector('[data-status]').textContent=error.message;}finally{button.disabled=false;button.textContent='重新连接主人会话';}};
  panel.querySelector('[data-client-name]').oninput=()=>{
   const field=panel.querySelector('[data-client-name]');
   const error=panel.querySelector('[data-name-error]');
   if(!field.value.trim())return;
   field.setAttribute('aria-invalid','false');
   error.textContent='';error.hidden=true;
  };
  panel.querySelector('[data-new-key]').onclick=()=>this.issueApiKey(panel,null,panel.querySelector('[data-new-key]'));
  await this.refresh();
 }
 showApiKey(panel,key,expiresAt,endpoint,slot=panel.querySelector('[data-issued-key]'),onClose){
  const heading=this.document.createElement('h3');
  heading.textContent='连接 JSON';
  const detail=this.document.createElement('p');
  const expiry=new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(expiresAt);
  detail.textContent=`此配置包含密钥，${expiry} 到期。`;
  const json=JSON.stringify({url:endpoint,headers:{Authorization:'Bearer '+key}},null,2);
  const preview=this.document.createElement('textarea');
  preview.className='agent-json';
  preview.rows=7;preview.readOnly=true;preview.spellcheck=false;preview.value=json;
  preview.setAttribute('aria-label','连接 JSON');
  const actions=this.document.createElement('div');
  actions.className='agent-key-actions';
  const copyJson=this.document.createElement('button');
  copyJson.type='button';copyJson.className='btn';copyJson.textContent='复制连接 JSON';
  copyJson.onclick=async()=>{
   try{await this.clipboard.writeText(json);copyJson.textContent='已复制 JSON';}
   catch{preview.focus();preview.select();}
  };
  const copyKey=this.document.createElement('button');
  copyKey.type='button';copyKey.className='agent-link';copyKey.textContent='只复制密钥';
  copyKey.onclick=async()=>{
   try{await this.clipboard.writeText(key);copyKey.textContent='已复制密钥';}
   catch{
    const start=json.indexOf(key);
    preview.focus();preview.setSelectionRange(start,start+key.length);
   }
  };
  const done=this.document.createElement('button');
  done.type='button';done.className='agent-link';done.textContent='关闭';
  done.onclick=()=>{slot.replaceChildren();slot.hidden=true;onClose?.();};
  actions.append(copyJson,copyKey,done);
  slot.replaceChildren(heading,detail,preview,actions);
  slot.hidden=false;
  slot.scrollIntoView?.({block:'nearest'});
 }
 async issueApiKey(panel,grant,button){
  const nameField=panel.querySelector('[data-client-name]');
  const clientName=nameField.value?.trim();
  if(!grant&&!clientName){
   const error=panel.querySelector('[data-name-error]');
   error.textContent='请输入接入的 agent 名称。';
   error.hidden=false;
   nameField.setAttribute('aria-invalid','true');
   nameField.focus();
   return;
  }
  button.disabled=true;
  try{
   const session=await this.session.read();
   const endpoint=validateMcpEndpoint(this.data.endpoint);
   const route=grant?'/api/auth/grants/'+encodeURIComponent(grant.grantId)+'/key':'/api/auth/grants/key';
   const body=grant?{}:{clientName};
   const response=await this.request(route,{
    method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify(body),
   });
   if(!response.ok)throw Error('密钥生成失败，请刷新授权状态后重试。');
   const {apiKey,grantId,expiresAt}=await response.json();
   if(this.panel!==panel)return;
   await this.refresh();
   if(this.panel===panel){
    if(!grant)nameField.value='';
    this.issuedGrantId=grantId;
    const slot=panel.querySelector('[data-issued-key]');
    this.showApiKey(panel,apiKey,expiresAt,endpoint,slot,()=>{this.issuedGrantId=null;});
   }
  }catch(error){
   if(this.panel===panel)panel.querySelector('[data-status]').textContent=error.message;
  }finally{button.disabled=false;}
 }
 async toggleSavedJson(panel,grant,button,slot){
  const setExpanded=expanded=>{
   button.setAttribute('aria-expanded',String(expanded));
   button.textContent=expanded?'收起 JSON':'查看 JSON';
  };
  if(!slot.hidden){
   slot.replaceChildren();slot.hidden=true;setExpanded(false);
   return;
  }
  button.disabled=true;
  try{
   const session=await this.session.read();
   const endpoint=validateMcpEndpoint(this.data.endpoint);
   const response=await this.request('/api/auth/grants/'+encodeURIComponent(grant.grantId)+'/key/view',{
    method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},body:'{}',
   });
   if(!response.ok)throw Error('无法读取旧密钥。可以更换密钥后重新复制。');
   const {apiKey,expiresAt}=await response.json();
   if(this.panel!==panel)return;
   this.showApiKey(panel,apiKey,expiresAt,endpoint,slot,()=>{setExpanded(false);button.focus();});
   setExpanded(true);
  }catch(error){
   if(this.panel===panel)panel.querySelector('[data-status]').textContent=error.message;
  }finally{button.disabled=false;}
 }
 async refresh(){
  const panel=this.panel;if(!panel)return;
  try{
   const r=await this.request('/api/integrations/mcp',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('offline');const data=await r.json();if(this.panel!==panel)return;this.data=data;
   panel.querySelector('[data-status]').textContent=connectionSummary(data);panel.querySelector('[data-connect]').hidden=data.health.authorization==='owner';
   panel.querySelector('[data-key-setup]').hidden=data.health.authorization!=='owner';
   const agents=panel.querySelector('[data-agents]');agents.replaceChildren();
   const authorized=data.connectedAgents.filter(grant=>grant.status==='authorized');
   if(this.issuedGrantId&&!authorized.some(grant=>grant.grantId===this.issuedGrantId)){
    const issued=panel.querySelector('[data-issued-key]');
    issued.replaceChildren();issued.hidden=true;this.issuedGrantId=null;
   }
   if(!authorized.length){const empty=this.document.createElement('p');empty.className='agent-empty';empty.textContent=data.health.authorization==='owner'?'还没有伙伴，生成连接 JSON 即可开始连接。':'主人会话未连接，请先重新连接，再查看和管理授权。';agents.append(empty);}
   for(const g of authorized){
    const row=this.document.createElement('div');row.className='agent-grant';const info=this.document.createElement('div'),name=this.document.createElement('strong'),detail=this.document.createElement('p'),badge=this.document.createElement('span');
    name.textContent=g.clientName;badge.className='agent-badge';badge.textContent='已授权';detail.textContent=g.scopes.map(s=>scopeNames[s]||s).join(' · ');info.append(name,badge,detail);row.append(info);
    const revoke=this.document.createElement('button');revoke.className='agent-link';revoke.textContent='撤销授权';revoke.onclick=async()=>{revoke.disabled=true;try{const session=await this.session.read();const r=await this.request('/api/auth/grants/'+encodeURIComponent(g.grantId)+'/revoke',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},body:'{}'});if(!r.ok)throw Error(r.status===401?'主人会话已失效，请打开本机游戏重新连接。':'撤销失败，请刷新后重试。');await this.refresh();}catch(e){panel.querySelector('[data-status]').textContent=e.message;revoke.disabled=false;}};row.append(revoke);
    const key=this.document.createElement('button');
    key.type='button';key.className='agent-link';key.textContent=g.hasApiKey?'更换密钥':'生成密钥';
    key.title=g.hasApiKey?'生成新密钥，旧密钥立即失效':'为此授权生成连接密钥';
    key.onclick=()=>this.issueApiKey(panel,g,key);
    row.append(key);agents.append(row);
    if(g.canViewJson){
     const view=this.document.createElement('button');
     view.type='button';view.className='agent-link';view.textContent='查看 JSON';view.setAttribute('aria-expanded','false');
     const history=this.document.createElement('div');
     history.className='agent-history-json';history.hidden=true;
     history.id='mcp-json-'+g.grantId;view.setAttribute('aria-controls',history.id);
     view.onclick=()=>this.toggleSavedJson(panel,g,view,history);
     row.append(view);agents.append(history);
    }
   }
  }catch{this.data=null;if(this.panel===panel){panel.querySelector('[data-status]').textContent=connectionSummary(null);panel.querySelector('[data-key-setup]').hidden=true;}}
 }
 dispose(){this.panel?.remove();this.document.removeEventListener('keydown',this.onKey);this.style.remove();}
}
const styles=`
.agent-connect-backdrop [hidden]{display:none!important}
.agent-connect-card button:disabled{opacity:.55;cursor:wait}


.agent-connect-backdrop{position:fixed;inset:0;z-index:140;background:#39313b75;backdrop-filter:blur(7px);display:grid;place-items:center;padding:20px;box-sizing:border-box;color:#55464c;font:14px/1.65 system-ui}
.agent-connect-card{width:min(560px,100%);max-height:88dvh;overflow:auto;box-sizing:border-box;background:#fff8ec;border:1px solid #fff;border-radius:25px;padding:26px;box-shadow:0 24px 90px #36273540;outline:none}
.agent-connect-card header{display:flex;justify-content:space-between;align-items:center}.agent-eyebrow{font-size:11px;color:#a07869;letter-spacing:.13em}.agent-connect-card h2{font-size:24px;line-height:1.3;margin:4px 0 0;color:#4d4148;font-weight:650}.agent-icon{background:#f0e7db;border:0;border-radius:50%;width:32px;height:32px;font-size:23px;color:#806b72;cursor:pointer}.agent-control-notice{margin-top:16px;padding:11px 13px;border:1px solid #e4bf86;border-left:4px solid #b77125;border-radius:11px;background:#fff0d6;color:#683c13}.agent-control-notice strong{font-size:14px;font-weight:700}.agent-control-notice p{margin:2px 0 0;font-size:12px}.agent-intro{margin:18px 0;color:#806f73}.agent-address{display:flex;gap:8px;margin:7px 0}.agent-address input{min-width:0;flex:1;border:1px solid #dfd0c0;border-radius:11px;padding:11px;background:#fffdf8;color:#51444e;font:13px ui-monospace,monospace}.agent-address .btn{white-space:nowrap;padding:9px 13px}.agent-health{background:#eeeadd;border:1px solid #dedfca;border-radius:11px;padding:10px 13px;color:#68725d;font-size:12px}.agent-section-heading{display:flex;align-items:center;justify-content:space-between;margin-top:20px}.agent-connect-card h3{font-size:15px;margin:0}.agent-link{border:0;background:none;color:#987466;font:inherit;font-size:12px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:5px}.agent-muted{font-size:11px;color:#a18e87;margin:4px 0 10px}.agent-empty{border:1px dashed #dfd1c1;padding:18px;border-radius:12px;font-size:12px;text-align:center;color:#9b857b}.agent-grant{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #e9dfd0;padding:12px 0}.agent-grant strong{font-size:13px;overflow-wrap:anywhere}.agent-grant p{font-size:11px;color:#99847e;margin:4px 0}.agent-badge{margin-left:8px;font-size:10px;color:#748064;background:#e9eddd;border-radius:5px;padding:2px 5px}.agent-field-error{color:#ab292c;font-size:12px;margin:3px 0 10px}.agent-address input[aria-invalid=true]{border-color:#ab292c}.agent-key-label{font-size:12px;font-weight:600}.agent-connect-card [data-issued-key],.agent-history-json{margin-top:14px;padding:12px;background:#eeeadd;border-radius:11px}.agent-connect-card [data-issued-key] p,.agent-history-json p{margin:4px 0 8px;font-size:12px}.agent-json{box-sizing:border-box;display:block;width:100%;padding:10px;border:1px solid #dfd0c0;border-radius:9px;background:#fffdf8;color:#51444e;font:12px/1.55 ui-monospace,monospace;resize:vertical}.agent-key-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:8px}.agent-connect-card details{margin-top:20px;padding-top:14px;border-top:1px solid #e9dfd0;font-size:12px;color:#928078}.agent-connect-card summary{cursor:pointer;color:#78696d}.agent-connect-card code{font-size:11px;overflow-wrap:anywhere}.agent-connect-card button:focus-visible,.agent-connect-card summary:focus-visible{outline:2px solid #a88872;outline-offset:3px}
@media(max-width:600px){.agent-connect-card{padding:20px;border-radius:20px}.agent-address{flex-wrap:wrap}.agent-address input{flex-basis:100%}.agent-address .btn{width:100%}}
`;
