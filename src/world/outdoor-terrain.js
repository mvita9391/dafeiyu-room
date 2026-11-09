import * as THREE from 'three';
import {outdoorHash} from '../../shared/world/outdoor-builder.js';

const PALETTE={
 grass:{base:'#82a951',dark:'#638a3c',light:'#acc36c',repeat:3.8},
 meadow:{base:'#a1b75d',dark:'#778e42',light:'#c6ce82',repeat:4.3},
 dirt:{base:'#c39967',dark:'#a78052',light:'#dcc095',repeat:3.2},
 paver:{base:'#82746e',dark:'#72615b',light:'#ddc0a6',repeat:2.2},
 rock:{base:'#9b8f82',dark:'#6f6972',light:'#b7a799',repeat:2.9},
 cliff:{base:'#8d8073',dark:'#676370',light:'#b8a587',repeat:3.4},
 lakebed:{base:'#77b0a4',dark:'#54877c',light:'#a9c6a3',repeat:3.2},
 lakeDeep:{base:'#426e83',dark:'#33566f',light:'#719bab',repeat:4.1},
};

export function paintOutdoorTexture(key){
 const {base,dark,light}=PALETTE[key],size=256;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d');
 const random=(i,j)=>outdoorHash(i+17,j+23);
 ctx.fillStyle=base;ctx.fillRect(0,0,size,size);
 const repeat=(x,y,r,draw)=>{
  for(const dx of [-size,0,size])for(const dy of [-size,0,size]){
   const px=x+dx,py=y+dy;
   if(px+r>=0&&px-r<=size&&py+r>=0&&py-r<=size)draw(px,py);
  }
 };
 if(key==='paver'){
  for(let row=0;row<5;row++)for(let col=0;col<4;col++){
   const width=size/4,height=size/5,x=col*width+(row%2)*width/2,y=row*height;
   const shade=Math.floor(random(row,col)*27),cut=6+random(col,row)*5;
   repeat(x+width/2,y+height/2,width,(px,py)=>{
    const left=px-width/2+2,top=py-height/2+2,right=left+width-4,bottom=top+height-4;
    ctx.fillStyle=`rgb(${157+shade},${137+shade},${122+shade})`;
    ctx.beginPath();ctx.moveTo(left+cut,top);ctx.lineTo(right-cut,top+2);ctx.quadraticCurveTo(right,top+1,right,bottom-cut);
    ctx.lineTo(right-cut,bottom);ctx.lineTo(left+cut,bottom-1);ctx.quadraticCurveTo(left,bottom,left,top+cut);
    ctx.closePath();ctx.fill();
    ctx.strokeStyle=light;ctx.lineWidth=1.5;ctx.globalAlpha=.53;ctx.beginPath();ctx.moveTo(left+cut,top+3);ctx.lineTo(right-cut,top+4);ctx.stroke();ctx.globalAlpha=1;
   });
  }
 }
 for(let i=0;i<260;i++){
  const x=random(i,1)*size,y=random(i,2)*size,r=2+random(i,3)*12;
  const grass=key==='grass'||key==='meadow';
  ctx.fillStyle=i%3===0?light:dark;ctx.globalAlpha=grass?.16:.11;
  repeat(x,y,r,(px,py)=>{
   ctx.beginPath();ctx.ellipse(px,py,r,r*(key==='cliff'?.35:.66),random(i,4)*Math.PI,0,Math.PI*2);ctx.fill();
  });
 }
 for(let i=0;i<1050;i++){
  const x=random(i,5)*size,y=random(i,6)*size,r=.35+random(i,7)*1.8;
  ctx.fillStyle=i%3===0?light:dark;ctx.globalAlpha=.12+random(i,8)*.25;
  ctx.fillRect(x,y,r*1.45,r);
 }
 if(key==='grass'||key==='meadow'||key==='dirt'){
  for(let i=0;i<62;i++){
   const x=random(i,11)*size,y=random(i,12)*size,r=1+random(i,14)*2;
   const grass=key!=='dirt';ctx.globalAlpha=.32+random(i,13)*.28;
   ctx.fillStyle=i%4===0?'#ece6ac':light;
   ctx.beginPath();ctx.ellipse(x,y,r*1.3,r,random(i,15),0,Math.PI*2);ctx.fill();
   if(grass){ctx.beginPath();ctx.ellipse(x+r,y+r,r*.9,r*.7,.6,0,Math.PI*2);ctx.fill();}
  }
 }
 ctx.globalAlpha=1;
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
 texture.anisotropy=8;
 return texture;
}

export function buildOutdoorTerrain(map){
 const root=new THREE.Group();root.name='outdoor-grid-terrain';
 const batches=new Map();
 function quad(points,key,shades,side=false){
  if(!batches.has(key))batches.set(key,{positions:[],colors:[],uvs:[]});
  const {positions,colors,uvs}=batches.get(key),repeat=PALETTE[key].repeat;
  const verticalX=Math.abs(points[0][0]-points[1][0])<.0001;
  for(const i of [0,1,2,0,2,3]){
   const [x,y,z]=points[i],shade=shades[i];
   positions.push(x,y,z);colors.push(shade,shade,shade);
   uvs.push((side&&verticalX?z:x)/repeat,(side?y:z)/repeat);
  }
 }
 for(const {x0,x1,z0,z1,y,material} of map.tops){
  const points=[[x0,y,z0],[x0,y,z1],[x1,y,z1],[x1,y,z0]];
  quad(points,material,points.map(([x,,z])=>.88+.12*outdoorHash(x,z)));
 }
 for(const {a,b,top,bottom,step,material} of map.walls){
  const side=(lo,hi,key,shade)=>quad([[b[0],hi,b[1]],[a[0],hi,a[1]],[a[0],lo,a[1]],[b[0],lo,b[1]]],key,[1,1,shade,shade],true);
  if(step){side(bottom,top,'paver',.71);continue;}
  const grass=material==='grass'||material==='meadow';
  const lip=grass?Math.max(bottom,top-.10):top;
  if(grass){
   const dx=b[0]-a[0],dz=b[1]-a[1],push=Math.min(.05,(top-lip)*.55)/Math.hypot(dx,dz);
   const roundedA=[a[0]-dz*push,(top+lip)/2,a[1]+dx*push];
   const roundedB=[b[0]-dz*push,(top+lip)/2,b[1]+dx*push];
   quad([[b[0],top,b[1]],[a[0],top,a[1]],roundedA,roundedB],material,[1,1,.88,.88],true);
   quad([roundedB,roundedA,[a[0],lip,a[1]],[b[0],lip,b[1]]],material,[.88,.88,.67,.67],true);
  }
  if(lip>bottom)side(bottom,lip,'cliff',.58);
 }
 for(const [key,{positions,colors,uvs}] of batches){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({map:paintOutdoorTexture(key),vertexColors:true,roughness:.94});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='outdoor-'+key;mesh.receiveShadow=true;root.add(mesh);
 }
 return root;
}
