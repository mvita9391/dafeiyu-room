export const FOREST_LAKE_LEVEL=4.72;
export const FOREST_LAKE_BOUNDS=Object.freeze({x0:36,x1:59,z0:-12,z1:12});

const centerX=47.4;
const rimHeight=4.8;
const turn=2*Math.PI;
const {x0,x1,z0,z1}=FOREST_LAKE_BOUNDS;
const angles=[
 ...Array.from({length:64},(_,i)=>i*turn/64),
 ...[x0,x1].flatMap(x=>[z0,z1].map(z=>(Math.atan2(z,x-centerX)+turn)%turn)),
].sort((a,b)=>a-b);

export function forestLakePoint(angle,radius){
 const wobble=1+.045*Math.sin(angle*3+.6)+.028*Math.cos(angle*5);
 return [centerX+10.1*Math.cos(angle)*wobble*radius,9.45*Math.sin(angle)*wobble*radius];
}

const rings=[.16,.34,.53,.69,.82,.92,1,1.07].map(radius=>angles.map(angle=>{
 const [x,z]=forestLakePoint(angle,radius);
 const y=radius>1?rimHeight:FOREST_LAKE_LEVEL-2.8*(1-radius**2)**1.25;
 return [x,y,z];
}));
rings.push(angles.map(angle=>{
 const dx=Math.cos(angle),dz=Math.sin(angle);
 const radius=Math.min((dx<0?x0-centerX:x1-centerX)/dx,(dz<0?z0:z1)/dz);
 return [centerX+radius*dx,rimHeight,radius*dz];
}));

const floor=[],water=[];
const center=[centerX,FOREST_LAKE_LEVEL-2.8,0];
const waterCenter=[centerX,FOREST_LAKE_LEVEL,0];
for(let i=0;i<angles.length;i++){
 const j=(i+1)%angles.length;
 floor.push([center,rings[0][j],rings[0][i]].flat());
 water.push([waterCenter,rings[6][j],rings[6][i]].flat());
 for(let r=0;r<rings.length-1;r++){
  const [a,b]=[rings[r],rings[r+1]];
  floor.push([a[i],a[j],b[i]].flat(),[b[i],a[j],b[j]].flat());
 }
}
export const FOREST_LAKE_FLOOR=floor;
export const FOREST_LAKE_WATER=water;

export const FOREST_LAKE_TRAIL_WIDTH=1.55;
const shoreLoop=[
 [35.2,0],[35.4,-5.1],[38,-9.3],[42.3,-11.5],[48.1,-12],[53.5,-10.7],
 [57.3,-7.3],[58.95,-3.8],[58.95,1.1],[58.45,5.15],[55.3,9.15],
 [50.3,11.5],[44.9,12],[40,10.45],[36.1,5.5],
];
const lakeEntrance=[[30,0],[32.3,.16],[35.2,0],[36.5,.22],[37.55,.36]];

function curveTrail(points,closed){
 const count=points.length;
 const at=i=>points[closed?(i+count)%count:Math.max(0,Math.min(count-1,i))];
 const trail=[];
 for(let i=0;i<(closed?count:count-1);i++){
  const [a,b,c,d]=[at(i-1),at(i),at(i+1),at(i+2)];
  for(let j=0;j<8;j++){
   const t=j/8;
   trail.push(b.map((value,k)=>.5*(2*value+(c[k]-a[k])*t+
    (2*a[k]-5*value+4*c[k]-d[k])*t*t+(-a[k]+3*value-3*c[k]+d[k])*t*t*t)));
  }
 }
 trail.push(closed?points[0]:points.at(-1));
 return trail;
}

export const FOREST_LAKE_TRAILS=[curveTrail(shoreLoop,true),curveTrail(lakeEntrance,false)];

export function forestLakeTrailDistance(x,z){
 if(x<28||Math.abs(z)>15)return Infinity;
 let distanceSquared=Infinity;
 for(const trail of FOREST_LAKE_TRAILS){
  for(let i=1;i<trail.length;i++){
   const [ax,az]=trail[i-1], [bx,bz]=trail[i];
   const dx=bx-ax,dz=bz-az;
   const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
   distanceSquared=Math.min(distanceSquared,(x-ax-t*dx)**2+(z-az-t*dz)**2);
  }
 }
 return Math.sqrt(distanceSquared);
}
