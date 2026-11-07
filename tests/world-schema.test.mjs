import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCommand} from '../shared/world/schema.js';
import {getTemplate} from '../shared/world/templates.js';
import {getCatalogEntry, listCatalog} from '../shared/world/catalog.js';
import {furnitureTypes} from '../shared/layout.js';
const op={kind:'scene.create',ref:'new',templateId:'cozy_room_v1',name:'休息室'};
const command={kind:'build.preview',worldId:'world',requestId:'req',payload:{baseRevision:0,ops:[op]}};
test('strict commands reject camera injection at every nesting level and unknown templates',()=>{
 assert.equal(validateCommand(command).ok,true);
 for(const key of ['camera','height','zoom','pitch']) {
  assert.equal(validateCommand({...command,[key]:1}).ok,false);
  assert.equal(validateCommand({...command,payload:{...command.payload,[key]:1}}).ok,false);
  assert.equal(validateCommand({...command,payload:{...command.payload,ops:[{...op,[key]:1}]}}).ok,false);
 }
 assert.equal(validateCommand({...command,payload:{...command.payload,ops:[{...op,templateId:'street'}]}}).ok,false);
});
test('all existing assets have plain JSON footprint, action, anchor and scale contracts',()=>{
 assert.deepEqual(listCatalog().map(x=>x.type).sort(),[...furnitureTypes].sort());
 for(const type of furnitureTypes){const a=getCatalogEntry(type);assert.deepEqual(JSON.parse(JSON.stringify(a)),a);assert.ok(a.footprint.width>0);assert.ok(a.footprint.depth>0);assert.ok(Array.isArray(a.actions));assert.ok(Array.isArray(a.anchors));assert.ok(a.scale.min>0);}
 assert.throws(()=>getCatalogEntry('script'));
});
test('templates expose local regions and inward portal landings outside triggers',()=>{
 for(const id of ['cozy_room_v1','courtyard_v1']){
  const t=getTemplate(id);assert.deepEqual(JSON.parse(JSON.stringify(t)),t);assert.ok(t.regions.length>=4);
  for(const s of t.portalSlots){const [x,,z]=s.landing;assert.ok(x>t.bounds.x0&&x<t.bounds.x1&&z>t.bounds.z0&&z<t.bounds.z1);assert.ok(! (x>=s.trigger.x0&&x<=s.trigger.x1&&z>=s.trigger.z0&&z<=s.trigger.z1));assert.equal(s.inwardNormal[0]*(x-s.position[0])+s.inwardNormal[2]*(z-s.position[2])>0,true);}
 }
 assert.throws(()=>getTemplate('street'));
});
test('catalog support surfaces follow rendered top heights and usable top bounds',()=>{
 const expected={desk:{y:.79,bounds:{x0:.15,x1:.5,z0:-.25,z1:.25}},nightstand:{y:.52,bounds:{x0:-.20,x1:.20,z0:.12,z1:.18}},table:{y:.545,bounds:{x0:-.12,x1:.12,z0:-.25,z1:-.22}},livingTable:{y:.455,bounds:{x0:-.80,x1:.80,z0:-.40,z1:-.25}}};
 for(const [type,{y,bounds}] of Object.entries(expected)){
  const surface=getCatalogEntry(type).anchors.find(a=>a.kind==='support');assert.equal(surface.position[1],y,type);assert.deepEqual(surface.bounds,bounds,type);
 }
});
test('tree footprint encloses the complete rendered canopy',()=>{
 const {width,depth}=getCatalogEntry('yardTree').footprint;
 assert.ok(-width/2<=-.92&&width/2>=.92);assert.ok(-depth/2<=-.76&&depth/2>=.71);
});
