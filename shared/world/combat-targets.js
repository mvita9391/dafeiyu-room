export const TRAINING_TARGETS = [[7.4,.8],[9.25,.8],[11.1,.8]].map(([x,z],index)=>({
 targetId:`yard-dummy-${index+1}`,sceneId:'yard',name:`${index+1} 号训练木桩`,position:[x,0,z],
}));

export function combatTargets(snapshot,sceneId){
 return TRAINING_TARGETS.filter(target=>(!sceneId||target.sceneId===sceneId)
  &&snapshot.scenes.some(scene=>scene.sceneId===target.sceneId&&scene.templateId==='courtyard_v1'&&scene.status==='active'));
}

// Shared by the server and the visible training dummies.
export function spellImpact(spell,start,end,target){
 const [x,,z]=target,dx=end[0]-start[0],dz=end[2]-start[2];
 const lengthSquared=dx*dx+dz*dz;
 const along=lengthSquared?Math.max(0,Math.min(1,((x-start[0])*dx+(z-start[2])*dz)/lengthSquared)):0;
 const zone=spell.kind==='zone';
 const hitX=zone?end[0]:start[0]+dx*along,hitZ=zone?end[2]:start[2]+dz*along;
 if(Math.hypot(x-hitX,z-hitZ)>.42+(zone?spell.radius:.28))return null;
 return spell.id==='frost'||spell.id==='rift'?spell.impact*along:spell.impact;
}
