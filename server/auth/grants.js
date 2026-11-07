import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {createApiKeyVault} from './api-key-vault.js';
import {authorizePrincipal} from '../world/service.js';
import {revokeSubjectControl} from '../world/runtime.js';
export const SCOPES=Object.freeze(['world:read','actor:control','build:write','audio:play']);
export const DEFAULT_SCOPES=Object.freeze(SCOPES.filter(s=>s!=='audio:play'));
const currentRecord=(kind,data)=>kind==='grant'?{...data,scopes:data.scopes.filter(s=>SCOPES.includes(s))}:data;
export const secret=()=>randomBytes(32).toString('base64url');
export const hash=value=>createHash('sha256').update(String(value)).digest('hex');
export function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
export class GrantStore {
 constructor(db,service,{issuer,clock=Date.now,onRevoke,apiKeyPath}={}){this.db=db;this.service=service;this.issuer=issuer;this.clock=clock;this.onRevoke=onRevoke;this.vault=createApiKeyVault(apiKeyPath);db.exec('CREATE TABLE IF NOT EXISTS auth_records (kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id))');}
 get(kind,id){const r=this.db.prepare('SELECT data FROM auth_records WHERE kind=? AND id=?').get(kind,id);return r?currentRecord(kind,JSON.parse(r.data)):null;}
 put(kind,id,data){this.db.prepare('INSERT INTO auth_records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data').run(kind,id,JSON.stringify(data));return data;}
 remove(kind,id){this.db.prepare('DELETE FROM auth_records WHERE kind=? AND id=?').run(kind,id);}
 list(kind){return this.db.prepare('SELECT data FROM auth_records WHERE kind=?').all(kind).map(r=>currentRecord(kind,JSON.parse(r.data)));}
 buildGrant({clientName='智能体',clientId=randomUUID(),worldId='default',actorIds=[],scopes=DEFAULT_SCOPES,expiresAt=this.clock()+30*86400000}={}){
  if(typeof clientName!=='string'||clientName.length>100||!Array.isArray(scopes)||scopes.some(s=>!SCOPES.includes(s))||!scopes.includes('world:read')||!Number.isFinite(expiresAt)||expiresAt<=this.clock()||expiresAt>this.clock()+366*86400000)throw Error('INVALID_GRANT');
  const snapshot=this.service.readSnapshot(worldId);if(!Array.isArray(actorIds)||actorIds.some(id=>!snapshot.actors.some(a=>a.actorId===id)))throw Error('INVALID_ACTOR');
  return {grantId:randomUUID(),subjectId:randomUUID(),clientId,clientName,worldIds:[worldId],actorIds:[...new Set(actorIds)],scopes:[...new Set(scopes)],role:'agent',expiresAt,revoked:false,createdAt:this.clock()};
 }
 create(options){
  const grant=this.buildGrant(options);
  this.put('grant',grant.grantId,grant);
  const token=this.issue(grant,{refresh:true});
  return {...grant,accessToken:token.accessToken,refreshToken:token.refreshToken,tokenExpiresAt:token.expiresAt};
 }
 issue(grant,{refresh=false,scopes=grant.scopes}={}){const accessToken=secret(),expiresAt=Math.min(grant.expiresAt,this.clock()+3600000);this.put('token',hash(accessToken),{grantId:grant.grantId,audience:this.issuer+'/mcp',expiresAt,scopes});let refreshToken;if(refresh){refreshToken=secret();this.put('refresh',hash(refreshToken),{grantId:grant.grantId,expiresAt:grant.expiresAt,scopes});}return {accessToken,expiresAt,...refreshToken?{refreshToken}:{}};}
 apiKeyAvailability(){return new Map(this.list('api_key').map(key=>[key.grantId,Boolean(key.sealed)]));}
 readApiKey(grantId){
  const grant=this.get('grant',grantId);
  if(!grant||grant.revoked||grant.expiresAt<=this.clock())throw Error('GRANT_NOT_ACTIVE');
  const row=this.db.prepare("SELECT id,data FROM auth_records WHERE kind='api_key' AND json_extract(data,'$.grantId')=?").get(grantId);
  const record=row&&JSON.parse(row.data);
  if(!record?.sealed||record.expiresAt<=this.clock()||record.audience!==this.issuer+'/mcp')throw Error('KEY_UNAVAILABLE');
  const apiKey=this.vault.open(grantId,record.sealed);
  if(!equal(hash(apiKey),row.id))throw Error('KEY_UNAVAILABLE');
  return {apiKey,grantId,expiresAt:Math.min(grant.expiresAt,record.expiresAt)};
 }
 issueApiKey(grantId){
  const grant=this.get('grant',grantId);
  if(!grant||grant.revoked||grant.expiresAt<=this.clock())throw Error('GRANT_NOT_ACTIVE');
  return this.saveApiKey(grant,{replace:true});
 }
 createApiKeyGrant(options){
  return this.saveApiKey(this.buildGrant(options),{replace:false});
 }
 saveApiKey(grant,{replace}){
  const {grantId}=grant;
  const apiKey='dafeiyu_'+secret();
  const sealed=this.vault.seal(grantId,apiKey);
  this.db.exec('BEGIN IMMEDIATE');
  try{
   if(replace)this.db.prepare("DELETE FROM auth_records WHERE kind='api_key' AND json_extract(data,'$.grantId')=?").run(grantId);
   else this.put('grant',grantId,grant);
   this.put('api_key',hash(apiKey),{grantId,audience:this.issuer+'/mcp',expiresAt:grant.expiresAt,scopes:grant.scopes,sealed});
   this.db.exec('COMMIT');
   return {apiKey,grantId,expiresAt:grant.expiresAt};
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 authenticate(credential,scope='world:read'){const t=typeof credential==='string'?this.get(credential.startsWith('dafeiyu_')?'api_key':'token',hash(credential)):null,g=t?this.get('grant',t.grantId):null;if(!t||t.expiresAt<=this.clock()||t.audience!==this.issuer+'/mcp'||!g)throw Error('UNAUTHORIZED');const principal={...g,scopes:g.scopes.filter(s=>(t.scopes||g.scopes).includes(s))};authorizePrincipal(principal,principal.worldIds?.[0],scope,undefined,this.clock());return principal;}
 authorize(credential,scope='world:read',worldId='default',actorId){const principal=this.authenticate(credential,scope);authorizePrincipal(principal,worldId,scope,actorId,this.clock());return principal;}
 revoke(grantId){const g=this.get('grant',grantId);if(!g)throw Error('GRANT_NOT_FOUND');this.service.transactRuntime(g.worldIds[0],({snapshot,emit})=>{g.revoked=true;this.put('grant',grantId,g);this.db.prepare("DELETE FROM auth_records WHERE kind='api_key' AND json_extract(data,'$.grantId')=?").run(grantId);revokeSubjectControl(snapshot,g.subjectId,emit);const hookResult=this.onRevoke?.({grant:g,snapshot,emit});if(hookResult&&typeof hookResult.then==='function')throw Error('ASYNC_HANDLER_NOT_ALLOWED');});return {grantId,status:'revoked'};}
}
