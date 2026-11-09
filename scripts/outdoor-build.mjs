import {readFileSync} from 'node:fs';
import {compileOutdoorMap} from '../shared/world/outdoor-builder.js';
import {FOREST_LAYOUT} from '../shared/world/forest-layout.js';

const [command='inspect',input]=process.argv.slice(2);
if(!['inspect','compile'].includes(command)){
 console.error('Usage: node scripts/outdoor-build.mjs inspect|compile [map.json]');
 process.exit(1);
}
try{
 const source=input?JSON.parse(readFileSync(input,'utf8')):FOREST_LAYOUT;
 const map=compileOutdoorMap(source);
 const features={};
 for(const {prop} of map.features)features[prop]=(features[prop]||0)+1;
 const result=command==='compile'?map:{
  bounds:map.bounds,operations:source.ops.length,
  topSurfaces:map.tops.length,exposedFaces:map.walls.length,collisionTriangles:map.surfaces.length,features,
 };
 console.log(JSON.stringify(result,null,2));
}catch(error){
 console.error(error.message);
 process.exitCode=1;
}
