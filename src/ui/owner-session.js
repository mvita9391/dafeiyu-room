// Shared owner session for the world view and the agent connection panel.
// The session credential stays in an HttpOnly cookie; only CSRF is held in memory.
export class OwnerSession {
 constructor({request=globalThis.fetch?.bind(globalThis)}={}){this.request=request;}
 async read(){
  let r=await this.request('/api/auth/session',{credentials:'same-origin'});
  if(r.status===401){
   const status=await this.request('/api/auth/status',{credentials:'same-origin'});
   this.localEntryAvailable=status.ok&&(await status.json()).localEntryAvailable===true;
   if(this.localEntryAvailable){
    const entry=await this.request('/api/auth/local-session',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});
    if(entry.ok)r=await this.request('/api/auth/session',{credentials:'same-origin'});
   }
  }
  if(!r.ok)throw Object.assign(Error(this.localEntryAvailable?'本机连接失败，请使用启动时的游戏地址刷新页面。':'请打开本机游戏连接。远程主人登录尚未支持，需要后续接入身份认证。'),{status:r.status});
  return this.session=await r.json();
 }
 async ensure(){
  let initialError;
  try{return await this.read();}catch(error){initialError=error;}
  return new Promise(resolve=>{
   if(this.panel)this.panel.remove();
   const panel=document.createElement('section');this.panel=panel;
   panel.style.cssText='position:fixed;inset:0;z-index:150;background:#2c2929b8;display:grid;place-items:center;font:15px system-ui;color:#51454a';
   panel.innerHTML='<section style="background:#faf1e5;padding:28px;border-radius:22px;width:min(420px,85vw);box-shadow:0 15px 60px #0005"><h2>连接你的世界</h2><p>请在本机打开游戏，浏览器会自动连接。连接中断时可以重试。远程主人登录尚未支持，需要后续接入身份认证。</p><button type="button" data-retry style="padding:10px 20px">重新连接</button><p role="status"></p></section>';
   panel.querySelector('[role="status"]').textContent=initialError.message;
   document.body.append(panel);
   const connect=async()=>{
    const buttons=[panel.querySelector('[data-retry]')];
    for(const button of buttons)button.disabled=true;
    try{const session=await this.read();panel.remove();resolve(session);}
    catch(error){panel.querySelector('[role="status"]').textContent=error.message;}
    finally{for(const button of buttons)button.disabled=false;}
   };
   panel.querySelector('[data-retry]').onclick=()=>connect();
  });
 }
}
export const ownerSession=new OwnerSession();
