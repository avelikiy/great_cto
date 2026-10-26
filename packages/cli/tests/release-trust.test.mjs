import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { encodeReleaseArchive } from '../src/release-archive.mjs';
import { validateReleaseIndex, parseStrictReleaseIndex, admitRelease, getAdmissionInfo, getAdmittedArtifact, inspectNpmPayload, inspectPluginPayload } from '../src/release-trust.mjs';

const digest = (bytes, kind = 'sha256') => createHash(kind).update(bytes).digest('hex');
const version = '3.71.0', commit = 'a'.repeat(40), tree = 'b'.repeat(40);
function fixture(t, { dependencies = {}, pluginExtra = false, packageFields = {}, npmImport = null, npmSource = null, claudeFields = {}, codexFields = {}, pluginMembers = [] } = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-admission-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const directory = path.join(base, 'stage'); fs.mkdirSync(directory, { mode: 0o700 });
  const cosignPath = path.join(base, 'cosign'), trustedRootPath = path.join(base, 'trusted-root.json');
  fs.writeFileSync(cosignPath, 'trusted-fixture-tool', { mode: 0o700 });
  fs.writeFileSync(trustedRootPath, '{}', { mode: 0o600 });
  const npmFiles = [{ path: 'package.json', bytes: Buffer.from(JSON.stringify({ name: 'great-cto', version, bin: { 'great-cto': 'index.mjs' }, dependencies, ...packageFields })), mode: 0o644 },
    ...['index.mjs', 'dist/main.js', 'board/packages/board/server.mjs'].map(p => ({ path: p, bytes: Buffer.from('// inert fixture'), mode: p === 'index.mjs' ? 0o755 : 0o644 }))];
  if (npmImport) npmFiles.find(f => f.path === 'dist/main.js').bytes = Buffer.from(`import '${npmImport}';`);
  if (npmSource) npmFiles.find(f => f.path === 'dist/main.js').bytes = Buffer.from(npmSource);
  const pluginFiles = ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'packages/cli/dist/main.js', 'packages/cli/index.mjs', 'packages/board/server.mjs'].map(p => ({ path: p, bytes: Buffer.from(p.endsWith('plugin.json') ? JSON.stringify({ name: 'great-cto', version }) : '// fixture'), mode: 0o644 }));
  for (const [name, fields] of [['.claude-plugin/plugin.json', claudeFields], ['.codex-plugin/plugin.json', codexFields]]) pluginFiles.find(f => f.path === name).bytes = Buffer.from(JSON.stringify({ name: 'great-cto', version, ...fields }));
  for (const name of pluginMembers) pluginFiles.push({ path: name, bytes: Buffer.from('// public inert fixture'), mode: 0o644 });
  const inventory = { schema: 1, version, files: pluginFiles.map(f => ({ path: f.path, size: f.bytes.length, sha256: digest(f.bytes), mode: f.mode })).sort((a, b) => a.path.localeCompare(b.path)) };
  if (pluginExtra) pluginFiles.push({ path: 'extra.mjs', bytes: Buffer.from('// unexpected'), mode: 0o644 });
  const blobs = { npm: [`great-cto-${version}.tgz`, encodeReleaseArchive(npmFiles)], plugin: [`great-cto-plugin-${version}.tgz`, encodeReleaseArchive(pluginFiles)], inventory: ['plugin-inventory.json', Buffer.from(JSON.stringify(inventory))], sbom: ['sbom.cdx.json', Buffer.from('{"bomFormat":"CycloneDX"}')] };
  const index = { schema: 1, package: 'great-cto', version, source: { repository: 'avelikiy/great_cto', commit, tree, tag: `v${version}` }, publisher: { workflow: '.github/workflows/publish.yml' }, artifacts: Object.entries(blobs).map(([kind, [filename, bytes]]) => ({ kind, filename, size: bytes.length, sha256: digest(bytes), sha512: digest(bytes, 'sha512') })) };
  for (const [, [name, bytes]] of Object.entries(blobs)) { fs.writeFileSync(path.join(directory, name), bytes, { mode: 0o600 }); fs.writeFileSync(path.join(directory, name + '.sigstore.json'), '{}', { mode: 0o600 }); }
  fs.writeFileSync(path.join(directory, 'release-index.json'), JSON.stringify(index), { mode: 0o600 });
  fs.writeFileSync(path.join(directory, 'release-index.json.sigstore.json'), '{}', { mode: 0o600 });
  const calls = [];
  const run = (bin, args, options) => { calls.push({ bin, args, options }); return args[0] === 'version' ? JSON.stringify({ gitVersion: 'v3.1.4' }) : ''; };
  const opts = { directory, version, expectedCommit: commit, currentVersion: '3.70.1', cosignPath, trustedRootPath, cosignSha256: digest(fs.readFileSync(cosignPath)), trustedRootSha256: digest(fs.readFileSync(trustedRootPath)) };
  return { base, directory, index, opts, calls, run };
}

