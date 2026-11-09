import test from 'node:test';
import assert from 'node:assert/strict';
import {advancePlayer} from '../shared/world/movement.js';
import {PICNIC_TOP_Y} from '../shared/world/yard-platforms.js';

const world={scenes:[{sceneId:'yard',templateId:'courtyard_v1'}],entities:[
 {entityId:'picnic',sceneId:'yard',type:'yardPicnicTable',position:[0,0,0],rotation:0,scale:[1,1,1]},
 {entityId:'umbrella',sceneId:'yard',type:'yardUmbrella',position:[-2.5,0,0],rotation:0,scale:[1,1,1]},
]};
const step=(actor,x=0,jump=false)=>advancePlayer(world,actor,[x,0],50,jump);

test('a picnic table and adjacent umbrella support standing, jumping and stepping off',()=>{
 let actor={sceneId:'yard',position:[1.34,0,0],grounded:true};
 assert.equal(step({...actor,position:[1.07,0,0]},-1).position[0],1.07);
 for(let i=0;i<9;i++)actor=step(actor,-1,i===0);
 assert.equal(actor.position[1],PICNIC_TOP_Y);
 assert.equal(actor.grounded,true);
 assert.equal(step(actor).position[1],PICNIC_TOP_Y);
 while(actor.position[0]>-.49)actor=step(actor,-1);
 for(let i=0;i<14;i++)actor=step(actor,-1,i===0||i===6);
 assert.ok(actor.position[1]>2.25);
 assert.equal(actor.grounded,true);
 for(let i=0;i<25;i++)actor=step(actor,-1);
 assert.equal(actor.position[1],0);
 assert.equal(actor.supportHeight,0);
 assert.equal(actor.grounded,true);
});

test('the benches give a forgiving route up the picnic table from the side',()=>{
 let actor={sceneId:'yard',position:[0,0,1.16],grounded:true};
 for(let i=0;i<14;i++)actor=advancePlayer(world,actor,i<5?[0,-1]:[0,0],50,i===0);
 assert.equal(actor.position[1],.50);
 assert.equal(actor.grounded,true);
 for(let i=0;i<14;i++)actor=advancePlayer(world,actor,i<6?[0,-1]:[0,0],50,i===0);
 assert.equal(actor.position[1],PICNIC_TOP_Y);
 assert.equal(actor.grounded,true);
});
