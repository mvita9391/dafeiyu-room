import {SPELLS} from '../world/spells.js';

export const PET_ELEMENTS={
 normal:{label:'普通',color:'#d8dfd3'},
 ice:{label:'冰',color:'#99e9ff'},
 fire:{label:'火',color:'#ffad87'},
 water:{label:'水',color:'#80cfff'},
 earth:{label:'土',color:'#eac199'},
 thunder:{label:'雷',color:'#cdb7ff'},
 grass:{label:'草',color:'#aee38e'},
 light:{label:'光',color:'#ffe7a0'},
};

const spells=Object.fromEntries(SPELLS.map(spell=>[spell.id,spell]));
const magic=(id,element,power,uses,effect=spells[id])=>({
 id,name:effect.label,element,kind:'attack',power,uses,effect,
 animationSlot:'attack',
});
export const PET_SKILLS={
 tackle:{id:'tackle',name:'撞击',element:'normal',kind:'attack',power:12,uses:null,animationSlot:'attack'},
 horn:{id:'horn',name:'角突',element:'normal',kind:'attack',power:20,uses:3,animationSlot:'attack'},
 guard:{id:'guard',name:'守势',element:'normal',kind:'guard',uses:null,animationSlot:'idle'},
 breathe:{id:'breathe',name:'调息',element:'normal',kind:'heal',power:14,uses:2,animationSlot:'idle'},
 frost:magic('frost','ice',18,3),
 crown:{...magic('crown','ice',23,2),targetMode:'all'},
 meteor:magic('meteor','fire',25,2),
 waterJet:magic('waterJet','water',16,3,{id:'waterJet',label:'水流冲击',kind:'line',impact:.34,color:'#66ccff'}),
 rift:magic('rift','earth',20,3),
 storm:magic('storm','thunder',16,3),
 snare:magic('snare','thunder',18,3),
 bloom:magic('bloom','grass',19,3),
 beam:magic('beam','light',22,2),
};
export const PET_SKILL_CHOICES=[...Object.keys(PET_SKILLS),'flee'];

export function describePetSkill(move){
 if(!move)return '';
 if(move.kind==='guard')return '本回合所受伤害减半';
 if(move.kind==='heal')return `恢复 ${move.power} 点生命`;
 return `造成 ${move.power} 点伤害`;
}
