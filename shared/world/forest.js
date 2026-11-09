import {compileOutdoorMap,outdoorHash} from './outdoor-builder.js';
import {FOREST_BOSS_ARENA,FOREST_LAYOUT} from './forest-layout.js';
import {FOREST_LAKE_FLOOR,FOREST_LAKE_LEVEL,FOREST_LAKE_WATER,FOREST_LAKE_TRAIL_WIDTH,forestLakeTrailDistance} from './forest-lake.js';
import {authorSurface,registerAuthorScene} from './author-scenes.js';
export {FOREST_BOUNDS,FOREST_STAIRS,FOREST_RIDGES,FOREST_CROSSINGS} from './forest-layout.js';
export {FOREST_LAKE_LEVEL} from './forest-lake.js';
export {outdoorHash as forestHash};

export const FOREST_TERRAIN_ID='Demo_DafeiyuForest';
export const FOREST_LANDMARKS=[
 {landmarkId:'entrance',name:'院门入口',position:[-29.8,0,0]},
 {landmarkId:'fork',name:'林间岔路',position:[-18,0,0]},
 {landmarkId:'lookout',name:'山顶观景台',position:[27,4.8,0]},
 {landmarkId:'summit-lake',name:'山顶湖入口',position:[35,4.8,0]},
 {landmarkId:'boss-arena',name:'后山斗场',position:FOREST_BOSS_ARENA.position},
];
const map=compileOutdoorMap(FOREST_LAYOUT);
const tops=map.tops.filter(tile=>tile.material!=='lakebed');
const features=map.features.filter(({x,z,size,prop})=>
 forestLakeTrailDistance(x,z)>FOREST_LAKE_TRAIL_WIDTH/2+(prop==='tree'?.44*size:.23));
export const FOREST_MAP={...map,tops,features};
const lakeFloorSurfaces=FOREST_LAKE_FLOOR.map(vertices=>({kind:'land',vertices}));
const lakeFloorId='Demo_DafeiyuLakeFloor';
registerAuthorScene({id:lakeFloorId,surfaces:lakeFloorSurfaces});
export const FOREST_SURFACES=[
 ...tops.flatMap(({x0,x1,z0,z1,y})=>[
  {kind:'land',vertices:[x0,y,z0,x0,y,z1,x1,y,z0]},
  {kind:'land',vertices:[x1,y,z0,x0,y,z1,x1,y,z1]},
 ]),
 ...lakeFloorSurfaces,
 ...FOREST_LAKE_WATER.map(vertices=>({kind:'water',vertices})),
];
export function forestLakeDepth(x,z){
 const floor=authorSurface(lakeFloorId,x,z);
 return floor?Math.max(0,FOREST_LAKE_LEVEL-floor.height):0;
}
export const FOREST_TREES=FOREST_MAP.features.filter(feature=>feature.prop==='tree');
export const FOREST_TREE_COLLIDERS=FOREST_TREES.map(({x,z,size})=>{
 const r=.27*size;
 return {x0:x-r,x1:x+r,z0:z-r,z1:z+r};
});

const grassKey=(x,z)=>Math.floor(x)+','+Math.floor(z);
const flowerCells=new Set(FOREST_MAP.features.filter(p=>p.prop==='flowers').map(p=>grassKey(p.x,p.z)));
const grassCells=new Set(FOREST_MAP.features.filter(p=>p.prop==='tallGrass'&&!flowerCells.has(grassKey(p.x,p.z))).map(p=>grassKey(p.x,p.z)));
export const forestGrassAt=(x,z)=>grassCells.has(grassKey(x,z));
