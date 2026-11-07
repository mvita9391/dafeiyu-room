import {localAssetLabel} from './local-asset-labels.js';
import {furnitureTypes} from '../layout.js';
// Conservative full base footprints in metres, before scale and Y rotation.
const sizes={coastalHouse:[3.7,3.7],shopBuilding:[6.45,5.2],shopVending:[1.02,1.1],shopLamp:[1.55,.5],shopCar:[2.4,1.2],bed:[2.5,3.8],desk:[2,.9],chair:[.65,.65],shelf:[1.2,.5],lamp:[.5,.5],bean:[1.2,1.2],table:[1.1,1.1],plant:[.7,1.1],smallPlant:[.4,.4],nightstand:[.65,.65],rug:[3.7,3],livingSofa:[2.6,1.3],livingTable:[1.8,1],livingChair:[.9,.9],livingShelf:[1.6,.5],livingLamp:[.6,.6],livingPlant:[.8,.8],livingRug:[4.2,3.2],yardPool:[8.2,4.2],yardFarm:[4.35,4.35],yardTree:[1.9,1.6],yardBench:[2,.8],yardLantern:[1.1,1.1],yardFlowers:[6.1,.6],yardCan:[.6,.4],yardSwing:[2.9,2.6],yardPicnicTable:[2.3,2.2],yardUmbrella:[2.8,2.8],yardFlowerBox:[1.5,.8],yardRoseArch:[2.2,1],yardBirdBath:[1,1]};
// Heights are actual top faces (centre Y + half thickness). Bounds are conservative
// free rectangles on the top face, excluding built-in laptop/books/cups/lamp/fishbowl.
// Bounds use asset-local X/Z, not offsets from the support anchor. A child must fit fully.
const labels={coastalHouse:'海边小屋',shopBuilding:'便利店',shopVending:'自动售货机',shopLamp:'街道路灯',shopCar:'小汽车',yardSwing:'秋千',yardPicnicTable:'野餐桌',yardUmbrella:'遮阳伞',yardFlowerBox:'花箱',yardRoseArch:'花拱门',yardBirdBath:'鸟浴盆'};
const surfaces={
 yardPicnicTable:{y:.805,bounds:{x0:-.8,x1:.8,z0:-.35,z1:.35}},
 desk:{y:.79,bounds:{x0:.15,x1:.5,z0:-.25,z1:.25}},
 nightstand:{y:.52,bounds:{x0:-.20,x1:.20,z0:.12,z1:.18}},
 table:{y:.545,bounds:{x0:-.12,x1:.12,z0:-.25,z1:-.22}},
 livingTable:{y:.455,bounds:{x0:-.80,x1:.80,z0:-.40,z1:-.25}},
};
function entry(type){
 const [width,depth]=sizes[type];const rug=/rug/i.test(type);const seat=/chair|sofa|bench|bean/i.test(type)||type==='yardSwing';const surface=surfaces[type];const actions=seat?['sit']:type==='bed'?['sleep']:type==='yardPool'?['swim','slide']:type==='yardTree'?['climbTree']:[];
 return {type,...(labels[type]?{label:labels[type]}:{}),version:1,sceneKinds:(type==='coastalHouse'||type.startsWith('yard')||type.startsWith('shop'))?['outdoor']:['indoor','outdoor'],footprint:{shape:'rectangle',width,depth,blocking:!rug},scale:{min:.5,max:2,uniform:true},placement:type==='smallPlant'?'ground-or-support':'ground',supportRequired:false,actions,anchors:[{anchorId:'approach',kind:'approach',position:[0,0,depth/2+.5]},...(actions.length?[{anchorId:'interaction',kind:actions[0],position:type==='bed'?[.1,.84,.8]:[0,type==='yardSwing'?.64:type==='chair'?.54:seat?.45:0,0]}]:[]),...(surface?[{anchorId:'surface',kind:'support',position:[0,surface.y,0],bounds:surface.bounds,capacity:1}]:[])],protected:type==='yardFarm',source:{kind:'procedural',license:'MIT'}};
}
const catalog=Object.fromEntries(furnitureTypes.map(t=>[t,entry(t)]));
export const ASSET_TYPES=[...furnitureTypes];
export function getCatalogEntry(type){if(!Object.hasOwn(catalog,type))throw new RangeError(`Unknown asset: ${type}`);return structuredClone(catalog[type]);}
export function listCatalog(){return ASSET_TYPES.map(getCatalogEntry);}
// Synchronous activation checkpoint: rollback registrations if the DB commit fails.
export function checkpointCatalog(){const entries={...catalog},types=[...ASSET_TYPES],furniture=[...furnitureTypes];return()=>{for(const key of Object.keys(catalog))delete catalog[key];Object.assign(catalog,entries);ASSET_TYPES.splice(0,ASSET_TYPES.length,...types);furnitureTypes.splice(0,furnitureTypes.length,...furniture);};}

export const LOCAL_CATEGORIES={Buildings:'建筑',Furniture:'家具',Seating:'座椅沙发',Tables:'桌台',Storage:'收纳柜架',Bedding:'床铺',Kitchen:'厨具餐具',Lighting:'灯饰',Plants:'植物花木',Trees:'树木',Flowers:'花草',Decor:'装饰摆件',Containers:'箱桶容器',Tools:'工具器械',Weapons:'武器',Animals:'动物',Characters:'角色',Vehicles:'载具',Terrain:'地形地貌',Attachments:'配件挂件',Misc:'其他杂物',Props:'杂项摆件',Roads:'道路桥梁',Stones:'石头',Floor:'景观地形',Laterns:'路灯',Fences:'围栏',Farming:'农场'};
export function registerLocalAssets(manifest){
 if(!manifest||!Array.isArray(manifest.assets))throw Error('INVALID_LOCAL_MANIFEST');
 const entries=manifest.assets.map(a=>{
  if(!/^(town|pf)-[a-z0-9][a-z0-9-]*$/.test(a.type)||!/^(models|glb)\/(town|pf)-[a-z0-9-]+\.glb$/.test(a.file)||!LOCAL_CATEGORIES[a.category]||!Array.isArray(a.dimensions)||a.dimensions.length!==3||!a.dimensions.every(n=>Number.isFinite(n)&&n>0&&n<500))throw Error('INVALID_LOCAL_ASSET');
  const [width,height,depth]=a.dimensions;
  return {type:a.type,label:localAssetLabel(a),sourceName:a.sourceName||a.name,...(/^thumbnails\/(town|pf)-[a-z0-9-]+\.(png|webp)$/.test(a.thumbnail||'')?{thumbnailURL:'/api/local-assets/'+a.thumbnail}:{}),editorHidden:!!a.editorHidden,authorOffsetY:a.authorOffsetY||0,category:LOCAL_CATEGORIES[a.category],localCategory:a.category,version:1,sceneKinds:['indoor','outdoor'],footprint:{shape:'rectangle',width,depth,blocking:a.blocking??!(['Flowers'].includes(a.category)||(a.category==='Roads'&&height<.1))},height,scale:{min:.01,max:2,uniform:true},placement:'ground',supportRequired:false,actions:[],anchors:[],protected:false,source:{kind:'local',license:'user-supplied',file:a.file}};
 });
 for(const e of entries){catalog[e.type]=e;if(!ASSET_TYPES.includes(e.type))ASSET_TYPES.push(e.type);if(!furnitureTypes.includes(e.type))furnitureTypes.push(e.type);}
 return entries;
}
