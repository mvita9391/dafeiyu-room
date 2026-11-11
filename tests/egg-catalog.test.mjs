import test from 'node:test';
import assert from 'node:assert/strict';
import {EGG_CATALOG_VERSION,initialEggs,upgradeEggs,createEgg} from '../shared/creatures/eggs.js';

const catalog=[
 {eggId:'starter',speciesId:'baize',grantVersion:1,initial:true,grantToExisting:false},
 {eggId:'event',speciesId:'fish-bowl',grantVersion:2,initial:false,grantToExisting:true},
 {eggId:'limited',speciesId:'baize',grantVersion:2,initial:false,grantToExisting:false},
];

test('新玩家初始蛋只包含 initial 条目',()=>{
 const eggs=initialEggs(1000,catalog);
 assert.equal(eggs.length,1);
 assert.equal(eggs[0].eggId,'starter');
 assert.equal(eggs[0].hatched,false);
});

test('版本升级只补 grantToExisting 的新蛋，保留已孵化蛋且不重复',()=>{
 const existing=[{...createEgg(catalog[0],1000),hatched:true}];
 const upgraded=upgradeEggs(existing,1,2000,catalog);
 assert.deepEqual(upgraded.map(egg=>egg.eggId),['starter','event']);
 assert.equal(upgraded[0].hatched,true);
 const again=upgradeEggs(upgraded,1,3000,catalog);
 assert.equal(again.filter(egg=>egg.eggId==='event').length,1);
});

test('从版本 0 升级不会补发仅新玩家可见的蛋',()=>{
 const upgraded=upgradeEggs([],0,1000,catalog);
 assert.deepEqual(upgraded.map(egg=>egg.eggId),['event']);
 assert.equal(EGG_CATALOG_VERSION,1);
});
