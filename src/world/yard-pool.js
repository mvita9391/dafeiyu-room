import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {POOL_WIDTH,POOL_DEPTH,POOL_SURFACE_Y,poolFixtureScale,slideMountX} from '../../shared/world/slide-path.js';
import {tex} from '../core/textures.js';
import {makePoolSlide} from './pool-slide.js';
import {addPoolCaustics,makePoolWater,updatePoolWaterTime} from './pool-water.js';

const models=new WeakMap();
const standard=options=>new THREE.MeshStandardMaterial(options);
let materials;

function poolMaterials(){
 if(materials)return materials;
 const canvas=document.createElement('canvas');
 canvas.width=128;canvas.height=128;
 const ctx=canvas.getContext('2d');
 ctx.fillStyle='#d4e8e8';ctx.fillRect(0,0,128,128);
 for(let row=0;row<4;row++)for(let col=0;col<4;col++){
  ctx.fillStyle=['#acd7dd','#b8e0e1','#a2cfd9','#a7d6dc'][(col*3+row*5+col*row)%4];
  ctx.fillRect(col*32+1,row*32+1,30,30);
 }
 const tile=standard({map:tex(canvas),roughness:.68,side:THREE.DoubleSide});
 return materials={
  tile,
  floorTile:addPoolCaustics(tile.clone()),
  wallTrim:standard({color:0x397c94,roughness:.68,side:THREE.DoubleSide}),
  base:standard({color:0x9e9c93,roughness:.91}),
  coping:standard({color:0xffffff,roughness:.84}),
  metal:standard({color:0xd4dedc,roughness:.32,metalness:.8}),
  drain:standard({color:0x526d70,roughness:.58}),
 };
}

function mesh(group,geometry,material,x,y,z,cast=false){
 const part=new THREE.Mesh(geometry,material);
 part.position.set(x,y,z);part.castShadow=cast;part.receiveShadow=true;
 group.add(part);
 return part;
}

function tiledPlane(width,height){
 const geometry=new THREE.PlaneGeometry(width,height);
 const uv=geometry.getAttribute('uv');
 for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*width/.8,uv.getY(i)*height/.8);
 return geometry;
}

function addCoping(group,span,depth,x,z,rotation,y,materials){
 const base=mesh(group,new THREE.BoxGeometry(span,.25,depth),materials.base,x,y-.13,z,true);
 base.rotation.y=rotation;
 const count=Math.max(1,Math.round(span/.62));
 const step=span/count;
 const geometry=new RoundedBoxGeometry(step-.012,.09,depth+.026,.022,2);
 const blocks=new THREE.InstancedMesh(geometry,materials.coping,count);
 blocks.position.set(x,y,z);blocks.rotation.y=rotation;blocks.castShadow=blocks.receiveShadow=true;
 for(let i=0;i<count;i++){
  blocks.setMatrixAt(i,new THREE.Matrix4().makeTranslation((i+.5)*step-span/2,0,0));
  blocks.setColorAt(i,new THREE.Color([0xece1cc,0xf2e9d9,0xe5d8c3,0xeee5d3][i%4]));
 }
 group.add(blocks);
}

