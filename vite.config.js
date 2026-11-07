import {defineConfig} from 'vite';
import {GAME_PORT, DEV_API_PORT} from './shared/ports.js';
import fs from 'node:fs';
const virtualId='virtual:character-config',resolvedId='\0'+virtualId;
export default defineConfig(({command,mode})=>{
  const config={defaultCharacter:'dafeiyu',modelBase:'./resources/character/models/'};
  const manifest=JSON.parse(fs.readFileSync(new URL('./resources/character/manifest.json',import.meta.url),'utf8'));
  return {server:{port:GAME_PORT,strictPort:true,proxy:{'/mcp':{target:`http://127.0.0.1:${DEV_API_PORT}`,changeOrigin:false},'/api':{target:`http://127.0.0.1:${DEV_API_PORT}`,changeOrigin:false,ws:true},'/oauth':{target:`http://127.0.0.1:${DEV_API_PORT}`,changeOrigin:false},'/.well-known':{target:`http://127.0.0.1:${DEV_API_PORT}`,changeOrigin:false}}},preview:{port:GAME_PORT,strictPort:true,proxy:{'/mcp':{target:`http://127.0.0.1:${DEV_API_PORT}`,changeOrigin:false},'/api':{target:`http://127.0.0.1:${DEV_API_PORT}`,changeOrigin:false,ws:true},'/oauth':{target:`http://127.0.0.1:${DEV_API_PORT}`,changeOrigin:false},'/.well-known':{target:`http://127.0.0.1:${DEV_API_PORT}`,changeOrigin:false}}},plugins:[{name:'bundled-character',resolveId(id){if(id===virtualId)return resolvedId;},load(id){if(id===resolvedId)return 'export default '+JSON.stringify(config);},generateBundle(){
    const audio=JSON.parse(fs.readFileSync(new URL('./resources/audio/manifest.json',import.meta.url),'utf8'));
    for(const file of [...manifest.files.filter(f=>f.runtime),...audio.files])this.emitFile({type:'asset',fileName:file.path,source:fs.readFileSync(new URL('./'+file.path,import.meta.url))});
  }}]};
});
