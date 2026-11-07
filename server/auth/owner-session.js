import {secret,hash,equal,SCOPES} from './grants.js';
export function createOwnerSessions(store,{issuer,worldId='default',clock=Date.now,localAccess=false}={}){
 const canonical=new URL(issuer);
 const loopback=ip=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip);
 const localEntryAvailable=localAccess===true&&['127.0.0.1','localhost','[::1]'].includes(canonical.hostname);
 const secure=new URL(issuer).protocol==='https:',cookieName='world_owner';
 const owner=()=>{const s=store.service.readSnapshot(worldId);return {subjectId:'local-owner',role:'owner',worldIds:[worldId],actorIds:s.actors.map(a=>a.actorId),scopes:[...SCOPES]};};
 function resolve(req,{write=false}={}){const raw=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);const s=raw?store.get('session',hash(raw)):null;if(!s||s.expiresAt<=clock())throw Error('UNAUTHORIZED');if(write&&!equal(req.headers['x-csrf-token']||req.body?.csrfToken||'',s.csrfToken))throw Error('CSRF_REQUIRED');return {...owner(),expiresAt:s.expiresAt,csrfToken:s.csrfToken};}
 function issue(reply,status){const token=secret(),csrfToken=secret();store.put('session',hash(token),{csrfToken,expiresAt:clock()+30*86400000});reply.header('cache-control','no-store').header('set-cookie',`${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure?'; Secure':''}`);return {status,csrfToken};}
 function localSession(req,reply){
  // Trust the socket address and canonical public Host, never forwarded headers.
  if(!localEntryAvailable||!loopback(req.ip)||req.headers.host!==canonical.host)throw Error('UNAUTHORIZED');
  const origin=req.headers.origin,site=req.headers['sec-fetch-site'];
  if((origin!==undefined&&origin!==canonical.origin)||(site!==undefined&&site!=='same-origin')||(!origin&&site!=='same-origin'))throw Error('UNAUTHORIZED');
  return issue(reply,'local');
 }
 return {resolve,owner,localSession,localEntryAvailable};
}
