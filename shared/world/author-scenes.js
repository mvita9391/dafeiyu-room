// Optional user-supplied author scenes: identical triangle sampling on client/server.
const scenes=new Map();
export function checkpointAuthorScenes(){const saved=new Map(scenes);return()=>{scenes.clear();for(const[key,value]of saved)scenes.set(key,value);};}
export function registerAuthorScene(data){
 if(!data||!/^Demo_[A-Za-z0-9_-]+$/.test(data.id)||!Array.isArray(data.surfaces))throw Error('INVALID_AUTHOR_SCENE');
 const cells=new Map();for(const t of data.surfaces){if(!['land','water','deck'].includes(t.kind)||t.vertices?.length!==9||!t.vertices.every(Number.isFinite))throw Error('INVALID_AUTHOR_SURFACE');const v=t.vertices;for(let x=Math.floor((Math.min(v[0],v[3],v[6])-.02)/2);x<=Math.floor((Math.max(v[0],v[3],v[6])+.02)/2);x++)for(let z=Math.floor((Math.min(v[2],v[5],v[8])-.02)/2);z<=Math.floor((Math.max(v[2],v[5],v[8])+.02)/2);z++){const key=`${x},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(t);}}
 const heights=data.surfaces.flatMap(t=>[t.vertices[1],t.vertices[4],t.vertices[7]]);scenes.set(data.id,{data,cells,heightRange:heights.length?[Math.min(...heights),Math.max(...heights)]:[0,0]});return data;
}
export function authorHeightRange(id){return scenes.get(id)?.heightRange;}
export function getAuthorScene(id){return scenes.get(id)?.data;}
export function authorSurface(id,x,z){
 const scene=scenes.get(id);if(!scene)return null;let best=null;
 for(const {vertices:v,kind}of scene.cells.get(`${Math.floor(x/2)},${Math.floor(z/2)}`)||[]){const den=(v[5]-v[8])*(v[0]-v[6])+(v[6]-v[3])*(v[2]-v[8]);if(Math.abs(den)<1e-9)continue;const a=((v[5]-v[8])*(x-v[6])+(v[6]-v[3])*(z-v[8]))/den,b=((v[8]-v[2])*(x-v[6])+(v[0]-v[6])*(z-v[8]))/den;let weights=[a,b,1-a-b];if(weights.some(w=>w< -1e-6)){weights=weights.map(w=>Math.max(0,w));const sum=weights.reduce((a,b)=>a+b,0);weights=weights.map(w=>w/sum);const px=weights[0]*v[0]+weights[1]*v[3]+weights[2]*v[6],pz=weights[0]*v[2]+weights[1]*v[5]+weights[2]*v[8];if(Math.hypot(px-x,pz-z)>.02)continue;}const height=v[1]+weights[1]*(v[4]-v[1])+weights[2]*(v[7]-v[1]);if(!best||height>best.height+1e-5||(Math.abs(height-best.height)<1e-5&&kind!=='water'))best={height,kind};}
 return best;
}