export function makeYardPool(){
 const pool=new THREE.Group();
 pool.name='yard-pool';
 pool.userData.poolRect={x0:-POOL_WIDTH/2,x1:POOL_WIDTH/2,z0:-POOL_DEPTH/2,z1:POOL_DEPTH/2};
 const mat=poolMaterials();
 const structure=new THREE.Group(),ladder=new THREE.Group(),slide=makePoolSlide(),float=new THREE.Group();
 // Keep a single water mesh while the editor changes the basin dimensions.
 const water=mesh(pool,new THREE.PlaneGeometry(1,1),makePoolWater(),0,0,0);
 water.name='pool-water';water.rotation.x=-Math.PI/2;
 for(const x of [-.28,.28]){
  const rail=mesh(ladder,new THREE.TorusGeometry(.24,.024,8,18,Math.PI),mat.metal,x,.46,.04,true);
  rail.rotation.y=Math.PI/2;
  mesh(ladder,new THREE.CylinderGeometry(.024,.024,1.36,8),mat.metal,x,-.48,.12,true);
 }
 for(let i=0;i<7;i++){
  const rung=mesh(ladder,new THREE.CylinderGeometry(.02,.02,.56,8),mat.metal,0,.42-i*.23,.12,true);
  rung.rotation.z=Math.PI/2;
 }
 const ring=mesh(float,new THREE.TorusGeometry(.26,.087,12,28),standard({color:0xf09ba7,roughness:.7}),0,0,0);
 ring.rotation.x=Math.PI/2;
 const band=standard({color:0xfff4e8,roughness:.7});
 for(let i=0;i<4;i++){
  const part=mesh(float,new THREE.TorusGeometry(.26,.089,8,6,.45),band,0,0,0);
  part.rotation.set(-Math.PI/2,i*Math.PI/2,0,'YXZ');
 }
 slide.rotation.y=-Math.PI/2;
 pool.add(structure,ladder,slide,float);
 models.set(pool,{structure,ladder,slide,float,water});
 fitYardPool(pool);
 return pool;
}

export function fitYardPool(pool){
 const model=models.get(pool);
 if(!model||model.scale?.equals(pool.scale))return;
 const {structure,ladder,slide,float,water}=model;
 model.scale=pool.scale.clone();
 const {x,y,z}=pool.scale;
 const size=poolFixtureScale([x,y,z]),width=POOL_WIDTH*x,length=POOL_DEPTH*z;
 const hw=width/2,hl=length/2,bottom=-1.35*y,top=.30*y;
 const rim=.20*size,mat=poolMaterials();
 for(const part of structure.children){part.geometry.dispose();if(part.isInstancedMesh)part.dispose();}
 structure.clear();
 // Geometry uses the finished dimensions, with tiles and coping of a consistent size.
 structure.scale.set(1/x,1/y,1/z);
 const floor=mesh(structure,tiledPlane(width,length),mat.floorTile,0,bottom,0);
 floor.name='pool-basin-floor';floor.rotation.x=-Math.PI/2;
 for(const [span,px,pz,rotation] of [[width,0,-hl,0],[width,0,hl,0],[length,-hw,0,Math.PI/2],[length,hw,0,Math.PI/2]]){
  const wall=mesh(structure,tiledPlane(span,top-bottom),mat.tile,px,(top+bottom)/2,pz);
  wall.rotation.y=rotation;
  const offset=rotation?Math.sign(px)*-.006:0;
  const trim=mesh(structure,new THREE.PlaneGeometry(span,.11*size),mat.wallTrim,px+offset,top-.10*size,pz+(rotation?0:Math.sign(pz)*-.006));
  trim.rotation.y=rotation;
 }
 for(const sign of [-1,1]){
  addCoping(structure,width+2*rim,rim,0,sign*(hl+rim/2),0,top,mat);
  addCoping(structure,length,rim,sign*(hw+rim/2),0,Math.PI/2,top,mat);
  mesh(structure,new THREE.CylinderGeometry(.13,.13,.02,16),mat.drain,sign*hw*.42,bottom+.01,0);
 }
 for(const fixture of [ladder,float])fixture.scale.set(size/x,size/y,size/z);
 slide.scale.set(size/z,size/y,size/x);
 ladder.position.set(0,0,-POOL_DEPTH/2);
 slide.position.set(slideMountX([x,y,z])/x,0,0);
 float.position.set((hw-.45*size)/x,.26,(hl-.35*size)/z);
 water.scale.set(POOL_WIDTH-.06/x,POOL_DEPTH-.06/z,1);
 water.position.y=POOL_SURFACE_Y;
}

export function animateYardPool(pool,time){
 const {water,float}=models.get(pool);
 water.position.y=POOL_SURFACE_Y+Math.sin(time*1.4)*.008;
 updatePoolWaterTime(time);
 float.position.y=.26+Math.sin(time*1.1)*.012;
}
