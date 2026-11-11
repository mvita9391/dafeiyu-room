import {getSpecies} from './species.js';

export const PET_BOND_MAX=100;
export const PET_BOND_HOURLY_CAP=10;
export const PET_BOND_GAIN=1;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

/** 派生属性不持久化：等级/羁绊/进化变化后实时重算。 */
export function deriveStats(speciesId='baize',level=1,bond=0,evolved=false){
 const species=getSpecies(speciesId);
 const lv=Math.max(1,Math.floor(Number(level)||1));
 const bondBonus=clamp(Number(bond)||0,0,PET_BOND_MAX)/PET_BOND_MAX;
 const evo=evolved?1.12:1;
 const value=(key)=>{
  const base=species.baseStats[key]??0;
  const growth=species.growth[key]??0;
  return Math.max(1,Math.round((base+growth*(lv-1))*(1+bondBonus*0.08)*evo));
 };
 return {maxHp:value('hp'),attack:value('attack'),defense:value('defense'),speed:value('speed')};
}

export function statsForInstance(instance){
 return deriveStats(instance.speciesId,instance.level,instance.bond,instance.evolved);
}
