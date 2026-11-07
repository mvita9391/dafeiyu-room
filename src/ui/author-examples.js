import * as THREE from 'three';
import {localExamples,localAssetCache} from '../world/local-assets.js';
import {buildAuthorScene} from '../world/author-scene.js';
// Install synchronously before fetching scene data, including key releases.
export function bindAuthorPreviewKeyboard(dialog,pan){
 dialog.addEventListener('keydown',e=>{e.stopPropagation();const d={KeyW:[0,-2],KeyS:[0,2],KeyA:[-2,0],KeyD:[2,0]}[e.code];if(d||e.code==='Space')e.preventDefault();if(d)pan(d);});
 dialog.addEventListener('keyup',e=>{e.stopPropagation();});
}
export function mountAuthorExamples({renderActivity,onOpen=()=>{},onClose=()=>{}}={}){
 if(!localExamples.length)return;
 const button=document.createElement('button');button.textContent='作者样例';button.style.cssText='position:fixed;right:24px;top:72px;z-index:34;padding:9px 13px;border:1px solid #bfae9d;border-radius:12px;background:#fff9ee;color:#51454a;cursor:pointer';document.body.append(button);
 button.onclick=async()=>{
  onOpen();const dialog=document.createElement('dialog');dialog.style.cssText='padding:0;border:0;border-radius:16px;width:94vw;max-width:1400px;background:#dfebe5;color:#46564d';dialog.innerHTML='<header style="display:flex;gap:12px;align-items:center;padding:14px"><strong>作者原布局 · 2 个可预览 / 12 个建筑清单</strong><select aria-label="选择作者样例"></select><span style="flex:1;font-size:12px">Town / Beach 可从便利店进入游玩；此处为作者原布局预览。拖动旋转 · WASD 平移 · 滚轮缩放</span><button data-close>返回游戏</button></header><div data-view style="height:70vh;position:relative"></div><footer style="padding:10px;font-size:12px"></footer>';document.body.append(dialog);dialog.showModal();
  const select=dialog.querySelector('select'),view=dialog.querySelector('[data-view]'),footer=dialog.querySelector('footer');for(const e of [...localExamples].sort((a,b)=>(a.kind==='town'?-1:a.kind==='beach'?0:1)-(b.kind==='town'?-1:b.kind==='beach'?0:1))){const o=document.createElement('option');o.value=e.id;o.textContent=e.kind==='town'?'整镇 Demo_Town · 完整预览':e.kind==='beach'?'海滩 Demo_Beach':`${e.id} · 建筑展示（列表）`;o.disabled=e.kind==='building';select.append(o);}
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(view.clientWidth,view.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;view.append(renderer.domElement);const scene=new THREE.Scene();scene.background=new THREE.Color(0xd9e9e8);scene.add(new THREE.HemisphereLight(0xffffff,0x849771,2));const sun=new THREE.DirectionalLight(0xffedcb,2.5);sun.position.set(20,35,10);scene.add(sun);const camera=new THREE.OrthographicCamera(),focus=new THREE.Vector3();let half=19,az=.7,content=null,pendingScene=null,stopRender=()=>{},closed=false,generation=0;
  const close=()=>{if(closed)return;closed=true;generation++;stopRender();content?.userData.streaming?.dispose();renderer.dispose();dialog.close();dialog.remove();onClose();};dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  bindAuthorPreviewKeyboard(dialog,d=>{focus.x+=d[0];focus.z+=d[1];});
  async function show(){const token=++generation;pendingScene=null;footer.textContent='正在读取作者原始场景…';content?.userData.streaming?.dispose();content?.removeFromParent();content=null;try{const response=await fetch('/api/local-assets/scenes/'+select.value);if(!response.ok)throw Error('本地场景文件不可用');const data=await response.json();if(closed||token!==generation)return;pendingScene={data,town:select.value==='Demo_Town'};}catch(e){footer.textContent=e.message;}}
  select.onchange=show;await show();let dragging=false,lastX=0;renderer.domElement.onpointerdown=e=>{dragging=true;lastX=e.clientX;renderer.domElement.setPointerCapture(e.pointerId);};renderer.domElement.onpointermove=e=>{if(dragging){az+=(e.clientX-lastX)*.008;lastX=e.clientX;}};renderer.domElement.onpointerup=()=>dragging=false;renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();half=Math.max(8,Math.min(30,half+e.deltaY*.02));},{passive:false});
  function frame(){if(closed)return;if(pendingScene){
   const {data,town}=pendingScene;
   pendingScene=null;
   try{
    content=buildAuthorScene(data,{radius:34,maxResident:160});
    scene.add(content);
    focus.set(...(town?[0,3,24]:[-3,1,0]));
    half=town?19:20;
   }catch(error){footer.textContent=error.message;}
  }const aspect=view.clientWidth/view.clientHeight;camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.near=.1;camera.far=500;camera.position.copy(focus).add(new THREE.Vector3(Math.cos(az)*65,48,Math.sin(az)*65));camera.lookAt(focus);camera.updateProjectionMatrix();content?.userData.streaming?.update(focus.toArray());content?.userData.streaming?.tick();renderer.render(scene,camera);if(content)footer.textContent=`${select.value} 原布局 · 当前 ${content.userData.streaming.stats.resident} / ${content.userData.streaming.stats.maxResident} 网格 · 加载中 ${localAssetCache.stats.pending+content.userData.streaming.stats.pending} · WASD 浏览完整场景`;}if(!closed)stopRender=renderActivity.loop(frame);
 };
}
