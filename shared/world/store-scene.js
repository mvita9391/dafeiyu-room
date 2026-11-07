export const STORE_SCENE_ID='convenience-store';
export const STORE_SCENE={sceneId:STORE_SCENE_ID,name:'街角便利店',templateId:'street_corner_v1',entities:[
 {type:'shopBuilding',position:[.4,0,-1.9],rotation:0,scale:[1,1,1]},
 {type:'shopVending',position:[4.25,0,-.35],rotation:0,scale:[1,1,1]},
 {type:'shopLamp',position:[-4.1,0,-4.8],rotation:0,scale:[1,1,1]},
 {type:'shopLamp',position:[5.35,0,2.1],rotation:Math.PI,scale:[1,1,1]},
 {type:'shopCar',position:[3.8,0,4.7],rotation:0,scale:[1,1,1]},
]};
export const STORE_PORTALS=[{portalId:'legacy-living-store',kind:'legacy',fromSceneId:'living',toSceneId:STORE_SCENE_ID},{portalId:'legacy-store-living',kind:'legacy',fromSceneId:STORE_SCENE_ID,toSceneId:'living'}];
export const STORE_EXTRA_LIGHTS=[
 {type:'shopLamp',position:[-5.3,0,1.2],rotation:0,scale:[.85,.85,.85]},
 {type:'shopLamp',position:[-3.4,0,5.65],rotation:0,scale:[.75,.75,.75]},
 {type:'shopLamp',position:[1.25,0,5.8],rotation:Math.PI,scale:[.75,.75,.75]},
 {type:'shopLamp',position:[5.3,0,-4.65],rotation:Math.PI,scale:[1,1,1]},
];
STORE_SCENE.entities.push(...STORE_EXTRA_LIGHTS);
