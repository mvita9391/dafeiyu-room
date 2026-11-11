import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SPECIES,getSpecies} from '../shared/creatures/species.js';
import {deriveStats} from '../shared/creatures/stats.js';
import {createPetInstance,normalizePetInstance,normalizeSkills} from '../shared/creatures/instance.js';
import {createRoster,setFollowPet,setBattlePet} from '../shared/creatures/roster.js';
import {createBattlePet} from '../shared/creatures/battle-projection.js';
import {createBaizeBattle,unitSkills,chooseBaizeOrder} from '../shared/world/baize-battle.js';

test('物种库包含白泽、缸盆小鱼和野生变体，均有属性与技能',()=>{
 assert.equal(getSpecies('baize').name,'白泽');
 assert.equal(getSpecies('fish-bowl').name,'缸盆小鱼');
 assert.equal(getSpecies('baize-wild').name,'野生白泽');
 for(const species of Object.values(SPECIES)){
  assert.ok(species.baseStats.hp>0);
  assert.ok(species.baseStats.attack>0);
  assert.ok(species.defaultLoadout.length>0);
 }
});

test('属性随等级、羁绊和进化变化，缸盆小鱼与白泽不同',()=>{
 const low=deriveStats('baize',1,0,false);
 const high=deriveStats('baize',10,100,true);
 assert.ok(high.maxHp>low.maxHp);
 assert.ok(high.attack>low.attack);
 const fish=deriveStats('fish-bowl',1,0,false);
 assert.notEqual(fish.maxHp,low.maxHp);
 assert.notEqual(fish.attack,low.attack);
});

test('宠物实例规范化未知物种、技能和家园坐标',()=>{
 const pet=normalizePetInstance({petId:'pet-fish',speciesId:'fish-bowl',nickname:'小鱼',level:3,bond:250,learnedSkills:['waterJet','unknown'],skillLoadout:['waterJet','unknown'],homePosition:[1,2,3]},'whale');
 assert.equal(pet.speciesId,'fish-bowl');
 assert.equal(pet.level,3);
 assert.equal(pet.bond,100);
 assert.deepEqual(pet.homePosition,[1,2,3]);
 assert.deepEqual(pet.learnedSkills,['waterJet']);
 assert.deepEqual(pet.skillLoadout,['waterJet']);
 assert.equal(normalizePetInstance({petId:'x',speciesId:'missing'},'whale'),null);
 assert.deepEqual(normalizeSkills('baize',[],[]).skillLoadout,['frost','storm','guard']);
});

test('名册只保留属于自己的宠物，跟随/出战唯一',()=>{
 const a=createPetInstance({petId:'a',ownerId:'whale',speciesId:'baize'});
 const b=createPetInstance({petId:'b',ownerId:'whale',speciesId:'fish-bowl'});
 const other=createPetInstance({petId:'c',ownerId:'other',speciesId:'baize'});
 const instances={a,b,c:other};
 let roster=createRoster('a','b');
 assert.equal(roster.followPetId,'a');
 roster=setFollowPet(roster,'b',instances,'whale');
 assert.equal(roster.followPetId,'b');
 roster=setFollowPet(roster,'c',instances,'whale');
 assert.equal(roster.followPetId,null);
 roster=setBattlePet(roster,'a',instances,'whale');
 assert.equal(roster.battlePetId,'a');
 roster=setBattlePet(roster,'c',instances,'whale');
 assert.equal(roster.battlePetId,null);
});

test('战斗投影使用出战宠物的 HP/攻击/技能',()=>{
 const baize=createPetInstance({petId:'p1',ownerId:'whale',speciesId:'baize',level:1});
 const fish=createPetInstance({petId:'p2',ownerId:'whale',speciesId:'fish-bowl',level:1});
 const baizeBattle=createBattlePet(baize);
 const fishBattle=createBattlePet(fish);
 assert.equal(baizeBattle.maxHp,deriveStats('baize',1,0,false).maxHp);
 assert.equal(fishBattle.maxHp,deriveStats('fish-bowl',1,0,false).maxHp);
 assert.ok(baizeBattle.skills.some(move=>move.id==='frost'));
 assert.ok(fishBattle.skills.some(move=>move.id==='waterJet'));
 const battle=createBaizeBattle('fish-battle',1000,{pet:fishBattle});
 assert.equal(battle.units.pet.name,'缸盆小鱼');
 assert.equal(battle.units.pet.maxHp,fishBattle.maxHp);
 assert.ok(unitSkills(battle.units.pet).some(move=>move.id==='waterJet'));
 assert.throws(()=>chooseBaizeOrder(battle,{unitId:'pet',choice:'frost',target:'wild'},1000),/BATTLE_MOVE_INVALID/);
});
