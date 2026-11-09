import {pathToFileURL} from 'node:url';
import {FOREST_RETURN_SLOT,YARD_FOREST_SLOT} from '../shared/world/templates.js';

export function forestConnectionOps(snapshot){
 const yard={sceneId:'yard',slotId:YARD_FOREST_SLOT};
 const occupies=end=>end?.sceneId===yard.sceneId&&end.slotId===yard.slotId;
 const link=snapshot.portals.find(portal=>occupies(portal.from)||occupies(portal.to));
 if(link){
  const other=occupies(link.from)?link.to:link.from;
  if(link.bidirectional&&other?.slotId===FOREST_RETURN_SLOT&&snapshot.scenes.some(scene=>scene.sceneId===other.sceneId&&scene.templateId==='forest_v1'&&scene.status==='active'))return [];
  throw Error('FOREST_GATE_OCCUPIED');
 }
 if(snapshot.scenes.some(scene=>scene.templateId==='forest_v1'))throw Error('FOREST_ALREADY_EXISTS_WITHOUT_GATE');
 return [
  {kind:'scene.create',ref:'forest-exploration',templateId:'forest_v1',name:'森林',style:'natural'},
  {kind:'portal.link',from:yard,to:{sceneId:'forest-exploration',slotId:FOREST_RETURN_SLOT}},
 ];
}

async function connect(origin){
 const pair=await fetch(origin+'/api/auth/local-session',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});
 if(!pair.ok)throw Error('LOCAL_OWNER_SESSION_REQUIRED');
 const cookie=pair.headers.get('set-cookie').split(';')[0],{csrfToken}=await pair.json();
 const world='/api/world/default';
 async function request(suffix,command){
  const headers={cookie,origin};
  if(command)Object.assign(headers,{'content-type':'application/json','x-csrf-token':csrfToken});
  const response=await fetch(origin+world+suffix,{headers,...command?{method:'POST',body:JSON.stringify(command)}:{}});
  const body=await response.json();
  if(!response.ok)throw Error(JSON.stringify(body));
  return body;
 }
 const snapshot=await request('/snapshot');
 const ops=forestConnectionOps(snapshot);
 if(!ops.length)return {status:'already_connected'};
 const dispatch=(kind,payload)=>request('/commands',{worldId:'default',kind,payload,requestId:crypto.randomUUID()});
 const plan=await dispatch('build.preview',{baseRevision:snapshot.layoutRevision,ops});
 const result=await dispatch('build.apply',{planId:plan.planId});
 if(forestConnectionOps(await request('/snapshot')).length)throw Error('FOREST_CONNECTION_NOT_VISIBLE');
 return {status:'connected',sceneId:result.createdIds['forest-exploration'],changeId:result.changeId};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const origin=new URL(process.env.FOREST_ORIGIN||'http://127.0.0.1:5200');
 if(!['127.0.0.1','localhost'].includes(origin.hostname))throw Error('LOCAL_ORIGIN_REQUIRED');
 console.log(JSON.stringify(await connect(origin.origin)));
}
