import {registerAuthorScene} from '../../shared/world/author-scenes.js';
import {registerLocalTemplate,getTemplate} from '../../shared/world/templates.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {AssetCache,PalettePool} from '../core/asset-cache.js';
import {registerLocalAssets,getCatalogEntry} from '../../shared/world/catalog.js';
export const localExamples=[];
const records=new Map(),loader=new GLTFLoader();
const palettePool=new PalettePool(texture=>{texture.dispose();texture.image?.close?.();});
function sharePalettes(root){const replaced=new Map(),leases=new Map();root.traverse(o=>{for(const material of Array.isArray(o.material)?o.material:o.material?[o.material]:[])for(const [slot,texture]of Object.entries(material)){if(!texture?.isTexture||!['Colors','Colors_Emission','Floor','GlossyColors'].includes(texture.name))continue;
 if(replaced.has(texture)){material[slot]=replaced.get(texture);continue;}
 const key=[texture.name,texture.colorSpace,texture.wrapS,texture.wrapT,texture.minFilter,texture.magFilter].join(':');let lease=leases.get(key);
 if(!lease){lease=palettePool.acquire(key,texture);leases.set(key,lease);}else if(lease.value!==texture){texture.dispose();if(texture.image!==lease.value.image)texture.image?.close?.();}
 lease.value.userData.localPalette=true;replaced.set(texture,lease.value);material[slot]=lease.value;
 }});return ()=>{for(const lease of leases.values())lease.release();};}

function disposeObject(root){const resources=new Set();root.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){resources.add(m);for(const v of Object.values(m))if(v?.isTexture&&!v.userData.localPalette)resources.add(v);}});for(const r of resources)r.dispose();}
function resourceBytes(root){const items=new Set();let bytes=0;root.traverse(o=>{if(o.geometry&&!items.has(o.geometry)){items.add(o.geometry);for(const a of Object.values(o.geometry.attributes))bytes+=a.array.byteLength;bytes+=o.geometry.index?.array.byteLength||0;}for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])for(const t of Object.values(m))if(t?.isTexture&&!t.userData.localPalette&&!items.has(t)){items.add(t);bytes+=(t.image?.width||1)*(t.image?.height||1)*4*4/3;}});return Math.ceil(bytes);}
export const localAssetCache=new AssetCache({load:async type=>{const a=records.get(type);const gltf=await loader.loadAsync('/api/local-assets/'+a.file);gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});const releasePalettes=sharePalettes(gltf.scene);return {root:gltf.scene,releasePalettes,bytes:resourceBytes(gltf.scene)};},dispose:value=>{disposeObject(value.root);value.releasePalettes();}});
Object.defineProperty(localAssetCache.stats,'paletteBytes',{enumerable:true,get:()=>[...palettePool.entries.values()].reduce((sum,e)=>sum+(e.value.image?.width||1)*(e.value.image?.height||1)*4*4/3,0)});
export async function discoverLocalAssets(){
 try{const response=await fetch('/api/local-assets/manifest');if(!response.ok)return [];const manifest=await response.json();localExamples.splice(0,localExamples.length,...(manifest.examples||[]));for(const data of manifest.authorScenes||[]){registerAuthorScene(data);registerLocalAssets({assets:data.authorAssets||[]});for(const a of data.authorAssets||[])records.set(a.type,a);if(data.template)registerLocalTemplate(data.template);}registerLocalAssets({assets:manifest.unavailable||[]});const entries=registerLocalAssets(manifest);for(const a of manifest.assets)records.set(a.type,a);return [...entries,...(manifest.authorScenes||[]).flatMap(d=>(d.authorAssets||[]).map(a=>registerLocalAssets({assets:[a]})[0]))];}catch(error){console.warn('Local asset catalog unavailable',error);return [];}
}
let pendingDiscovery;
function needsLocalMetadata(snapshot){return (snapshot.scenes||[]).some(s=>{try{getTemplate(s.templateId);return false;}catch{return s.templateId?.startsWith('local_');}})||(snapshot.entities||[]).some(e=>{if(!e.type.startsWith('town-'))return false;try{getCatalogEntry(e.type);return false;}catch{return true;}});}
export async function prepareLocalSnapshot(snapshot){
 if(!needsLocalMetadata(snapshot))return;
 pendingDiscovery??=discoverLocalAssets().then(async entries=>{(await import('./props.js')).registerLocalFurniture(entries);}).finally(()=>pendingDiscovery=null);
 await pendingDiscovery;
 if(needsLocalMetadata(snapshot))throw Error('LOCAL_PACK_METADATA_NOT_READY');
}
export function makeLocalAsset(type){
 const group=new THREE.Group(),a=records.get(type);group.userData.localAssetManaged=true;
 const [w,h,d]=a?.dimensions||[1,1,1],placeholder=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:0xd2baa1,transparent:true,opacity:.3,wireframe:true}));placeholder.position.y=h/2;group.add(placeholder);group.userData.assetState='loading';
 let released=false;const lease=a?localAssetCache.acquire(a.baseType||type):null;
 group.userData.releaseLocalAsset=()=>{if(released)return;released=true;lease?.release();placeholder.geometry.dispose();placeholder.material.dispose();group.clear();};
 lease?.promise.then(value=>{if(released)return;group.remove(placeholder);placeholder.geometry.dispose();placeholder.material.dispose();if(a.authorRecord||a.authorRecords){for(const record of a.authorRecords||[a.authorRecord]){const original=(value.root.getObjectByName(record.mesh)||value.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(record.mesh))),mesh=clone(original);mesh.position.set(0,0,0);const holder=new THREE.Group();holder.matrix.multiplyMatrices(new THREE.Matrix4().makeTranslation(...a.authorAnchor.map(v=>-v)),new THREE.Matrix4().fromArray(record.matrix));holder.matrixAutoUpdate=false;holder.userData.authorRecordId=record.id;holder.add(mesh);group.add(holder);}}else group.add(clone(value.root));group.userData.assetState='ready';group.dispatchEvent({type:'assetstate'});}).catch(error=>{if(released)return;group.userData.assetError=String(error);group.userData.assetState='failed';placeholder.material.color.set(0xc86964);group.dispatchEvent({type:'assetstate'});});
 if(!a)group.userData.assetState='missing';return group;
}
export function releaseLocalAssets(root){root.traverse(o=>o.userData.releaseLocalAsset?.());}

// Author scenes reference individual FBX meshes at original Unity pivots. Keep the
// FBX node's axis rotation, discard the editor-only ground-centre translation.
export function hasLocalAsset(type){return records.has(type);}
export function makeAuthorMesh(record){
 const group=new THREE.Group();group.userData.localAssetManaged=true;group.matrix.fromArray(record.matrix);group.matrixAutoUpdate=false;group.userData.assetState='loading';group.userData.authorRecordId=record.id;let released=false;const lease=localAssetCache.acquire(record.type);
 group.userData.releaseLocalAsset=()=>{if(released)return;released=true;lease.release();group.clear();};
 lease.promise.then(value=>{if(released||!value)return;const original=(value.root.getObjectByName(record.mesh)||value.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(record.mesh)));if(!original)throw Error('SOURCE_MESH_MISSING:'+record.mesh);const mesh=clone(original);mesh.position.set(0,0,0);group.add(mesh);group.userData.assetState='ready';}).catch(error=>{if(!released){group.userData.assetState='failed';console.warn(error);}});return group;
}
