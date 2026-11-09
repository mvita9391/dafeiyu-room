import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {FOREST_MAP,FOREST_TREES,FOREST_TERRAIN_ID,forestGrassAt,forestHash,forestLakeDepth} from '../../shared/world/forest.js';
import {FOREST_LAKE_FLOOR,FOREST_LAKE_LEVEL,FOREST_LAKE_WATER,FOREST_LAKE_TRAILS,FOREST_LAKE_TRAIL_WIDTH,forestLakePoint} from '../../shared/world/forest-lake.js';
import {authorSurface} from '../../shared/world/author-scenes.js';
import {compileOutdoorMap} from '../../shared/world/outdoor-builder.js';
import {createCloudShadows} from './cloud-shadows.js';
import {CHERRY_TREE,loadLocalTree,plantLocalTrees} from './local-tree-model.js';
import {buildOutdoorTerrain,paintOutdoorTexture} from './outdoor-terrain.js';
import {addPoolCaustics,makePoolWater,updatePoolWaterTime} from './pool-water.js';

function batch(root,geometry,material,instances,name,castShadow=false){
 const mesh=new THREE.InstancedMesh(geometry,material,instances.length);
 const transform=new THREE.Object3D();
 for(const [i,{x,y,z,sx,sy,sz,yaw=0,color}] of instances.entries()){
  transform.position.set(x,y,z);transform.rotation.set(0,yaw,0);transform.scale.set(sx,sy,sz);
  transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
  if(color)mesh.setColorAt(i,new THREE.Color(color));
 }
 mesh.name=name;mesh.castShadow=castShadow;mesh.receiveShadow=true;root.add(mesh);
 return mesh;
}

function makeTrees(root,trees){
 if(!trees.length)return;
 const trunk=[],crown=[];
 for(const {x,y,z,size} of trees){
  trunk.push({x,y:y+1.05*size,z,sx:size,sy:size,sz:size});
  crown.push({x,y:y+2.65*size,z,sx:1.08*size,sy:1.25*size,sz:1.08*size,color:0x568c49});
  crown.push({x:x+.58*size,y:y+2.23*size,z:z+.38*size,sx:.76*size,sy:.8*size,sz:.76*size,color:0x7aab53});
  crown.push({x:x-.46*size,y:y+2.2*size,z:z-.4*size,sx:.7*size,sy:.8*size,sz:.7*size,color:0x467c4b});
 }
 batch(root,new THREE.CylinderGeometry(.16,.27,2.1,7),new THREE.MeshStandardMaterial({color:0x77553d}),trunk,'forest-trunks',true);
 batch(root,new THREE.IcosahedronGeometry(1,2),new THREE.MeshStandardMaterial({roughness:.93}),crown,'forest-canopies',true);
}

const forestTreeTypes=[
 [CHERRY_TREE,3.8],
 ['pf-apple-tree-ef0ba0',3.5],
 ['pf-oak-tree-50ee7c',4.0],
];

function makeForestTrees(root,trees,clouds){
 const group=new THREE.Group();
 group.name='forest-trees';
 root.add(group);
 makeTrees(group,trees);
 const groups=forestTreeTypes.map(()=>[]);
 for(const tree of trees){
  const index=Math.floor(forestHash(tree.x*4+37,tree.z*4-19)*groups.length);
  groups[index].push({...tree,yaw:forestHash(tree.z*4+9,tree.x*4)*Math.PI*2});
 }
 let released=false;
 const cleanup=[];
 group.userData.releaseLocalAsset=()=>{
  released=true;
  for(const dispose of cleanup.splice(0))dispose();
 };
 void Promise.all(forestTreeTypes.map(([type,height])=>loadLocalTree(type,height))).then(models=>{
  if(released){for(const model of models)model?.release();return;}
  if(!models.some(Boolean))return;
  for(const mesh of [...group.children]){
   mesh.removeFromParent();mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();
  }
  makeTrees(group,groups.flatMap((trees,i)=>models[i]?[]:trees));
  for(const mesh of group.children)clouds?.apply(mesh.material);
  for(const [i,model] of models.entries()){
   if(!model)continue;
   const meshes=plantLocalTrees(group,forestTreeTypes[i][0],model.parts,groups[i],clouds);
   for(const mesh of meshes)mesh.castShadow=mesh.receiveShadow=true;
   cleanup.push(()=>{
    for(const mesh of meshes){
     mesh.removeFromParent();mesh.dispose();
     for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.dispose();
    }
    model.release();
   });
  }
 });
}

