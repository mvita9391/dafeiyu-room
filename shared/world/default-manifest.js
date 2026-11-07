import starterWorld from './starter-world.json' with {type:'json'};
// Shipped baseline is read only during first initialization, never merged over a save.
// Actor state is deliberately fresh, independent of the publisher's personal save.
export const farmPlots=Array.from({length:9},(_,i)=>({plotId:`farm-plot-${Math.floor(i/3)+1}-${i%3+1}`,position:[(i%3-1)*1.55,0,(Math.floor(i/3)-1)*1.55],size:1.25,furrows:{count:4,spacing:.25,y:.13,width:1.09,depth:.045}}));
export const defaultManifest={worldId:starterWorld.worldId,scenes:starterWorld.scenes,portals:starterWorld.portals,actors:[{actorId:'whale',sceneId:'bedroom',position:[.05,0,.55],rotation:0,controller:null,actionId:null}]};
