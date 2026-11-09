import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {BAIZE_ASSET_URL} from '/shared/world/baize-battle.js';
import {surfaceAt} from '/shared/world/coastal.js';
import {getTemplate} from '/shared/world/templates.js';
import {nearestFree,segmentWalkable} from '/shared/world/navigation.js';

let asset;
export function loadBaize(){
 return asset??=(async()=>{
  const response=await fetch(BAIZE_ASSET_URL);
  if(!response.ok||!response.headers.get('content-type')?.startsWith('model/gltf-binary'))return null;
  return new GLTFLoader().parseAsync(await response.arrayBuffer(),'');
 })().catch(error=>{console.warn('白泽模型加载失败',error);return null;});
}

const ribbonMaterial=new THREE.MeshStandardMaterial({color:0x285cca,roughness:.63});
const ribbonBand=new THREE.TorusGeometry(.18,.026,8,24);
const ribbonTail=new THREE.BoxGeometry(.085,.26,.025);
const ribbonKnot=new THREE.SphereGeometry(.082,12,8);

function addRibbon(model){
 const neck=model.getObjectByName('Neck');
 if(!neck)return;
 const ribbon=new THREE.Group();
 const band=new THREE.Mesh(ribbonBand,ribbonMaterial);
 band.scale.y=1.22;
 ribbon.add(band);
 for(const side of [-1,1]){
  const bow=new THREE.Group();
  bow.position.set(side*.30,-.025,-.015);
  bow.rotation.y=side*Math.PI/2;
  const knot=new THREE.Mesh(ribbonKnot,ribbonMaterial);
  knot.scale.set(1.25,.65,.38);
  bow.add(knot);
  for(const angle of [-.28,.37]){
   const tail=new THREE.Mesh(ribbonTail,ribbonMaterial);
   tail.position.set(angle*.18,-.135,.01);
   tail.rotation.z=angle;
   bow.add(tail);
  }
  ribbon.add(bow);
 }
 model.updateMatrixWorld(true);
 ribbon.position.copy(neck.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(.01,-.05,.065));
 model.add(ribbon);
 neck.attach(ribbon);
}

function inPlaceClip(clip,hips){
 const copy=clip.clone();
 const track=copy.tracks.find(track=>track.name==='Hips.position');
 if(track&&hips){
  for(let i=0;i<track.values.length;i+=3){
   track.values[i]=hips.position.x;
   track.values[i+2]=hips.position.z;
  }
 }
 return copy;
}

