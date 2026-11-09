// A short screen veil masks the scene handoff; the arrival ring finishes it.
export function createTeleportEffect(){
 const style=document.createElement('style');style.textContent=`
 .teleport-veil{position:fixed;inset:0;z-index:95;display:grid;place-content:center;text-align:center;gap:18px;background:radial-gradient(ellipse at 50% 65%,#b9f5e6e8,#283a48f5);color:#fff9ec;font:16px system-ui;opacity:0;transition:opacity 220ms;pointer-events:all}.teleport-veil[hidden]{display:none}.teleport-veil.visible{opacity:1}.teleport-veil.cut{transition:none}.teleport-veil.encounter{z-index:1150;background:radial-gradient(ellipse at 50% 65%,#4d6947,#101a19 72%)}.teleport-veil.encounter.arrived{background:radial-gradient(ellipse at 50% 65%,#b7e77740,transparent 68%)}.teleport-ring{width:86px;height:86px;margin:auto;border:3px solid #e2fff3;border-radius:50%;box-shadow:0 0 35px #b5ffe2,inset 0 0 20px #b5ffe2;transform:rotateX(55deg);animation:teleport-pulse .8s ease-in-out infinite}.teleport-veil.arrived{background:radial-gradient(ellipse at 50% 65%,#bbffe7aa,transparent 65%)}.teleport-veil.arrived .teleport-ring{animation:teleport-arrive .45s ease-out forwards}@keyframes teleport-pulse{50%{transform:rotateX(55deg) scale(1.3)}}@keyframes teleport-arrive{to{transform:rotateX(55deg) scale(3);opacity:0}}@media(prefers-reduced-motion:reduce){.teleport-veil{transition:none}.teleport-ring{animation:none!important}}`;
 const element=document.createElement('div');element.className='teleport-veil';element.hidden=true;element.setAttribute('role','status');element.innerHTML='<div class="teleport-ring" aria-hidden="true"></div><span></span>';document.head.append(style);document.body.append(element);
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion: reduce)').matches?0:ms));
 let revision=0;
 const label=element.querySelector('span');
 function clear(){revision++;element.hidden=true;element.classList.remove('visible','arrived','cut','encounter');}
 async function arrive(){
  const token=revision;
  label.textContent='';
  element.classList.add('arrived');
  await pause(180);
  if(token!==revision)return;
  element.classList.remove('visible');
  await pause(240);
  if(token===revision)clear();
 }
 return {
  async depart(destination){
   clear();
   label.textContent=`传送至 ${destination}`;
   element.hidden=false;
   void element.offsetWidth;
   element.classList.add('visible');
   await pause(240);
  },
  async reveal(title,{encounter=false}={}){
   clear();
   const token=revision;
   label.textContent=title;
   element.hidden=false;
   element.classList.add('visible','cut');
   element.classList.toggle('encounter',encounter);
   await pause(encounter?220:100);
   if(token!==revision)return;
   element.classList.remove('cut');
   await arrive();
  },
  arrive,clear,
 };
}
