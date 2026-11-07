import test from 'node:test';import assert from 'node:assert/strict';
import {poolAt} from '../shared/world/water.js';import {advancePlayer} from '../shared/world/movement.js';
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