function additiveRotation(model,name,axis,times,angles){
 const bone=model.getObjectByName(name);
 if(!bone)return null;
 axis.applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()))
  .applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
 const values=angles.flatMap(angle=>new THREE.Quaternion().setFromAxisAngle(axis,angle).toArray());
 return new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`,times,values);
}

function makeHitClip(model){
 const times=[0,.045,.105,.22,.34];
 const recoil=[0,.18,1,-.12,0];
 const tracks=[['Hips',-.19],['Spine',-.11],['Neck',-.17]].map(([name,amount])=>
  additiveRotation(model,name,new THREE.Vector3(1,0,0),times,recoil.map(weight=>amount*weight))
 ).filter(Boolean);
 return new THREE.AnimationClip('BaizeHit',times.at(-1),tracks,THREE.AdditiveAnimationBlendMode);
}

function makeBattleIdle(model){
 const times=[0,.6,1.3,2,2.7,3.4,4.1,4.8,5.5,6.2,7];
 const breath=times.map(t=>.026*(1-Math.cos(t*Math.PI*4/7))*.5);
 const tracks=[
  additiveRotation(model,'Spine',new THREE.Vector3(1,0,0),times,breath.map(y=>-1.6*y)),
  additiveRotation(model,'Neck',new THREE.Vector3(1,0,0),times,[0,-.02,-.04,-.015,0,-.1,-.14,-.045,0,.015,0]),
  additiveRotation(model,'Head',new THREE.Vector3(0,1,0),times,[0,.025,.04,0,0,.10,.13,.04,-.045,-.02,0]),
  additiveRotation(model,'Tail1',new THREE.Vector3(0,1,0),times,[0,.08,.12,.04,-.07,-.12,-.035,.10,.13,.07,0]),
  additiveRotation(model,'Tail3',new THREE.Vector3(0,1,0),times,[0,.035,.10,.09,-.02,-.11,-.09,.045,.11,.09,0]),
 ].filter(Boolean);
 if(model.getObjectByName('Hips'))tracks.push(new THREE.VectorKeyframeTrack('Hips.position',times,breath.flatMap(y=>[0,y,0])));
 return new THREE.AnimationClip('BaizeBattleIdle',7,tracks,THREE.AdditiveAnimationBlendMode);
}

export function makeBaize(asset,pet,{inPlace=false,idleOffset=null}={}){
 const model=clone(asset.scene);
 const root=new THREE.Group();
 root.name=pet?'baize-companion':'baize-wild';
 model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;node.frustumCulled=false;}});
 if(pet)addRibbon(model);
 model.scale.setScalar(.68);
 root.add(model);
 const mixer=new THREE.AnimationMixer(model);
 const hips=model.getObjectByName('Hips');
 const clips=new Map(asset.animations.map(clip=>[clip.name,inPlace?inPlaceClip(clip,hips):clip]));
 const idleLayer=idleOffset===null?null:mixer.clipAction(makeBattleIdle(model));
 if(idleLayer){idleLayer.time=idleOffset%idleLayer.getClip().duration;idleLayer.play();}
 let current,reaction;
 function play(name='CanineIdle',duration,rate=1){
  const clip=clips.get(name);
  if(!clip)return;
  const next=mixer.clipAction(clip);
  if(next===current&&!duration){next.setEffectiveTimeScale(rate);return;}
  const previous=current;
  current=next.reset().setLoop(duration?THREE.LoopOnce:THREE.LoopRepeat,duration?1:Infinity);
  current.clampWhenFinished=Boolean(duration);
  if(duration)current.setDuration(duration);
  else current.setEffectiveTimeScale(rate);
  current.play();
  if(idleLayer){
   if(name==='CanineIdle'){idleLayer.enabled=true;idleLayer.fadeIn(.18);}
   else idleLayer.fadeOut(.12);
  }
  if(previous&&previous!==current)current.crossFadeFrom(previous,.10,false);
 }
 function hit(){
  reaction??=mixer.clipAction(makeHitClip(model)).setLoop(THREE.LoopOnce,1);
  reaction.reset().setEffectiveWeight(1).play();
 }
 play();
 return {root,play,hit,update:dt=>mixer.update(dt)};
}

const gap=1.5;
const spacing=.12;
const gaits={
 walk:{clip:'CanineWalk',speed:1.7},
 run:{clip:'CanineLocoTrot',speed:2.8},
 sprint:{clip:'CanineGallop',speed:5.5},
};
export function createBaizeFollower(scene){
 let model,sceneId,trail=[],leaderSpeed=0,pace=0,gait='walk',moving=false;
 const point=new THREE.Vector3(),target=new THREE.Vector3(),candidate=new THREE.Vector3();
 return {
  get available(){return Boolean(model);},
  async load(){
   const asset=await loadBaize();
   if(!asset)return;
   model=makeBaize(asset,true,{inPlace:true});
   model.root.visible=false;
   scene.add(model.root);
  },
  reset(){sceneId=null;},
  update(dt,snapshot,actor,renderPosition){
   if(!model||!actor||!snapshot)return;
   const entry=snapshot.scenes.find(scene=>scene.sceneId===actor.sceneId);
   if(!entry)return;
   const {root}=model,template=getTemplate(entry.templateId);
   point.copy(renderPosition);
   const floor=surfaceAt(template,point.x,point.z);
   if(!floor)return;
   const forest=template.templateId==='forest_v1';
   if(forest&&floor.kind==='water'){
    root.visible=sceneId===actor.sceneId;
    pace=leaderSpeed=0;moving=false;
    model.play();
    model.update(dt);
    return;
   }
   point.y=floor.height;
   if(sceneId!==actor.sceneId||trail[0].distanceTo(point)>4){
    sceneId=actor.sceneId;
    leaderSpeed=pace=0;gait='walk';moving=false;
    const heading=actor.rotation||0;
    const dx=Math.sin(heading),dz=Math.cos(heading);
    const offsets=[[-gap,.48],[0,1.25],[0,-1.25],[gap,.42]];
    let landing;
    for(const [back,side] of offsets){
     try{
      const p=nearestFree(snapshot,sceneId,[point.x+dx*back+dz*side,point.y,point.z+dz*back-dx*side]);
      if(forest&&surfaceAt(template,p[0],p[2])?.kind==='water')continue;
      if(Math.hypot(p[0]-point.x,p[2]-point.z)>.85&&Math.abs(p[1]-point.y)<.45){landing=p;break;}
     }catch{}
    }
    if(!landing){root.visible=false;sceneId=null;return;}
    root.position.fromArray(landing);
    root.rotation.y=heading;
    trail=[point.clone(),root.position.clone()];
    root.visible=true;
   }else if(trail[0].distanceTo(point)>spacing){
    trail.unshift(point.clone());
    if(trail.length>70)trail.pop();
   }
   let remaining=gap;
   target.copy(trail.at(-1));
   // Include this frame's leader position so the target advances between breadcrumbs.
   let from=point;
   for(const to of trail){
    const length=from.distanceTo(to);
    if(length>=remaining){target.copy(from).lerp(to,remaining/length);break;}
    remaining-=length;
    from=to;
   }
   leaderSpeed=THREE.MathUtils.damp(leaderSpeed,actor.speed||0,12,dt);
   if(actor.sprint&&leaderSpeed>(gait==='sprint'?3.4:4.1))gait='sprint';
   else gait=leaderSpeed>(gait==='run'?2.05:2.4)?'run':'walk';
   const dx=target.x-root.position.x,dz=target.z-root.position.z,distance=Math.hypot(dx,dz);
   let speed=0;
   if(distance>.035&&dt>0){
    const followSpeed=THREE.MathUtils.clamp(leaderSpeed+.9,1,6.8);
    const step=Math.min(distance,dt*Math.min(followSpeed,distance*7));
    candidate.copy(root.position);
    candidate.x+=dx/distance*step;
    candidate.z+=dz/distance*step;
    const surface=surfaceAt(template,candidate.x,candidate.z);
    if(surface&&!(forest&&surface.kind==='water')&&segmentWalkable(snapshot,sceneId,root.position.toArray(),candidate.setY(surface.height).toArray())){
     root.position.copy(candidate);
     speed=step/dt;
     const angle=Math.atan2(dx,dz)-root.rotation.y;
     root.rotation.y+=Math.atan2(Math.sin(angle),Math.cos(angle))*Math.min(1,dt*13);
    }else if(distance>3)sceneId=null;
   }
   pace=THREE.MathUtils.damp(pace,speed,15,dt);
   moving=pace>(moving?.16:.31);
   const {clip,speed:strideSpeed}=gaits[gait];
   model.play(moving?clip:'CanineIdle',undefined,moving?THREE.MathUtils.clamp(pace/strideSpeed,.35,1.65):1);
   model.update(dt);
  },
 };
}
