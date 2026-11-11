import {getSpecies} from './species.js';
import {PET_SKILLS} from './skills.js';
import {statsForInstance} from './stats.js';

export function createBattlePet(instance){
 if(!instance)return null;
 const species=getSpecies(instance.speciesId);
 const stats=statsForInstance(instance);
 const loadout=(instance.skillLoadout?.length?instance.skillLoadout:species.defaultLoadout)
  .map(id=>PET_SKILLS[id]).filter(Boolean);
 return {
  id:'pet',
  name:instance.nickname||species.name,
  speciesId:species.id,
  modelId:species.modelId,
  level:instance.level,
  maxHp:stats.maxHp,
  hp:stats.maxHp,
  attack:stats.attack,
  defense:stats.defense,
  speed:stats.speed,
  skills:loadout.map(move=>({...move})),
 };
}
