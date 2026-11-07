import test from 'node:test';import assert from 'node:assert/strict';import {RoomEditor} from '../src/ui/room-editor.js';
test('reset requires explicit typed acknowledgement; cancellation never resets',async()=>{
 const previous=globalThis.document;let dialog;
 class Element{constructor(){this.value='';this.children=new Map();this.events={};}setAttribute(){}querySelector(key){if(!this.children.has(key))this.children.set(key,new Element());return this.children.get(key);}addEventListener(name,fn){this.events[name]=fn;}showModal(){this.shown=true;}focus(){}close(){this.closed=true;}remove(){this.removed=true;}set innerHTML(value){this.html=value;this.querySelector('[data-confirm]').disabled=true;}}
 globalThis.document={createElement:()=>dialog=new Element(),body:{append(){}}};
 try{
  let done=false;const first=RoomEditor.prototype.confirmReset.call({context:{label:'院子'}}).then(value=>{done=true;return value;});
  assert.equal(dialog.shown,true);assert.match(dialog.html,/当前自定义家具和摆放修改将被替换/);assert.match(dialog.html,/数据库存档/);assert.equal(dialog.querySelector('[data-scene]').textContent,'操作范围：院子');
  const confirm=dialog.querySelector('[data-confirm]'),input=dialog.querySelector('[data-ack]');assert.equal(confirm.disabled,true);confirm.onclick();await Promise.resolve();assert.equal(done,false);
  input.value='确认';input.oninput();assert.equal(confirm.disabled,true);input.value='恢复默认';input.oninput();assert.equal(confirm.disabled,false);
  dialog.querySelector('[data-cancel]').onclick();assert.equal(await first,false);
  const second=RoomEditor.prototype.confirmReset.call({context:{label:'卧室'}});dialog.querySelector('[data-ack]').value='恢复默认';dialog.querySelector('[data-confirm]').onclick();assert.equal(await second,true);
 }finally{globalThis.document=previous;}
});
test('cancel leaves furniture untouched; confirmation performs one reset',async()=>{
 const calls=[],context={},editor={context,active:false,defaults:[],async setActive(value){this.active=value;calls.push('activate');},select(){calls.push('deselect');},confirmReset:async()=>false,checkpoint:()=>calls.push('checkpoint'),restore:()=>calls.push('restore'),save:()=>calls.push('save')};
 assert.equal(await RoomEditor.prototype.requestReset.call(editor),false);assert.deepEqual(calls,[]);assert.equal(editor.resetPending,false);
 editor.confirmReset=async()=>true;assert.equal(await RoomEditor.prototype.requestReset.call(editor),true);assert.deepEqual(calls,['activate','deselect','checkpoint','restore','save']);
});
