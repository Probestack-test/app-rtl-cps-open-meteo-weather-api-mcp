import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
const port = 18123; const host = '127.0.0.1:' + port; const origin = 'http://' + host;
const apiKey = 'generated-protocol-test-key';
const child = spawn(process.execPath, ['dist/http.js'], { stdio: ['ignore', 'pipe', 'pipe'], env: {
  ...process.env, PORT: String(port), HOST: '127.0.0.1', MCP_ALLOWED_HOSTS: host,
  MCP_ALLOWED_ORIGINS: origin, MCP_API_KEYS: apiKey
}});
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(origin + '/mcp', { method: 'POST' }); if (r.status === 400) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'HTTP MCP server did not become ready');
  const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'generated-wire-test', version: '1' },
    'io.modelcontextprotocol/clientCapabilities': {} };
  const discover = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: meta } });
  const wireHeaders = { Origin: origin, Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json', 'Mcp-Method': 'server/discover' };
  const endpoint = origin + '/mcp';
  const wrongOrigin = await fetch(endpoint, { method: 'POST', body: discover,
    headers: { ...wireHeaders, Origin: 'https://untrusted.example', 'MCP-Protocol-Version': '2026-07-28' } });
  assert.equal(wrongOrigin.status, 403, 'untrusted Origin must be forbidden');
  const missingVersion = await fetch(endpoint, { method: 'POST', body: discover, headers: wireHeaders });
  assert.equal(missingVersion.status, 400, 'missing protocol header must be rejected');
  const invalidVersion = await fetch(endpoint, { method: 'POST', body: discover,
    headers: { ...wireHeaders, 'MCP-Protocol-Version': '2025-06-18' } });
  assert.equal(invalidVersion.status, 400, 'mismatched protocol header must be rejected');
  const batch = await fetch(endpoint, { method: 'POST', body: '[' + discover + ']',
    headers: { ...wireHeaders, 'MCP-Protocol-Version': '2026-07-28' } });
  assert.equal(batch.status, 400, 'JSON-RPC batch arrays must be rejected');
  const discovery = await fetch(endpoint, { method: 'POST', body: discover,
    headers: { ...wireHeaders, 'MCP-Protocol-Version': '2026-07-28' } });
  assert.equal(discovery.status, 200);
  const advertised = (await discovery.json()).result.capabilities;
  assert.equal(Boolean(advertised.tools), true);
  assert.equal(Boolean(advertised.resources), false);
  assert.equal(Boolean(advertised.prompts), false);
  const client = new Client({ name: 'generated-http-test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  const headers = { Origin: origin };
  await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp'), { requestInit: { headers } }));
  if (true) assert.equal((await client.listTools()).tools.length, 1);
  if (false) assert.equal((await client.listResources()).resources.length, 0);
  if (false) assert.equal((await client.listPrompts()).prompts.length, 0);
  await client.close(); console.log('verified generated MCP capabilities over HTTP');
} finally { child.kill(); }
