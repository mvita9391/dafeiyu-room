import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePetScene,settlePetPoops,PET_POOP_OFFLINE_CAP,PET_POOP_SPEEDS,petPoopInterval,petPoopSpeed} from '../shared/creatures/poop.js';

const pet=(overrides={})=>({petId:'p1',homeSceneId:'yard',poopSpeed:'fast',...overrides});
const roster={followPetId:'p1',battlePetId:null};
const actor={sceneId:'yard',battle:null};
const FAST=PET_POOP_SPEEDS.fast.intervalMs;

test('拉屎速度映射为快10分钟、中2小时、慢8小时',()=>{
 assert.equal(PET_POOP_SPEEDS.fast.intervalMs,10*60*1000);
 assert.equal(PET_POOP_SPEEDS.normal.intervalMs,2*60*60*1000);
 assert.equal(PET_POOP_SPEEDS.slow.intervalMs,8*60*60*1000);
 assert.equal(petPoopSpeed({}), 'normal');
 assert.equal(petPoopInterval({poopSpeed:'normal'}),2*60*60*1000);
 assert.equal(petPoopInterval({poopSpeed:'slow'}),8*60*60*1000);
});

test('宠物场景由跟随/待命推导',()=>{
 assert.equal(resolvePetScene(pet(),roster,actor),'yard');
 assert.equal(resolvePetScene(pet(),{followPetId:null},actor),'yard');
 assert.equal(resolvePetScene(pet(),roster,{sceneId:'bedroom',battle:null}),'bedroom');
 assert.equal(resolvePetScene(pet(),roster,{sceneId:'yard',battle:{battleId:'b'}}),null);
});

test('第一次结算只建立计时，到期后才生成且离线有上限',()=>{
 const p=pet();
 let result=settlePetPoops({pets:[p],roster,actor,sceneId:'yard',now:1000});
 assert.equal(result.length,0);
 assert.equal(p.poopSceneId,'yard');
 assert.equal(p.lastPoopAt,1000);
 assert.equal(p.nextPoopAt,1000+FAST);
 result=settlePetPoops({pets:[p],roster,actor,sceneId:'yard',now:1000+FAST*10});
 assert.equal(result.length,1);
 assert.equal(result[0].count,PET_POOP_OFFLINE_CAP);
 assert.equal(p.lastPoopAt,1000+FAST*10);
});

test('中速/慢速使用各自的间隔',()=>{
 const normal=pet({petId:'normal',poopSpeed:'normal'});
 const slow=pet({petId:'slow',poopSpeed:'slow'});
 settlePetPoops({pets:[normal,slow],roster:{followPetId:null},actor,sceneId:'yard',now:1000});
 assert.equal(normal.nextPoopAt,1000+2*60*60*1000);
 assert.equal(slow.nextPoopAt,1000+8*60*60*1000);
 let result=settlePetPoops({pets:[normal,slow],roster:{followPetId:null},actor,sceneId:'yard',now:1000+10*60*1000});
 assert.equal(result.length,0);
 result=settlePetPoops({pets:[normal,slow],roster:{followPetId:null},actor,sceneId:'yard',now:1000+2*60*60*1000});
 assert.deepEqual(result.map(entry=>entry.pet.petId),['normal']);
});

test('只结算目标场景内的宠物',()=>{
 const yard=pet({petId:'yard-pet',homeSceneId:'yard'});
 const bedroom=pet({petId:'bed-pet',homeSceneId:'bedroom'});
 let result=settlePetPoops({pets:[yard,bedroom],roster:{followPetId:null},actor:{sceneId:'yard',battle:null},sceneId:'yard',now:1000});
 assert.equal(result.length,0);
 result=settlePetPoops({pets:[yard,bedroom],roster:{followPetId:null},actor:{sceneId:'yard',battle:null},sceneId:'yard',now:1000+FAST+1});
 assert.equal(result.length,1);
 assert.equal(result[0].pet.petId,'yard-pet');
});

test('离开场景暂停，回来重新计时',()=>{
 const p=pet();
 settlePetPoops({pets:[p],roster,actor,sceneId:'yard',now:1000});
 settlePetPoops({pets:[p],roster,actor:{sceneId:'bedroom',battle:null},sceneId:'bedroom',now:300000});
 assert.equal(p.poopSceneId,'bedroom');
 assert.equal(p.lastPoopAt,300000);
 const back=settlePetPoops({pets:[p],roster,actor,sceneId:'yard',now:600000});
 assert.equal(back.length,0);
 assert.equal(p.poopSceneId,'yard');
 assert.equal(p.lastPoopAt,600000);
});

test('旧宠物没有速度字段时迁移为中档并重算下一次',()=>{
 const p=pet({poopSpeed:undefined,poopSceneId:'yard',lastPoopAt:1000,nextPoopAt:2000});
 const result=settlePetPoops({pets:[p],roster:{followPetId:null},actor,sceneId:'yard',now:5000});
 assert.equal(result.length,0);
 assert.equal(p.poopSpeed,'normal');
 assert.equal(p.lastPoopAt,5000);
 assert.equal(p.nextPoopAt,5000+2*60*60*1000);
});