export function grassTileGeometry(){
 const positions=[],colors=[];
 const baseColor=new THREE.Color(0x306342),midColor=new THREE.Color(0x65ab54),tipColor=new THREE.Color(0xb9dc72);
 const triangle=(a,b,c)=>{
  for(const [x,y,z,color] of [a,b,c]){
   positions.push(x,y,z);colors.push(color.r,color.g,color.b);
  }
 };
 for(let row=0;row<7;row++)for(let col=0;col<7;col++){
  const x=(col+.5)/7-.5+(forestHash(col,row)-.5)*.075;
  const z=(row+.5)/7-.5+(forestHash(row,col+19)-.5)*.075;
  const angle=forestHash(col+11,row+3)*Math.PI*2,dx=Math.cos(angle),dz=Math.sin(angle);
  const height=.50+forestHash(col,row+7)*.35,lean=.075+forestHash(row+7,col+8)*.11;
  const point=(r,y,w,color)=>[THREE.MathUtils.clamp(x+dx*r-dz*w,-.488,.488),y,THREE.MathUtils.clamp(z+dz*r+dx*w,-.488,.488),color];
  const a=point(0,0,.034,baseColor),b=point(0,0,-.034,baseColor);
  const l=point(lean*.46,height*.62,.05,midColor),r=point(lean*.46,height*.62,-.05,midColor);
  const ridge=point(lean*.22,height*.68,0,midColor),tip=point(lean,height,0,tipColor);
  triangle(a,b,ridge);triangle(a,ridge,l);triangle(b,r,ridge);triangle(l,ridge,tip);triangle(ridge,r,tip);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geometry.computeVertexNormals();
 return geometry;
}

function makeGrass(root,features,groundAt){
 const plants=[],pebbles=[],petals=[],centers=[],leaves=[];
 for(const feature of features){
  const {x,y,z,size,prop}=feature;
  if(prop==='stone'){
   pebbles.push({x,y:y+.13*size,z,sx:.42*size,sy:.23*size,sz:.31*size,yaw:x+z,color:0xb0a296});
   continue;
  }
  if(prop!=='tallGrass'&&prop!=='flowers')continue;
  const tx=Math.floor(x)+.5,tz=Math.floor(z)+.5;
  const ground=groundAt?.(tx,tz)??y;
  if(prop==='tallGrass'){
   plants.push({x:tx,y:ground+.009,z:tz,sx:1,sy:.86+size*.15,sz:1,
    yaw:Math.floor(forestHash(tx,tz)*4)*Math.PI/2,color:0xf3ffef});
   continue;
  }
  for(let row=0;row<5;row++)for(let col=0;col<5;col++){
   const fx=tx+(col-2)*.174+(forestHash(col+tx,row+tz)-.5)*.06;
   const fz=tz+(row-2)*.174+(forestHash(row+tx,col+tz+7)-.5)*.06;
   const flowerHeight=.23+forestHash(row+tz+3,col+tx)*.14;
   const fy=ground+flowerHeight;
   const angle=forestHash(tx+col+5,tz+row)*Math.PI*2;
   const color=[0xf29fb8,0xfff5da,0xd7b8ee,0xffd3a7][Math.floor(forestHash(tx+row,tz+col+1)*4)];
   leaves.push({x:fx,y:ground+flowerHeight*.46,z:fz,sx:.145,sy:flowerHeight*.46,sz:.112,yaw:angle,color:(col+row)%3===0?0x4d9656:0x367748});
   centers.push({x:fx,y:fy+.023,z:fz,sx:.027,sy:.017,sz:.027,color:0xfbd66b});
   for(let j=0;j<5;j++){
    const a=angle+j*Math.PI*2/5;
    petals.push({x:fx+Math.cos(a)*.048,y:fy+.012,z:fz+Math.sin(a)*.048,
     sx:.051,sy:.022,sz:.037,yaw:-a,color});
   }
  }
 }
 const geometry=grassTileGeometry();
 const actor={value:new THREE.Vector3(1000,0,1000)},trail={value:new THREE.Vector3(1000,0,1000)},fade={value:0},time={value:0};
 const material=new THREE.MeshStandardMaterial({side:THREE.DoubleSide,vertexColors:true,roughness:.88});
 material.customProgramCacheKey=()=> 'forest-grass-bend';
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{forestWalker:actor,forestTrail:trail,forestTrailFade:fade,forestTime:time});
  shader.vertexShader=`uniform vec3 forestWalker, forestTrail;
uniform float forestTrailFade, forestTime;
`+shader.vertexShader.replace('#include <begin_vertex>',`
   #include <begin_vertex>
   vec3 center = instanceMatrix[3].xyz;
   vec2 away = center.xz - forestWalker.xz;
   float nearWalker = (1.0 - smoothstep(.18, 1.22, length(away))) * (1.0 - smoothstep(.35, 1.05, abs(center.y - forestWalker.y)));
   float behind = (1.0 - smoothstep(.18, 1.0, distance(center, forestTrail))) * forestTrailFade;
   float height = position.y / .85;
   transformed.x += height * (.045 * sin(forestTime * 1.6 + center.x * 1.3 + center.z) + .22 * max(nearWalker, behind));
   transformed.y -= height * .18 * max(nearWalker, behind);
  `);
 };
 batch(root,geometry,material,plants,'forest-tall-grass');
 batch(root,new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({roughness:1}),pebbles,'forest-pebbles');
 const bloom=new THREE.MeshStandardMaterial({roughness:.82});
 batch(root,new THREE.SphereGeometry(1,6,4),bloom,petals,'forest-flower-petals');
 batch(root,new THREE.SphereGeometry(1,6,4),bloom,centers,'forest-flower-centers');
 batch(root,new THREE.IcosahedronGeometry(1,0),bloom,leaves,'forest-flower-leaves');
 let lastStep=-Infinity;
 root.userData.updateForest=(t,position)=>{
  time.value=t;
  if(!position)return;
  const [x,y,z]=position;
  if(actor.value.x<999&&t-lastStep>.10&&Math.hypot(actor.value.x-x,actor.value.z-z)>.025){trail.value.copy(actor.value);lastStep=t;}
  fade.value=Math.max(0,1-(t-lastStep)/.42);
  actor.value.set(x,y,z);
 };
}

