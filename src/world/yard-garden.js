import * as THREE from 'three';

// 固定景观层：不写入家具存档，不修改农田和泳池的布局数据。
export function makeYardGarden(options={}) {
  const group=new THREE.Group();group.name='yard-landscape';
  const leafGeo=new THREE.SphereGeometry(1,10,7);
  const stemGeo=new THREE.CylinderGeometry(.012,.016,1,5);
  const blossomGeo=new THREE.SphereGeometry(1,8,6);
  const materials={
    green:new THREE.MeshStandardMaterial({color:0x71945f,roughness:1}),
    light:new THREE.MeshStandardMaterial({color:0x96b379,roughness:1}),
    stem:new THREE.MeshStandardMaterial({color:0x608353,roughness:1}),
    pink:new THREE.MeshStandardMaterial({color:0xeeb6bc,roughness:.9}),
    cream:new THREE.MeshStandardMaterial({color:0xffe5aa,roughness:.9}),
    lilac:new THREE.MeshStandardMaterial({color:0xc4b6df,roughness:.9}),
  };
  const placements=options.placements||[[-6.7,4.7],[-5.2,6.8],[-2.8,5.8],[-.4,6.4],[2.0,6.7],
    [6.9,6.5],[7.5,2.4],[7.5,.1],[5.2,1.2],[-4.5,3.3],[-6.7,-1.0],[.3,-6.9]];
  const dummy=new THREE.Object3D();
  placements.forEach(([x,z],index)=>{
    const patch=new THREE.Group();patch.name=`garden-patch-${index+1}`;patch.position.set(x,0,z);
    const batches=new Map();
    const add=(key,geometry,position,scale)=>{
      if(!batches.has(key))batches.set(key,{geometry,transforms:[]});
      dummy.position.set(...position);dummy.scale.set(...scale);dummy.rotation.set(0,0,0);dummy.updateMatrix();
      batches.get(key).transforms.push(dummy.matrix.clone());
    };
    for(let i=0;i<5;i++){
      const a=i*2.4+index,r=.25+((i+index)%3)*.14;
      add(i%2?'light':'green',leafGeo,[Math.cos(a)*r,.24+(.04*(i%2)),Math.sin(a)*r],[.33,.3,.3]);
    }
    for(let i=0;i<15;i++){
      const a=i*2.39996,r=.82*Math.sqrt((i+.5)/15),h=.28+(i%4)*.065;
      const fx=Math.cos(a)*r,fz=Math.sin(a)*r;
      add('stem',stemGeo,[fx,h/2,fz],[1,h,1]);
      const color=['pink','cream','lilac'][(i+index)%3];
      for(let petal=0;petal<5;petal++){
        const pa=petal*Math.PI*2/5;
        add(color,blossomGeo,[fx+Math.cos(pa)*.055,h, fz+Math.sin(pa)*.055],[.048,.028,.048]);
      }
      add('cream',blossomGeo,[fx,h+.012,fz],[.025,.025,.025]);
    }
    for(const [key,batch] of batches){
      const mesh=new THREE.InstancedMesh(batch.geometry,materials[key],batch.transforms.length);
      batch.transforms.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
      mesh.castShadow=true;mesh.receiveShadow=true;patch.add(mesh);
    }
    group.add(patch);
  });
  return group;
}

export function protectFarmSpace(yard, garden) {
  yard.updateMatrixWorld(true);
  const reserved=yard.children.filter(o=>['yardFarm','yardPool','yardBench','yardTree'].includes(o.userData.furnitureType))
    .map(o=>new THREE.Box3().setFromObject(o).expandByScalar(.65));
  for(const patch of garden.children){
    const point=patch.getWorldPosition(new THREE.Vector3());
    patch.visible=!reserved.some(b=>point.x+.95>b.min.x && point.x-.95<b.max.x && point.z+.95>b.min.z && point.z-.95<b.max.z);
  }
}
