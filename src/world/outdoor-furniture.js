import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {PICNIC_BENCH_Y,PICNIC_TOP_Y,UMBRELLA_RADIUS,UMBRELLA_RISE,UMBRELLA_TOP_Y} from '../../shared/world/yard-platforms.js';
const wood=0xb97e53,dark=0x855e46,cream=0xf5e6ca,green=0x91b786;
const material=color=>new THREE.MeshStandardMaterial({color,roughness:.85});
function mesh(root,geometry,color,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
function box(root,w,h,d,color,x=0,y=0,z=0){return mesh(root,new RoundedBoxGeometry(w,h,d,2,Math.min(.035,w/5,h/5,d/5)),color,x,y,z);}
function pole(root,r,h,color,x=0,y=0,z=0){return mesh(root,new THREE.CylinderGeometry(r,r,h,10),color,x,y,z);}
function beam(root,from,to,r,color){const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),delta=b.clone().sub(a);const m=pole(root,r,delta.length(),color);m.position.copy(a.add(b).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;}
function flower(root,x,y,z,color){pole(root,.012,.24,green,x,y-.12,z);const middle=mesh(root,new THREE.SphereGeometry(.04,8,6),0xf6d482,x,y,z);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const petal=mesh(root,new THREE.SphereGeometry(.065,8,6),color,x+Math.cos(a)*.065,y,z+Math.sin(a)*.065);petal.scale.y=.45;}return middle;}
function makeSwing(){
 const root=new THREE.Group();
 for(const x of [-1.08,1.08]){for(const z of [-.8,.8])beam(root,[x,.06,z],[x,2.22,0],.065,wood);beam(root,[x,.78,-.55],[x,.78,.55],.045,dark);}
 box(root,2.7,.16,.18,dark,0,2.24,0);
 const pivot=new THREE.Group();pivot.name='swing-pivot';pivot.position.y=2.18;root.add(pivot);
 for(const x of [-.48,.48])beam(pivot,[x,0,0],[x,-1.56,0],.014,cream);
 for(let i=0;i<4;i++)box(pivot,1.14,.085,.1,wood,0,-1.6,(i-1.5)*.11);
 box(pivot,1.13,.34,.075,wood,0,-1.38,-.23);
 box(pivot,1.04,.045,.38,0xaec5b6,0,-1.565,0);
 const contact=new THREE.Object3D();contact.name='swing-seat-contact';contact.position.set(0,-1.54,0);pivot.add(contact);
 return root;
}
function makePicnicTable(){
 const root=new THREE.Group();
 for(let i=0;i<5;i++)box(root,1.9,.09,.17,wood,0,PICNIC_TOP_Y-.045,(i-2)*.18);
 for(const x of [-.68,.68]){beam(root,[x,.05,-.6],[x,.74,.3],.065,dark);beam(root,[x,.05,.6],[x,.74,-.3],.065,dark);box(root,.13,.1,1.75,dark,x,.4,0);}
 for(const z of [-.8,.8])for(let i=0;i<2;i++)box(root,2.05,.08,.18,wood,0,PICNIC_BENCH_Y-.04,z+(i-.5)*.19);
 return root;
}
function makeUmbrella(){
 const root=new THREE.Group();pole(root,.3,.12,0xc5b7a3,0,.06);pole(root,.035,2.3,wood,0,1.2);
 const g=new THREE.ConeGeometry(UMBRELLA_RADIUS,UMBRELLA_RISE,12,1,true);g.translate(0,UMBRELLA_TOP_Y-UMBRELLA_RISE/2,0);
 const cover=mesh(root,g,0xd6a58b);cover.material.side=THREE.DoubleSide;
 for(let i=0;i<12;i++){const a=i*Math.PI/6;beam(root,[0,2.36,0],[Math.cos(a)*1.27,1.74,Math.sin(a)*1.27],.012,cream);}
 pole(root,.045,.12,dark,0,2.42);return root;
}
function makeFlowerBox(){
 const root=new THREE.Group();box(root,1.25,.42,.58,wood,0,.26);box(root,1.18,.035,.5,dark,0,.48);
 for(const x of [-.5,.5])box(root,.075,.48,.63,dark,x,.26);
 const colors=[0xe6acc1,0xf2d994,0xc4b4d6];for(let i=0;i<9;i++){const x=(i%5-2)*.22,z=i<5?-.12:.13;flower(root,x,.78+(i%3)*.035,z,colors[i%3]);}
 return root;
}
function makeRoseArch(){
 const root=new THREE.Group();for(const x of [-.85,.85]){box(root,.12,1.9,.14,cream,x,.95);box(root,.24,.12,.34,dark,x,.06);for(let i=0;i<5;i++)box(root,.16,.045,.5,cream,x,.32+i*.29);}
 const points=[];for(let i=0;i<=24;i++){const a=i*Math.PI/24;points.push(new THREE.Vector3(Math.cos(a)*.85,1.88+Math.sin(a)*.6,0));}
 mesh(root,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),28,.065,8,false),cream);
 for(let i=0;i<11;i++){const a=i*Math.PI/10,x=Math.cos(a)*.85,y=1.88+Math.sin(a)*.6;const leaf=mesh(root,new THREE.SphereGeometry(.13,8,6),green,x,y,.03);leaf.scale.set(1.1,.6,.8);flower(root,x,y+.03,.11,i%2?0xe7b9c9:0xf6d8d0);}
 return root;
}
function makeBirdBath(){
 const root=new THREE.Group();pole(root,.27,.1,0xd1c4ac,0,.05);pole(root,.095,.72,0xd9cdb8,0,.43);
 const profile=[new THREE.Vector2(.06,0),new THREE.Vector2(.18,.02),new THREE.Vector2(.4,.17),new THREE.Vector2(.4,.2),new THREE.Vector2(.36,.18),new THREE.Vector2(.12,.08)];
 mesh(root,new THREE.LatheGeometry(profile,24),0xe7dcc8,0,.73);
 const water=mesh(root,new THREE.CircleGeometry(.33,28),0x9fcbd1,0,.89);water.rotation.x=-Math.PI/2;
 const bird=mesh(root,new THREE.SphereGeometry(.065,10,8),0xb79676,.28,.99,.09);bird.scale.set(1,1,1.3);return root;
}
export const OUTDOOR_FURNITURE={
 yardSwing:{label:'秋千',icon:'🛝',make:makeSwing},
 yardPicnicTable:{label:'野餐桌',icon:'🧺',make:makePicnicTable},
 yardUmbrella:{label:'遮阳伞',icon:'⛱️',make:makeUmbrella},
 yardFlowerBox:{label:'花箱',icon:'🌼',make:makeFlowerBox},
 yardRoseArch:{label:'花拱门',icon:'🌸',make:makeRoseArch},
 yardBirdBath:{label:'鸟浴盆',icon:'🐦',make:makeBirdBath},
};
export function animateOutdoorFurniture(object,time,occupied=false){
 const pivot=object.getObjectByName('swing-pivot');if(pivot)pivot.rotation.x=Math.sin(time*1.7)*(occupied?.15:.018);
}
