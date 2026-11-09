import * as THREE from 'three';
import { mealBitesAt, poseMeal, poseHandMeal } from '../characters/meal-pose.js';
import { FOODS } from '../../shared/world/foods.js';
import { hasLocalAsset, makeLocalAsset, releaseLocalAssets } from '../world/local-assets.js';
export function makeRiceBowl(){
 const root=new THREE.Group();root.name='white-rice-bowl';
 const ceramic=new THREE.MeshStandardMaterial({color:0xe6f0ff,roughness:.4});
 const bowl=new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(.06,0),new THREE.Vector2(.11,.025),new THREE.Vector2(.17,.12),new THREE.Vector2(.165,.135),new THREE.Vector2(.13,.10)],24),ceramic);root.add(bowl);
 const rice=new THREE.Mesh(new THREE.SphereGeometry(.15,20,12),new THREE.MeshStandardMaterial({color:0xfff9e9,roughness:1}));rice.name='rice';rice.position.y=.12;rice.scale.y=.4;root.add(rice);root.scale.setScalar(.65);root.position.set(0,.42,.28);return root;
}

function presentHandFood(character, foodId) {
 const asset=FOODS[foodId]?.asset;
 if(character.worldMealFood?.name!==foodId&&character.worldMealFood){
  releaseLocalAssets(character.worldMealFood);
  character.worldMealFood.removeFromParent();
  character.worldMealFood=null;
 }
 if(!asset||!hasLocalAsset(asset))return false;
 if(!character.worldMealFood){
  const holder=new THREE.Group();
  holder.name=foodId;
  const model=makeLocalAsset(asset);
  model.visible=false;
  holder.add(model);character.group.add(holder);
  character.worldMealFood=holder;
  model.addEventListener('assetstate',()=>{
   if(model.userData.assetState!=='ready')return;
   model.removeFromParent();
   const box=new THREE.Box3().setFromObject(model);
   holder.add(model);
   if(box.isEmpty())return;
   const size=box.getSize(new THREE.Vector3());
   const scale=.15/Math.max(size.x,size.y,size.z,.001);
   model.scale.setScalar(scale);
   model.position.copy(box.getCenter(new THREE.Vector3()).multiplyScalar(-scale));
   model.visible=true;
  });
 }
 poseHandMeal(character,character.worldMealFood);
 return character.worldMealFood.children[0].userData.assetState!=='failed';
}
// Translate authoritative poses to rig inputs. The rig owns its final seat/bed Y.
export function presentActor(character,visual,dt,time){
 const state=({sleeping:'sleep',seated:'sit',eating:'eat',walking:'swim',swimming:'swim',climbing:'swim'})[visual.pose]||'idle';
 const activity=`${visual.actionId||''}:${state}`;
 if(character.worldActivity!==activity){character.worldActivity=activity;character.stateTime=0;}
 character.state=state;
 const position=new THREE.Vector3(...visual.position);position.y+=visual.airHeight||0;
 if(visual.pose==='swimming'||visual.form==='swim')position.y+=.38;
 else if(!['sleeping','seated','climbing','sliding','tree-climbing'].includes(visual.pose))position.y=position.y+(character.groundY??character.baseY??1.12);
 character.sleepPos??=new THREE.Vector3();character.sleepPos.copy(position);character.sleepArrived=state==='sleep';
 character.seatHeight=visual.position[1];
 character.pos.copy(position);character.target.copy(position);character.velocity?.set(0,0,0);
 character.heading=visual.rotation||0;
 character.externalMotion={maneuver:visual.maneuver,moving:['walking','swimming','climbing'].includes(visual.pose)&&!!visual.moving,speed:visual.speed||0,sprint:!!visual.sprint,crawl:!!visual.crawl,treeClimbing:visual.pose==='tree-climbing',climbMotion:visual.climbMotion||0,runningJump:!!visual.runningJump,grounded:visual.grounded!==false,jumping:visual.pose==='jumping'||visual.grounded===false,airHeight:visual.airHeight||0,jumpStage:visual.jumpStage??0,verticalVelocity:visual.verticalVelocity||0};
 character.externalMotion.platformLanding=visual.sceneId==='yard'&&visual.supportHeight>0;
 character.group.position.copy(position);character.group.rotation.y=character.heading;
 const previousMealTime=character.stateTime;
 character.update(dt,time);
 if(state==='eat'&&mealBitesAt(character.stateTime)>mealBitesAt(previousMealTime)){
  character.onActionSound?.(['apple','croissant'].includes(visual.mealFoodId)?'meal-crunch':'meal-soft');
 }
 // Local rig animation may align the hips with a seat. Don't overwrite that Y.
 character.group.position.x=position.x;character.group.position.z=position.z;
 if(!['sit','sleep'].includes(state))character.group.position.y=position.y;
 character.pos.copy(position);character.target.copy(position);character.group.rotation.y=visual.rotation||0;
 const handFood=presentHandFood(character,state==='eat'?visual.mealFoodId:undefined);
 const eatingRice=state==='eat'&&!handFood;
 if(eatingRice&&!character.worldRiceBowl){character.worldRiceBowl=makeRiceBowl();if(character.groundY===undefined)character.worldRiceBowl.position.set(0,-.2,.6);character.group.add(character.worldRiceBowl);}
 if(character.worldRiceBowl){
  character.worldRiceBowl.visible=eatingRice;
  if(eatingRice&&!poseMeal(character,character.worldRiceBowl)){
   const rice=character.worldRiceBowl.getObjectByName('rice');rice.visible=true;rice.scale.set(1,Math.max(.08,.4*(1-character.stateTime/3)),1);
  }
 }
 if(!eatingRice&&character.worldRiceSpoon)character.worldRiceSpoon.visible=false;
 return character.group.position;
}
