import {validLayout} from '../../shared/layout.js';
import {getTemplate} from '../../shared/world/templates.js';
export const STARTER_SCENES=['bedroom','living','yard','convenience-store'];
// Explicit release operation only. Runtime/MCP handlers never call this exporter.
export function createStarterWorld(snapshot){
 if(snapshot.entities.some(e=>e.type.startsWith("town-"))||snapshot.scenes.some(s=>s.templateId?.startsWith("local_")))throw Error("LOCAL_ASSETS_NOT_PUBLISHABLE");
 const scenes=STARTER_SCENES.map(sceneId=>{
  const scene=snapshot.scenes.find(s=>s.sceneId===sceneId&&s.status==='active');
  if(!scene)throw Error(`STARTER_SCENE_MISSING:${sceneId}`);
  const template=getTemplate(scene.templateId);
  const entities=snapshot.entities.filter(e=>e.sceneId===sceneId).map(e=>{
   // Don't silently lose dependency relationships when publishing a flat layout.
   if(e.supportEntityId||e.supportAnchorId)throw Error(`STARTER_SUPPORT_UNSUPPORTED:${sceneId}`);
   return {type:e.type,position:[...e.position],rotation:e.rotation,scale:[...e.scale]};
  });
  if(!validLayout(entities,sceneId,template.bounds))throw Error(`INVALID_STARTER_LAYOUT:${sceneId}`);
  return {sceneId,name:scene.name,templateId:scene.templateId,entities};
 });
 const portals=snapshot.portals.filter(p=>STARTER_SCENES.includes(p.kind==='legacy'?p.fromSceneId:p.from?.sceneId)&&STARTER_SCENES.includes(p.kind==='legacy'?p.toSceneId:p.to?.sceneId)).map(p=>{
  const common={...(p.portalId?{portalId:p.portalId}:{id:p.id}),...(p.bidirectional!==undefined?{bidirectional:p.bidirectional}:{})};
  return p.kind==='legacy'?{...common,kind:'legacy',fromSceneId:p.fromSceneId,toSceneId:p.toSceneId}:{...common,from:{sceneId:p.from.sceneId,slotId:p.from.slotId},to:{sceneId:p.to.sceneId,slotId:p.to.slotId}};
 });
 return {formatVersion:1,worldId:'default',scenes,portals};
}