test('strict JSON rejects duplicate decoded keys, deep nesting and non-JSON primitives', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"__proto__":{}}', 'NaN', '{"x":1,}', '['.repeat(34) + '0' + ']'.repeat(34)]) assert.throws(() => parseStrictReleaseIndex(text), /JSON|duplicate|key|depth|schema|object/);
});

test('signed inventory is insufficient when manifest agent, type or Codex runtime references are missing', t => {
  for (const options of [
    { claudeFields: { agents: ['./agents-full/architect.md'] } },
    { claudeFields: { types: './types/index.d.ts' } },
    { codexFields: { skills: './skills/', hooks: './.codex-plugin/hooks.json' } },
    { codexFields: { interface: { composerIcon: './assets/icon.svg' } } },
    { claudeFields: { agents: ['../outside.md'] } },
    { claudeFields: { types: './types/index.d.ts/' }, pluginMembers: ['types/index.d.ts'] },
    { codexFields: { hooks: ['./missing-hooks.json'] } },
    { claudeFields: { mcpServers: ['./missing-mcp.json'] } },
    { codexFields: { skills: './skills.md/' }, pluginMembers: ['skills.md'] },
  ]) {
    const f = fixture(t, options);
    assert.throws(() => admitRelease(f.opts, { run: f.run }), /manifest.*(?:reference|path)/);
  }
  const f = fixture(t, { claudeFields: { agents: ['./agents-full/architect.md'], types: './types/index.d.ts' },
    codexFields: { skills: './skills/', hooks: './.codex-plugin/hooks.json', interface: { composerIcon: './assets/icon.svg' } },
    pluginMembers: ['agents-full/architect.md', 'types/index.d.ts', 'skills/core/SKILL.md', '.codex-plugin/hooks.json', 'assets/icon.svg'] });
  assert.equal(getAdmissionInfo(admitRelease(f.opts, { run: f.run })).authority, 'NONE');
});

test('index binds exact source/version/workflow and permits no arbitrary URL or extra kind', t => {
  const { index } = fixture(t);
  assert.equal(validateReleaseIndex(index, { version }).version, version);
  const bad = [];
  for (const change of [x => { x.source.repository = 'other/repo'; }, x => { x.publisher.workflow = '.github/workflows/test.yml'; }, x => { x.source.tag = 'main'; }, x => { x.source.commit = 'bad'; }, x => { x.artifacts[0].filename = '../escape'; }, x => { x.artifacts[0].url = 'https://invalid.example'; }, x => { x.artifacts[0].kind = 'helper'; }, x => { x.artifacts.push(x.artifacts[0]); }]) { const x = structuredClone(index); change(x); bad.push(x); }
  for (const x of bad) assert.throws(() => validateReleaseIndex(x, { version }), /index|source|publisher|artifact|schema|field|filename|kind|tag/);
  assert.throws(() => validateReleaseIndex(index, { version, expectedCommit: 'c'.repeat(40) }), /commit/);
  assert.throws(() => validateReleaseIndex(index, { version, currentVersion: '3.72.0' }), /version|downgrade/);
});

