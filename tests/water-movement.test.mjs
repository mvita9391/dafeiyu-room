import test from 'node:test';import assert from 'node:assert/strict';
import {poolAt} from '../shared/world/water.js';import {advancePlayer,simulateJump} from '../shared/world/movement.js';
const pool={entityId:'pool',sceneId:'yard',type:'yardPool',position:[0,0,0],rotation:Math.PI/2,scale:[1.2,1,1.2]};
const world={scenes:[{sceneId:'yard',templateId:'courtyard_v1'}],entities:[pool]};
test('water detection matches rotated scaled basin, excluding ladder and shore',()=>{assert.equal(poolAt(world,'yard',[0,0,2])?.entityId,'pool');assert.equal(poolAt(world,'yard',[0,0,4]),undefined);assert.equal(poolAt(world,'yard',[2.2,0,0]),undefined);assert.equal(poolAt(world,'bedroom',[0,0,0]),undefined);});
test('shared player motion swims through water, exits naturally, and still collides with other furniture',()=>{
 let actor={sceneId:'yard',position:[0,0,0],rotation:0};actor=advancePlayer(world,actor,[1,0],50);assert.equal(actor.form,'swim');assert.equal(actor.pose,'swimming');
 const stopped=advancePlayer(world,actor,[0,0],0);assert.equal(stopped.pose,'swimming');
 for(let i=0;i<20;i++)actor=advancePlayer(world,actor,[1,0],50);assert.ok(actor.position[0]>2);assert.equal(actor.form,'normal');
 const blockedWorld={...world,entities:[...world.entities,{entityId:'chair',sceneId:'yard',type:'chair',position:[.65,0,0],rotation:0,scale:[1,1,1]}]};
 actor={sceneId:'yard',position:[0,0,0]};for(let i=0;i<10;i++)actor=advancePlayer(blockedWorld,actor,[1,0],50);assert.ok(actor.position[0]<.15);
});

test('dive toggles in water, survives swimming inputs and clears on land or a jump',()=>{
 const swimmer={sceneId:'yard',position:[0,0,0],grounded:true,form:'swim',pose:'swimming'};
 const diving=advancePlayer(world,swimmer,[0,0],50,false,1,true);
 assert.equal(diving.diving,true);
 assert.equal(advancePlayer(world,diving,[1,0],50).diving,true);
 assert.equal(advancePlayer(world,diving,[0,0],50,false,1,false).diving,false);
 assert.equal(advancePlayer(world,diving,[0,0],50,true).diving,false);
 let actor=diving;
 for(let i=0;i<20;i++)actor=advancePlayer(world,actor,[1,0],50);
 assert.equal(actor.diving,false);
 assert.equal(advancePlayer(world,actor,[0,0],50,false,1,true).diving,false);
});


test('pool jumps keep the whale form until landing, and cannot jump twice in the air',()=>{
 const swimmer={sceneId:'yard',position:[0,0,0],rotation:0,grounded:true,form:'swim',pose:'swimming'};
 let actor=advancePlayer(world,swimmer,[0,0],50,true);
 assert.equal(actor.pose,'jumping');
 assert.equal(actor.form,'swim');
 assert.ok(actor.airHeight>0);
 actor=advancePlayer(world,actor,[0,0],50);
 const secondPress=advancePlayer(world,actor,[0,0],50,true);
 assert.equal(secondPress.jumpStage,1);
 assert.equal(secondPress.airHeight,advancePlayer(world,actor,[0,0],50).airHeight);
 const leap=simulateJump(world,swimmer,[1,0,0]);
 assert.ok(leap.frames.every(frame=>frame.form==='swim'));
 assert.equal(leap.frames.at(-1).pose,'swimming');
 actor=advancePlayer(world,{...swimmer,position:[1.85,0,0]},[1,0],50,true);
 assert.equal(poolAt(world,'yard',actor.position),undefined);
 assert.equal(actor.form,'swim');
 for(let i=0;i<11;i++)actor=advancePlayer(world,actor,[1,0],50);
 assert.equal(actor.grounded,true);
 assert.equal(actor.form,'normal');
 const elsewhere=advancePlayer({...world,entities:[]},swimmer,[0,0],50,true);
 assert.equal(elsewhere.grounded,true);
});
