// Pool-local coordinates shared by the runtime and clickable slide model.
export const POOL_WIDTH=4.8;
export const POOL_DEPTH=3.4;
export const POOL_SURFACE_Y=.22;
export const poolFixtureScale=scale=>Math.min(...scale);
export const slideMountX=scale=>-POOL_WIDTH/2*scale[0]-.04*poolFixtureScale(scale);

export function slidePoint(entity,progress){
 const t=Math.max(0,Math.min(1,progress));
 const points=[[0,1.44,.52],[0,1.38,.2],[0,1.02,-.3],[0,.55,-.86],[0,.37,-1.45]];
 let y,z;
 if(t<.6){const u=t/.6;y=.04+1.4*u;z=1.72-1.2*u;}
 else {const u=(t-.6)/.4*4,i=Math.min(3,Math.floor(u)),k=u-i;y=points[i][1]+(points[i+1][1]-points[i][1])*k;z=points[i][2]+(points[i+1][2]-points[i][2])*k;}
 const size=poolFixtureScale(entity.scale),x=slideMountX(entity.scale)-z*size,c=Math.cos(entity.rotation),s=Math.sin(entity.rotation);
 return [entity.position[0]+x*c,entity.position[1]+y*size,entity.position[2]-x*s];
}

export function slideApproach(entity){const x=slideMountX(entity.scale)-2.26*poolFixtureScale(entity.scale);return [entity.position[0]+x*Math.cos(entity.rotation),entity.position[1],entity.position[2]-x*Math.sin(entity.rotation)];}
