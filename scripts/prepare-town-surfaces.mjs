import {readFileSync,writeFileSync} from 'node:fs';import {registerAuthorScene,authorSurface} from '../shared/world/author-scenes.js';import {getTemplate} from '../shared/world/templates.js';import * as THREE from 'three';
const root=(process.argv[2]||'.cache/town-assets').replace(/\/$/,'')+'/';const assets=new Map(JSON.parse(readFileSync(root+'manifest.json')).assets.map(a=>[a.type,a]));const cache=new Map();
function geometry(type,meshName){if(!cache.has(type)){const b=readFileSync(root+assets.get(type).file),n=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+n));cache.set(type,{g,b,bin:20+n+8});}const {g,b,bin}=cache.get(type);const node=g.nodes.find(n=>n.name===meshName&&n.mesh!==undefined);const trs=new THREE.Matrix4().compose(new THREE.Vector3(),new THREE.Quaternion(...(node.rotation||[0,0,0,1])),new THREE.Vector3(...(node.scale||[1,1,1])));
 const access=id=>{const a=g.accessors[id],v=g.bufferViews[a.bufferView],start=bin+(v.byteOffset||0)+(a.byteOffset||0),width={SCALAR:1,VEC3:3,VEC2:2,VEC4:4}[a.type],size={5126:4,5125:4,5123:2,5121:1}[a.componentType];return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>{const off=start+i*(v.byteStride||width*size)+j*size;return a.componentType===5126?b.readFloatLE(off):a.componentType===5125?b.readUInt32LE(off):a.componentType===5123?b.readUInt16LE(off):b.readUInt8(off);}));};
 return g.meshes[node.mesh].primitives.map(p=>({points:access(p.attributes.POSITION).map(v=>new THREE.Vector3(...v).applyMatrix4(trs)),order:p.indices!==undefined?access(p.indices).flat():null}));}
for(const name of ['Demo_Beach','Demo_Town']){
 const s=JSON.parse(readFileSync(root+name+'.json'));const surfaces=[],allBounds=new THREE.Box3(),landBounds=new THREE.Box3();
 for(const r of s.records){const mat=new THREE.Matrix4().fromArray(r.matrix),bounds=new THREE.Box3();for(const g of geometry(r.type,r.mesh)){const points=g.points.map(v=>v.applyMatrix4(mat));points.forEach(p=>bounds.expandByPoint(p));if(!['Floor','Roads'].includes(r.category))continue;const kind=/sea-mainfloor|town-water/.test(r.type)?'water':/bridge/.test(r.type)?'deck':'land';if(kind!=='water')points.forEach(p=>landBounds.expandByPoint(p));const order=g.order||points.map((_,i)=>i);for(let i=0;i<order.length;i+=3){const a=points[order[i]],b=points[order[i+1]],c=points[order[i+2]],normal=new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize();if(normal.y<.55)continue;surfaces.push({kind,recordId:r.id,type:r.type,vertices:[...a.toArray(),...b.toArray(),...c.toArray()].map(x=>Math.round(x*1e6)/1e6)});}}
 r.bounds={min:bounds.min.toArray(),max:bounds.max.toArray()};if(!/sea-mainfloor/.test(r.type))allBounds.union(bounds);
 }
 s.surfaces=surfaces;s.landBounds={min:landBounds.min.toArray(),max:landBounds.max.toArray()};s.bounds={min:allBounds.min.toArray(),max:allBounds.max.toArray()};writeFileSync(root+name+'.json',JSON.stringify(s));console.log(name,{meshes:s.records.length,surfaces:surfaces.length,landBounds:s.landBounds,bounds:s.bounds});
}

// Derive editable author props and a playable template from the private reconstruction.
{
const path=root+'Demo_Beach.json',data=JSON.parse(readFileSync(path));
// Rail/post top faces are not walkable deck. Keep the actual deck planks and ramps.
data.surfaces=data.surfaces.filter(t=>t.kind!=='deck'||Math.max(t.vertices[1],t.vertices[4],t.vertices[7])<2.2);
registerAuthorScene(data);const height=(x,z)=>authorSurface(data.id,x,z)?.height||0;
const template=getTemplate('courtyard_v1');Object.assign(template,{templateId:'local_author_beach_v1',authorSceneId:data.id,bounds:{x0:-24,x1:24,z0:-21,z1:21},buildBounds:{x0:-23.5,x1:23.5,z0:-20.5,z1:20.5},spawn:[-10,height(-10,0),0],spawnClearance:{x0:-10.5,x1:-9.5,z0:-.5,z1:.5},groundY:1.8,regions:[{zoneId:'author-beach',purpose:'decoration',bounds:{x0:-12,x1:2,z0:-7,z1:7}}],landmarks:[{landmarkId:'beach',name:'作者沙滩',position:[0,height(0,0),0]},{landmarkId:'pier',name:'作者码头',position:[12,height(12,0),0]},{landmarkId:'water',name:'浅海',position:[-19,height(-19,0),0]}],portalSlots:[{slotId:'west',side:'west',position:[-12,height(-12,0),0],inwardNormal:[1,0,0],width:2,landing:[-10,height(-10,0),0],trigger:{x0:-12.5,x1:-11.5,z0:-.6,z1:.6},clearance:{x0:-12.5,x1:-9.5,z0:-1,z1:1}}],staticColliders:data.records.filter(r=>['Buildings','Trees','Stones'].includes(r.category)||r.type==='town-boat').map(r=>({x0:r.bounds.min[0],x1:r.bounds.max[0],z0:r.bounds.min[2],z1:r.bounds.max[2]}))});
data.template=template;writeFileSync(path,JSON.stringify(data));console.log({surfaces:data.surfaces.length,spawn:template.spawn,colliders:template.staticColliders.length});

}
{
const path=root+'Demo_Beach.json',data=JSON.parse(readFileSync(path)),models=new Map(JSON.parse(readFileSync(root+'manifest.json')).assets.map(a=>[a.type,a]));registerAuthorScene(data);
data.authorAssets=[];data.authorEntities=[];
for(const r of data.records.filter(r=>!['Floor','Roads'].includes(r.category))){const type='town-author-beach-'+r.id,position=[(r.bounds.min[0]+r.bounds.max[0])/2,r.bounds.min[1],(r.bounds.min[2]+r.bounds.max[2])/2],base=models.get(r.type);data.authorAssets.push({...base,type,name:r.prefab,label:'原场景 · '+r.prefab,dimensions:r.bounds.max.map((v,i)=>v-r.bounds.min[i]),baseType:r.type,authorRecord:r,authorAnchor:position,authorOffsetY:position[1]-(authorSurface(data.id,position[0],position[2])?.height||0),editorHidden:true,blocking:!['Flowers'].includes(r.category)&&!r.type.includes('cloud')});data.authorEntities.push({entityId:'author-beach-'+r.id,sceneId:'beach-demo',type,position,rotation:0,scale:[1,1,1]});}
data.template.staticColliders=[];data.template.bounds={x0:Math.floor(data.bounds.min[0])-3,x1:Math.ceil(data.bounds.max[0])+3,z0:Math.floor(data.bounds.min[2])-3,z1:Math.ceil(data.bounds.max[2])+3};data.template.buildBounds={...data.template.bounds};writeFileSync(path,JSON.stringify(data));console.log('Editable author entities',data.authorEntities.length,'bounds',data.template.bounds);

}
