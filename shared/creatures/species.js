// 物种/怪物库：宠物和野生单位共用。新增物种只需要在这里加配置。
import {PET_SKILLS} from './skills.js';
export const SPECIES={
 baize:{
  id:'baize',name:'白泽',modelId:'baize',element:'ice',tags:['pet','wild'],
  baseStats:{hp:54,attack:20,defense:12,speed:14},
  growth:{hp:4,attack:2,defense:1,speed:1},
  skillPool:['frost','storm','guard'],defaultLoadout:['frost','storm','guard'],
  battleAi:{rotation:['frost','storm']},
 },
 'baize-wild':{
  id:'baize-wild',name:'野生白泽',modelId:'baize',element:'ice',tags:['wild'],
  baseStats:{hp:64,attack:20,defense:10,speed:12},
  growth:{hp:4,attack:2,defense:1,speed:1},
  skillPool:['frost','storm'],defaultLoadout:['frost','storm'],
  battleAi:{rotation:['frost','storm']},
 },
 'fish-bowl':{
  id:'fish-bowl',name:'缸盆小鱼',modelId:'fish-bowl',element:'water',tags:['pet'],
  baseStats:{hp:42,attack:17,defense:10,speed:12},
  growth:{hp:3,attack:2,defense:1,speed:1},
  skillPool:['tackle','waterJet','guard'],defaultLoadout:['tackle','waterJet','guard'],
  battleAi:{rotation:['waterJet','tackle']},
 },
};
export const PET_SPECIES={
 baize:{name:SPECIES.baize.name,skills:['frost','storm'],wildRotation:SPECIES.baize.battleAi.rotation},
 'baize-wild':{name:SPECIES['baize-wild'].name,skills:['frost','storm'],wildRotation:SPECIES['baize-wild'].battleAi.rotation},
 'fish-bowl':{name:SPECIES['fish-bowl'].name,skills:SPECIES['fish-bowl'].defaultLoadout,wildRotation:SPECIES['fish-bowl'].battleAi.rotation},
};
export function getSpecies(id='baize'){return SPECIES[id]??SPECIES.baize;}
export function speciesSkills(id='baize'){
 const species=getSpecies(id);
 return species.defaultLoadout.map(skillId=>PET_SKILLS[skillId]).filter(Boolean);
}
