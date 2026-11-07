// Pool-local coordinates shared by the runtime and clickable slide model.
export function slidePoint(entity,progress){
 const t=Math.max(0,Math.min(1,progress));
 const points=[[0,1.44,.52],[0,1.38,.2],[0,1.02,-.3],[0,.55,-.86],[0,.37,-1.45]];
 let y,z;
 if(t<.6){const u=t/.6;y=.04+1.4*u;z=1.72-1.2*u;}
 else {const u=(t-.6)/.4*4,i=Math.min(3,Math.floor(u)),k=u-i;y=points[i][1]+(points[i+1][1]-points[i][1])*k;z=points[i][2]+(points[i+1][2]-points[i][2])*k;}
 const x=(-2.44-z)*entity.scale[0],zz=0,c=Math.cos(entity.rotation),s=Math.sin(entity.rotation);
 return [entity.position[0]+x*c+zz*s,entity.position[1]+y*entity.scale[1],entity.position[2]-x*s+zz*c];
}

export function slideApproach(entity){const distance=4.7*entity.scale[0];return [entity.position[0]-distance*Math.cos(entity.rotation),0,entity.position[2]+distance*Math.sin(entity.rotation)];}