function makeLakeTrail(root){
 const x0=29,z0=-15,span=31,depth=30,density=32;
 const canvas=document.createElement('canvas');
 canvas.width=span*density;canvas.height=depth*density;
 const ctx=canvas.getContext('2d');
 ctx.setTransform(density,0,0,density,-x0*density,-z0*density);
 ctx.lineJoin=ctx.lineCap='round';
 const entry=ctx.createLinearGradient(29.2,0,37.6,0);
 entry.addColorStop(0,'transparent');
 entry.addColorStop(.13,'white');
 entry.addColorStop(.83,'white');
 entry.addColorStop(1,'transparent');
 for(const [index,trail] of FOREST_LAKE_TRAILS.entries()){
  ctx.beginPath();
  ctx.moveTo(...trail[0]);
  for(const point of trail.slice(1))ctx.lineTo(...point);
  if(index===0)ctx.closePath();
  ctx.strokeStyle=index===0?'white':entry;
  for(const [extra,alpha] of [[.27,.18],[.13,.35],[-.02,.74],[-.23,.9]]){
   ctx.globalAlpha=alpha;
   ctx.lineWidth=FOREST_LAKE_TRAIL_WIDTH+extra;
   ctx.stroke();
  }
 }
 ctx.resetTransform();
 ctx.globalAlpha=1;
 ctx.globalCompositeOperation='source-in';
 const dirt=paintOutdoorTexture('dirt');
 const pattern=ctx.createPattern(dirt.image,'repeat');
 pattern.setTransform(new DOMMatrix().scale(3.2*density/dirt.image.width));
 ctx.fillStyle=pattern;
 ctx.fillRect(0,0,canvas.width,canvas.height);
 dirt.dispose();
 const map=new THREE.CanvasTexture(canvas);
 map.colorSpace=THREE.SRGBColorSpace;
 map.anisotropy=8;
 const path=new THREE.Mesh(new THREE.PlaneGeometry(span,depth),new THREE.MeshStandardMaterial({
  map,transparent:true,depthWrite:false,roughness:.96,
 }));
 path.name='summit-lake-trail';
 path.rotation.x=-Math.PI/2;
 path.position.set(x0+span/2,4.809,z0+depth/2);
 path.receiveShadow=true;
 root.add(path);
}

