import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { admitRelease } from '../src/release-trust.mjs';
import { inspectClaudeNativeAdmission } from '../src/native-plugin-admission.mjs';
import { proposeManagedPluginActivation } from '../src/release-activation.mjs';
import { nativeAdmissionFixture } from './helpers/native-admission-fixture.mjs';

const add = (files, name, value) => files.push({ path: name, bytes: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)), mode: 0o644 });
const manifest = files => JSON.parse(files.find(file => file.path === '.claude-plugin/plugin.json').bytes);
const setManifest = (files, value) => { files.find(file => file.path === '.claude-plugin/plugin.json').bytes = Buffer.from(JSON.stringify(value)); };
const local = { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/runtime/server.mjs'] };
function candidate(t, change = () => {}) {
  const f = nativeAdmissionFixture(t, files => {
    setManifest(files, { ...manifest(files), mcpServers: { local } });
    add(files, 'runtime/server.mjs', '// inert fixture, never executed'); change(files);
  });
  return { ...f, ticket: admitRelease(f.opts) };
}
function inspect(t, change) { return inspectClaudeNativeAdmission(candidate(t, change).ticket); }
function blocked(result, code) {
  assert.equal(result.state, 'UNSUPPORTED'); assert.ok(result.blockers.includes(code), JSON.stringify(result));
  assert.equal(result.authority, 'NONE'); assert.equal(result.registration, 'UNCHANGED');
  assert.equal(result.process, 'NOT_OBSERVED'); assert.equal(result.releaseEligibility, 'NOT_CHECKED');
}

test('opaque admission required; JSON and serialized inspection never become capabilities', t => {
  for (const value of [null, {}, { type: 'release-admission', isProduction: true }, JSON.parse(JSON.stringify(candidate(t).ticket))]) {
    assert.equal(inspectClaudeNativeAdmission(value).state, 'REFUSED');
  }
  const inspected = inspect(t);
  assert.equal(inspectClaudeNativeAdmission(inspected).state, 'REFUSED');
});

test('real ephemeral signatures prove bytes only, never native activation or runtime closure', t => {
  const f = candidate(t), before = fs.readdirSync(f.base).sort();
  const result = inspectClaudeNativeAdmission(f.ticket);
  blocked(result, 'native-activation-and-recovery-not-established');
  assert.equal(result.artifact, 'ADMITTED'); assert.equal(result.payload, 'ARCHIVE_BYTES_VERIFIED');
  assert.equal(result.mcp, 'NOT_CHECKED'); assert.equal(result.hooks, 'NOT_CHECKED');
  assert.deepEqual(fs.readdirSync(f.base).sort(), before);
});

test('synthetic admission stays refused even when real fixture signatures are valid', t => {
  const f = candidate(t); let executions = 0;
  const ticket = admitRelease(f.opts, { run() { executions++; throw Error('must not execute'); } });
  const result = inspectClaudeNativeAdmission(ticket);
  assert.equal(result.state, 'REFUSED'); assert.equal(result.authority, 'NONE');
  assert.deepEqual(result.blockers, ['production-artifact-admission-required']); assert.equal(executions, 0);
});

test('artifact changes after admission refuse on every read without leaking the path', t => {
  const f = candidate(t), archive = path.join(f.directory, 'great-cto-plugin-3.72.0.tgz');
  fs.appendFileSync(archive, 'changed');
  const result = inspectClaudeNativeAdmission(f.ticket);
  assert.equal(result.state, 'REFUSED'); assert.equal(JSON.stringify(result).includes(f.base), false);
});

for (const dependencies of [['superpowers@superpowers-marketplace', 'beads@local'], { beads: 'local' }, null, [5]]) {
  test(`dependency declaration refuses: ${JSON.stringify(dependencies)}`, t => {
    const result = inspect(t, files => setManifest(files, { ...manifest(files), dependencies }));
    blocked(result, Array.isArray(dependencies) && dependencies.every(value => typeof value === 'string') ?
      'external-plugin-dependency-admission-required' : 'invalid-native-dependency-declaration');
  });
}

for (const command of ['npx', 'npm', 'python3', '/usr/local/bin/node', 'node; touch /tmp/unowned']) {
  test(`ambient or dynamic MCP command refuses: ${command}`, t => {
    blocked(inspect(t, files => setManifest(files, { ...manifest(files), mcpServers: { local: { ...local, command } } })), 'external-mcp-runtime-admission-required');
  });
}

for (const args of [[], ['--eval', 'process.exit(0)'], ['${CLAUDE_PLUGIN_ROOT}/runtime/../runtime/server.mjs'], ['https://example.invalid/mcp'], ['${CLAUDE_PLUGIN_ROOT}/runtime/missing.mjs']]) {
  test(`nonlocal, missing or additional MCP arguments refuse: ${JSON.stringify(args)}`, t => {
    blocked(inspect(t, files => setManifest(files, { ...manifest(files), mcpServers: { local: { ...local, args } } })), 'local-native-mcp-entry-required');
  });
}

test('host-default MCP and hooks are inspected without a manifest reference', t => {
  const result = inspect(t, files => {
    const value = manifest(files); delete value.mcpServers; setManifest(files, value);
    add(files, '.mcp.json', { mcpServers: { other: { command: 'npx', args: ['-y', 'unadmitted'] } } });
    add(files, 'hooks/hooks.json', { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'git clone https://example.invalid' }] }] } });
  });
  blocked(result, 'external-mcp-runtime-admission-required'); blocked(result, 'native-hook-execution-contract-required');
});

test('inline hooks, duplicate MCP, settings, extensions and environment cannot be silently omitted', t => {
  const f = candidate(t, files => {
    setManifest(files, { ...manifest(files), hooks: {}, lspServers: {}, mcpServers: { local: { ...local, env: { TOKEN: 'private-fixture-token' }, headersHelper: 'unadmitted command' } } });
    add(files, '.mcp.json', { mcpServers: { local } }); add(files, 'settings.json', {});
  });
  const result = inspectClaudeNativeAdmission(f.ticket);
  for (const code of ['native-hook-execution-contract-required', 'ambiguous-native-mcp-configuration',
    'native-settings-execution-contract-required', 'unsupported-native-manifest-extension',
    'native-mcp-environment-contract-required', 'unsupported-native-mcp-extension']) blocked(result, code);
  assert.equal(JSON.stringify(result).includes('private-fixture-token'), false);
});

test('existing proposal also reports unsupported inline startup hooks', t => {
  const f = candidate(t, files => setManifest(files, { ...manifest(files), hooks: { SessionStart: [] } }));
  const result = proposeManagedPluginActivation(f.ticket);
  assert.equal(result.state, 'UNSUPPORTED'); assert.equal(result.reason, 'native-hook-execution-contract-required');
  assert.equal(result.authority, 'NONE'); assert.equal(result.nativeInspection.registration, 'UNCHANGED');
});
