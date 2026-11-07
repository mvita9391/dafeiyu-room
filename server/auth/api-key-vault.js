import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';

export function createApiKeyVault(keyPath) {
 let key;
 function loadKey(create) {
  if(key)return key;
  if(!keyPath){
   if(create)return (key=randomBytes(32));
   throw Error('KEY_UNAVAILABLE');
  }
  const read=()=>{
   const info=lstatSync(keyPath);
   if(!info.isFile()||(process.platform!=='win32'&&(info.mode&0o077)))throw Error('KEY_UNAVAILABLE');
   const bytes=readFileSync(keyPath);
   if(bytes.length!==32)throw Error('KEY_UNAVAILABLE');
   return bytes;
  };
  try{return (key=read());}
  catch(error){
   if(error.code!=='ENOENT'||!create)throw Error('KEY_UNAVAILABLE');
  }
  const bytes=randomBytes(32);
  try{writeFileSync(keyPath,bytes,{flag:'wx',mode:0o600});return (key=bytes);}
  catch(error){if(error.code==='EEXIST')return (key=read());throw error;}
 }
 return {
  seal(grantId,apiKey){
   const nonce=randomBytes(12);
   const cipher=createCipheriv('aes-256-gcm',loadKey(true),nonce);
   cipher.setAAD(Buffer.from(grantId));
   return Buffer.concat([nonce,cipher.update(apiKey,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64url');
  },
  open(grantId,sealed){
   try{
    const bytes=Buffer.from(sealed,'base64url');
    const decipher=createDecipheriv('aes-256-gcm',loadKey(false),bytes.subarray(0,12));
    decipher.setAAD(Buffer.from(grantId));
    decipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString('utf8');
   }catch{throw Error('KEY_UNAVAILABLE');}
  },
 };
}
