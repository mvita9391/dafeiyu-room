import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildLiving} from '../src/world/living.js';
import {buildYard} from '../src/world/yard.js';
import {createFurniture} from '../src/world/props.js';
import {sampleSlideRide} from '../src/world/pool-slide.js';
import {validLayout} from '../shared/layout.js';
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
