import {surfaceAt,surfaceSegment,COASTAL_LOW_OBSTACLES} from './coastal.js';
import {STREET_HOME} from './street-home.js';
import {getTemplate} from './templates.js';
import {getCatalogEntry} from './catalog.js';

// A layout owns this index; runtime movement reuses the same entity array without
// cloning catalog entries for every A* edge or keyboard substep.
const collisionIndexes=new WeakMap();
export function invalidateNavigationCache(snapshot){collisionIndexes.delete(snapshot.entities);}
function collisionCandidates(snapshot,sceneId,a,b=a){
 let index=collisionIndexes.get(snapshot.entities);if(!index||index.revision!==snapshot.layoutRevision||index.count!==snapshot.entities.length){
  const cells=new Map();for(const e of snapshot.entities){const f=getCatalogEntry(e.type).footprint;if(!f.blocking||e.type==='yardPool'||e.supportEntityId)continue;const c=Math.cos(e.rotation),s=Math.sin(e.rotation),w=f.width*e.scale[0]/2+.18,d=f.depth*e.scale[2]/2+.18,rx=Math.abs(c)*w+Math.abs(s)*d,rz=Math.abs(s)*w+Math.abs(c)*d,record={entity:e,c,s,half:[w,d]};for(let x=Math.floor((e.position[0]-rx)/8);x<=Math.floor((e.position[0]+rx)/8);x++)for(let z=Math.floor((e.position[2]-rz)/8);z<=Math.floor((e.position[2]+rz)/8);z++){const key=`${e.sceneId}:${x},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(record);}}
  index={cells,revision:snapshot.layoutRevision,count:snapshot.entities.length};collisionIndexes.set(snapshot.entities,index);
 }
 const found=new Set();for(let x=Math.floor(Math.min(a[0],b[0])/8);x<=Math.floor(Math.max(a[0],b[0])/8);x++)for(let z=Math.floor(Math.min(a[2],b[2])/8);z<=Math.floor(Math.max(a[2],b[2])/8);z++)for(const r of index.cells.get(`${sceneId}:${x},${z}`)||[])found.add(r);return [...found];
}

export const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
export function anchor(entity,id){const a=getCatalogEntry(entity.type).anchors.find(a=>a.anchorId===id);if(!a)throw Error('ANCHOR_NOT_FOUND');const [x,y,z]=a.position.map((v,i)=>v*entity.scale[i]);const c=Math.cos(entity.rotation),s=Math.sin(entity.rotation);return [entity.position[0]+x*c+z*s,entity.position[1]+y,entity.position[2]-x*s+z*c];}
export function walkable(snapshot,sceneId,p,airHeight=0){const scene=snapshot.scenes.find(s=>s.sceneId===sceneId);if(!scene)throw Error('SCENE_NOT_FOUND');const t=getTemplate(scene.templateId),b=t.bounds;airHeight=Math.max(airHeight,p[1]-(surfaceAt(t,p[0],p[2])?.height??p[1]));if(!surfaceAt(t,p[0],p[2]))return false;if(t.templateId==='coastal_town_v1'&&COASTAL_LOW_OBSTACLES.some(r=>airHeight<r.height+.02&&p[0]>r.x0-.18&&p[0]<r.x1+.18&&p[2]>r.z0-.18&&p[2]<r.z1+.18))return false;if((t.staticColliders||[]).some(r=>p[0]>r.x0-.18&&p[0]<r.x1+.18&&p[2]>r.z0-.18&&p[2]<r.z1+.18))return false;if(p[0]<b.x0+.15||p[0]>b.x1-.15||p[2]<b.z0+.15||p[2]>b.z1-.15)return false;return !collisionCandidates(snapshot,sceneId,p).some(({entity:e,c,s,half})=>{const dx=p[0]-e.position[0],dz=p[2]-e.position[2];return Math.abs(dx*c-dz*s)<half[0]&&Math.abs(dx*s+dz*c)<half[1];});}
// Exact slab intersection against every inflated, rotated furniture rectangle.
export function segmentWalkable(snapshot,sceneId,start,end,airHeight=0){
 const t=getTemplate(snapshot.scenes.find(s=>s.sceneId===sceneId).templateId);airHeight=Math.max(airHeight,start[1]-(surfaceAt(t,start[0],start[2])?.height??start[1]),end[1]-(surfaceAt(t,end[0],end[2])?.height??end[1]));
 if(!walkable(snapshot,sceneId,start,airHeight)||!walkable(snapshot,sceneId,end,airHeight))return false;
 const template=getTemplate(snapshot.scenes.find(s=>s.sceneId===sceneId).templateId);
 if(!surfaceSegment(template,start,end))return false;if(template.templateId==='coastal_town_v1'&&COASTAL_LOW_OBSTACLES.some(r=>airHeight<r.height+.02&&segmentHitsRect(start,end,r)))return false;
 if((template.staticColliders||[]).some(r=>segmentHitsRect(start,end,r)))return false;
 return !collisionCandidates(snapshot,sceneId,start,end).some(({entity,c,s,half})=>{
  const local=p=>{const x=p[0]-entity.position[0],z=p[2]-entity.position[2];return [x*c-z*s,x*s+z*c];};
  const a=local(start),b=local(end);
  let lo=0,hi=1;
  for(let axis=0;axis<2;axis++){
   const delta=b[axis]-a[axis],extent=half[axis]-1e-10;
   if(Math.abs(delta)<1e-12){if(Math.abs(a[axis])>=extent)return false;continue;}
   const t0=(-extent-a[axis])/delta,t1=(extent-a[axis])/delta;
   lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return false;
  }
  return lo<=hi;
 });
}
export function findPath(snapshot,sceneId,start,goal){
 const scene=snapshot.scenes.find(s=>s.sceneId===sceneId);if(!scene)throw Error('SCENE_NOT_FOUND');
 const terrain=getTemplate(scene.templateId),groundY=surfaceAt(terrain,goal[0],goal[2])?.height;
 if(groundY===undefined)throw Error('DESTINATION_BLOCKED');
 if(Math.abs(goal[1]-groundY)>1e-6)throw Error('INVALID_GROUND_HEIGHT');
 if(!walkable(snapshot,sceneId,goal))throw Error('DESTINATION_BLOCKED');
 if(!walkable(snapshot,sceneId,start))throw Error('PATH_START_BLOCKED');
 // A cancelled jump may land on a legal low support. Walk across its top and
 // step down outside its inflated collider before joining the ground grid.
 if(terrain.templateId==='coastal_town_v1'&&start[1]-coastalBase(start)>.02){
  const rock=COASTAL_LOW_OBSTACLES.find(r=>start[0]>r.x0-.18&&start[0]<r.x1+.18&&start[2]>r.z0-.18&&start[2]<r.z1+.18);
  if(rock){const exits=[[rock.x0-.21,start[1],start[2]],[rock.x1+.21,start[1],start[2]],[start[0],start[1],rock.z0-.21],[start[0],start[1],rock.z1+.21]].sort((a,b)=>distance(a,goal)-distance(b,goal));for(const exit of exits){const landing=[exit[0],coastalBase(exit),exit[2]];try{if(segmentWalkable(snapshot,sceneId,start,exit))return [exit,landing,...findPath(snapshot,sceneId,landing,goal)];}catch{}}throw Error('PATH_NOT_FOUND');}
 }
 function coastalBase(p){return surfaceAt(terrain,p[0],p[2])?.height??p[1];}

 // Keyboard steering must not snap to A* grid nodes when the direct edge is clear.
 if(segmentWalkable(snapshot,sceneId,start,goal))return [goal.slice()];
 const step=.25,key=p=>`${p[0]},${p[1]}`,point=p=>[p[0]*step,surfaceAt(terrain,p[0]*step,p[1]*step)?.height??0,p[1]*step];
 const a=[Math.round(start[0]/step),Math.round(start[2]/step)],b=[Math.round(goal[0]/step),Math.round(goal[2]/step)],open=[],cost=new Map(),prev=new Map();
 // Attach the exact start only through collision-free edges, including off-grid starts.
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
  const node=[a[0]+dx,a[1]+dz];if(!segmentWalkable(snapshot,sceneId,start,point(node)))continue;
  open.push(node);cost.set(key(node),distance(start,point(node))/step);
 }
 let found;
 for(let n=0;open.length&&n<30000;n++){
  open.sort((x,y)=>(cost.get(key(x))+Math.abs(x[0]-b[0])+Math.abs(x[1]-b[1]))-(cost.get(key(y))+Math.abs(y[0]-b[0])+Math.abs(y[1]-b[1])));
  const u=open.shift();
  if(distance(point(u),goal)<.36&&segmentWalkable(snapshot,sceneId,point(u),goal)){found=u;break;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const v=[u[0]+dx,u[1]+dz],k=key(v),g=cost.get(key(u))+1;
   if(cost.has(k)&&cost.get(k)<=g||!segmentWalkable(snapshot,sceneId,point(u),point(v)))continue;
   cost.set(k,g);prev.set(k,u);open.push(v);
  }
 }
 if(!found)throw Error('PATH_NOT_FOUND');
 const path=[goal.slice()];for(let u=found;u;u=prev.get(key(u)))path.unshift(point(u));
 return path;
}
export function portalEnds(snapshot,p){if(p.kind==='legacy'){
 const departures={'bedroom-yard':[-3.02,0,1.05],'bedroom-living':[3.12,0,.45],'living-bedroom':[-2.8,0,2.45],'living-yard':[2.35,0,-2.8],'yard-bedroom':[-7.45,0,1.05],'living-convenience-store':[2.35,0,-2.8],'convenience-store-living':STREET_HOME.departure};
 const door=departures[`${p.toSceneId}-${p.fromSceneId}`];
 let landing=door?[...door]:({bedroom:[-2.22,0,1.05],living:[2.35,0,-2],yard:[-6.65,0,1.05],'convenience-store':[.4,0,2.2]})[p.toSceneId];
 if(door){const axis=Math.abs(door[0])>Math.abs(door[2])?0:2;landing[axis]-=Math.sign(door[axis])*.8;}
 return {fromSceneId:p.fromSceneId,toSceneId:p.toSceneId,departure:departures[`${p.fromSceneId}-${p.toSceneId}`],landing};}
 const from=p.from||{sceneId:p.fromSceneId,slotId:p.fromSlotId},to=p.to||{sceneId:p.toSceneId,slotId:p.toSlotId};const slot=end=>getTemplate(snapshot.scenes.find(s=>s.sceneId===end.sceneId).templateId).portalSlots.find(s=>s.slotId===end.slotId);return {fromSceneId:from.sceneId,toSceneId:to.sceneId,departure:slot(from).landing,landing:slot(to).landing};}
export function sceneRoute(snapshot,from,to){const queue=[[from,[]]],seen=new Set([from]);while(queue.length){const [id,route]=queue.shift();if(id===to)return route;for(const p of snapshot.portals){const base=portalEnds(snapshot,p);const directions=[base,...p.bidirectional?[{fromSceneId:base.toSceneId,toSceneId:base.fromSceneId,departure:base.landing,landing:base.departure}]:[]];for(const e of directions)if(e.fromSceneId===id&&!seen.has(e.toSceneId)){seen.add(e.toSceneId);queue.push([e.toSceneId,[...route,{...e,portalId:p.portalId||p.id}]]);}}}throw Error('SCENE_UNREACHABLE');}

export function nearestFree(snapshot,sceneId,p){const template=getTemplate(snapshot.scenes.find(s=>s.sceneId===sceneId).templateId);p=[p[0],surfaceAt(template,p[0],p[2])?.height??0,p[2]];if(walkable(snapshot,sceneId,p))return p;for(let r=.25;r<4;r+=.25)for(let i=0;i<32;i++){const q=[p[0]+Math.cos(i*Math.PI/16)*r,0,p[2]+Math.sin(i*Math.PI/16)*r];q[1]=surfaceAt(template,q[0],q[2])?.height??0;if(walkable(snapshot,sceneId,q))return q;}throw Error('DESTINATION_BLOCKED');}

// Pure routing API usable by both headless runtime and clients.
export function planRoute(snapshot,actorId,destination){
 const actor=snapshot.actors.find(a=>a.actorId===actorId);if(!actor)throw Error('ACTOR_NOT_FOUND');
 const entity=destination.entityId?snapshot.entities.find(e=>e.entityId===destination.entityId):null;
 if(destination.entityId&&!entity)throw Error('ENTITY_NOT_FOUND');
 const sceneId=entity?.sceneId||destination.sceneId||actor.sceneId;
 const goal=entity?anchor(entity,destination.anchorId):destination.position||nearestFree(snapshot,sceneId,getTemplate(snapshot.scenes.find(s=>s.sceneId===sceneId).templateId).spawn);
 const segments=[];let current=actor.sceneId,start=actor.position;
 for(const portal of sceneRoute(snapshot,current,sceneId)){segments.push({sceneId:current,path:findPath(snapshot,current,start,portal.departure),portal});current=portal.toSceneId;start=portal.landing;}
 segments.push({sceneId:current,path:findPath(snapshot,current,start,goal)});
 return {segments,topologyRevision:snapshot.topologyRevision};
}

function segmentHitsRect(a,b,r){let lo=0,hi=1;for(const [axis,min,max]of [[0,r.x0-.18,r.x1+.18],[2,r.z0-.18,r.z1+.18]]){const d=b[axis]-a[axis];if(Math.abs(d)<1e-12){if(a[axis]<=min||a[axis]>=max)return false;continue;}const t0=(min-a[axis])/d,t1=(max-a[axis])/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return false;}return lo<=hi;}
