import * as T from 'three';
import {createSkyDome,FOREST_SUNNY_SKY,setSkyMood} from '../core/fp-sky.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {BATTLE_RUN_DELAY_MS,controlledUnits,FLEE_TURN_SECONDS,FORMATION,skillTargetMode,targetCells} from '/shared/world/baize-battle.js';
import {SPELL_THROW} from '/shared/world/maneuvers.js';
import {loadBaize,makeBaize} from '../characters/baize.js';
import {PET_MODEL_BY_ID,loadPetModelAsset,createPetModel} from '../pets/pet-models.js';
import {grassTileGeometry} from '../world/forest.js';
import {PET_SKILLS} from '/shared/world/pet-skills.js';
import {spawnElementalCast} from '../effects/elemental/casts.js';
import {buildBaizeTreeline} from './baize-treeline.js';
import {createCloudShadows} from '../world/cloud-shadows.js';
import {paintOutdoorTexture} from '../world/outdoor-terrain.js';

const coordinates=Object.fromEntries(FORMATION.map(({id,team,row,column})=>[
 id,new T.Vector3((team==='ally'?-1:1)*(row==='front'?2.4:4.3),.025,(column-2)*1.32),
]));

export function createBaizeArena(playSound,character){
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(42,1,.1,75);
 const orbit=new T.Spherical().setFromVector3(new T.Vector3(-7.8,7.2,10));
 scene.background=new T.Color(FOREST_SUNNY_SKY.horizon);
 scene.fog=new T.Fog(FOREST_SUNNY_SKY.horizon,23,61);
 const sky=createSkyDome();
 setSkyMood(sky,FOREST_SUNNY_SKY);
 sky.scale.setScalar(.38);
 sky.visible=true;
 scene.add(sky,new T.HemisphereLight(0xe2f2ff,0x839b66,1.65));
 const sun=new T.DirectionalLight(0xfff3d9,2.4);
 sun.position.set(-6,13,-5);
 sun.castShadow=true;
 sun.shadow.mapSize.set(1024,1024);
 Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,far:26});
 sun.shadow.normalBias=.027;
 scene.add(sun);

 const clouds=createCloudShadows();
 let weatherTime=0;
 const grassMap=paintOutdoorTexture('grass'),dirtMap=paintOutdoorTexture('dirt');
 grassMap.repeat.setScalar(95/3.8);
 dirtMap.repeat.set(3,2.4);
 const turf=new T.Mesh(new T.PlaneGeometry(95,95),clouds.apply(new T.MeshStandardMaterial({map:grassMap})));
 turf.rotation.x=-Math.PI/2;
 turf.receiveShadow=true;
 scene.add(turf);
 const clearing=new T.Mesh(new T.CircleGeometry(3.95,56),clouds.apply(new T.MeshStandardMaterial({map:dirtMap})));
 clearing.rotation.x=-Math.PI/2;
 clearing.scale.set(1.64,1.23,1);
 clearing.position.y=.012;
 clearing.receiveShadow=true;
 scene.add(clearing);
 const updateTreeline=buildBaizeTreeline(scene,clouds);
 const node=new T.Object3D();
 const grass=new T.InstancedMesh(grassTileGeometry(),clouds.apply(new T.MeshStandardMaterial({side:T.DoubleSide,vertexColors:true,roughness:.88})),108);
 for(let i=0;i<grass.count;i++){
  const angle=i*2.39996,radius=5.05+(i%19)*.23;
  node.position.set(Math.cos(angle)*radius*1.25,.012,Math.sin(angle)*radius*.8);
  node.rotation.set(0,i,0);
  node.scale.set(.86,.45+(i%8)*.065,.86);
  node.updateMatrix();
  grass.setMatrixAt(i,node.matrix);
 }
 grass.receiveShadow=true;
 scene.add(grass);

 const markerGeometry=new T.CircleGeometry(.53,36);
 const pads={};
 for(const slot of FORMATION){
  const material=new T.MeshBasicMaterial({color:slot.team==='ally'?0x75bde8:0xf09c92,transparent:true,opacity:.44,depthWrite:false,toneMapped:false,fog:false});
  const pad=new T.Mesh(markerGeometry,material);
  pad.rotation.x=-Math.PI/2;
  pad.position.copy(coordinates[slot.id]);
  pad.name=slot.id;
  pads[slot.id]=pad;
  scene.add(pad);
 }
 const aim=new Set(),struck=new Set(),projected=new T.Vector3();
 const targetRay=new T.Raycaster(),targetPointer=new T.Vector2(),targetHits=[];
 let battle,hero,attack,escape,entryRunning=false;
 let hoveredSlot,hoverTime=0;
 const casts=[];
 function clearCasts(){
  for(const cast of casts)cast.dispose();
  casts.length=0;
  struck.clear();
 }
 function position(id){return coordinates[battle.units[id].slot];}
 const pets={};
 const fighter=id=>id==='hero'?hero:pets[id];
 function face(root,direction,dt){
  const turn=Math.atan2(direction.x,direction.z)-root.rotation.y;
  const shortest=Math.atan2(Math.sin(turn),Math.cos(turn));
  root.rotation.y+=shortest*(1-Math.exp(-dt*25));
 }
 const forward=new T.Vector3();
 const up=new T.Vector3(0,1,0);
 const exitDirection=new T.Vector3(-1,0,0);
 function run(id){
  if(id==='hero')hero?.play(hero.run??hero.idle);
  else pets[id]?.play('CanineGallop');
 }
 function advanceEntrance(now){
  const start=battle.turn===1?battle.introStartedAt:undefined;
  const end=battle.readyAt-160;
  if(start===undefined||now>=end){
   if(entryRunning){
    for(const id of Object.keys(battle.units)){
     if(id==='hero')hero?.play(hero.idle);
     else pets[id]?.play();
    }
    entryRunning=false;
   }
   return false;
  }
  const runAt=start+BATTLE_RUN_DELAY_MS;
  const progress=T.MathUtils.clamp((now-runAt)/(end-runAt),0,1);
  for(const id of Object.keys(battle.units)){
   const root=fighter(id)?.root;
   if(!root)continue;
   const slot=position(id),side=Math.sign(slot.x);
   root.position.copy(slot);
   root.position.x+=side*5.2*(1-progress);
   root.rotation.y=-side*Math.PI/2;
   if(progress>0)run(id);
  }
  entryRunning=progress>0;
  return true;
 }
 function castRoute(start,end,side){
  const blockers=Object.keys(battle.units).filter(id=>id!==side).map(position);
  const offset=start.clone().sub(end).setLength(1.85);
  const sample=new T.Vector3();
  let best,clearance=-1;
  const safeDistance=.82**2;
  for(const angle of [0,.66,-.66,1.05,-1.05]){
   const stop=offset.clone().applyAxisAngle(up,angle).add(end);
   if(blockers.some(other=>stop.distanceToSquared(other)<safeDistance))continue;
   for(const bend of [0,2.1,-2.1,3.4,-3.4]){
    const control=start.clone().lerp(stop,.5);
    control.z+=bend;
    const route=new T.QuadraticBezierCurve3(start,control,stop);
    let distance=safeDistance;
    for(let i=1;i<=12;i++){
     route.getPoint(i/12,sample);
     for(const other of blockers)distance=Math.min(distance,sample.distanceToSquared(other));
    }
    if(distance>=safeDistance)return route;
    if(distance>clearance){best=route;clearance=distance;}
   }
  }
  const stop=end.clone().add(offset);
  return best??new T.QuadraticBezierCurve3(start,start.clone().lerp(stop,.5),stop);
 }
 let baizeAsset;
 let fishAsset;
 function syncPets(){
  if(!battle)return;
  for(const [id,model] of Object.entries(pets))model.root.visible=Boolean(battle.units[id]);
  for(const unit of Object.values(battle.units)){
   if(unit.id==='hero'||pets[unit.id])continue;
   const ally=unit.slot.startsWith('ally-');
   const baizeSpecies=!unit.speciesId||unit.speciesId.startsWith('baize')||unit.modelId==='baize';
   if(baizeSpecies&&baizeAsset){
    const model=makeBaize(baizeAsset,ally,{inPlace:true,idleOffset:FORMATION.findIndex(slot=>slot.id===unit.slot)*.83});
    if(!ally&&unit.id!=='wild'){
     model.root.name=`baize-${unit.id}`;
     model.root.scale.setScalar(.8);
    }
    model.root.rotation.y=ally?Math.PI/2:-Math.PI/2;
    pets[unit.id]=model;
    scene.add(model.root);
    continue;
   }
   const config=PET_MODEL_BY_ID[unit.modelId];
   if(!config||!fishAsset)continue;
   const model=createPetModel(fishAsset,config);
   model.root.name=`pet-battle-${unit.id}`;
   model.root.rotation.y=ally?Math.PI/2:-Math.PI/2;
   const wrapper={
    root:model.root,
    play(name,duration){
     if(name==='CanineGallop')model.loop('runFast');
     else if(name==='CanineDeath2')model.once('death',duration);
     else if(name==='CanineStand')model.once('attack',duration);
     else if(name==='CanineIdle'||!name)model.loop('idle');
     else model.loop('idle');
    },
    hit(){model.once('hit');},
    update(dt){model.update(dt);},
   };
   pets[unit.id]=wrapper;
   scene.add(model.root);
  }
 }
 const ready=Promise.all([
  loadBaize().then(asset=>{baizeAsset=asset;syncPets();return Boolean(asset);}),
  loadPetModelAsset(PET_MODEL_BY_ID['fish-bowl']).then(asset=>{fishAsset=asset;syncPets();return Boolean(asset);}).catch(()=>false),
  Promise.resolve(character?.ready).then(()=>{
   if(!character?.model)return;
   const model=clone(character.model);
   const root=new T.Group();
   root.name='battle-hero';
   root.rotation.y=Math.PI/2;
   model.scale.multiplyScalar(1.2);
   root.add(model);
   const mixer=new T.AnimationMixer(model);
   const idle=character.actions.Idle?.getClip();
   const run=character.actions.Running?.getClip();
   const sprint=character.actions.Sprint?.getClip();
   const source=character.actions[SPELL_THROW.name]?.getClip();
   const spell=source&&T.AnimationUtils.subclip(source,'battle-cast',Math.floor(SPELL_THROW.start*30),Math.ceil(SPELL_THROW.end*30));
   const hurt=character.actions.HumanSpBigStomachHit?.getClip(),death=character.actions.HumanSpStandingDeathBackward?.getClip();
   let current;
   function play(clip,duration){
    if(!clip)return;
    const next=mixer.clipAction(clip);
    if(next===current&&!duration)return;
    const previous=current;
    current=next.reset().setEffectiveTimeScale(1).setLoop(duration?T.LoopOnce:T.LoopRepeat,duration?1:Infinity);
    current.clampWhenFinished=Boolean(duration);
    if(duration)current.setDuration(duration);
    current.play();
    if(previous&&previous!==current)current.crossFadeFrom(previous,.1,false);
   }
   hero={root,play,idle,run,sprint,spell,hurt,death,mixer};
   scene.add(root);
  }),
 ]).then(([loaded])=>loaded);
 return {
  ready,
  clearCasts,
  sync(state){battle=state;},
  reset(state){
   battle=state;
   attack=null;
   escape=null;
   entryRunning=false;
   clearCasts();
   syncPets();
   for(const [id,model] of Object.entries(pets)){
    const unit=state.units[id];
    if(unit)model.play(unit.hp?'CanineIdle':'CanineDeath2',unit.hp?undefined:.05);
   }
   if(hero)hero.play(state.units.hero.hp?hero.idle:hero.death,state.units.hero.hp?undefined:.05);
  },
  preview(ids){aim.clear();for(const id of ids)aim.add(id);},
  hover(slot){hoveredSlot=slot;hoverTime=0;},
  rotate(dx,dy){
   orbit.theta=(orbit.theta-dx*.008)%(Math.PI*2);
   orbit.phi=T.MathUtils.clamp(orbit.phi-dy*.008,.09,1.43);
  },
  begin(event,duration,timing){
   if(event.kind==='flee'){
    const runners=new Set(controlledUnits(battle).map(unit=>unit.id));
    escape={runners,duration,sprinting:false};
    return;
   }
   if(event.kind==='faint'){
    if(event.side==='hero')hero?.play(hero.death,duration);
    else pets[event.side]?.play('CanineDeath2',duration);
    return;
   }
   if(event.kind!=='attack')return;
   const start=position(event.side);
   const move=PET_SKILLS[event.skillId];
   const group=skillTargetMode(move)==='all';
   const target=position(event.target);
   const end=group?new T.Vector3(Math.sign(target.x)*3.35,.025,0):target;
   const route=castRoute(start,end,event.side);
   const direction=end.clone().sub(route.v2).normalize();
   attack={side:event.side,route,end,direction,group,timing,phase:'approach'};
   run(event.side);
  },
  advance(event,elapsed,dt){
   if(event.kind==='flee'){
    if(!escape)return;
    const progress=T.MathUtils.clamp((elapsed-FLEE_TURN_SECONDS)/(escape.duration-FLEE_TURN_SECONDS),0,1);
    const startSprint=progress>0&&!escape.sprinting;
    for(const id of escape.runners){
     const model=fighter(id);
     if(!model)continue;
     if(startSprint){
      if(id==='hero')hero.play(hero.sprint??hero.run??hero.idle);
      else model.play('CanineGallop');
     }
     const root=model.root;
     root.position.copy(position(id)).addScaledVector(exitDirection,7.8*progress**2*(2-progress));
     // Split into parallel lanes so the front-row pet can pass the hero's starting slot.
     root.position.z+=(id==='hero'?-1:1)*.95*T.MathUtils.smoothstep(progress,0,.42);
     face(root,exitDirection,dt);
    }
    if(startSprint)escape.sprinting=true;
    return;
   }
   if(!attack||event.kind!=='attack')return;
   const {route,end,direction,group,timing}=attack;
   const root=fighter(event.side)?.root;
   if(attack.phase==='approach'&&elapsed>=timing.approach){
    attack.phase='cast';
    const duration=timing.retreat-timing.approach;
    if(event.side==='hero')hero?.play(hero.spell,duration);
    else pets[event.side]?.play('CanineStand',duration);
    const effect=PET_SKILLS[event.skillId]?.effect;
    if(effect){
     const start=route.v2;
     const launch=start.clone().setY(event.side==='hero'?1.12:.78).addScaledVector(direction,.44);
     const spell=effect.kind==='zone'?{...effect,radius:effect.radius*(group?1.4:.52)}:effect;
     const cast=spawnElementalCast(spell,start,end,[],launch,playSound);
     casts.push(cast);
     scene.add(cast.root);
    }
   }
   if(attack.phase==='cast'&&elapsed>=timing.retreat){
    attack.phase='retreat';
    run(event.side);
   }
   if(!root)return;
   if(attack.phase==='cast'){
    root.position.copy(route.v2);
    face(root,direction,dt);
   }else{
    const returning=attack.phase==='retreat';
    const progress=returning?1-(elapsed-timing.retreat)/(timing.end-timing.retreat):elapsed/timing.approach;
    const t=T.MathUtils.smoothstep(progress,0,1);
    route.getPoint(t,root.position);
    route.getTangent(t,forward);
    face(root,forward.multiplyScalar(returning?-1:1),dt);
   }
  },
  hit(event){
   for(const hit of event.hits){
    if(hit.target==='hero')hero?.play(hero.hurt,.34);
    else pets[hit.target]?.hit();
   }
   for(const id of targetCells(battle.units[event.target].slot,PET_SKILLS[event.skillId]))struck.add(id);
  },
  end(event){
   struck.clear();
   if(event.kind!=='attack')return;
   attack=null;
   const root=fighter(event.side)?.root;
   if(root){
    root.position.copy(position(event.side));
    root.rotation.y=root.position.x<0?Math.PI/2:-Math.PI/2;
   }
   if(event.hits.some(hit=>hit.target==='hero'&&hit.hp>0))hero?.play(hero.idle);
   if(event.side==='hero')hero?.play(hero.idle);
   else pets[event.side]?.play();
  },
  render(renderer,dt){
   if(hoveredSlot)hoverTime+=dt;
   weatherTime+=dt;clouds.update(weatherTime);
   const width=renderer.domElement.clientWidth,height=renderer.domElement.clientHeight;
   camera.aspect=width/Math.max(1,height);
   camera.position.setFromSpherical(orbit).multiplyScalar(Math.max(1,1.35/camera.aspect));
   camera.lookAt(0,.13,0);
   camera.updateProjectionMatrix();
   camera.updateMatrixWorld();
   updateTreeline(camera);
   const entering=advanceEntrance(Date.now());
   for(const [id,model] of Object.entries(pets)){
    if(!model.root.visible)continue;
    if(!entering&&attack?.side!==id&&!escape?.runners.has(id))model.root.position.copy(position(id));
    model.update(dt);
   }
   if(hero){
    if(!entering&&attack?.side!=='hero'&&!escape?.runners.has('hero'))hero.root.position.copy(position('hero'));
    hero.mixer.update(dt);
   }
   for(const slot of FORMATION){
    const marked=aim.has(slot.id),hit=struck.has(slot.id);
    const hovered=slot.id===hoveredSlot;
    pads[slot.id].material.color.setHex(hit?0xff9256:marked?0xffd669:hovered?0xffef9f:slot.team==='ally'?0x75bde8:0xf09c92);
    pads[slot.id].material.opacity=hit ? .90 : hovered ? .70+.28*Math.cos(hoverTime*Math.PI*6) : marked ? .82 : .44;
   }
   for(let i=casts.length-1;i>=0;i--){
    if(casts[i].update(dt))continue;
    casts[i].dispose();
    casts.splice(i,1);
   }
   renderer.render(scene,camera);
  },
  project(id,height=0,unitId){
   projected.copy(fighter(unitId)?.root.position??coordinates[id]);
   projected.y+=height;
   projected.project(camera);
   return [(projected.x*.5+.5)*100,(.5-projected.y*.5)*100];
  },
  pickEnemy(x,y){
   targetRay.setFromCamera(targetPointer.set(x,y),camera);
   let closest=Infinity,target=null;
   for(const unit of Object.values(battle.units)){
    const model=pets[unit.id];
    if(!unit.hp||!unit.slot.startsWith('enemy-')||!model?.root.visible)continue;
    targetHits.length=0;
    targetRay.intersectObject(model.root,true,targetHits);
    if(targetHits[0]?.distance<closest){
     closest=targetHits[0].distance;
     target=unit.id;
    }
   }
   return target;
  },
 };
}
