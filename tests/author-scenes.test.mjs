import test from 'node:test';import assert from 'node:assert/strict';
import {registerAuthorScene,authorSurface} from '../shared/world/author-scenes.js';
test('author triangle sampler interpolates slopes and selects deck above water without making holes walkable',()=>{
 registerAuthorScene({id:'Demo_Test',surfaces:[{kind:'water',vertices:[0,0,0,0,0,4,4,0,0]},{kind:'deck',vertices:[0,1,0,0,2,2,2,1,0]}]});assert.deepEqual(authorSurface('Demo_Test',.5,1),{height:1.5,kind:'deck'});assert.equal(authorSurface('Demo_Test',3,.2).kind,'water');assert.equal(authorSurface('Demo_Test',10,10),null);
});

test('author surfaces use the same water, jump and bridge-side rules as the player',async()=>{
 const {registerLocalTemplate,getTemplate}=await import('../shared/world/templates.js');const {surfaceSegment}=await import('../shared/world/coastal.js');const {waterPose}=await import('../shared/world/water.js');const {advancePlayer}=await import('../shared/world/movement.js');
 registerAuthorScene({id:'Demo_Movement',surfaces:[{kind:'water',vertices:[-5,0,-5,-5,0,5,5,0,-5]},{kind:'land',vertices:[-2,1,-2,-2,1,2,2,1,-2]},{kind:'deck',vertices:[2,1,-2,2,1,0,4,1,-2]}]});const t={...getTemplate('courtyard_v1'),templateId:'local_test_beach',authorSceneId:'Demo_Movement'};registerLocalTemplate(t);const s={scenes:[{sceneId:'demo',templateId:t.templateId}],entities:[]},a={sceneId:'demo',position:[-1,1,-1],grounded:true,form:'normal'};
 assert.equal(waterPose(s,{...a,position:[-4,0,-4]}).form,'swim');assert.equal(waterPose(s,a).form,'normal');assert.equal(surfaceSegment(t,[3,0,-3],[3,1,-1]),false);const moved=advancePlayer(s,a,[1,0],50,true);assert.ok(moved.position[0]>-1);assert.equal(moved.pose,'jumping');assert.ok(moved.airHeight>0);
});

test('author Beach installation appends stable editable props and preserves existing worlds',async()=>{
 const {buildServer}=await import('../server/app.js');const {installAuthorBeach}=await import('../server/world/author-beach.js');const {registerLocalTemplate,getTemplate}=await import('../shared/world/templates.js');
 const t={...getTemplate('courtyard_v1'),templateId:'local_test_author_install'};registerLocalTemplate(t);const app=await buildServer({databasePath:':memory:',worldMode:true,startRuntime:false});try{const before=app.worldService.readSnapshot('default');const entity={entityId:'author-test-prop',sceneId:'beach-demo',type:'plant',position:[0,0,0],rotation:0,scale:[1,1,1]},manifest={assets:[{}],authorScenes:[{id:'Demo_Beach',template:t,authorEntities:[entity]}]};assert.equal(installAuthorBeach(app.worldService,manifest).installed,true);const after=app.worldService.readSnapshot('default');assert.deepEqual(after.entities.slice(0,before.entities.length),before.entities);assert.deepEqual(after.portals.slice(0,before.portals.length),before.portals);assert.deepEqual(after.entities.at(-1),entity);assert.equal(installAuthorBeach(app.worldService,manifest).installed,false);}finally{await app.close();}
});

test('author contact sampler closes millimetre mesh seams without bridging real gaps',()=>{
 registerAuthorScene({id:'Demo_Seam',surfaces:[{kind:'water',vertices:[-5,0,-5,-5,0,5,5,0,-5]},{kind:'land',vertices:[0,2,0,0,2,2,2,2,2]},{kind:'deck',vertices:[0,2,2.01,0,2,4,2,2,2.01]}]});assert.equal(authorSurface('Demo_Seam',.5,2.005).height,2);assert.equal(authorSurface('Demo_Seam',-2,1).kind,'water');
});