function makeSummitLake(root){
 const dry=[],wet=[];
 for(const triangle of FOREST_LAKE_FLOOR)([1,4,7].every(i=>triangle[i]>=4.8-1e-6)?dry:wet).push(...triangle);
 const turf=new THREE.BufferGeometry(),grassUv=[];
 for(let i=0;i<dry.length;i+=3)grassUv.push(dry[i]/3.8,dry[i+2]/3.8);
 turf.setAttribute('position',new THREE.Float32BufferAttribute(dry,3));
 turf.setAttribute('uv',new THREE.Float32BufferAttribute(grassUv,2));
 turf.computeVertexNormals();
 const bank=new THREE.Mesh(turf,new THREE.MeshStandardMaterial({map:paintOutdoorTexture('grass'),color:0xf5f5f5,roughness:.94}));
 bank.receiveShadow=true;
 root.add(bank);

 const floorPositions=wet,uv=[],colors=[];
 const sand=new THREE.Color(0xd9bd87),deep=new THREE.Color(0x507d80),color=new THREE.Color();
 for(let i=0;i<floorPositions.length;i+=3){
  const [x,y,z]=floorPositions.slice(i,i+3);
  uv.push(x/3.1,z/3.1);
  color.copy(sand).lerp(deep,THREE.MathUtils.smoothstep(FOREST_LAKE_LEVEL-y,0,2.8));
  colors.push(color.r,color.g,color.b);
 }
 const floor=new THREE.BufferGeometry();
 floor.setAttribute('position',new THREE.Float32BufferAttribute(floorPositions,3));
 floor.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 floor.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const smoothFloor=mergeVertices(floor);
 smoothFloor.computeVertexNormals();
 const floorMaterial=addPoolCaustics(new THREE.MeshStandardMaterial({map:paintOutdoorTexture('dirt'),vertexColors:true,roughness:.96}),FOREST_LAKE_LEVEL);
 const bottom=new THREE.Mesh(smoothFloor,floorMaterial);
 bottom.name='summit-lake-sand';
 bottom.receiveShadow=true;
 root.add(bottom);

 const lakePositions=FOREST_LAKE_WATER.flat().map((value,i)=>i%3===1?value+.008:value);
 const lakeGeometry=new THREE.BufferGeometry();
 lakeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(lakePositions,3));
 lakeGeometry.computeVertexNormals();
 const lakeMaterial=makePoolWater();
 lakeMaterial.color.setHex(0x28768b);
 lakeMaterial.opacity=.43;
 const lake=new THREE.Mesh(lakeGeometry,lakeMaterial);
 lake.name='forest-summit-lake';
 lake.receiveShadow=true;
 root.add(lake);

 const stones=[],reeds=[],pads=[],flowers=[];
 for(let i=0;i<68;i++){
  const angle=i*2.39996,radius=.30+.66*forestHash(i,19);
  const [x,z]=forestLakePoint(angle,radius);
  const size=.12+.42*forestHash(i,26);
  stones.push({x,y:FOREST_LAKE_LEVEL-forestLakeDepth(x,z)+size*.19,z,sx:size,sy:size*.54,sz:size*.73,
   yaw:angle,color:[0x8f9a91,0xa6a699,0x717e83][i%3]});
 }
 // Leave the western trail into the water clear.
 for(const angle of [.27,.85,1.64,2.22,3.89,4.59,5.3,5.83]){
  for(let i=0;i<4;i++){
   const yaw=angle+(i-1.5)*.056;
   const [x,z]=forestLakePoint(yaw,.96+forestHash(i,angle)*.045);
   const y=authorSurface(FOREST_TERRAIN_ID,x,z)?.height??FOREST_LAKE_LEVEL;
   reeds.push({x,y:y-.02,z,sx:.59,sy:.8+forestHash(angle,i)*.55,sz:.66,yaw,color:0xe2eba2});
   if(i===3)continue;
   const [px,pz]=forestLakePoint(yaw,.73+forestHash(i,angle+6)*.17);
   const size=.18+forestHash(angle+5,i)*.16;
   pads.push({x:px,y:FOREST_LAKE_LEVEL+.019,z:pz,sx:size,sy:1,sz:size*.88,yaw,color:i%2===0?0x5c9c50:0x448453});
   if(i===1)flowers.push({x:px,y:FOREST_LAKE_LEVEL+.052,z:pz,sx:.082,sy:.047,sz:.082,color:0xf3bec9});
  }
 }
 const rock=new THREE.MeshStandardMaterial({roughness:.89});
 batch(root,new THREE.DodecahedronGeometry(1,0),rock,stones,'summit-lake-stones');
 const reedMaterial=new THREE.MeshStandardMaterial({side:THREE.DoubleSide,vertexColors:true,roughness:.88});
 batch(root,grassTileGeometry(),reedMaterial,reeds,'summit-lake-reeds');
 batch(root,new THREE.CircleGeometry(1,14,.18,Math.PI*2-.42).rotateX(-Math.PI/2),
  new THREE.MeshStandardMaterial({roughness:.76}),pads,'summit-lake-lilies');
 batch(root,new THREE.SphereGeometry(1,7,4),new THREE.MeshStandardMaterial({roughness:.85}),flowers,'summit-lake-blossoms');
}

