import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOwnedPhaseFixture } from '../../scripts/lib/owned-phase-fixture.mjs';
import { runMcpSmoke } from '../../scripts/lib/mcp-smoke.mjs';

test('actual source CLI provides owned SSE initialize and tool inventory without calls', { timeout: 20000 }, async () => {
  const result = await runMcpSmoke({ cliPath: fileURLToPath(new URL('../../packages/cli/index.mjs', import.meta.url)) });
  assert.equal(result.ownedListenerVerified, true);
  assert.equal(result.protocolVersion, '2024-11-05');
  assert.equal(result.toolsListed, 7);
  assert.equal(result.toolCalls, 0); assert.equal(result.providerCalls, 0);
});

function fixture(t, code) {
  const owned = createOwnedPhaseFixture(); t.after(() => owned.cleanup());
  const cliPath = join(owned.root, 'fixture.mjs'); writeFileSync(cliPath, code); return cliPath;
}

test('exit zero and printed readiness cannot satisfy owned listener', async t => {
  const cliPath = fixture(t, "console.error('http://localhost:8766/sse');process.exit(0);");
  await assert.rejects(runMcpSmoke({ cliPath }), /exited before owned listener/);
});

test('fixed-port bind is refused without querying or stopping another server', async t => {
  let requests = 0;
  const server = createServer((_, response) => { requests++; response.end('{"transport":"sse"}'); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const cliPath = fixture(t, `import{createServer}from'node:http';createServer().listen(${server.address().port},'127.0.0.1');`);
    await assert.rejects(runMcpSmoke({ cliPath }), /non-ephemeral loopback bind/);
    assert.equal(requests, 0); assert.equal(server.listening, true);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('unexpected subprocess is intercepted rather than executing a model', async t => {
  const cliPath = fixture(t, "import{spawn}from'node:child_process';spawn('claude',['-p','must not run']);");
  await assert.rejects(runMcpSmoke({ cliPath }), /refused subprocess/);
});

test('stock smoke captures logs and delegates MCP readiness without fixed paths or port', () => {
  const source = readFileSync(fileURLToPath(new URL('../../scripts/test-pipeline.sh', import.meta.url)), 'utf8');
  assert.ok(!source.includes('/tmp/gctest-l1-'));
  assert.ok(!source.includes('--port 8766'));
  assert.ok(source.includes('node "$ROOT/scripts/lib/mcp-smoke.mjs" "$PLUGIN_DIR/packages/cli/index.mjs"'));
});
