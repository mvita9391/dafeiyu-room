export const PICNIC_TOP_Y=.805;
export const PICNIC_BENCH_Y=.50;
export const PICNIC_SURFACES=[
 {z:0,halfX:.95,halfZ:.445,y:PICNIC_TOP_Y},
 ...[-.8,.8].map(z=>({z,halfX:1.025,halfZ:.185,y:PICNIC_BENCH_Y})),
];
export const UMBRELLA_RADIUS=1.28;
export const UMBRELLA_TOP_Y=2.36;
export const UMBRELLA_RISE=.62;
const panelAngle=Math.PI/6;

export function yardPlatformAt(entity,localX,localZ){
 const x=localX/entity.scale[0],z=localZ/entity.scale[2];
 if(entity.type==='yardPicnicTable'){
  const surface=PICNIC_SURFACES.find(part=>Math.abs(x)<=part.halfX&&Math.abs(z-part.z)<=part.halfZ);
  if(surface)return entity.position[1]+surface.y*entity.scale[1];
 }
 if(entity.type==='yardUmbrella'){
  const angle=Math.atan2(x,z);
  const panel=(angle%panelAngle+panelAngle)%panelAngle;
  const radius=UMBRELLA_RADIUS*Math.cos(panelAngle/2)/Math.cos(panel-panelAngle/2);
  const distance=Math.hypot(x,z);
  if(distance>radius)return;
  return entity.position[1]+(UMBRELLA_TOP_Y-UMBRELLA_RISE*distance/radius)*entity.scale[1];
 }
}
