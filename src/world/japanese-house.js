import * as THREE from 'three';
import {STREET_HOME} from '../../shared/world/street-home.js';
const materials=new Map();
function material(color,glow=false){const key=`${color}:${glow}`;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.8,emissive:glow?color:0,emissiveIntensity:glow?.65:0}));return materials.get(key);}
function box(root,w,h,d,color,x,y,z,glow=false){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color,glow));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
function roof(root,width,depth,base,rise){
 const geometry=new THREE.BufferGeometry();const x=width/2,z=depth/2;
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([-x,base,-z,0,base+rise,-z,-x,base,z,0,base+rise,-z,0,base+rise,z,-x,base,z,0,base+rise,-z,x,base,-z,0,base+rise,z,x,base,-z,x,base,z,0,base+rise,z],3));geometry.computeVertexNormals();
 const mat=material(0x3f4651).clone();mat.side=THREE.DoubleSide;const m=new THREE.Mesh(geometry,mat);m.castShadow=true;root.add(m);
 box(root,.13,.1,depth+.1,0x505763,0,base+rise+.03,0);
 for(let i=-6;i<=6;i++){const xx=i*width/12,yy=base+rise*(1-Math.abs(xx)/(width/2));box(root,.025,.045,depth,0x545d69,xx,yy+.025,0);}
 for(const xx of [-x,x])box(root,.08,.1,depth+.04,0x59616b,xx,base,0);
}
function windowFrame(root,y,z){
 box(root,.035,.9,.78,0xe7ce93,1.067,y,z,true);
 for(const zz of [z-.42,z+.42])box(root,.065,1.02,.05,0x675047,1.1,y,zz);
 for(const yy of [y-.49,y+.49])box(root,.065,.045,.88,0x675047,1.1,yy,z);
 for(let i=-1;i<=1;i++)box(root,.07,.92,.025,0x8c6f58,1.11,y,z+i*.23);
 box(root,.075,.025,.8,0x8c6f58,1.11,y,z);
}
export function buildJapaneseHome(){
 const root=new THREE.Group();root.name='japanese-two-storey-home';
 const house=new THREE.Group();house.name='house-facade';house.position.fromArray(STREET_HOME.houseCenter);house.scale.z=STREET_HOME.facadeScale;root.add(house);
 box(house,2.2,.24,2.85,0x686065,0,.12,0);
 box(house,2.08,1.9,2.7,0xd9c9b3,0,1.17,0);box(house,2.08,1.85,2.7,0xe7e0ca,0,3.04,0);
 for(const xx of [-1.06,1.06])for(const zz of [-1.37,1.37])box(house,.1,3.85,.1,0x6f5548,xx,2.12,zz);
 box(house,2.16,.15,2.8,0x6e5344,0,2.13,0);box(house,2.18,.1,2.82,0x6e5344,0,3.97,0);
 for(let i=0;i<9;i++)box(house,.055,.5,.22,0x80634e,1.07,.57,-1.2+i*.3);
 for(const y of [1.25,3.05])for(const z of [-.83,.83])windowFrame(house,y,z);
 // East-facing wooden entrance and a shallow second-floor veranda.
 box(house,.06,1.55,.68,0x6c5040,1.09,.98,0);for(let i=-2;i<=2;i++)box(house,.035,1.45,.025,0x9e805c,1.135,.98,i*.12);
 box(house,.1,.06,.05,0xd2b378,1.15,1.0,.23);box(house,.36,.15,.96,0x8d8172,1.24,.15,0);
 box(house,.55,.1,2.7,0x745b4b,1.22,2.48,0);box(house,.05,.06,2.75,0x96775b,1.5,3.02,0);
 for(let i=0;i<12;i++)box(house,.04,.52,.04,0x7f6651,1.49,2.75,-1.28+i*.233);
 roof(house,2.9,3.3,4.13,.66);
 // Modest lower eave above the entrance, not a separate floating doorway.
 box(house,.68,.09,1.12,0x454d59,1.25,1.95,0);
 const porch=new THREE.PointLight(0xffd4a2,6,4,2);porch.position.set(1.5,1.72,0);house.add(porch);
 box(house,.08,.22,.16,0xffd5a0,1.12,1.72,.52,true);
 // Enclosed courtyard with a clear path and the gate open toward the street.
 const [north,south]=STREET_HOME.courtyardSides;
 box(root,1.35,.035,south-north-.18,0x7c836a,-3.39,.01,(north+south)/2);
 for(let i=0;i<4;i++)box(root,.24,.035,.65,0xb8b1a1,-3.96+i*.34,.045,3.4);
 for(const z of [north,south]){box(root,3.7,.72,.18,0xcfc5b2,-4.55,.36,z);box(root,3.76,.08,.24,0x665d5c,-4.55,.76,z);}
 for(const [from,to] of [[north+.09,2.75],[4.05,south-.09]]){
  const z=(from+to)/2,d=to-from;
  box(root,.18,.72,d,0xcfc5b2,-2.75,.36,z);box(root,.24,.08,d+.06,0x665d5c,-2.75,.76,z);
 }
 for(const [z,rotation,direction]of [[2.8,-Math.PI/2,1],[4,Math.PI/2,-1]]){
  box(root,.2,1.18,.2,0x77716a,-2.75,.59,z);
  const pivot=new THREE.Group();pivot.name='open-courtyard-gate-leaf';pivot.position.set(-2.75,0,z);pivot.rotation.y=rotation;root.add(pivot);
  for(let i=0;i<6;i++)box(pivot,.045,.88,.025,0x48464a,0,.5,direction*(.05+i*.1));
  for(const y of [.17,.86])box(pivot,.05,.045,.6,0x48464a,0,y,direction*.3);
 }
 // Moss planting and a stone garden lantern stay outside the walking strip.
 for(const [x,z]of [[-3.55,2.15],[-3.55,4.65]]){box(root,.6,.12,.65,0x5e6857,x,.08,z);for(let i=0;i<3;i++){const bush=new THREE.Mesh(new THREE.SphereGeometry(.18,12,8),material(0x59715d));bush.position.set(x+(i-1)*.13,.28,z);root.add(bush);}}
 box(root,.16,.56,.16,0xa59a88,-3.1,.28,2.15);box(root,.28,.24,.28,0xd9bd88,-3.1,.68,2.15,true);box(root,.38,.09,.38,0x706c64,-3.1,.85,2.15);
 const gardenLight=new THREE.PointLight(0xffd19a,3,3,2);gardenLight.position.set(-3.1,.8,2.15);root.add(gardenLight);
 const plate=box(root,.04,.3,.5,0x85694e,-2.64,1.05,2.3);plate.name='home-nameplate';
 if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#e6d9bb';ctx.fillRect(0,0,512,256);ctx.fillStyle='#655142';ctx.font='600 65px system-ui';ctx.textAlign='center';ctx.fillText('大肥鱼の家',256,130);ctx.font='38px system-ui';ctx.fillText('回客厅',256,205);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const face=new THREE.Mesh(new THREE.PlaneGeometry(.5,.3),new THREE.MeshBasicMaterial({map:texture}));face.rotation.y=Math.PI/2;face.position.set(-2.615,1.05,2.3);root.add(face);}
 return root;
}