test('synthetic verifier proves argument ordering only and never grants activation authority', t => {
  const { opts, calls, run } = fixture(t);
  const ticket = admitRelease(opts, { run }); const info = getAdmissionInfo(ticket);
  assert.equal(info.isProduction, false); assert.equal(info.authority, 'NONE'); assert.equal(info.evidence, 'SYNTHETIC_ONLY'); assert.equal(info.releaseEligibility, 'NOT_CHECKED');
  assert.equal(info.commit, commit); assert.ok(Object.isFrozen(info));
  const verifies = calls.filter(c => c.args[0] === 'verify-blob'); assert.equal(verifies.length, 5);
  for (const c of verifies) {
    for (const [flag, value] of [['--certificate-identity', `https://github.com/avelikiy/great_cto/.github/workflows/publish.yml@refs/tags/v${version}`], ['--certificate-oidc-issuer', 'https://token.actions.githubusercontent.com'], ['--certificate-github-workflow-sha', commit], ['--certificate-github-workflow-repository', 'avelikiy/great_cto'], ['--certificate-github-workflow-ref', `refs/tags/v${version}`], ['--certificate-github-workflow-trigger', 'push']]) assert.equal(c.args[c.args.indexOf(flag) + 1], value);
    assert.equal(c.args.some(a => /insecure|regexp/.test(a)), false); assert.equal(c.options.env.SIGSTORE_ROOT_FILE, undefined); assert.equal(c.options.env.NODE_OPTIONS, undefined);
  }
  assert.equal(inspectNpmPayload(ticket).version, version);
  assert.equal(inspectPluginPayload(ticket).version, version);
});

test('forged tickets and changed staged bytes cannot reach activation', t => {
  const { opts, run, directory } = fixture(t); const ticket = admitRelease(opts, { run });
  assert.throws(() => getAdmissionInfo({ version }), /admission|ticket/);
  assert.throws(() => getAdmittedArtifact({}, 'npm'), /admission|ticket/);
  fs.appendFileSync(path.join(directory, `great-cto-${version}.tgz`), 'changed');
  assert.throws(() => getAdmittedArtifact(ticket, 'npm'), /changed|digest|identity|size/);
});

test('verification failure, missing bundle, unsafe stage and mismatched trusted pins refuse', t => {
  const f = fixture(t);
  assert.throws(() => admitRelease(f.opts, { run: () => { throw Error('signature rejected'); } }), /signature rejected|verification/);
  assert.throws(() => admitRelease({ ...f.opts, cosignSha256: '0'.repeat(64) }, { run: f.run }), /cosign|verifier|digest/);
  assert.throws(() => admitRelease({ ...f.opts, trustedRootSha256: '0'.repeat(64) }, { run: f.run }), /root|digest/);
  assert.throws(() => admitRelease(f.opts, { run: () => JSON.stringify({ gitVersion: 'v3.1.3' }) }), /version|verifier/);
  fs.unlinkSync(path.join(f.directory, 'release-index.json.sigstore.json'));
  assert.throws(() => admitRelease(f.opts, { run: f.run }), /ENOENT|bundle|regular/);
  fs.chmodSync(f.directory, 0o755); assert.throws(() => admitRelease(f.opts, { run: f.run }), /private|permission|0700/);
});

test('hardlinks and symlinks cannot substitute already-admitted staged files', t => {
  const f = fixture(t), ticket = admitRelease(f.opts, { run: f.run });
  const npm = path.join(f.directory, `great-cto-${version}.tgz`), outside = path.join(f.base, 'outside');
  fs.renameSync(npm, outside); fs.symlinkSync(outside, npm);
  assert.throws(() => getAdmittedArtifact(ticket, 'npm'), /symlink|regular|link|identity/);
  fs.unlinkSync(npm); fs.linkSync(outside, npm);
  assert.throws(() => getAdmittedArtifact(ticket, 'npm'), /link|regular|identity/);
});

