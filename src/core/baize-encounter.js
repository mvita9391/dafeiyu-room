import {forestGrassAt} from '../../shared/world/forest.js';

export function createBaizeEncounter(random=Math.random){
 const state={threshold:0,distance:0,cooldown:0};

 function advance(previous,next,inForest){
  const [x,,z]=previous.position,[ex,,ez]=next.position;
  const dx=ex-x,dz=ez-z,distance=Math.hypot(dx,dz);
  const grounded=previous.grounded!==false&&next.grounded!==false;
  if(distance<1e-9||!inForest&&!state.cooldown)return false;
  // An input frame is shorter than one tile. Split at both axes so diagonal
  // motion, entering a field and leaving it count only the part inside grass.
  const splits=[0,1];
  for(const [p,d] of [[x,dx],[z,dz]]){
   if(!d)continue;
   const edge=d>0?Math.floor(p)+1:Math.ceil(p)-1;
   const t=(edge-p)/d;
   if(t>0&&t<1)splits.push(t);
  }
  splits.sort((a,b)=>a-b);
  for(let i=1;i<splits.length;i++){
   const span=(splits[i]-splits[i-1])*distance;
   if(span<1e-9)continue;
   const mid=(splits[i]+splits[i-1])/2;
   const cooldown=grounded?Math.min(state.cooldown,span):0;
   state.cooldown-=cooldown;
   if(!inForest||!forestGrassAt(x+dx*mid,z+dz*mid)){
    state.threshold=state.distance=0;
    continue;
   }
   if(!grounded)continue;
   if(!state.threshold)state.threshold=8+8*random();
   state.distance+=span-cooldown;
   if(state.distance>=state.threshold&&forestGrassAt(ex,ez))return true;
  }
  return false;
 }

 function clearGrass(){state.threshold=state.distance=0;}
 return {
  advance,
  clearGrass,
  afterBattle(){clearGrass();state.cooldown=5;},
 };
}
