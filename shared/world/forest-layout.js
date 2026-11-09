import {FOREST_LAKE_BOUNDS} from './forest-lake.js';
import {OUTDOOR_HEIGHT_UNIT} from './outdoor-builder.js';

// Coordinates are in 1 m cells. Elevation is in 0.16 m steps.
const lakesideBounds=Object.freeze({x0:-32,x1:60,z0:-26,z1:26});
export const FOREST_BOUNDS=Object.freeze({...lakesideBounds,x1:108});
export const FOREST_STAIRS=[-10,12];
export const FOREST_RIDGES=[-8,8,20];
export const FOREST_CROSSINGS=[-18,0,14,27];
const rect=(x0,x1,z0,z1)=>({x0,x1,z0,z1});
const height=(level,x0,x1,z0,z1)=>({kind:'height',level,rect:rect(x0,x1,z0,z1)});
const paint=(material,x0,x1,z0,z1)=>({kind:'paint',material,rect:rect(x0,x1,z0,z1)});
const mountainTiers=[
 {level:40,bounds:rect(62,106,-24,20)},
 {level:50,bounds:rect(68,104,-23,15)},
 {level:60,bounds:rect(74,103,-22,9)},
 {level:70,bounds:rect(80,102,-21,3)},
];
const summit=mountainTiers.at(-1);
export const FOREST_BOSS_ARENA={
 bounds:summit.bounds,
 position:[91,Math.round(summit.level*OUTDOOR_HEIGHT_UNIT*100)/100,-9],
};
const stairZ=-10;
const arenaRadius=9;
const [arenaX,,arenaZ]=FOREST_BOSS_ARENA.position;
const arenaSurface=Array.from({length:arenaRadius*2},(_,row)=>{
 const offset=row-arenaRadius+.5;
 const halfWidth=Math.round(Math.sqrt(arenaRadius**2-offset**2));
 return paint('dirt',arenaX-halfWidth,arenaX+halfWidth,arenaZ+row-arenaRadius,arenaZ+row-arenaRadius+1);
});
const zBands=[[-26,-20,2],[-20,-16,0],[-16,-12,-2],[-12,-7,0],[-7,-3,2],[-3,3,0],[3,6,-2],[6,10,1],[10,15,0],[15,21,2],[21,26,-1]];
const trailMaterials=['dirt','paver'];
const shoreExclusions=[...trailMaterials,'rock','lakebed','lakeDeep'];
const grassPatches=[
 // Each group is a connected field. Keep the stairs and main paths clear.
 [rect(-30,-21,-8,-2),rect(-29,-24,-10,-8),rect(-21,-19,-6,-3)],
 [rect(-17,-11,1,9),rect(-16,-12,-1,1),rect(-15,-10,9,11)],
 [rect(-6,-1,-6,8),rect(-7,-6,-4,5),rect(-5,-2,8,11)],
 [rect(2,7,-7,5),rect(3,7,5,8),rect(4,6,-9,-7)],
 [rect(16,19,-7,10),rect(15,16,2,8)],
 [rect(22,26,4,10),rect(23,26,2,4),rect(25,30,9,11)],
];

export const FOREST_LAYOUT={version:1,bounds:FOREST_BOUNDS,ops:[
 ...FOREST_RIDGES.flatMap((ridge,i)=>zBands.map(([lo,hi,shift])=>height((i+1)*10,ridge+shift,FOREST_BOUNDS.x1,lo,hi))),
 paint('meadow',-27,-21,-7,-2),paint('meadow',-15,-11,1,7),paint('meadow',-1,6,-23,-16),
 paint('meadow',3,7,-4,5),paint('meadow',12,18,-7,5),paint('meadow',24,30,5,10),
 paint('rock',-13,-10,15,20),paint('rock',16,19,-19,-15),paint('rock',29,32,-7,-4),
 paint('dirt',-32,-17,-1,2),
 ...FOREST_STAIRS.map(z=>paint('dirt',-19,29,z-1,z+2)),
 ...FOREST_CROSSINGS.map(x=>paint('dirt',x-1,x+2,-11,14)),
 paint('dirt',-18,-14,-4,-2),paint('dirt',0,4,5,8),paint('dirt',13,18,-5,-2),
 paint('paver',24,30,-3,4),
 paint('meadow',39,55,-20,-14),paint('meadow',38,54,14,20),
 {kind:'paint',material:'lakebed',rect:FOREST_LAKE_BOUNDS},
 ...mountainTiers.map(({level,bounds})=>({kind:'height',level,rect:bounds})),
 {kind:'paint',material:'meadow',rect:summit.bounds},
 paint('dirt',59,62,-12,2),
 paint('dirt',59,85,stairZ-2,stairZ+2),
 ...arenaSurface,
 ...mountainTiers.map(({level,bounds})=>({
  kind:'stairs',direction:'east',from:level-10,to:level,rect:rect(bounds.x0-2,bounds.x0+3,stairZ-2,stairZ+2),
 })),
 ...FOREST_RIDGES.flatMap((x,i)=>FOREST_STAIRS.map(z=>({kind:'stairs',direction:'east',from:i*10,to:(i+1)*10,rect:rect(x-2,x+3,z-1,z+2)}))),
 {kind:'scatter',prop:'tree',rect:lakesideBounds,seed:29,spacing:4,density:.8,avoid:shoreExclusions},
 {kind:'scatter',prop:'tree',rect:rect(61,78,-23,-15),seed:93,spacing:5,density:.72,avoid:shoreExclusions},
 {kind:'scatter',prop:'tree',rect:rect(62,80,2,18),seed:95,spacing:5,density:.67,avoid:shoreExclusions},
 {kind:'erase',prop:'tree',rect:rect(-32,-27,-4,4)},
 ...grassPatches.flatMap((patch,index)=>patch.map(rect=>({
  kind:'scatter',prop:'tallGrass',rect,seed:73+index,spacing:1,density:1,avoid:[...trailMaterials,'rock'],
 }))),
 {kind:'scatter',prop:'flowers',rect:rect(-29,-21,2,8),seed:55,spacing:2,density:.8,avoid:trailMaterials},
 {kind:'scatter',prop:'flowers',rect:rect(-17,-11,-9,-2),seed:61,spacing:2,density:.85,avoid:trailMaterials},
 {kind:'scatter',prop:'flowers',rect:rect(23,31,-6,7),seed:58,spacing:2,density:.83,avoid:trailMaterials},
 {kind:'scatter',prop:'flowers',rect:rect(34,58,-16,16),seed:64,spacing:2,density:.48,avoid:shoreExclusions},
 {kind:'scatter',prop:'stone',rect:lakesideBounds,seed:106,spacing:4,density:.32,avoid:shoreExclusions},
 {kind:'scatter',prop:'stone',rect:rect(61,105,-24,20),seed:107,spacing:3,density:.66,avoid:shoreExclusions},
 {kind:'scatter',prop:'tallGrass',rect:rect(37,55,-18,-14),seed:86,spacing:1,density:.90,avoid:shoreExclusions},
 {kind:'scatter',prop:'tallGrass',rect:rect(39,55,14,19),seed:88,spacing:1,density:.86,avoid:shoreExclusions},
 // Keep the existing clearing and vegetation layout when resurfacing the lookout.
 paint('grass',24,30,-3,4),paint('dirt',26,29,-3,4),
 paint('grass',29,32,-7,-4),
]};
