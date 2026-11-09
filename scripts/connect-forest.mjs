import {pathToFileURL} from 'node:url';
import {forestConnectionOps} from '../server/world/forest-connection.js';
export {forestConnectionOps};

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
 return {status:'connected',sceneId:result.createdIds['forest-exploration']??ops.at(-1).to.sceneId,changeId:result.changeId};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const origin=new URL(process.env.FOREST_ORIGIN||'http://127.0.0.1:5200');
 if(!['127.0.0.1','localhost'].includes(origin.hostname))throw Error('LOCAL_ORIGIN_REQUIRED');
 console.log(JSON.stringify(await connect(origin.origin)));
}
