import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import { createProbeServer } from '../tests/fixtures/world-probe-server.mjs';

const transports = new Set(['stdio', 'streamable-http']);
export function buildReport(input = {}) {
  const supportedTransports = [...new Set((input.supportedTransports ?? []).filter(value => transports.has(value)))];
  return {
    sdk: { package: '@modelcontextprotocol/sdk', version: '1.32.2' },
    supportedTransports,
    protocolVersions: [...new Set((input.protocolVersions ?? []).filter(value => SUPPORTED_PROTOCOL_VERSIONS.includes(value)))],
    host: { status: 'unverified', reason: '未连接实际宿主；标准客户端结果不能证明具体宿主兼容' },
    connection: { status: supportedTransports.length ? 'verified' : 'unavailable' },
    experiments: (input.experiments ?? []).filter(item => transports.has(item.transport)).map(item => ({
      transport: item.transport, discovered: item.discovered === true, called: item.called === true,
      unauthorizedRejected: item.unauthorizedRejected === true,
    })),
    reachability: 'loopback-only', authorization: 'fixture-only-not-production-oauth',
  };
}

async function exercise(transport) {
  let protocolVersion;
  const start = transport.start.bind(transport);
  transport.start = async () => {
    const onmessage = transport.onmessage;
    transport.onmessage = (message, extra) => {
      if (message.result?.protocolVersion) protocolVersion = message.result.protocolVersion;
      onmessage?.(message, extra);
    };
    await start();
  };
  const client = new Client({ name: 'world-probe-client', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const result = await client.callTool({ name: 'probe_echo', arguments: { text: '你好，世界' } });
    return { protocolVersion, discovered: tools.tools.some(tool => tool.name === 'probe_echo'), called: result.content?.[0]?.text === '你好，世界' };
  } finally { await client.close(); }
}

export async function runCompatibilityProbe() {
  const experiments = [];
  const fixture = fileURLToPath(new URL('../tests/fixtures/world-probe-server.mjs', import.meta.url));
  const stdio = authorized => new StdioClientTransport({ command: process.execPath, args: [fixture], env: { WORLD_PROBE_AUTHORIZED: authorized ? 'yes' : 'no' }, stderr: 'pipe' });
  const stdioResult = await exercise(stdio(true));
  const deniedClient = new Client({ name: 'denied-probe', version: '1.0.0' });
  let denied;
  try {
    await deniedClient.connect(stdio(false));
    denied = await deniedClient.callTool({ name: 'probe_echo', arguments: { text: '你好' } });
  } finally { await deniedClient.close(); }
  experiments.push({ transport: 'stdio', ...stdioResult, unauthorizedRejected: denied.isError === true });

  const http = createServer(async (req, res) => {
    if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
    if (req.headers.authorization !== 'Bearer synthetic-fixture') { res.writeHead(401).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    const server = createProbeServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      let raw = ''; for await (const chunk of req) raw += chunk;
      await server.connect(transport);
      await transport.handleRequest(req, res, JSON.parse(raw));
    } catch { if (!res.headersSent) res.writeHead(500).end(); }
    finally { await server.close(); }
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const endpoint = new URL(`http://127.0.0.1:${http.address().port}/mcp`);
  try {
    const unauthorizedRejected = (await fetch(endpoint, { method: 'POST' })).status === 401;
    const result = await exercise(new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { Authorization: 'Bearer synthetic-fixture' } } }));
    experiments.push({ transport: 'streamable-http', ...result, unauthorizedRejected });
  } finally { await new Promise(resolve => http.close(resolve)); }
  if (experiments.some(result => !result.called || !result.discovered || !result.unauthorizedRejected)) throw new Error('Compatibility fixture failed');
  return buildReport({ supportedTransports: experiments.map(result => result.transport), protocolVersions: experiments.map(result => result.protocolVersion), experiments });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await runCompatibilityProbe(), null, 2)); }
  catch { console.error('兼容探针失败；未输出原始异常以避免泄漏路径或凭证'); process.exitCode = 1; }
}
