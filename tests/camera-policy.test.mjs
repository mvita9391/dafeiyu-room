import test from 'node:test';
import assert from 'node:assert/strict';
import {IsoCamera,bindCameraWheel} from '../src/core/camera.js';
import {cameraPolicyFor} from '../shared/world/policies.js';
globalThis.window={innerWidth:1200,innerHeight:800};
test('outdoor wheel raises or lowers the camera except while rotating selected furniture',()=>{
 const canvas=new EventTarget(),editor={active:true,selected:{}},c=new IsoCamera();c.setProfile('local_author_town_v1');c.setView(c.target,.7);c.zoom=c.zoomTarget=.7;c.update(.1);const height=c.camera.position.y,pitch=c.el;
 const unbind=bindCameraWheel(canvas,c,()=>editor);let rotations=0;canvas.addEventListener('wheel',e=>{if(editor.selected){rotations++;e.preventDefault();}});
 const scroll=delta=>{const e=new Event('wheel',{cancelable:true});Object.assign(e,{deltaY:delta,deltaMode:0});canvas.dispatchEvent(e);return e;};
 scroll(-120);assert.equal(rotations,1);assert.equal(c.zoomTarget,.7);
 editor.selected=null;assert.equal(scroll(-120).defaultPrevented,true);for(let i=0;i<80;i++)c.update(.1);assert.ok(c.camera.position.y<height);assert.equal(c.el,pitch);assert.equal(rotations,1);
 for(let i=0;i<40;i++)scroll(120);for(let i=0;i<80;i++)c.update(.1);assert.equal(c.zoomTarget,.35);assert.ok(c.camera.position.y>height);
 for(let i=0;i<40;i++)scroll(-120);assert.equal(c.zoomTarget,1.5);unbind();
});
test('immutable profiles survive pointer drag resize follow and 100 scene switches',()=>{
 const c=new IsoCamera();const p=cameraPolicyFor('cozy_room_v1');assert.ok(Object.isFrozen(p));assert.equal(p.az,Math.PI/4);
 let expected;
 for(let i=0;i<100;i++){
  const outdoor=i%2===1;c.setProfile(outdoor?'courtyard_v1':'cozy_room_v1');c.setPointer(1,-1);c.addDrag(.5);window.innerWidth=400+i*13;c.resize();c.follow({x:i,y:90,z:-i},.1,true);c.update(.1);
  const height=c.camera.position.y;
  expected??=height;assert.ok(Math.abs(height-expected)<1e-10);assert.equal(c.el,p.el);if(!outdoor){assert.ok(c.drag>0);assert.ok(c.drag<=p.horizontalDragLimit);}else assert.ok(c.drag>0);
 }
});

test('indoor left drag has a bounded horizontal sway while height and pitch stay fixed',()=>{
 const c=new IsoCamera();c.update(.1);const height=c.camera.position.y,pitch=c.el;
 c.addDrag(100);for(let i=0;i<100;i++)c.update(.1);
 assert.ok(c.drag>0&&c.drag<=Math.PI*8/180+1e-10);assert.equal(c.camera.position.y,height);assert.equal(c.el,pitch);
 c.addDrag(-200);for(let i=0;i<100;i++)c.update(.1);
 assert.ok(c.drag<0&&c.drag>=-Math.PI*8/180-1e-10);assert.equal(c.camera.position.y,height);
 c.setProfile('courtyard_v1');c.addDrag(Math.PI);for(let i=0;i<100;i++)c.update(.1);assert.ok(c.drag>3);
 c.setProfile('cozy_room_v1');assert.equal(c.drag,0);assert.equal(c.dragTarget,0);
});

test('local author overview keeps near foreground within the orthographic depth range',async()=>{
 const THREE=await import('three');const c=new IsoCamera();c.setProfile('local_author_town_v1');c.target.set(12,2,24);c.groundTargetY=2;c.zoom=c.zoomTarget=.23;c.update(.1);c.camera.updateMatrixWorld(true);for(const p of [[35,2,60],[55,2,65],[-30,2,-20]]){const projected=new THREE.Vector3(...p).project(c.camera);assert.ok(projected.z>=-1&&projected.z<=1,`source point ${p} must not be depth-clipped`);}
});

test('author ground picking remains accurate with the deeper local camera',async()=>{
 const THREE=await import('three');const{registerAuthorScene}=await import('../shared/world/author-scenes.js');const{registerLocalTemplate,getTemplate}=await import('../shared/world/templates.js');const{RoomEditor}=await import('../src/ui/room-editor.js');registerAuthorScene({id:'Demo_Ray',surfaces:[{kind:'land',vertices:[-5,2,-5,-5,2,5,5,2,-5]},{kind:'land',vertices:[5,2,5,5,2,-5,-5,2,5]}]});registerLocalTemplate({...getTemplate('courtyard_v1'),templateId:'local_ray_test',authorSceneId:'Demo_Ray'});const c=new IsoCamera();c.setProfile('local_ray_test');c.target.set(0,2,0);c.groundTargetY=2;c.update(.1);c.camera.updateMatrixWorld(true);const point=RoomEditor.prototype.ground.call({camera:c.camera,context:{templateId:'local_ray_test'},canvas:{getBoundingClientRect:()=>({left:0,top:0,width:1200,height:800})},ray:new THREE.Raycaster()},{clientX:600,clientY:400});assert.ok(point);assert.equal(point.y,2);assert.ok(Math.hypot(point.x,point.z)<.08);
});