export function buildForest(){
 const root=new THREE.Group();root.name='forest-exploration';
 root.add(buildOutdoorTerrain(FOREST_MAP));
 makeSummitLake(root);
 makeLakeTrail(root);
 const clouds=createCloudShadows();
 makeForestTrees(root,FOREST_TREES,clouds);
 makeGrass(root,FOREST_MAP.features.filter(feature=>feature.prop!=='tallGrass'||forestGrassAt(feature.x,feature.z)),
  (x,z)=>authorSurface(FOREST_TERRAIN_ID,x,z)?.height);
 const materials=new Set();
 root.traverse(node=>{if(node.material?.isMeshStandardMaterial)materials.add(node.material);});
 for(const material of materials)clouds.apply(material);
 const updateGrass=root.userData.updateForest;
 root.userData.updateForest=(time,position)=>{
  clouds.update(time);
  updatePoolWaterTime(time);
  updateGrass(time,position);
 };
 return root;
}

function buildForestVerge(){
 const root=new THREE.Group();root.name='yard-forest-verge';
 const rect=(x0,x1,z0,z1)=>({x0,x1,z0,z1});
 const paint=(material,...bounds)=>({kind:'paint',material,rect:rect(...bounds)});
 const raise=(level,...bounds)=>({kind:'height',level,rect:rect(...bounds)});
 const scatter=(prop,density,spacing,seed,...bounds)=>({kind:'scatter',prop,density,spacing,seed,rect:rect(...bounds),avoid:['dirt','paver']});
 const map=compileOutdoorMap({version:1,bounds:rect(0,12,-7,7),ops:[
  raise(2,2,11,-7,-3),raise(3,5,12,3,7),
  raise(5,6,12,-7,-4),raise(7,9,12,-7,-3),raise(5,8,12,4,7),
  paint('meadow',0,3,-3,3),paint('meadow',3,7,-3,-1),paint('meadow',2,8,1,3),
  paint('dirt',0,7,-1,1),paint('dirt',7,9,-2,1),paint('dirt',9,12,-2,0),
  scatter('tallGrass',.79,1,23,1,12,-7,-1),scatter('tallGrass',.81,1,51,1,12,1,7),
  scatter('flowers',.40,2,17,0,7,-5,-1),scatter('flowers',.44,2,21,0,8,1,5),
  scatter('tree',.87,2,46,5,12,-7,-3),scatter('tree',.85,2,19,6,12,2,7),
  ...[[1.8,-3.3,1.45],[2.4,2.9,1.25],[4.6,-1.8,1.5],[6.6,2.3,1.9],[8.7,-2.7,1.85],[10.7,1.2,1.55]]
   .map(([x,z,size])=>({kind:'place',prop:'stone',x,z,size})),
 ]});
 // The fence hides this seam where the verge meets the existing yard ground.
 map.walls=map.walls.filter(({a,b})=>a[0]!==0||b[0]!==0);
 root.add(buildOutdoorTerrain(map));
 makeForestTrees(root,map.features.filter(feature=>feature.prop==='tree'));
 const flowers=new Set(map.features.filter(feature=>feature.prop==='flowers').map(({x,z})=>`${Math.floor(x)},${Math.floor(z)}`));
 makeGrass(root,map.features.filter(({prop,x,z})=>prop!=='tallGrass'||!flowers.has(`${Math.floor(x)},${Math.floor(z)}`)));
 return root;
}

