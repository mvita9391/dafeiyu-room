import {selectAuthorizedWorld} from './world-selection.js';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {mcpTools,createToolCaller} from './tools.js';
import {RESOURCE_NAMES,resourceValue,RULES} from './resources.js';
export function createMcpServer(service,{resolvePrincipal,extensions={},advancedActions=false}={}){
 const server=new McpServer({name:'dafeiyu-world',version:'1.0.0'},{instructions:RULES.worldSelection}),call=createToolCaller(service,{resolvePrincipal,extensions,advancedActions});
 for(const t of mcpTools(advancedActions))server.registerTool(t.name,{description:t.description,inputSchema:t.schema},async args=>{try{const result=await call(t.name,args);return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}catch(error){const result={error:error.name==='ZodError'?'INVALID_ARGUMENTS':error.message,...error.details?{details:error.details}:{}};return {isError:true,content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}});
 for(const name of RESOURCE_NAMES)server.registerResource(name,`world://current/${name}`,{description:`授权世界的${name}`,mimeType:'application/json'},async uri=>{const p=await resolvePrincipal(),worldId=selectAuthorizedWorld(p,undefined,service.clock()),value=resourceValue(name,service,p,worldId);return {contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(value)}]};});
 return server;
}
export function installMcp(app,service,auth,{extensions={},advancedActions=false}={}){
 app.route({method:['GET','POST','DELETE'],url:'/mcp',handler:async(req,reply)=>{
  let bearer;try{bearer=/^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization||'')?.[1];auth.store.authenticate(bearer);}catch{return reply.code(401).header('www-authenticate',`Bearer resource_metadata="${auth.issuer}/.well-known/oauth-protected-resource/mcp"`).send({error:'UNAUTHORIZED'});}
  const server=createMcpServer(service,{resolvePrincipal:()=>auth.store.authenticate(bearer),extensions,advancedActions});
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  await server.connect(transport);reply.hijack();reply.raw.on('close',()=>{transport.close();server.close();});await transport.handleRequest(req.raw,reply.raw,req.body);
 }});
}
