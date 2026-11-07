// Synthetic public fixture only: never connects to a real world or host.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
export function createProbeServer(authorized = true) {
  const server = new McpServer({ name: 'world-compatibility-fixture', version: '1.0.0' });
  server.registerTool('probe_echo', { description: '仅回显合成兼容测试文本', inputSchema: { text: z.string().max(100) } }, async ({ text }) => authorized
    ? { content: [{ type: 'text', text }] }
    : { isError: true, content: [{ type: 'text', text: 'UNAUTHORIZED' }] });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await createProbeServer(process.env.WORLD_PROBE_AUTHORIZED === 'yes').connect(new StdioServerTransport());
}
