import * as THREE from 'three';
import {hasLocalAsset,localAssetCache} from './local-assets.js';

export const CHERRY_TREE='pf-cherry-tree-a710a9';

export async function loadLocalTree(type,height){
 if(!hasLocalAsset(type))return null;
 const lease=localAssetCache.acquire(type);
 try{
  const {root}=await lease.promise;
  root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root);
  const center=box.getCenter(new THREE.Vector3());
  const heightInAsset=box.max.y-box.min.y;
  const parts=[];
  if(heightInAsset>0){
   const scale=height/heightInAsset;
   const placement=new THREE.Matrix4().makeScale(scale,scale,scale)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x,-box.min.y,-center.z));
   root.traverse(mesh=>{
    if(mesh.isMesh)parts.push({geometry:mesh.geometry,material:mesh.material,transform:placement.clone().multiply(mesh.matrixWorld)});
   });
  }
  if(parts.length)return {parts,release:()=>lease.release()};
 }catch{/* Keep the procedural trees when the model is unavailable. */}
 lease.release();
 return null;
}

export function plantLocalTrees(root,type,parts,trees,clouds){
 const node=new THREE.Object3D(),matrix=new THREE.Matrix4();
 const copy=source=>{
  const result=source.clone();
  return clouds&&result.isMeshStandardMaterial?clouds.apply(result):result;
 };
 return parts.map(({geometry,material,transform})=>{
  const mesh=new THREE.InstancedMesh(geometry,Array.isArray(material)?material.map(copy):copy(material),trees.length);
  mesh.name=type;
  for(const [i,{x,y=0,z,size,yaw}] of trees.entries()){
   node.position.set(x,y,z);
   node.rotation.y=yaw;
   node.scale.setScalar(size);
   node.updateMatrix();
   mesh.setMatrixAt(i,matrix.multiplyMatrices(node.matrix,transform));
  }
  root.add(mesh);
  return mesh;
 });
}
