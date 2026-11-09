export const TRAINING_RANGE = {center:[18.7,0,.8],rotation:Math.PI/2};
export const TRAINING_TARGETS = [-1.85,0,1.85].map((offset,index)=>{
 const {center:[x,y,z],rotation}=TRAINING_RANGE;
 return {
  targetId:`yard-dummy-${index+1}`,sceneId:'yard',name:`${index+1} 号训练木桩`,
  position:[x+Math.cos(rotation)*offset,y,z-Math.sin(rotation)*offset],
 };
});

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
