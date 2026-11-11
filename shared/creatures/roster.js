export function createRoster(followPetId=null,battlePetId=null){
 return {followPetId:followPetId||null,battlePetId:battlePetId||null};
}
export function normalizeRoster(raw,instances,ownerId){
 const owned=new Set(Object.values(instances||{}).filter(pet=>!ownerId||pet.ownerId===ownerId).map(pet=>pet.petId));
 const follow=raw?.followPetId&&owned.has(raw.followPetId)?raw.followPetId:null;
 const battle=raw?.battlePetId&&owned.has(raw.battlePetId)?raw.battlePetId:null;
 return createRoster(follow,battle);
}
export function setFollowPet(roster,petId,instances,ownerId){
 const next=normalizeRoster(roster,instances,ownerId);
 next.followPetId=petId&&instances[petId]?.ownerId===ownerId?petId:null;
 return next;
}
export function setBattlePet(roster,petId,instances,ownerId){
 const next=normalizeRoster(roster,instances,ownerId);
 next.battlePetId=petId&&instances[petId]?.ownerId===ownerId?petId:null;
 return next;
}
