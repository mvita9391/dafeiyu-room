import * as T from 'three';
import {CHERRY_TREE,loadLocalTree,plantLocalTrees} from '../world/local-tree-model.js';

const radius=17;

export function buildBaizeTreeline(scene,clouds){
 const bark=new T.CylinderGeometry(.14,.27,2.8,9);
 const crown=new T.IcosahedronGeometry(1,1);
 const node=new T.Object3D(),color=new T.Color();
 const treelines=Array.from({length:4},(_,side)=>{
  const facing=side*Math.PI/2;
  const root=new T.Group();
  root.name=`arena-treeline-${side}`;
  scene.add(root);
  const trees=[8,10].flatMap((count,row)=>Array.from({length:count},(_,i)=>{
   const seed=side*18+row*8+i;
   const angle=facing+((i+(row ? .78 : .38))/count-.5)*Math.PI/2+Math.sin(seed*2.1)*.025;
   const distance=radius+row*4+Math.sin(seed*1.7)*.8;
   return {seed,x:Math.sin(angle)*distance,z:Math.cos(angle)*distance,size:.88+(seed%5)*.055,yaw:seed*2.39996};
  }));
  return {root,trees,x:Math.sin(facing),z:Math.cos(facing)};
 });

 function fallback(root,trees){
  if(!trees.length)return;
  const trunks=new T.InstancedMesh(bark,clouds.apply(new T.MeshStandardMaterial({color:0x745239})),trees.length);
  const canopy=new T.InstancedMesh(crown,clouds.apply(new T.MeshStandardMaterial({roughness:.96})),trees.length*4);
  node.quaternion.identity();
  for(const [i,{x,z,seed}] of trees.entries()){
   const height=1+seed%5*.09;
   node.position.set(x,1.4*height,z);
   node.scale.set(1,height,1);
   node.updateMatrix();
   trunks.setMatrixAt(i,node.matrix);
   for(let j=0;j<4;j++){
    const branch=j*2.4+seed;
    node.position.set(x+Math.sin(branch)*.75,(2.5+j*.34)*height,z+Math.cos(branch)*.65);
    node.scale.set(1.37,1.16,1.28);
    node.updateMatrix();
    canopy.setMatrixAt(i*4+j,node.matrix);
    canopy.setColorAt(i*4+j,color.setHSL(.24+(seed%4)*.014,.37,.25+j*.042));
   }
  }
  root.add(trunks,canopy);
 }

 for(const {root,trees} of treelines)fallback(root,trees);
 // The arena retains this lease for as long as its instances are reused.
 void loadLocalTree(CHERRY_TREE,4.0).then(model=>{
  if(!model)return;
  for(const {root,trees} of treelines){
   for(const mesh of [...root.children]){
    root.remove(mesh);mesh.dispose();mesh.material.dispose();
   }
   plantLocalTrees(root,CHERRY_TREE,model.parts,trees,clouds);
  }
  bark.dispose();
  crown.dispose();
 });

 return camera=>{
  const distance=Math.hypot(camera.position.x,camera.position.z);
  const near=T.MathUtils.smoothstep(distance,radius-4.4,radius-2.5);
  for(const {root,x,z} of treelines){
   const facing=(camera.position.x*x+camera.position.z*z)/Math.max(1,distance);
   const opacity=1-near*T.MathUtils.smoothstep(facing,.52,.70);
   root.visible=opacity>.01;
   for(const mesh of root.children){
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
     material.opacity=opacity;
     material.transparent=opacity<1;
     material.depthWrite=opacity===1;
    }
   }
  }
 };
}