test('npm dependency closure and unlisted plugin membership refuse despite signed fixture bytes', t => {
  const npm = fixture(t, { dependencies: { unrelated: '^1' } });
  assert.throws(() => inspectNpmPayload(admitRelease(npm.opts, { run: npm.run })), /dependenc/);
  const plugin = fixture(t, { pluginExtra: true });
  assert.throws(() => inspectPluginPayload(admitRelease(plugin.opts, { run: plugin.run })), /inventory|membership|extra/);
});

test('a signed npm payload cannot add bin names, man links or workspace installs', t => {
  for (const packageFields of [{ bin: { 'great-cto': 'index.mjs', neighbor: 'extra.mjs' } }, { bin: { 'great-cto': '../outside' } }, { man: ['manual.1'] }, { workspaces: ['packages/*'] }, { optionalDependencies: { other: '1' } }, { bundledDependencies: ['other'] }]) {
    const f = fixture(t, { packageFields });
    assert.throws(() => inspectNpmPayload(admitRelease(f.opts, { run: f.run })), /bin|install targets|dependenc/);
  }
});

test('same-version replay needs exact retained index digest and downgrade never admits', t => {
  const f = fixture(t); const raw = fs.readFileSync(path.join(f.directory, 'release-index.json'));
  assert.throws(() => admitRelease({ ...f.opts, currentVersion: version }, { run: f.run }), /retained index digest/);
  assert.throws(() => admitRelease({ ...f.opts, currentVersion: version, currentIndexDigest: 'c'.repeat(64) }, { run: f.run }), /digest changed/);
  assert.equal(getAdmissionInfo(admitRelease({ ...f.opts, currentVersion: version, currentIndexDigest: digest(raw) }, { run: f.run })).version, version);
});

test('admission metadata refuses a changed index even when the selected artifact is unchanged', t => {
  const f = fixture(t), ticket = admitRelease(f.opts, { run: f.run });
  fs.appendFileSync(path.join(f.directory, 'release-index.json'), ' ');
  assert.throws(() => getAdmissionInfo(ticket), /index changed/);
  assert.throws(() => getAdmittedArtifact(ticket, 'npm'), /index changed/);
});

test('missing or escaping literal runtime imports refuse instead of admitting incomplete dist', t => {
  for (const npmImport of ['./missing.js', '../../../outside.mjs', './main.js?other']) {
    const f = fixture(t, { npmImport });
    assert.throws(() => inspectNpmPayload(admitRelease(f.opts, { run: f.run })), /runtime import/);
  }
});

test('no admission ticket is issued before both package and plugin content gates pass', t => {
  for (const options of [{ dependencies: { unexpected: '1' } }, { pluginExtra: true }, { npmImport: './missing.js' }]) {
    const f = fixture(t, options);
    assert.throws(() => admitRelease(f.opts, { run: f.run }), /dependenc|inventory|runtime import/);
  }
});

test('an explanatory ellipsis is not treated as a relative module path', t => {
  const f = fixture(t, { npmSource: "// counted from `import ... from '...'` statements\nexport {};" });
  assert.equal(getAdmissionInfo(admitRelease(f.opts, { run: f.run })).authority, 'NONE');
});

test('default production admission rejects a caller-self-pinned verifier and custom CA before executing it', t => {
  const f = fixture(t), marker = path.join(f.base, 'unexpected-verifier-execution');
  fs.writeFileSync(f.opts.cosignPath, '#!/usr/bin/env node\n' + `require('node:fs').appendFileSync(${JSON.stringify(marker)},'executed');\n` + "if(process.argv.includes('version')) console.log(JSON.stringify({gitVersion:'v3.1.4'}));\n");
  const opts = { ...f.opts, cosignSha256: digest(fs.readFileSync(f.opts.cosignPath)) };
  assert.throws(() => admitRelease(opts), /pinned production|production.*pin|unsupported verifier platform/);
  assert.equal(fs.existsSync(marker), false, 'an untrusted self-pinned tool must never run');
});
