import {buildJapaneseHome} from './japanese-house.js';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {STORE_STREET_BOUNDS,STORE_STREET_FIXTURES} from '../../shared/world/store-street.js';
const mats=new Map();
function mat(color,glow=false){const key=`${color}:${glow}`;if(!mats.has(key))mats.set(key,new THREE.MeshStandardMaterial({color,roughness:glow?.4:.72,emissive:glow?color:0,emissiveIntensity:glow?1.1:0}));return mats.get(key);}
function box(root,w,h,d,color,x=0,y=0,z=0,glow=false){const m=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(.035,w/5,h/5,d/5)),mat(color,glow));m.position.set(x,y,z);m.castShadow=!glow;m.receiveShadow=true;root.add(m);return m;}
function cylinder(root,r,h,color,x,y,z){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),mat(color));m.position.set(x,y,z);m.castShadow=true;root.add(m);return m;}
function sign(root,text,w,h,x,y,z,{bg='#f5f5de',fg='#23594e',rotation=0}={}){
 let material=new THREE.MeshBasicMaterial({color:bg});
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.round(1024*h/w);const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=fg;ctx.font=`600 ${Math.round(canvas.height*.55)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,canvas.height*.53,980);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;material=new THREE.MeshBasicMaterial({map:texture});
 }
 const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);m.position.set(x,y,z);m.rotation.y=rotation;root.add(m);return m;
}
function goods(root,x,y,z,side=false){const colors=[0x7bc2ab,0xefb273,0x9ba4dd,0xf0db8e,0xec879c,0x8ac4dc];for(let row=0;row<3;row++){box(root,side?.35:1.45,.035,side?1.45:.35,0xe4d8bd,x,y+row*.37,z);for(let col=0;col<6;col++){const xx=side?x:x+(col-2.5)*.215,zz=side?z+(col-2.5)*.215:z;box(root,.13,.24,.13,colors[(col+row)%colors.length],xx,y+.135+row*.37,zz);}}}
function building(){
 const g=new THREE.Group();g.name='whale-mart-building';
 box(g,6.3,.18,4.3,0x534c54,0,.09,0);box(g,6,.28,4,0xddd4b9,0,.3,0);
 box(g,6,2.6,.16,0xddd7c9,0,1.72,-1.94);box(g,.16,2.6,4,0xddd7c9,-2.92,1.72,0);box(g,.16,.55,4,0xd3c9b8,2.92,.65,0);
 // Open front glazing reveals real shelf geometry rather than a flat facade.
 box(g,6,.5,.16,0xded6c5,0,.65,1.94);box(g,6,.55,.16,0xe7e1ce,0,2.76,1.94);
 const glass=new THREE.MeshPhysicalMaterial({color:0x7da4a2,transparent:true,opacity:.21,roughness:.12,metalness:.1,depthWrite:false});
 for(const x of [-2.78,-.95,.95,2.78])box(g,.065,1.85,.09,0x494d4d,x,1.67,2.02);
 for(const x of [-1.87,0,1.87]){const pane=new THREE.Mesh(new THREE.PlaneGeometry(1.75,1.75),glass);pane.position.set(x,1.65,2.035);g.add(pane);}
 for(const x of [-1.85,.15,1.95])goods(g,x,.9,1.5);
 for(const z of [-1.1,.5])goods(g,2.68,.9,z,true);
 const sideGlass=new THREE.Mesh(new THREE.PlaneGeometry(3.7,1.75),glass);sideGlass.rotation.y=Math.PI/2;sideGlass.position.set(3.015,1.65,0);g.add(sideGlass);
 for(const z of [-1.8,0,1.8])box(g,.08,1.85,.065,0x494d4d,3.04,1.67,z);
 // Sliding door and warm entrance canopy.
 box(g,.9,2.15,.07,0x718480,-1.83,1.45,2.09);box(g,.035,.48,.04,0xe1e4d7,-1.52,1.5,2.145);
 sign(g,'OPEN',.52,.2,-1.82,1.9,2.14,{bg:'#1a5b51',fg:'#f4e9a8'});
 box(g,1.7,.09,.75,0x54545a,-1.83,2.6,2.2);box(g,1.5,.035,.6,0xffdc9b,-1.83,2.54,2.2,true);
 box(g,6.2,.6,.15,0xeee9d9,0,3.05,2.035);box(g,6.2,.07,.19,0x56aa8d,0,2.76,2.04,true);box(g,6.2,.055,.19,0xe8ab5d,0,3.35,2.04,true);
 sign(g,'大肥鱼便利店  ·  24H',5.8,.44,0,3.07,2.125);
 box(g,.15,.6,4.1,0xeee9d9,3.035,3.05,0);sign(g,'WHALE MART',3.7,.42,3.12,3.06,0,{rotation:Math.PI/2});
 // Flat roof, parapet, HVAC and fine rail silhouette.
 box(g,6.45,.18,4.4,0x45424c,0,3.47,0);for(const x of [-3.12,3.12])box(g,.1,.22,4.3,0x56525c,x,3.65,0);for(const z of [-2.1,2.1])box(g,6.25,.22,.1,0x56525c,0,3.65,z);
 box(g,1.6,.48,1.05,0x737780,.6,3.84,-.55);for(let i=0;i<6;i++)box(g,1.3,.025,.025,0x3c444e,.6,3.73+i*.05,0);
 for(const x of [-2.65,2.65]){cylinder(g,.025,.6,0x303840,x,3.97,-1.55);box(g,.08,.08,.08,0x56616c,x,4.27,-1.55);}box(g,5.3,.035,.035,0x303840,0,4.22,-1.55);
 const warm=new THREE.PointLight(0xffd39a,3,7,2);warm.position.set(0,1.9,1.5);g.add(warm);
 const spill=new THREE.PointLight(0x8ddcba,1,5,2);spill.position.set(.6,2.7,2.45);g.add(spill);
 return g;
}
function vending(){const g=new THREE.Group();box(g,1.02,2.18,.8,0xcbd7da,0,1.09,0);box(g,.84,1.55,.04,0xe8f5ef,0,1.3,.425,true);for(let row=0;row<4;row++)for(let col=0;col<5;col++){const color=[0x7dc6df,0xe89983,0xe6cc78,0xa3cbaa,0xa6a2ce][col];cylinder(g,.05,.2,color,(col-2)*.145,.84+row*.3,.47);}box(g,.38,.09,.05,0x26333e,0,.28,.44);sign(g,'DRINKS',.8,.2,0,2,.455,{bg:'#45758f',fg:'#fff6e1'});const light=new THREE.PointLight(0x9dd8ff,.8,3,2);light.position.set(0,1.2,.7);g.add(light);return g;}
function lamp(){const g=new THREE.Group();cylinder(g,.13,.16,0x4a4c57,0,.08,0);cylinder(g,.045,4.8,0x51535d,0,2.45,0);box(g,1.05,.065,.065,0x51535d,.48,4.8,0);box(g,.48,.1,.28,0xffdda0,.95,4.76,0,true);const light=new THREE.PointLight(0xffce8f,0,9,2);light.position.set(.95,4.55,0);g.add(light);for(const child of g.children)child.position.x-=.5;return g;}
function car(){const g=new THREE.Group();box(g,2.25,.5,1.05,0x34475e,0,.52,0);box(g,1.35,.52,.94,0x2f4257,-.15,.96,0);box(g,1.15,.36,.95,0x243646,-.15,1,0);for(const x of [-.7,.7])for(const z of [-.52,.52]){const wheel=cylinder(g,.22,.13,0x232530,x,.29,z);wheel.rotation.x=Math.PI/2;}for(const z of [-.32,.32]){box(g,.04,.14,.2,0xffcd95,1.14,.61,z,true);box(g,.04,.13,.18,0xe95475,-1.14,.61,z,true);}return g;}
export const STORE_FURNITURE={shopBuilding:{label:'便利店',icon:'🏪',make:building},shopVending:{label:'自动售货机',icon:'🥤',make:vending},shopLamp:{label:'街道路灯',icon:'💡',make:lamp},shopCar:{label:'小汽车',icon:'🚙',make:car}};

function parkedVehicle(g, van){
 const paint=van?0xefd9ac:0x719e94, glass=0x354856, trim=0x40444b;
 const length=van?2.56:2.46, roof=van?1.36:1.15;
 box(g,1.16,.24,length,trim,0,.35,0);
 box(g,1.18,.45,length-.03,paint,0,.61,0);
 box(g,1.06,roof-.72,van?1.83:1.36,paint,0,(roof+.72)/2,.17);
 box(g,1.07,.095,van?1.8:1.3,paint,0,roof,.17);
 const windshield=box(g,.91,van?.41:.27,.045,glass,0,roof-.24,van?-.75:-.53);
 windshield.rotation.x=-.25;
 box(g,.89,van?.32:.22,.038,glass,0,roof-.23,van?1.09:.86);
 for(const x of [-1,1]){
  box(g,.045,van?.32:.23,.46,glass,x*.534,roof-.23,-.28);
  box(g,.044,van?.32:.23,van?.81:.52,glass,x*.534,roof-.23,.39);
  box(g,.029,.037,.14,trim,x*.595,.785,.16);
  box(g,.13,.09,.13,paint,x*.53,.92,-.59);
  for(const z of [-.77,.76]){
   cylinder(g,.245,.14,0x26292f,x*.53,.25,z).rotation.z=Math.PI/2;
   cylinder(g,.125,.021,0xb7babe,x*.606,.25,z).rotation.z=Math.PI/2;
  }
  box(g,.25,.105,.04,0xffe4b5,x*.393,.625,-length/2);
  box(g,.18,.11,.04,0xc8594c,x*.434,.645,length/2);
 }
 box(g,.37,.115,.025,0xf5f0db,0,.51,length/2+.018);
 box(g,.49,.085,.025,trim,0,.55,-length/2-.014);
}
function hydrant(g){
 const red=0xbb4c45, dark=0x863c3e;
 cylinder(g,.155,.08,dark,0,.04,0);
 cylinder(g,.113,.43,red,0,.27,0);
 cylinder(g,.144,.065,red,0,.47,0);
 cylinder(g,.104,.08,dark,0,.535,0);
 cylinder(g,.038,.045,0xe3ba7b,0,.595,0);
 for(const x of [-.16,.16]){
  cylinder(g,.069,.13,red,x,.33,0).rotation.z=Math.PI/2;
  cylinder(g,.08,.04,dark,x*1.43,.33,0).rotation.z=Math.PI/2;
 }
}
function bench(g){
 for(const x of [-.68,.68]){
  box(g,.06,.43,.48,0x485452,x,.22,0);
  box(g,.045,.55,.07,0x485452,x,.58,-.26);
 }
 for(const z of [-.15,0,.15])box(g,1.8,.055,.125,0xb48963,0,.45,z);
 for(const y of [.63,.77])box(g,1.8,.10,.055,0xb48963,0,y,-.26);
}
function planter(g){
 box(g,1.17,.31,1.17,0xa5a69a,0,.155,0);
 box(g,1.19,.055,1.19,0xc4c1ad,0,.31,0);
 box(g,1.03,.04,1.03,0x6a5d51,0,.34,0);
 for(const [x,z,r,color] of [[-.21,.18,.27,0x6f8a5d],[.23,.21,.24,0x7f9b69],[.03,-.2,.34,0x5c7d61]]){
  const shrub=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),mat(color));
  shrub.position.set(x,.39+r*.5,z);shrub.castShadow=true;g.add(shrub);
 }
 for(const [x,z] of [[-.32,.22],[.29,.25],[.05,-.14]])cylinder(g,.055,.045,0xe4ad7d,x,.76,z);
}
function streetSign(g, isBus){
 cylinder(g,.037,1.95,0x536564,0,.98,0);
 box(g,isBus?.34:.32,isBus?.42:.32,.06,0x42718a,0,1.79,0);
 sign(g,isBus?'BUS':'P',isBus?.31:.29,isBus?.39:.29,0,1.79,.032,{bg:'#42718a',fg:'#fff3da'});
}
function shelter(g){
 const frame=0x4a6665;
 for(const x of [-1.33,1.33])for(const z of [-.51,.48])box(g,.07,2.15,.07,frame,x,1.075,z);
 box(g,2.9,.12,1.25,frame,0,2.18,0);
 box(g,2.76,.13,.065,0xa4baa7,0,2.1,.59);
 box(g,2.58,1.36,.048,0xb3c4be,0,1.05,-.515);
 sign(g,'街角便利店站',1.25,.17,0,2.11,.627,{bg:'#a4baa7',fg:'#314f50'});
 const seat=new THREE.Group();seat.position.set(0,0,-.17);bench(seat);g.add(seat);
}
const streetFixtures={
 hatchback:g=>parkedVehicle(g,false),van:g=>parkedVehicle(g,true),hydrant,bench,planter,shelter,
 parkingSign:g=>streetSign(g,false),busStop:g=>streetSign(g,true),
 bin:g=>{
  cylinder(g,.215,.55,0x516c67,0,.275,0);
  cylinder(g,.23,.075,0x354e50,0,.58,0);
  box(g,.22,.085,.035,0x283c40,0,.476,.202);
 },
 parkingLamp:g=>{
  cylinder(g,.12,.14,0x4a545a,0,.07,0);
  cylinder(g,.04,3.5,0x4a545a,0,1.75,0);
  box(g,.09,.055,.65,0x4a545a,0,3.47,-.25);
  box(g,.25,.075,.36,0xf2d6a1,0,3.43,-.52,true);
 },
};

function buildStreetExpansion(g){
 const asphalt=0x5b646c, lot=0x58646c, paint=0xe5dfc8, pavement=0xb9b3a5;
 const slab=(x,z,w,d,color,top=0,depth=.03)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,depth,d),mat(color));
  mesh.position.set(x,top-depth/2,z);mesh.receiveShadow=true;g.add(mesh);
 };
 // The aisle stays open between the storefront, the parking bays and the east exit.
 slab(9.55,3,11.9,3.25,asphalt,-.004);
 slab(10.85,9,8.3,7.65,lot,.002);
 slab(10.85,12.05,8.3,.55,pavement,.055);
 slab(10.8,-2.55,8.5,6.8,pavement,.042);
 slab(-3.95,9.2,4.3,2.9,pavement,.035);
 slab(0,9.95,1.6,7.1,pavement,.029);
 slab(-1.7,8.1,2.1,1.3,pavement,.03);
 for(const z of [-5.2,-4.4,-3.6,-2.8,-2,-1.2,-.4,.4])slab(10.8,z,8.45,.014,0xa4a295,.043,.007);
 for(const x of [7,7.5,8,8.5,9])slab(x,2.99,.27,2.92,paint,.006,.007);
 for(const x of [10.25,11.35,12.45,13.55,14.65])slab(x,3,.54,.07,0xdfc28e,.006,.007);
 for(let i=0;i<=5;i++)slab(6.7+i*1.6,10.57,.045,2.55,paint,.01,.008);
 slab(10.7,11.845,8,.045,paint,.01,.008);
 for(const x of [7.5,9.1,10.7,12.3,13.9])slab(x,11.64,.86,.12,0xb7b9a8,.045);
 // Low verges frame the outer edge while preserving the four street exits.
 slab(4,12.89,6,.65,0x85966e,.035);
 slab(-3.6,12.89,5.1,.65,0x85966e,.035);
 slab(10.7,-6.17,8.6,.45,0x899974,.033);
 slab(15.18,8.7,.33,7.8,0x879773,.034);
 for(const fixture of STORE_STREET_FIXTURES){
  const {kind,x,z}=fixture, root=new THREE.Group();
  root.name=`street-${kind}`;
  root.position.set(x,kind==='parkingLamp'?.055:0,z);
  streetFixtures[kind](root);
  g.add(root);
 }
}
export function buildStoreStreet(){
 const g=new THREE.Group();g.name='store-street-shell';
 const {x0,x1,z0,z1}=STORE_STREET_BOUNDS;
 const floor=box(g,x1-x0,.28,z1-z0,0x687176,(x0+x1)/2,-.148,(z0+z1)/2);floor.castShadow=false;
 buildStreetExpansion(g);
 box(g,9,.11,6.3,0x65616b,.7,-.005,-2);box(g,9,.07,.1,0xc7a16c,.7,.07,1.18);
 // Fine sidewalk tiles and parking space paint.
 for(let i=0;i<12;i++)box(g,.012,.006,6.2,0x55535e,-3.45+i*.75,.055,-2);
 for(let i=0;i<5;i++){const z=-4.5+i*1.25;box(g,2.1,.009,.055,0xa6a9b1,-4.85,.012,z);}box(g,.055,.009,5,0xa6a9b1,-3.8,.012,-2);
 for(let i=0;i<10;i++)box(g,.32,.009,2.1,0xd2d2d2,-2.25+i*.5,.012,4.55);
 box(g,3.8,.009,.05,0xddd3bb,4,.012,5.55);box(g,.05,.009,1.75,0xddd3bb,2.15,.012,4.7);box(g,.05,.009,1.75,0xddd3bb,5.85,.012,4.7);
 for(const [x,z,w,d] of [[-4.7,1.6,1.8,.65],[1.6,2.3,2,.6],[-1.8,5.8,1,.35],[5.3,1.1,.8,.35]]){const p=new THREE.Mesh(new THREE.CircleGeometry(1,32),new THREE.MeshStandardMaterial({color:0x667b87,roughness:.1,metalness:.55,transparent:true,opacity:.3}));p.rotation.x=-Math.PI/2;p.scale.set(w/2,d/2,1);p.position.set(x,.016,z);g.add(p);}
 for(const x of [-2.8,2.7]){const cover=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.012,24),mat(0x171d28));cover.position.set(x,.013,3.3);g.add(cover);}
 g.add(buildJapaneseHome());
 return g;
}

// Local +Z points into the street. Extend the road beyond the scene edge.
export function buildStreetExitRoad(side){
 const road=new THREE.Group();road.name='street-exit-road';
 road.rotation.y=({north:0,south:Math.PI,west:Math.PI/2,east:-Math.PI/2})[side]||0;
 const asphalt=box(road,2.4,.045,3.8,0x687176,0,-.03,.6);asphalt.castShadow=false;
 for(const x of [-1.25,1.25]){box(road,.16,.12,3.8,0xcfc7b5,x,.015,.6);box(road,.045,.008,3.5,0xe1cb97,x*.86,.003,.6);}
 for(const z of [-.7,.15,1,1.85])box(road,.065,.008,.42,0xf0dfb6,0,.004,z);
 return road;
}
