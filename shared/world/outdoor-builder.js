// Version 1. A 1 m grid with one solid column per tile and two subtiles per axis for stairs.
export const OUTDOOR_MATERIALS=['grass','meadow','dirt','paver','rock','lakebed','lakeDeep'];
const PROPS=['tree','tallGrass','flowers','stone'];
export const OUTDOOR_HEIGHT_UNIT=.16;
const SUB=2;

export function outdoorHash(x,z){
 const n=Math.sin(x*127.1+z*311.7)*43758.5453;
 return n-Math.floor(n);
}

export function compileOutdoorMap({version,bounds,ops}){
 if(version!==1||!bounds||!Array.isArray(ops))throw Error('INVALID_OUTDOOR_MAP');
 const {x0,x1,z0,z1}=bounds,width=x1-x0,length=z1-z0;
 if(![x0,x1,z0,z1].every(Number.isSafeInteger)||width<1||length<1||width*length>16384)throw Error('INVALID_OUTDOOR_BOUNDS');
 const w=width*SUB,d=length*SUB,heights=new Int16Array(w*d),materials=new Uint8Array(w*d);
 const stairs=new Uint8Array(w*d),props=new Map();
 const id=(x,z)=>z*w+x;
 const inBounds=(x,z)=>x>=0&&x<w&&z>=0&&z<d;
 const world=(x,z)=>[(x+.5)/SUB+x0,(z+.5)/SUB+z0];
 const worldY=h=>h*(OUTDOOR_HEIGHT_UNIT*100)/100;
 const cellBounds=rect=>{
  const {x0:a,x1:b,z0:c,z1:e}=rect||{};
  if(![a,b,c,e].every(Number.isSafeInteger)||a<x0||b>x1||c<z0||e>z1||a>=b||c>=e)throw Error('OUTDOOR_RECT_OUT_OF_BOUNDS');
  return [(a-x0)*SUB,(b-x0)*SUB,(c-z0)*SUB,(e-z0)*SUB];
 };
 const materialId=material=>{
  const i=OUTDOOR_MATERIALS.indexOf(material);
  if(i===-1)throw Error('UNKNOWN_OUTDOOR_MATERIAL');
  return i;
 };
 const checkHeight=h=>{if(!Number.isInteger(h)||h<0||h>100)throw Error('INVALID_OUTDOOR_HEIGHT');};
 function putProp(op){
  const {x,z,prop,size=1}=op;
  if(![x,z,size].every(Number.isFinite)||x<x0||x>=x1||z<z0||z>=z1||size<.2||size>4||!PROPS.includes(prop))throw Error('INVALID_OUTDOOR_PROP');
  props.set(`${Math.floor(x)},${Math.floor(z)},${prop}`,{x,z,prop,size});
 }
 for(const op of ops){
  if(op.kind==='place'){putProp(op);continue;}
  if(op.kind==='erase'){
   const [a,b,c,e]=cellBounds(op.rect);
   for(const [key,p] of props){
    const x=(p.x-x0)*SUB,z=(p.z-z0)*SUB;
    if(x>=a&&x<b&&z>=c&&z<e&&(!op.prop||p.prop===op.prop))props.delete(key);
   }
   continue;
  }
  const [a,b,c,e]=cellBounds(op.rect);
  if(op.kind==='scatter'){
   const {seed=0,density=.5,spacing=1,prop,avoid=[]}=op;
   if(!Number.isSafeInteger(seed)||!Number.isInteger(spacing)||spacing<1||density<0||density>1||!Number.isFinite(density)||!PROPS.includes(prop)||!Array.isArray(avoid))throw Error('INVALID_OUTDOOR_SCATTER');
   const blocked=new Set(avoid.map(materialId));
   for(let z=c;z<e;z+=spacing*SUB)for(let x=a;x<b;x+=spacing*SUB){
    if(outdoorHash(x+seed,z)>density)continue;
    const ix=Math.min(b-1,x+Math.floor(outdoorHash(x,z+seed)*spacing*SUB));
    const iz=Math.min(e-1,z+Math.floor(outdoorHash(z,x+seed)*spacing*SUB));
    const at=id(ix,iz);
    if(stairs[at]||blocked.has(materials[at]))continue;
    const [px,pz]=world(ix,iz);
    putProp({x:px,z:pz,prop,size:.72+outdoorHash(ix+11,iz+seed)*.52});
   }
   continue;
  }
  let apply;
  if(op.kind==='height'){
   checkHeight(op.level);
   apply=at=>{heights[at]=op.level;stairs[at]=0;};
  }else if(op.kind==='paint'){
   const material=materialId(op.material);
   apply=at=>{materials[at]=material;};
  }else if(op.kind==='stairs'){
   const {from,to,direction}=op;
   checkHeight(from);checkHeight(to);
   if(!['east','west','north','south'].includes(direction))throw Error('INVALID_OUTDOOR_STAIR_DIRECTION');
   const alongX=direction==='east'||direction==='west',span=alongX?b-a:e-c;
   const rise=to-from;
   if(!rise||Math.abs(rise)>span)throw Error('OUTDOOR_STAIRS_TOO_STEEP');
   const reverse=direction==='west'||direction==='north';
   apply=(at,x,z)=>{
    const offset=alongX?x-a:z-c;
    const step=reverse?span-offset:offset+1;
    heights[at]=from+Math.sign(rise)*Math.ceil(Math.abs(rise)*step/span);
    materials[at]=materialId('paver');stairs[at]=1;
   };
  }else throw Error('UNKNOWN_OUTDOOR_OPERATION');
  for(let z=c;z<e;z++)for(let x=a;x<b;x++)apply(id(x,z),x,z);
 }

 function rects(includeMaterial){
  const used=new Uint8Array(w*d),result=[];
  for(let z=0;z<d;z++)for(let x=0;x<w;x++){
   const start=id(x,z);
   if(used[start])continue;
   const matches=(x,z)=>{
    const at=id(x,z);
    return !used[at]&&heights[at]===heights[start]&&(!includeMaterial||materials[at]===materials[start]&&stairs[at]===stairs[start]);
   };
   let ex=x+1,ez=z+1;
   while(ex<w&&matches(ex,z))ex++;
   rows:while(ez<d){
    for(let dx=x;dx<ex;dx++)if(!matches(dx,ez))break rows;
    ez++;
   }
   for(let dz=z;dz<ez;dz++)used.fill(1,id(x,dz),id(ex,dz));
   result.push({x0:x/SUB+x0,x1:ex/SUB+x0,z0:z/SUB+z0,z1:ez/SUB+z0,y:worldY(heights[start]),
    ...(includeMaterial?{material:OUTDOOR_MATERIALS[materials[start]],step:!!stairs[start]}:{})});
  }
  return result;
 }
 const surfaces=rects(false).flatMap(({x0,x1,z0,z1,y})=>[
  {kind:'land',vertices:[x0,y,z0,x0,y,z1,x1,y,z0]},
  {kind:'land',vertices:[x1,y,z0,x0,y,z1,x1,y,z1]},
 ]);
 const walls=[];
 for(let z=0;z<d;z++)for(let x=0;x<w;x++){
  const at=id(x,z),y=worldY(heights[at]),a=x/SUB+x0,b=z/SUB+z0,s=1/SUB;
  const corners=[[a,b],[a,b+s],[a+s,b+s],[a+s,b]];
  for(const [side,[dx,dz]] of [[-1,0],[0,1],[1,0],[0,-1]].entries()){
   const bottom=inBounds(x+dx,z+dz)?worldY(heights[id(x+dx,z+dz)]):-.55;
   if(y>bottom+1e-6)walls.push({a:corners[side],b:corners[(side+1)%4],top:y,bottom,material:OUTDOOR_MATERIALS[materials[at]],step:!!stairs[at]});
  }
 }
 const features=[...props.values()].map(p=>{
  const at=id(Math.floor((p.x-x0)*SUB),Math.floor((p.z-z0)*SUB));
  return {...p,y:worldY(heights[at])};
 });
 return {bounds:{...bounds},tops:rects(true),surfaces,walls,features};
}
