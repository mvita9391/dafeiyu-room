import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildProps, FURNITURE } from '../src/world/props.js';
import { RoomEditor, FURNITURE_CATEGORIES } from '../src/ui/room-editor.js';
const gradient={addColorStop(){}};
const ctx=new Proxy({}, {get:(_,key)=>key==='getImageData'?(_x,_y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}):key==='createRadialGradient'||key==='createLinearGradient'?()=>gradient:key==='measureText'?()=>({width:10}):()=>{},set:()=>true});
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
globalThis.localStorage={setItem(){}};
const props=buildProps();
const editor=Object.assign(Object.create(RoomEditor.prototype), {
 group:props.group, history:[], selected:null,
 outline:{setFromObject(){},visible:false}, status:{}, onChange(){},
});
const original=editor.snapshot();
assert.equal(original.length,12);
assert.ok(editor.validate(original));
editor.restore(JSON.parse(JSON.stringify(original)));
assert.deepEqual(editor.snapshot(),original,'save/load must preserve every transform');
for(const type of Object.keys(FURNITURE)) {
 editor.add(type);assert.equal(editor.selected.userData.furnitureType,type);
 const before=editor.snapshot();editor.rotate();assert.equal(editor.selected.rotation.y,before.at(-1).rotation+Math.PI/2);
 editor.undo();assert.deepEqual(editor.snapshot(),before);
 editor.select(editor.items().at(-1));editor.remove();editor.undo();assert.deepEqual(editor.snapshot(),before);
}
assert.equal(editor.validate([{...original[0],type:'__proto__'}]),false);
assert.equal(editor.validate([{...original[0],position:[Infinity,0,0]}]),false);
assert.throws(()=>editor.restore([{type:'bad'}]));
editor.restore(original);assert.deepEqual(editor.snapshot(),original);
const bed=editor.items().find(o=>o.userData.furnitureType==='bed');
bed.position.set(1,0,1);bed.rotation.y=Math.PI/2;bed.updateWorldMatrix(true,false);
const anchor=bed.localToWorld(new THREE.Vector3(.21,.84,.24));assert.ok(Math.abs(anchor.x-1.24)<1e-6);assert.ok(Math.abs(anchor.z-.79)<1e-6);
console.log('PASS: all 11 furniture types add/rotate/delete/undo; transforms round-trip; invalid saves rejected; rotated bed anchor follows');

const classified=Object.entries(FURNITURE_CATEGORIES).filter(([k])=>k!=='全部').flatMap(([,v])=>v).filter(type=>Object.hasOwn(FURNITURE,type));
assert.deepEqual([...classified].sort(),Object.keys(FURNITURE).sort(),'each furniture type appears in exactly one category');
editor.select(editor.items()[0]);const angle=editor.selected.rotation.y;editor.rotate(Math.PI/12);assert.ok(Math.abs(editor.selected.rotation.y-angle-Math.PI/12)<1e-8);
console.log('PASS: categories cover all furniture; 15-degree rotation works');

let placement=false;
editor.panel={hidden:false,classList:{toggle(_name,value){placement=value;}}};editor.active=true;
editor.select(editor.items()[0]);assert.equal(editor.panel.hidden,false);assert.equal(placement,true);
editor.select(null);assert.equal(editor.panel.hidden,false);assert.equal(placement,false);
editor.active=false;editor.select(null);assert.equal(editor.panel.hidden,true);
console.log('PASS: selecting furniture switches to a compact panel while editing');
const previewEditor=Object.assign(Object.create(RoomEditor.prototype),{worldClient:{},registry:{scenes:new Map([['yard',{draft:false}]])},context:{sceneId:'yard',bounds:{x0:-8,x1:8,z0:-8,z1:8}},group:new THREE.Group(),history:[],outline:{visible:false,setFromObject(){}},save(){throw Error('catalog selection must not auto-save before placement');}});
previewEditor.add('yardPicnicTable');assert.equal(previewEditor.selected.userData.furnitureType,'yardPicnicTable');assert.equal(previewEditor.items().length,1);assert.equal(previewEditor.registry.scenes.get('yard').draft,true);
console.log('PASS: new picnic table remains an editable preview until explicit placement');
const blockedExit=Object.assign(Object.create(RoomEditor.prototype),{active:true,worldClient:{dispatch(){throw Error('must not unlock with rejected draft');}},sync:{pending:{},error:Error('SPAWN_BLOCKED'),async flush(){}},finishDrag(){},save(){},refreshState(){}});
await blockedExit.setActive(false);assert.equal(blockedExit.active,true);
console.log('PASS: rejected furniture cannot be silently left behind by finishing edit mode');
