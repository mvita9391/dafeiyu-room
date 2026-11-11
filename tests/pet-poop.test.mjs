import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePetScene,settlePetPoops,PET_POOP_OFFLINE_CAP} from '../shared/creatures/poop.js';

const pet=(overrides={})=>({petId:'p1',homeSceneId:'yard',...overrides});
const roster={followPetId:'p1',battlePetId:null};
const actor={sceneId:'yard',battle:null};

test('宠物场景由跟随/待命推导',()=>{
 assert.equal(resolvePetScene(pet(),roster,actor),'yard');
 assert.equal(resolvePetScene(pet(),{followPetId:null},actor),'yard');
 assert.equal(resolvePetScene(pet(),roster,{sceneId:'bedroom',battle:null}),'bedroom');
 assert.equal(resolvePetScene(pet(),roster,{sceneId:'yard',battle:{battleId:'b'}}),null);
});

test('第一次结算只建立计时，到期后才生成且离线有上限',()=>{
 const p=pet();
 let result=settlePetPoops({pets:[p],roster,actor,sceneId:'yard',now:1000,random:()=>0});
 assert.equal(result.length,0);
 assert.equal(p.poopSceneId,'yard');
 assert.equal(p.lastPoopAt,1000);
 assert.equal(p.nextPoopAt,241000);
 result=settlePetPoops({pets:[p],roster,actor,sceneId:'yard',now:1000+240000+480000*4,random:()=>0});
 assert.equal(result.length,1);
 assert.equal(result[0].count,PET_POOP_OFFLINE_CAP);
 assert.equal(p.lastPoopAt,1000+240000+480000*4);
});

test('只结算目标场景内的宠物',()=>{
 const yard=pet({petId:'yard-pet',homeSceneId:'yard'});
 const bedroom=pet({petId:'bed-pet',homeSceneId:'bedroom'});
 let result=settlePetPoops({pets:[yard,bedroom],roster:{followPetId:null},actor:{sceneId:'yard',battle:null},sceneId:'yard',now:1000,random:()=>0});
 assert.equal(result.length,0);
 result=settlePetPoops({pets:[yard,bedroom],roster:{followPetId:null},actor:{sceneId:'yard',battle:null},sceneId:'yard',now:241001,random:()=>0});
 assert.equal(result.length,1);
 assert.equal(result[0].pet.petId,'yard-pet');
});

test('离开场景暂停，回来重新计时',()=>{
 const p=pet();
 settlePetPoops({pets:[p],roster,actor,sceneId:'yard',now:1000,random:()=>0});
 // 跟随到卧室：计时切到卧室，不应在院子结算
 settlePetPoops({pets:[p],roster,actor:{sceneId:'bedroom',battle:null},sceneId:'bedroom',now:300000,random:()=>0});
 assert.equal(p.poopSceneId,'bedroom');
 assert.equal(p.lastPoopAt,300000);
 // 回院子：重新建立，不立即补拉
 const back=settlePetPoops({pets:[p],roster,actor,sceneId:'yard',now:600000,random:()=>0});
 assert.equal(back.length,0);
 assert.equal(p.poopSceneId,'yard');
 assert.equal(p.lastPoopAt,600000);
});