export function buildForestGate(slot,returning){
 const root=new THREE.Group();root.name='forest-fence-gate';
 const wood=new THREE.MeshStandardMaterial({color:0x88603f,roughness:.86});
 const plank=new THREE.MeshStandardMaterial({color:0xaa7d51,roughness:.86});
 const box=(parent,w,h,d,material,x,y,z)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
  mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);
  return mesh;
 };
 root.rotation.y=slot.side==='west'?Math.PI:0;
 for(const side of [-1,1])box(root,.19,1.36,.19,wood,0,.68,side*(slot.width/2+.06));
 const leaf=new THREE.Group();
 leaf.position.set(0,0,-slot.width/2);leaf.rotation.y=.99;root.add(leaf);
 for(const y of [.25,.68])box(leaf,.07,.105,.95,plank,0,y,.47);
 for(const z of [.09,.33,.61,.86])box(leaf,.085,.85,.08,wood,0,.48,z);
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;
 const ctx=canvas.getContext('2d');
 ctx.fillStyle='#e8cf9d';ctx.fillRect(0,0,256,96);
 ctx.strokeStyle='#936747';ctx.lineWidth=7;ctx.strokeRect(4,4,248,88);
 ctx.fillStyle='#503921';ctx.font='bold 52px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillText(returning?'院子':'森林',128,48);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const sign=new THREE.Mesh(new THREE.PlaneGeometry(.72,.27),new THREE.MeshBasicMaterial({map:texture}));
 sign.rotation.y=-Math.PI/2;sign.position.set(-.11,1.35,slot.width/2+.09);root.add(sign);
 if(!returning)root.add(buildForestVerge());
 return root;
}
