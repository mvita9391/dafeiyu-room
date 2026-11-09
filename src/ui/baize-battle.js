import {attackTiming,controlledUnits,eventDuration,ROUND_MS,skillTargetMode,targetCells,unitSkills,validTargets} from '/shared/world/baize-battle.js';
import {PET_ELEMENTS,PET_SKILLS,describePetSkill} from '/shared/world/pet-skills.js';
import {UI_SOUND} from '../core/sound-dictionary.js';
import {createBaizeArena} from './baize-arena.js';
import './baize-battle.css';

const secondsLeft=battle=>Math.max(0,Math.min(ROUND_MS/1000,Math.ceil((battle.deadline-Date.now())/1000)));
const introducing=battle=>battle.turn===1&&battle.introStartedAt!=null&&Date.now()<battle.readyAt&&!battle.outcome;
const targetLabels={single:'单体',t:'T 字范围',all:'敌方全体'};
const petSkillKey='dafeiyu:last-battle-pet-skill';
const outcomes={won:'战斗胜利！',lost:'队伍倒下了，将回到森林入口。',fled:'成功逃离。'};
const badge=move=>{
 const {label,color}=PET_ELEMENTS[move.element];
 return `<span class="baize-element" style="--element-color:${color}">${label}</span>`;
};

export function mountBaizeBattle(client,{onEnter,onExit,playSound,character}){
 const panel=document.createElement('section');
 panel.className='baize-battle';
 panel.hidden=true;
 panel.tabIndex=-1;
 panel.setAttribute('role','dialog');
 panel.setAttribute('aria-modal','true');
 panel.setAttribute('aria-label','森林对战');
 panel.innerHTML=`
  <header class="baize-top"><span>森林对战</span><b></b><strong class="baize-ready"></strong>
   <details class="baize-library"><summary>技能库</summary><div class="baize-library-list" aria-label="宠物技能库"></div></details>
  </header>
  <strong class="baize-clock" role="timer" aria-label="剩余秒数" hidden></strong>
  <div class="baize-formation"></div>
  <div class="baize-message" role="status" aria-live="polite"><b></b><span></span></div>
  <aside class="baize-skill-popup" aria-label="选择技能" hidden>
   <div class="baize-skill-title"></div><div class="baize-moves"></div>
  </aside>
  <div class="baize-menu">
   <div class="baize-command-actions"><button class="baize-wait" type="button">待命</button><button class="baize-leave" type="button">逃跑</button></div>
  </div>`;
 const round=panel.querySelector('header b'),clock=panel.querySelector('.baize-clock'),readyText=panel.querySelector('.baize-ready');
 const message=panel.querySelector('.baize-message b'),hint=panel.querySelector('.baize-message span');
 const popup=panel.querySelector('.baize-skill-popup'),moves=panel.querySelector('.baize-moves'),popupTitle=panel.querySelector('.baize-skill-title');
 const wait=panel.querySelector('.baize-wait'),leave=panel.querySelector('.baize-leave');
 const library=panel.querySelector('.baize-library'),formation=panel.querySelector('.baize-formation');
 library.querySelector('.baize-library-list').innerHTML=Object.values(PET_SKILLS).map(move=>
  `<div>${badge(move)}<b>${move.name}</b><small>${describePetSkill(move)}</small><span>${targetLabels[skillTargetMode(move)]}</span></div>`
 ).join('');
 document.body.append(panel);

 let arena,battle,actorId,closedId,modelReady=null,busy=false,played=0,queue=[],event,elapsed=0,duration,impact;
 let selectedUnit,selectedMove,anchorId,previewTarget,buttons=[],exitDelay=null,lastHint='',lastSeconds;
 let hoveredEnemy=null;
 let lastPetSkill;
 try{lastPetSkill=localStorage.getItem(petSkillKey);}catch{}
 let tickRound=0,lastTick=6;
 const cards=new Map();
 const damageNumbers=[];

 function showHp(id,hp){
  const card=cards.get(id);
  card.hp.textContent=`${hp} / ${battle.units[id].maxHp}`;
  card.bar.style.width=`${100*hp/battle.units[id].maxHp}%`;
  card.button.classList.toggle('defeated',hp===0);
 }
 function showDamage({target,amount,hp}){
  showHp(target,hp);
  const unit=battle.units[target];
  const node=document.createElement('span');
  node.className='baize-damage-number';
  node.setAttribute('aria-hidden','true');
  node.textContent=String(amount);
  formation.append(node);
  damageNumbers.push({node,slot:unit.slot,height:unit.speciesId?1.06:1.66,age:0});
 }
 function clearDamage(){
  for(const {node} of damageNumbers)node.remove();
  damageNumbers.length=0;
 }
 function locked(){
  const now=Date.now();
  return busy||modelReady===null||Boolean(event)||queue.length>0||client.connectionStatus!=='connected'||
   (!battle.outcome&&(now<battle.readyAt||now>=battle.deadline));
 }
 function targets(){return selectedUnit?validTargets(battle,battle.units[selectedUnit]):[];}
 function aim(id,move=selectedMove){
  previewTarget=id;
  const primary=id&&battle.units[id];
  const slots=move&&primary?targetCells(primary.slot,move):[];
  arena.preview(slots);
  for(const [key,{button}] of cards)button.classList.toggle('marked',slots.includes(battle.units[key].slot));
 }
 function hoverEnemy(id){
  if(id===hoveredEnemy)return;
  hoveredEnemy=id;
  arena?.hover(id?battle.units[id].slot:null);
  if(!id)return;
  playSound?.(UI_SOUND.enemyHover);
  if(anchorId&&battle.units[selectedUnit]?.speciesId)aim(id);
 }
 function selectUnit(id){
  selectedUnit=id;
  selectedMove=null;
  anchorId=null;
  buttons=[];
  moves.replaceChildren();
  aim(null);
 }
 function openSkills(id){
  const unit=battle.units[selectedUnit];
  const pet=Boolean(unit.speciesId);
  const skills=unitSkills(unit);
  const available=skills.filter(move=>unit.uses[move.id]!==0);
  anchorId=id;
  selectedMove=pet?(available.find(move=>move.id===lastPetSkill)??available[0]):null;
  popupTitle.textContent=`${unit.name} · ${pet?'选好技能后点敌人':'选择技能'}`;
  moves.replaceChildren();
  buttons=skills.map((move,index)=>{
   const button=document.createElement('button');
   button.type='button';
   button.dataset.skill=move.id;
   const targetMode=skillTargetMode(move);
   button.innerHTML=`<kbd>${index+1}</kbd><span><b>${move.name} ${badge(move)}</b><small>${move.power} 伤害</small></span><em></em><strong class="baize-target-kind" data-mode="${targetMode}">${targetLabels[targetMode]}</strong>`;
   const preview=()=>aim(previewTarget??anchorId,move);
   const restore=()=>aim(popup.hidden?null:previewTarget??anchorId);
   button.addEventListener('pointerenter',preview);
   button.addEventListener('pointerleave',restore);
   button.addEventListener('focus',preview);
   button.addEventListener('blur',restore);
   button.addEventListener('click',()=>{
    if(!pet){void submit(move.id,anchorId);return;}
    selectedMove=move;
    restore();
    updateControls();
   });
   moves.append(button);
   return {button,move,uses:button.querySelector('em')};
  });
  aim(id);
  updateControls();
 }
 function selectEnemy(id,fromModel=false){
  if(cards.get(id)?.button.disabled!==false||locked())return;
  if(fromModel)playSound?.(UI_SOUND.confirm);
  if(anchorId&&selectedMove&&battle.units[selectedUnit]?.speciesId)void submit(selectedMove.id,id);
  else openSkills(id);
 }
 function buildUnits(){
  clearDamage();
  formation.replaceChildren();cards.clear();
  for(const unit of Object.values(battle.units)){
   const enemy=unit.slot.startsWith('enemy-');
   const rear=unit.slot.includes('-back-');
   const button=document.createElement(enemy?'button':'div');
   button.className=`baize-unit ${enemy?'enemy':'ally'}`;
   button.classList.toggle('rear',rear);
   button.dataset.unit=unit.id;
   button.innerHTML=`<b>${unit.name}</b><span></span><i><em></em></i>`;
   const height=rear?(unit.speciesId?1.35:2.05):-.03;
   cards.set(unit.id,{button,height,hp:button.querySelector('span'),bar:button.querySelector('em')});
   formation.append(button);
   if(!enemy)continue;
   button.type='button';
   const preview=()=>{if(anchorId&&battle.units[selectedUnit]?.speciesId)aim(unit.id);};
   button.addEventListener('focus',preview);
   button.addEventListener('click',()=>selectEnemy(unit.id));
  }
 }
 function updateControls(){
  if(!battle)return;
  const done=Boolean(battle.outcome&&!event&&!queue.length);
  const returning=done&&(exitDelay!==null||busy);
  const entering=introducing(battle);
  panel.classList.toggle('baize-entering',entering);
  const disabled=locked();
  if(disabled||done){
   panel.classList.remove('baize-model-target');
   hoverEnemy(null);
  }
  const units=controlledUnits(battle);
  const ready=units.filter(unit=>battle.orders[unit.id]).length;
  const seconds=secondsLeft(battle);
  const planning=!done&&!event&&!queue.length&&Date.now()>=battle.readyAt&&!battle.outcome;
  round.textContent=`第 ${event?played:battle.turn} 回合`;
  readyText.textContent=entering?'双方入场':planning?`${ready}/${units.length} 已选`:done?'结算':'行动中';
  clock.hidden=!planning;
  if(planning)clock.textContent=String(seconds);
  lastSeconds=planning?seconds:null;
  clock.classList.toggle('urgent',planning&&seconds<=5);
  const text=client.connectionStatus!=='connected'?'正在重新连接世界…':returning?'即将返回森林…':done?'':entering?'双方就位后开始读秒':event||Date.now()<battle.readyAt?'正在结算回合…':
   selectedMove?`点击敌方目标确认 · ${targetLabels[skillTargetMode(selectedMove)]}`:anchorId?'将鼠标移到技能上可预览范围':'点击敌人，打开技能选择';
  if(text!==lastHint){hint.textContent=text;lastHint=text;}
  popup.hidden=!anchorId||!planning||seconds===0;
  if(!planning||seconds===0)aim(null);
  wait.hidden=done;
  for(const {button,move,uses} of buttons){
   const left=battle.units[selectedUnit]?.uses[move.id]??move.uses;
   uses.textContent=left??'∞';
   button.disabled=disabled||!battle.units[selectedUnit]?.hp||left===0||done;
   button.setAttribute('aria-pressed',String(move===selectedMove));
  }
  const candidates=new Set(targets().map(unit=>unit.id));
  if(hoveredEnemy&&!candidates.has(hoveredEnemy))hoverEnemy(null);
  for(const [id,{button}] of cards)if(button.tagName==='BUTTON')button.disabled=disabled||!candidates.has(id)||done;
  wait.disabled=disabled||!battle.units[selectedUnit]?.hp;
  leave.textContent=done?'返回森林':'逃跑';
  leave.hidden=returning;
  leave.disabled=entering||busy||Boolean(event)||queue.length>0||client.connectionStatus!=='connected';
 }
 function settle(){
  for(const unit of Object.values(battle.units))showHp(unit.id,unit.hp);
  message.textContent=outcomes[battle.outcome]||'先选择要攻击的敌人。';
  exitDelay=battle.outcome==='won'?.55:battle.outcome==='fled'?.1:null;
  const units=controlledUnits(battle);
  selectUnit(units.find(unit=>!battle.orders[unit.id])?.id);
  updateControls();
 }
 function playNext(){
  event=queue.shift();
  elapsed=0;
  if(!event){settle();return;}
  if(event.kind==='attack')message.textContent=`${battle.units[event.side].name}使出${PET_SKILLS[event.skillId].name}！`;
  if(event.kind==='faint')message.textContent=`${battle.units[event.side].name}倒下了。`;
  if(event.kind==='flee')message.textContent='正在撤离战场…';
  const timing=event.kind==='attack'?attackTiming(event):null;
  duration=timing?.end??eventDuration(event);
  impact=timing?.impact;
  arena.begin(event,duration,timing);
  updateControls();
 }
 async function submit(choice,target){
  if(!battle||busy||event||queue.length||client.connectionStatus!=='connected')return;
  if(!['leave','flee'].includes(choice)&&locked())return;
  const current=battle,unitId=selectedUnit;
  library.open=false;
  busy=true;updateControls();
  try{
   await client.dispatch({kind:choice==='leave'?'battle.leave':'battle.choose',payload:{actorId,battleId:current.battleId,
    ...(choice==='leave'?{}:{turn:current.turn,choice,...(choice==='flee'?{}:{unitId,target})})}});
   if(unitId==='pet'&&PET_SKILLS[choice]&&choice!==lastPetSkill){
    lastPetSkill=choice;
    try{localStorage.setItem(petSkillKey,choice);}catch{}
   }
   if(battle?.battleId===current.battleId&&battle.turn===current.turn&&!battle.outcome){
    const next=controlledUnits(battle).find(unit=>!battle.orders[unit.id]);
    if(next){
     selectUnit(next.id);
     if(target&&battle.units[target]?.hp)openSkills(target);
    }
   }
  }catch(error){
   if(battle?.battleId===current.battleId)message.textContent=error.message==='BATTLE_ROUND_CLOSED'?'本轮选招已结束。':'指令未确认，请重试。';
  }finally{busy=false;updateControls();}
 }
 wait.addEventListener('click',()=>void submit('wait'));
 leave.addEventListener('click',()=>void submit(battle?.outcome?'leave':'flee'));
 let drag;
 function enemyAtPointer(event){
  if(!battle||battle.outcome||drag||event.target!==panel||locked())return null;
  const {left,top,width,height}=panel.getBoundingClientRect();
  const id=arena.pickEnemy((event.clientX-left)/width*2-1,1-(event.clientY-top)/height*2);
  return cards.get(id)?.button.disabled===false?id:null;
 }
 function stopOrbit(){
  if(!drag)return;
  const {id}=drag;
  drag=null;
  if(panel.hasPointerCapture(id))panel.releasePointerCapture(id);
  panel.classList.remove('baize-orbiting');
 }
 panel.addEventListener('pointerdown',event=>{
  if(!battle||event.button!==2)return;
  event.preventDefault();
  drag={id:event.pointerId,x:event.clientX,y:event.clientY};
  panel.setPointerCapture(event.pointerId);
  panel.classList.remove('baize-model-target');
  hoverEnemy(null);
  panel.classList.add('baize-orbiting');
 });
 panel.addEventListener('pointermove',event=>{
  if(drag?.id===event.pointerId){
   if(!(event.buttons&2)){stopOrbit();return;}
   arena.rotate(event.clientX-drag.x,event.clientY-drag.y);
   drag.x=event.clientX;drag.y=event.clientY;
   return;
  }
  const id=enemyAtPointer(event);
  panel.classList.toggle('baize-model-target',Boolean(id));
  const card=event.target.closest('button.enemy[data-unit]');
  hoverEnemy(id??(card?.disabled===false&&!locked()?card.dataset.unit:null));
 });
 panel.addEventListener('pointerleave',()=>{
  panel.classList.remove('baize-model-target');
  hoverEnemy(null);
 });
 panel.addEventListener('click',event=>{
  if(event.button!==0)return;
  const id=enemyAtPointer(event);
  if(id)selectEnemy(id,true);
 });
 for(const type of ['pointerup','pointercancel','lostpointercapture'])panel.addEventListener(type,event=>{
  if(drag?.id===event.pointerId)stopOrbit();
 });
 panel.addEventListener('contextmenu',event=>event.preventDefault());
 window.addEventListener('blur',stopOrbit);
 window.addEventListener('keydown',e=>{
  if(!battle)return;
  e.stopImmediatePropagation();
  if(e.key==='Tab'){
   const focusable=[...panel.querySelectorAll('summary, button:not(:disabled)')].filter(node=>!node.closest('[hidden]'));
   const first=focusable[0],last=focusable.at(-1);
   if(!first||e.shiftKey&&document.activeElement===first||!e.shiftKey&&document.activeElement===last){
    e.preventDefault();
    (e.shiftKey?last:first)?.focus();
   }
   return;
  }
  if(e.key==='Escape'){
   if(library.open)library.open=false;
   else if(anchorId){selectUnit(selectedUnit);updateControls();}
   return;
  }
  if(!/^[1-9]$/.test(e.key)||!buttons[Number(e.key)-1])return;
  e.preventDefault();
  if(!e.repeat&&!library.open&&!popup.hidden)buttons[Number(e.key)-1].button.click();
 },true);
 window.addEventListener('keyup',e=>{if(battle)e.stopImmediatePropagation();},true);
 client.onStatus(updateControls);

 return {
  get active(){return Boolean(battle);},
  sync(next,id){
   if(!next){
    if(battle){
     stopOrbit();
     hoverEnemy(null);
     clearDamage();
     closedId=battle.battleId;battle=null;event=null;queue=[];exitDelay=null;
     arena.clearCasts();panel.hidden=true;panel.classList.remove('baize-model-target');document.body.classList.remove('baize-battling');onExit();
    }
    return;
   }
   if(next.battleId===closedId)return;
   if(battle?.battleId!==next.battleId){
    hoverEnemy(null);
    battle=next;actorId=id;played=next.lastTurn?.turn??0;event=null;queue=[];tickRound=0;lastTick=6;
    if(!arena){
     arena=createBaizeArena(playSound,character);
     void arena.ready.then(ready=>{modelReady=ready;if(battle&&!event)arena.reset(battle);updateControls();});
    }
    arena.reset(battle);
    library.open=false;buildUnits();
    panel.hidden=false;document.body.classList.add('baize-battling');panel.focus({preventScroll:true});
    onEnter(introducing(next)&&Date.now()-next.introStartedAt<1000);settle();
    if(!next.lastTurn)message.textContent='高草中出现了一只野生白泽！';
    return;
   }
   const last=next.lastTurn;
   if((last?.turn??0)<played)return;
   battle=next;arena.sync(next);
   if(last&&last.turn>played){played=last.turn;queue=[...last.events];aim(null);playNext();}
   else updateControls();
  },
  render(renderer,dt){
   if(event){
    const previous=elapsed;
    elapsed+=dt;
    arena.advance(event,elapsed,dt);
    if(event.kind==='attack'&&previous<impact&&elapsed>=impact){
     arena.hit(event);
     for(const hit of event.hits)showDamage(hit);
    }
    if(elapsed>=duration){arena.end(event);playNext();}
   }else if(exitDelay!==null){
    exitDelay-=dt;
    if(exitDelay<=0&&!locked()){exitDelay=null;void submit('leave');}
   }
   arena.render(renderer,dt);
   for(let i=damageNumbers.length-1;i>=0;i--){
    const number=damageNumbers[i];
    number.age+=dt;
    const progress=number.age/.82;
    if(progress>=1){
     number.node.remove();damageNumbers.splice(i,1);continue;
    }
    const [x,y]=arena.project(number.slot,number.height);
    const pop=.9+.29*Math.sin(Math.PI*Math.min(1,progress*3.8));
    const rise=(1-(1-progress)**2)*40;
    number.node.style.left=`${x}%`;
    number.node.style.top=`${y}%`;
    number.node.style.transform=`translate(-50%,calc(-100% - ${rise}px)) scale(${pop})`;
    number.node.style.opacity=String(Math.min(1,(1-progress)*3.2));
   }
   let minX=100,maxX=0;
   for(const [id,{button,height}] of cards){
    const [x,y]=arena.project(battle.units[id].slot,height,id);
    if(battle.units[id].hp){minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
    const left=`${x.toFixed(3)}%`,top=`${y.toFixed(3)}%`;
    if(button.style.left!==left)button.style.left=left;
    if(button.style.top!==top)button.style.top=top;
   }
   if(!popup.hidden){
    const [x,y]=arena.project(battle.units[anchorId].slot);
    const width=panel.clientWidth;
    const leftSpace=width*minX/100-72,rightSpace=width*(100-maxX)/100-72;
    const openLeft=x<50?leftSpace>=248||leftSpace>rightSpace:leftSpace>rightSpace&&rightSpace<248;
    const available=openLeft?leftSpace:rightSpace;
    const edge=openLeft?minX:maxX;
    popup.style.setProperty('--anchor-x',`${edge.toFixed(2)}%`);
    popup.style.setProperty('--anchor-y',`${y.toFixed(2)}%`);
    popup.style.setProperty('--available-width',`${Math.max(150,Math.floor(available))}px`);
    popup.classList.toggle('open-left',openLeft);
   }
   const now=Date.now();
   if(!battle.outcome&&!event&&!queue.length&&now>=battle.readyAt&&secondsLeft(battle)!==lastSeconds)updateControls();
   if(lastSeconds>0&&lastSeconds<=5&&client.connectionStatus==='connected'){
    if(tickRound!==battle.turn){tickRound=battle.turn;lastTick=6;}
    if(lastSeconds<lastTick){
     lastTick=lastSeconds;
     playSound?.('battle-countdown');
    }
   }
  },
 };
}
