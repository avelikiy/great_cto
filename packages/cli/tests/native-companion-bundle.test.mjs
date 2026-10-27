import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { admitRelease } from '../src/release-trust.mjs';
import { inspectBundledNativeCompanions } from '../src/native-companion-bundle.mjs';
import { inspectClaudeNativeAdmission } from '../src/native-plugin-admission.mjs';
import { proposeManagedPluginActivation } from '../src/release-activation.mjs';
import { nativeAdmissionFixture } from './helpers/native-admission-fixture.mjs';

const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const ids = ['beads@local', 'superpowers@superpowers-marketplace'];
function bundle(t, change = () => {}) {
  let descriptor;
  const fixture = nativeAdmissionFixture(t, files => {
    const primary = files.find(f => f.path === '.claude-plugin/plugin.json');
    primary.bytes = Buffer.from(JSON.stringify({ name: 'great-cto', version: '3.72.0', dependencies: ids }));
    const components = ids.map(id => {
      const name = id.split('@')[0], root = 'vendor/native/' + name;
      const members = [
        { path: '.claude-plugin/plugin.json', bytes: Buffer.from(JSON.stringify({ name, version: '1.0.0', license: 'MIT' })), mode: 0o644 },
        { path: 'LICENSE', bytes: Buffer.from('MIT License\nInert test fixture, not upstream source.'), mode: 0o644 },
        { path: 'skills/example/SKILL.md', bytes: Buffer.from('Inert public fixture skill'), mode: 0o644 },
      ];
      for (const file of members) files.push({ ...file, path: root + '/' + file.path });
      return { id, name, version: '1.0.0', root,
        source: { repository: 'https://github.com/' + (name === 'beads' ? 'gastownhall/beads' : 'obra/superpowers'), commit: 'a'.repeat(40), tree: 'b'.repeat(40), subdirectory: name === 'beads' ? 'plugins/beads' : '.' },
        license: { id: 'MIT', path: 'LICENSE', sha256: hash(members[1].bytes) },
        files: members.map(f => ({ path: f.path, size: f.bytes.length, sha256: hash(f.bytes), mode: f.mode,
          sourcePath: name === 'beads' && f.path !== 'LICENSE' ? 'plugins/beads/' + f.path : f.path,
          sourceBlob: hash(Buffer.concat([Buffer.from(`blob ${f.bytes.length}\0`), f.bytes]), 'sha1') })).sort((a, b) => a.path < b.path ? -1 : 1),
      };
    });
    descriptor = { schema: 1, profile: 'great-cto-reviewed-companions-v1', components };
    change(descriptor, files);
    files.push({ path: 'native-companions.json', bytes: Buffer.from(JSON.stringify(descriptor)), mode: 0o644 });
  });
  return { ...fixture, descriptor, get ticket() { return admitRelease(fixture.opts); } };
}
function changeComponentManifest(descriptor, files, mutate) {
  const component = descriptor.components[0], file = files.find(f => f.path === component.root + '/.claude-plugin/plugin.json');
  const manifest = JSON.parse(file.bytes); mutate(manifest); file.bytes = Buffer.from(JSON.stringify(manifest));
  Object.assign(component.files.find(f => f.path === '.claude-plugin/plugin.json'), { size: file.bytes.length, sha256: hash(file.bytes),
    sourceBlob: hash(Buffer.concat([Buffer.from(`blob ${file.bytes.length}\0`), file.bytes]), 'sha1') });
}
function addComponentFile(descriptor, files, name, value) {
  const component = descriptor.components[0], bytes = Buffer.from(JSON.stringify(value));
  files.push({ path: component.root + '/' + name, bytes, mode: 0o644 });
  component.files.push({ path: name, size: bytes.length, sha256: hash(bytes), mode: 0o644, sourcePath: 'plugins/beads/' + name,
    sourceBlob: hash(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), 'sha1') });
  component.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

test('independently checks both signed component inventories without installation authority', t => {
  const f = bundle(t), result = inspectBundledNativeCompanions(f.ticket);
  assert.equal(result.state, 'COMPONENT_BYTES_VERIFIED'); assert.equal(result.authority, 'NONE');
  assert.equal(result.runtimeClosure, 'NOT_CHECKED'); assert.equal(result.activationEligibility, 'NOT_ESTABLISHED');
  assert.deepEqual(result.components.map(c => c.id), ids);
  assert.equal(JSON.stringify(result).includes(f.base), false);
});

test('plain JSON and synthetic admission cannot supply component trust', t => {
  const f = bundle(t);
  assert.throws(() => inspectBundledNativeCompanions({ isProduction: true }));
  assert.throws(() => inspectBundledNativeCompanions(admitRelease(f.opts, { run() { throw Error('not called'); } })), /production.*admission/);
});

