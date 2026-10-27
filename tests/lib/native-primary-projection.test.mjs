import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { prepareClaudePrimaryProjection, validateClaudePrimaryProjection, NATIVE_ROOT_PREFIX } from '../../packages/cli/src/native-primary-projection.mjs';
const inputs = () => ({ sourceManifestText: readFileSync('.claude-plugin/plugin.json', 'utf8'),
 policyText: readFileSync('scripts/hooks/native-startup-policy.json', 'utf8'),
 contextBytes: readFileSync('scripts/hooks/native-session-context.mjs'), routerBytes: readFileSync('mcp-servers/llm-router/server-native.mjs') });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
test('unsigned projection is deterministic, source preserving and unsupported for activation', () => {
 const input = inputs(), before = { ...input, contextBytes: Buffer.from(input.contextBytes), routerBytes: Buffer.from(input.routerBytes) };
 const a = prepareClaudePrimaryProjection(input), b = prepareClaudePrimaryProjection(input);
 assert.deepEqual(a, b); assert.equal(a.authority, 'NONE'); assert.equal(a.activation, 'UNSUPPORTED');
 assert(a.manifestBytes.equals(b.manifestBytes)); assert(a.descriptorBytes.equals(b.descriptorBytes)); assert.deepEqual(input, before);
 const descriptor = JSON.parse(a.descriptorBytes); assert.equal(descriptor.sourceSlots, 54); assert.equal(descriptor.retainedSourceSlots, 53);
 assert.equal(descriptor.sourceManifestSha256, sha(input.sourceManifestText)); assert.equal(descriptor.projectedManifestSha256, sha(a.manifestBytes));
 assert(!a.descriptorBytes.toString().includes('git clone')); assert(!a.descriptorBytes.toString().includes('/Users/'));
 assert.equal(validateClaudePrimaryProjection({ ...input, manifestBytes: a.manifestBytes, descriptorBytes: a.descriptorBytes }).state, 'VALID_UNSIGNED_PROJECTION_ONLY');
});
test('every53 retained commands and all matcher/order/timeout/async metadata remain exact', () => {
 const input = inputs(), original = JSON.parse(input.sourceManifestText), projected = JSON.parse(prepareClaudePrimaryProjection(input).manifestBytes);
 for (const [event, groups] of Object.entries(original.hooks)) for (const [ei, group] of groups.entries()) {
  const candidate = projected.hooks[event][ei]; assert.deepEqual(Object.keys(candidate), Object.keys(group));
  assert.equal(candidate.matcher, group.matcher); assert.equal(candidate.hooks.length, group.hooks.length);
  for (const [hi, hook] of group.hooks.entries()) {
   const derived = candidate.hooks[hi]; assert.deepEqual({ ...derived, command: hook.command }, hook);
   if (event !== 'SessionStart' || ei !== 0 || hi !== 1) assert.equal(derived.command, NATIVE_ROOT_PREFIX + hook.command);
   else { assert(derived.command.startsWith(NATIVE_ROOT_PREFIX)); assert(derived.command.includes('native-session-context.mjs')); assert(!derived.command.includes('git clone')); assert(!derived.command.includes('quota-check')); }
  }
 }
 for (const event of ['PreToolUse', 'Stop', 'PostToolUseFailure']) assert.deepEqual(projected.hooks[event].map(g => g.matcher), original.hooks[event].map(g => g.matcher));
});
test('MCP server name remains stable and uses only the local Node entry', () => {
 const p = JSON.parse(prepareClaudePrimaryProjection(inputs()).manifestBytes);
 assert.deepEqual(p.mcpServers, { great_cto_llm_router: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/mcp-servers/llm-router/server-native.mjs'] } });
});
test('missing/extra/changed source inputs refuse rather than dropping unknown behavior', () => {
 for (const patch of [{ contextBytes: null }, { routerBytes: Buffer.alloc(0) }, { policyText: '{}' }, { sourceManifestText: '{}' },
  { extra: 'unrecognized' }, { contextBytes: Buffer.alloc(1048577) }]) assert.throws(() => prepareClaudePrimaryProjection({ ...inputs(), ...patch }), /native primary projection refused/);
 const input = inputs(), m = JSON.parse(input.sourceManifestText); m.hooks.PreToolUse[0].hooks.pop();
 assert.throws(() => prepareClaudePrimaryProjection({ ...input, sourceManifestText: JSON.stringify(m) }));
});
test('changed guards, metadata, MCP config and recalculated attacker digests still refuse', () => {
 const input = inputs(), result = prepareClaudePrimaryProjection(input);
 for (const mutate of [m => m.hooks.PreToolUse[0].hooks[0].command = 'true', m => m.hooks.Stop.reverse(),
  m => m.hooks.PreToolUse[0].matcher = '', m => m.hooks.PreToolUse[0].hooks[0].timeout = 600,
  m => m.hooks.SessionStart[0].hooks[1].command = NATIVE_ROOT_PREFIX + 'true',
  m => m.mcpServers.great_cto_llm_router.command = 'npx', m => m.mcpServers.extra = { command: 'node', args: ['foreign.mjs'] }]) {
  const m = JSON.parse(result.manifestBytes); mutate(m); const bytes = Buffer.from(JSON.stringify(m, null, 2) + '\n');
  const descriptor = JSON.parse(result.descriptorBytes); descriptor.projectedManifestSha256 = sha(bytes);
  assert.equal(validateClaudePrimaryProjection({ ...input, manifestBytes: bytes, descriptorBytes: Buffer.from(JSON.stringify(descriptor, null, 2) + '\n') }).state, 'REFUSED');
 }
});
test('descriptor extra fields, duplicate keys, runtime substitutions and serialized PASS refuse', () => {
 const input = inputs(), result = prepareClaudePrimaryProjection(input);
 for (const descriptorBytes of [Buffer.from('{}'), Buffer.from(JSON.stringify({ ...JSON.parse(result.descriptorBytes), approved: true })),
  Buffer.from(result.descriptorBytes.toString().replace('"schema":', '"schema":9,"schema":'))]) {
  assert.equal(validateClaudePrimaryProjection({ ...input, manifestBytes: result.manifestBytes, descriptorBytes }).state, 'REFUSED');
 }
 assert.equal(validateClaudePrimaryProjection({ ...input, manifestBytes: result.manifestBytes, descriptorBytes: result.descriptorBytes, contextBytes: Buffer.from('changed') }).state, 'REFUSED');
 assert.equal(validateClaudePrimaryProjection({ state: 'VALID_UNSIGNED_PROJECTION_ONLY', authority: 'NONE' }).state, 'REFUSED');
});
test('actual shell prefix refuses missing/mismatched roots before marker, including metacharacters', t => {
 const root = realpathSync(mkdtempSync(join(tmpdir(), 'native-root-prefix-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
 const script = join(root, 'owned-prefix.sh'); writeFileSync(script, NATIVE_ROOT_PREFIX + 'printf marker\n');
 for (const env of [{}, { CLAUDE_PLUGIN_ROOT: root }, { CLAUDE_PLUGIN_ROOT: root, GREAT_CTO_NATIVE_PLUGIN_ROOT: root + '-foreign' }]) {
  const p = spawnSync('/bin/bash', ['--noprofile', '--norc', script], { cwd: root, env: { PATH: '/usr/bin:/bin', ...env }, encoding: 'utf8', timeout: 2000 });
  assert.equal(p.status, 2); assert.equal(p.stdout, ''); assert.equal(p.stderr, 'native plugin root binding refused\n');
 }
 const malicious = root + '$(touch injected)';
 const p = spawnSync('/bin/bash', ['--noprofile', '--norc', script], { cwd: root, env: { PATH: '/usr/bin:/bin', CLAUDE_PLUGIN_ROOT: malicious, GREAT_CTO_NATIVE_PLUGIN_ROOT: malicious }, encoding: 'utf8', timeout: 2000 });
 assert.equal(p.status, 0); assert.equal(p.stdout, 'marker'); assert(!existsSync(join(root, 'injected')));
 const q = spawnSync('/bin/bash', ['--noprofile', '--norc', script], { cwd: root, env: { PATH: '/usr/bin:/bin', CLAUDE_PLUGIN_ROOT: root, GREAT_CTO_NATIVE_PLUGIN_ROOT: root }, encoding: 'utf8', timeout: 2000 });
 assert.equal(q.status, 0); assert.equal(q.stdout, 'marker');
});
