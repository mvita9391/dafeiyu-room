import {authorizePrincipal} from '../world/service.js';
// Authenticate before disclosing even the world names included in a grant.
// Never check whether an ungranted world exists: that would disclose other saves.
export function selectAuthorizedWorld(principal,requestedWorldId,now=Date.now()){
 const first=principal?.worldIds?.[0];
 authorizePrincipal(principal,first,'world:read',undefined,now);
 const availableWorldIds=[...new Set(principal.worldIds)];
 const defaultWorldId=availableWorldIds.includes('default')?'default':first;
 const worldId=requestedWorldId??defaultWorldId;
 if(!availableWorldIds.includes(worldId)){
  throw Object.assign(new Error('WORLD_SELECTION_INVALID'),{details:{
   requestedWorldId:worldId,availableWorldIds,defaultWorldId,credentialValid:true,
   message:'凭证有效，但 worldId 不在本授权范围；这不代表授权失效。',
   nextStep:'调用 world_enter {} 进入当前授权世界，或使用 availableWorldIds 中的值；不要猜世界名，不需要因此重新授权。'
  }});
 }
 return worldId;
}