const attacks = [
  ['unknown profile', d => { d.profile = 'trust-cached-plugins'; }],
  ['component omitted', d => { d.components.pop(); }],
  ['duplicate identity', d => { d.components[1] = d.components[0]; }],
  ['root alias', d => { d.components[0].root = '.claude'; }],
  ['wrong upstream', d => { d.components[0].source.repository = 'https://example.invalid/replacement'; }],
  ['source with credentials', d => { d.components[0].source.repository = 'https://fixture@example.invalid/source'; }],
  ['invalid source commit', d => { d.components[0].source.commit = 'main'; }],
  ['wrong upstream subdirectory', d => { d.components[0].source.subdirectory = '.'; }],
  ['license changed', d => { d.components[0].license.sha256 = '0'.repeat(64); }],
  ['member mode changed', d => { d.components[0].files[0].mode = 0o755; }],
  ['member digest changed', d => { d.components[0].files[0].sha256 = '0'.repeat(64); }],
  ['source blob changed', d => { d.components[0].files[0].sourceBlob = '0'.repeat(40); }],
  ['source path changed', d => { d.components[0].files[0].sourcePath = 'private/source'; }],
  ['extra descriptor authority', d => { d.authority = 'ACTIVE_VERIFIED'; }],
  ['component helper', d => { d.components[0].installer = 'npx unadmitted'; }],
  ['undeclared component file', (d, files) => { files.push({ path: d.components[0].root + '/skills/extra.md', bytes: Buffer.from('extra'), mode: 0o644 }); }],
  ['unlisted vendor root', (d, files) => { files.push({ path: 'vendor/native/other/extra.md', bytes: Buffer.from('extra'), mode: 0o644 }); }],
  ['required dependency dropped', (d, files) => { const p = files.find(f => f.path === '.claude-plugin/plugin.json'); const m = JSON.parse(p.bytes); m.dependencies = [ids[0]]; p.bytes = Buffer.from(JSON.stringify(m)); }],
  ['inline MCP missing entry', (d, files) => changeComponentManifest(d, files, m => { m.mcpServers = { local: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/missing.mjs'] } }; })],
  ['missing type asset', (d, files) => changeComponentManifest(d, files, m => { m.types = './types/missing.d.ts'; })],
  ['unknown runtime setting', (d, files) => changeComponentManifest(d, files, m => { m.settings = { autoInstall: true }; })],
  ['unbounded hook command', (d, files) => changeComponentManifest(d, files, m => { m.hooks = { SessionStart: [{ hooks: [{ type: 'command', command: 'npx unadmitted' }] }] }; })],
  ['missing hook entry', (d, files) => changeComponentManifest(d, files, m => { m.hooks = { SessionStart: [{ hooks: [{ type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}/hooks/missing"' }] }] }; })],
  ['default MCP missing entry', (d, files) => addComponentFile(d, files, '.mcp.json', { mcpServers: { local: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/missing.mjs'] } } })],
  ['file MCP missing entry', (d, files) => {
    addComponentFile(d, files, 'hooks/mcp.json', { mcpServers: { local: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/missing.mjs'] } } });
    changeComponentManifest(d, files, m => { m.mcpServers = './hooks/mcp.json'; });
  }],
];
for (const [name, mutate] of attacks) test('refuses correctly signed incompatible bundle: ' + name, t => {
  const f = bundle(t, mutate);
  assert.throws(() => inspectBundledNativeCompanions(f.ticket));
});

test('descriptor absence does not make an existing release dependency-compatible', t => {
  const f = nativeAdmissionFixture(t);
  assert.throws(() => inspectBundledNativeCompanions(admitRelease(f.opts)), /descriptor-required/);
});

test('primary preflight exposes checked component bytes while retaining every runtime blocker', t => {
  const f = bundle(t), result = inspectClaudeNativeAdmission(f.ticket);
  assert.equal(result.state, 'UNSUPPORTED'); assert.equal(result.registration, 'UNCHANGED');
  assert.equal(result.dependencies.state, 'COMPONENT_BYTES_VERIFIED');
  assert.ok(result.blockers.includes('native-companion-runtime-closure-not-established'));
  assert.ok(result.blockers.includes('native-activation-and-recovery-not-established'));
  assert.equal(result.blockers.includes('external-plugin-dependency-admission-required'), false);
  const proposal = proposeManagedPluginActivation(f.ticket);
  assert.equal(proposal.state, 'UNSUPPORTED'); assert.equal(proposal.authority, 'NONE');
  assert.equal(proposal.nativeInspection.dependencies.state, 'COMPONENT_BYTES_VERIFIED');
});

test('a present descriptor cannot suppress missing mandatory dependency declarations', t => {
  const f = bundle(t, (d, files) => {
    const p = files.find(file => file.path === '.claude-plugin/plugin.json'), m = JSON.parse(p.bytes);
    delete m.dependencies; p.bytes = Buffer.from(JSON.stringify(m));
  });
  assert.throws(() => f.ticket, /native-companion-required-dependencies/);
});
