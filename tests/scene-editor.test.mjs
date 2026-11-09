import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildLiving} from '../src/world/living.js';
import {buildYard} from '../src/world/yard.js';
import {createFurniture} from '../src/world/props.js';
import {sampleSlideRide} from '../src/world/pool-slide.js';
import {RoomEditor} from '../src/ui/room-editor.js';
import {validLayout} from '../shared/layout.js';
import {getTemplate} from '../shared/world/templates.js';
import {findPath,walkable} from '../shared/world/navigation.js';
import {slidePoint} from '../shared/world/slide-path.js';
import {validateSpatial} from '../server/world/spatial.js';
const gradient={addColorStop(){}};
const ctx=new Proxy({}, {get:(_,k)=>k==='getImageData'?(_x,_y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}):k==='createRadialGradient'||k==='createLinearGradient'?()=>gradient:k==='measureText'?()=>({width:20}):()=>{},set:()=>true});
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
for(const [id,build] of [['living',buildLiving],['yard',buildYard]]) {
 const world=build();const objects=world.group.children.filter(o=>o.userData.furnitureType);
 assert.equal(objects.length,7);
 const layout=objects.map(o=>({type:o.userData.furnitureType,position:o.position.toArray(),rotation:o.rotation.y,scale:o.scale.toArray()}));
 assert.ok(validLayout(layout,id),`${id} defaults valid`);
 for(const object of objects){const clone=createFurniture(object.userData.furnitureType);assert.ok(clone.isObject3D);}
 if(id==='yard') {
  const farm=objects.find(o=>o.userData.furnitureType==='yardFarm');
  const before=farm.position.clone();const grid=farm.children.map(o=>o.position.clone());
  world.refreshLandscape();assert.ok(farm.position.equals(before));
  assert.equal(farm.children.length,9);farm.children.forEach((o,i)=>assert.ok(o.position.equals(grid[i])));
  const garden=world.group.getObjectByName('yard-landscape');assert.ok(garden.children.some(o=>o.visible));
  farm.position.copy(garden.children[0].position);world.refreshLandscape();assert.equal(garden.children[0].visible,false);
  farm.position.copy(before);world.refreshLandscape();

  let pool=objects.find(o=>o.userData.furnitureType==='yardPool');assert.ok(pool.getObjectByName('pool-slide'));assert.ok(createFurniture('yardPool').getObjectByName('pool-slide'));assert.ok(world.containsWater(pool.position));
  pool.position.set(1,0,1);pool.rotation.y=Math.PI/3;assert.ok(world.containsWater(new THREE.Vector3(1,0,1)));assert.equal(world.containsWater(new THREE.Vector3(6,0,-6)),false);
  world.group.remove(pool);assert.equal(world.containsWater(new THREE.Vector3(1,0,1)),false);
  pool=createFurniture('yardPool');pool.position.set(-2,0,2);world.group.add(pool);assert.ok(world.containsWater(new THREE.Vector3(-2,0,2)));
  const template=getTemplate('courtyard_v1');
  const emptyYard={scenes:[{sceneId:'yard',templateId:template.templateId}],entities:[],actors:[],portals:[]};
  const expandedLawn=[9,0,-17];
  const grass=new THREE.Box3().setFromObject(world.group.getObjectByName('yard-grass'));
  assert.ok(grass.min.z<=template.bounds.z0&&grass.max.z>=template.bounds.z1);
  assert.deepEqual(findPath(emptyYard,'yard',[9,0,-6],expandedLawn).at(-1),expandedLawn);
  assert.equal(walkable(emptyYard,'yard',[9,0,-19]),false);
  const lawnSeat={entityId:'lawn-seat',sceneId:'yard',type:'yardBench',position:expandedLawn,rotation:0,scale:[1,1,1]};
  assert.ok(validLayout([lawnSeat],'yard'));
  assert.doesNotThrow(()=>validateSpatial(emptyYard,{...emptyYard,entities:[lawnSeat]}));
  pool.scale.set(2.24,1.12,2.24);
  for(const rotation of [0,Math.PI/6,Math.PI/2]){
    pool.position.set(template.buildBounds.x1,0,template.buildBounds.z1);
    pool.rotation.y=rotation;
    RoomEditor.prototype.constrain.call({context:{bounds:template.buildBounds},outline:{setFromObject(){}}},pool);
    const entity={entityId:'edge-pool',sceneId:'yard',type:'yardPool',position:pool.position.toArray(),rotation,scale:pool.scale.toArray()};
    assert.doesNotThrow(()=>validateSpatial(emptyYard,{...emptyYard,entities:[entity]}));
    const slide=pool.getObjectByName('pool-slide');
    const size=slide.getWorldScale(new THREE.Vector3());
    assert.ok(size.distanceTo(new THREE.Vector3(1.12,1.12,1.12))<1e-8);
    const landing=sampleSlideRide(slide,1);
    assert.ok(world.containsWater(landing));
    assert.ok(landing.distanceTo(new THREE.Vector3(...slidePoint(entity,1)))<.03);
  }
  pool.position.set(-2,0,2);pool.scale.setScalar(1);
  const slide=pool.getObjectByName('pool-slide');
  for(const rotation of [0,Math.PI/2,Math.PI/3]){
    pool.rotation.y=rotation;world.group.updateMatrixWorld(true);
    const start=sampleSlideRide(slide,0),top=sampleSlideRide(slide,.62),end=sampleSlideRide(slide,1);
    assert.ok(top.y>start.y+1);assert.ok(end.y<top.y-1);assert.ok(world.containsWater(end));
    let previous=start;
    for(let i=1;i<=330;i++){const point=sampleSlideRide(slide,i/330);assert.ok(point.distanceTo(previous)<.15);previous=point;}
  }

 }
 world.update(1/60,1);
}
console.log('PASS: living/yard factories and defaults; moved/rotated/deleted/restored pool detection');
