#!/usr/bin/env node
import {readFile,lstat,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema,ListResourcesRequestSchema,ReadResourceRequestSchema} from '@modelcontextprotocol/sdk/types.js';
const args=process.argv.slice(2),configPath=args[args.indexOf('--config')+1];
try{
 if(args.indexOf('--config')<0||!configPath)throw Error('请使用 --config 指定受保护的凭证 JSON 文件。');
 const stat=await lstat(configPath);if(!stat.isFile()||stat.mode&0o077||process.getuid&&stat.uid!==process.getuid())throw Error('凭证文件须为当前用户所有的普通文件，权限0600。');
 const config=JSON.parse(await readFile(configPath,'utf8')),url=new URL(config.endpoint);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/mcp'||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))||typeof config.accessToken!=='string')throw Error('凭证配置无效。');
 const client=new Client({name:'dafeiyu-stdio-adapter',version:'1.0.0'});
 const authProvider=config.refreshToken&&config.clientId?{
  redirectUrl:undefined,
  prepareTokenRequest:()=>new URLSearchParams({grant_type:'refresh_token',refresh_token:config.refreshToken}),
  clientMetadata:{redirect_uris:[],grant_types:['refresh_token'],token_endpoint_auth_method:'none'},
  clientInformation:()=>({client_id:config.clientId,token_endpoint_auth_method:'none',issuer:url.origin}),
  tokens:()=>({access_token:config.accessToken,refresh_token:config.refreshToken,token_type:'Bearer',issuer:url.origin}),
  saveTokens:async tokens=>{config.accessToken=tokens.access_token;config.refreshToken=tokens.refresh_token||config.refreshToken;const temporary=configPath+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(config),{mode:0o600,flag:'wx'});await rename(temporary,configPath);},
  redirectToAuthorization:()=>{throw Error('凭证已失效，请从游戏重新授权。');},
  saveCodeVerifier:()=>{},codeVerifier:()=>{throw Error('该适配器仅续期已授权凭证。');}
 }:undefined;
 await client.connect(new StreamableHTTPClientTransport(url,authProvider?{authProvider}:{requestInit:{headers:{Authorization:`Bearer ${config.accessToken}`}}}));
 const server=new Server({name:'dafeiyu-world',version:'1.0.0'},{instructions:client.getInstructions(),capabilities:{tools:{},resources:{}}});
 server.setRequestHandler(ListToolsRequestSchema,()=>client.listTools());server.setRequestHandler(CallToolRequestSchema,r=>client.callTool(r.params));server.setRequestHandler(ListResourcesRequestSchema,()=>client.listResources());server.setRequestHandler(ReadResourceRequestSchema,r=>client.readResource(r.params));
 const transport=new StdioServerTransport();let closing=false;const close=async()=>{if(closing)return;closing=true;await client.close();await server.close();};process.on('SIGINT',()=>close().then(()=>process.exit(0)));process.on('SIGTERM',()=>close().then(()=>process.exit(0)));process.stdin.on('end',()=>close().then(()=>process.exit(0)));await server.connect(transport);
}catch(error){console.error(error.message);process.exit(1);}
