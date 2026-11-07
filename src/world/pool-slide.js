import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

export function makePoolSlide() {
  const group=new THREE.Group();group.name='pool-slide';group.userData.actionKind='slide';
  const aqua=new THREE.MeshStandardMaterial({color:0x78cbd2,roughness:.46,side:THREE.DoubleSide});
  const cream=new THREE.MeshStandardMaterial({color:0xffe6b3,roughness:.65});
  const steel=new THREE.MeshStandardMaterial({color:0xe4eeec,roughness:.4,metalness:.25});
  const curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,1.42,.52),new THREE.Vector3(0,1.38,.2),
    new THREE.Vector3(0,1.02,-.3),new THREE.Vector3(0,.55,-.86),new THREE.Vector3(0,.37,-1.3),
  ]);
  const points=curve.getPoints(48),vertices=[],indices=[];
  for(const p of points)vertices.push(-.32,p.y,p.z,.32,p.y,p.z);
  for(let i=0;i<points.length-1;i++){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry,aqua));
  for(const side of [-1,1]) {
    const edge=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(side*.34,p.y+.09,p.z)));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(edge,48,.065,8,false),cream));
  }
  function bar(a,b,r=.026,material=steel){
    const delta=new THREE.Vector3().subVectors(b,a);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),10),material);
    mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());group.add(mesh);
  }
  for(const x of [-.32,.32]) {
    bar(new THREE.Vector3(x,.04,.55),new THREE.Vector3(x,1.43,.55),.04);
    bar(new THREE.Vector3(x,.05,1.6),new THREE.Vector3(x,1.43,.58),.035);
    bar(new THREE.Vector3(x,.55,1.6),new THREE.Vector3(x,1.85,.58),.027);
    bar(new THREE.Vector3(x,1.43,.58),new THREE.Vector3(x,1.85,.58),.027);
  }
  for(let i=0;i<6;i++) {
    const k=(i+1)/6;
    const step=new THREE.Mesh(new RoundedBoxGeometry(.58,.065,.2,2,.02),cream);
    step.position.set(0,.08+k*1.3,1.6-k*1.02);group.add(step);
  }
  const platform=new THREE.Mesh(new RoundedBoxGeometry(.72,.08,.4,3,.03),aqua);platform.position.set(0,1.38,.53);group.add(platform);
  group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return group;
}

// Progress includes approaching the ladder, climbing, then sliding into the pool.
export function sampleSlideRide(slide, progress, start) {
  const k=THREE.MathUtils.clamp(progress,0,1);
  const base=new THREE.Vector3(0,.04,1.72);
  const top=new THREE.Vector3(0,1.44,.52);
  let local;
  if(k<.12)local=(start||base).clone().lerp(base,k/.12);
  else if(k<.62)local=base.clone().lerp(top,(k-.12)/.5);
  else {
    const curve=new THREE.CatmullRomCurve3([
      top,new THREE.Vector3(0,1.4,.2),new THREE.Vector3(0,1.04,-.3),
      new THREE.Vector3(0,.57,-.86),new THREE.Vector3(0,.39,-1.45),
    ]);
    const u=(k-.62)/.38;
    local=curve.getPoint(u*u);
  }
  slide.updateWorldMatrix(true,false);
  return slide.localToWorld(local);
}
