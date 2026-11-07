// Public transport metadata is deliberately separate from private owner grants.
export function installMcpIntegration(app, auth) {
 app.get('/api/integrations/mcp', async (req, reply) => {
  reply.header('cache-control','no-store');
  const endpoint=auth.issuer+'/mcp',local=['localhost','127.0.0.1','[::1]'].includes(new URL(endpoint).hostname);
  let owner=false;
  try { auth.owner.resolve(req); owner=true; } catch {}
  const keyedGrants=owner?auth.store.apiKeyAvailability():new Map();
  return {endpoint,transports:['streamable-http','stdio'],reachability:{kind:local?'local':'remote',verified:false,message:local?'仅限运行游戏的这台电脑；其他设备无法使用此地址。':'已配置 HTTPS 入口；外部网络、代理和证书需由客户端连接验证。'},health:{service:'ready',protocol:'awaiting_client',authorization:owner?'owner':'owner_required'},connectedAgents:owner?auth.store.list('grant').map(g=>({grantId:g.grantId,clientName:g.clientName,scopes:g.scopes,expiresAt:g.expiresAt,hasApiKey:keyedGrants.has(g.grantId),canViewJson:keyedGrants.get(g.grantId)===true,status:g.revoked?'revoked':g.expiresAt<=auth.store.clock()?'expired':'authorized'})):[]};
 });
}
