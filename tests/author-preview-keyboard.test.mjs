import test from 'node:test';import assert from 'node:assert/strict';
import {bindAuthorPreviewKeyboard} from '../src/ui/author-examples.js';
test('preview keyboard captures movement and release while scene data is still pending',()=>{
 const dialog=new EventTarget(),pans=[];bindAuthorPreviewKeyboard(dialog,d=>pans.push(d));
 const key=(type,code)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'code',{value:code});dialog.dispatchEvent(e);return e;};
 for(const code of ['KeyW','KeyA','KeyS','KeyD','Space']){const down=key('keydown',code);assert.equal(down.cancelBubble,true,code+' down must not reach game');assert.equal(down.defaultPrevented,true);const up=key('keyup',code);assert.equal(up.cancelBubble,true,code+' release must not reach game');}
 assert.deepEqual(pans,[[0,-2],[-2,0],[0,2],[2,0]]);const escape=key('keydown','Escape');assert.equal(escape.cancelBubble,true);assert.equal(escape.defaultPrevented,false,'native dialog Escape close remains available');
});
