import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { prepareNativeCompanionBundle } from '../../scripts/lib/native-companion-builder.mjs';
import { NATIVE_COMPANIONS, NATIVE_COMPANION_PROFILE, inspectBundledNativeCompanions } from '../../packages/cli/src/native-companion-bundle.mjs';
import { admitRelease } from '../../packages/cli/src/release-trust.mjs';
import { nativeCompanionSources } from '../helpers/native-companion-sources.mjs';
import { nativeAdmissionFixture } from '../../packages/cli/tests/helpers/native-admission-fixture.mjs';


test('locked object projection excludes tracked operational state and ignores working-tree edits', t => {
  const f = nativeCompanionSources(t);
  fs.writeFileSync(path.join(f.base, 'superpowers/skills/example/SKILL.md'), 'uncommitted replacement');
  const prepared = prepareNativeCompanionBundle(f);
  assert.equal(prepared.state, 'UNSIGNED_COMPONENT_PREPARATION'); assert.equal(prepared.authority, 'NONE'); assert.equal(prepared.signed, false);
  assert.equal(prepared.files.some(file => file.path.includes('.beads')), false);
  assert.equal(prepared.files.find(file => file.path.endsWith('superpowers/skills/example/SKILL.md')).bytes.toString(), 'Inert source fixture');
  const signedFixture = nativeAdmissionFixture(t, files => {
    const p = files.find(file => file.path === '.claude-plugin/plugin.json'), m = JSON.parse(p.bytes);
    p.bytes = Buffer.from(JSON.stringify({ ...m, dependencies: NATIVE_COMPANIONS.map(c => c.id) })); files.push(...prepared.files);
  });
  const checked = inspectBundledNativeCompanions(admitRelease(signedFixture.opts));
  assert.equal(checked.state, 'COMPONENT_BYTES_VERIFIED'); assert.equal(checked.authority, 'NONE');
});

test('wrong lock tree and absent source refuse; no acquisition fallback', t => {
  const f = nativeCompanionSources(t); f.lock.components[0].source.tree = '0'.repeat(40);
  assert.throws(() => prepareNativeCompanionBundle(f));
  assert.throws(() => prepareNativeCompanionBundle({ ...f, repositories: {} }));
});

test('selected symlink is refused rather than followed or silently copied', t => {
  const f = nativeCompanionSources(t, ({ prefix }) => fs.symlinkSync('../outside', path.join(prefix, 'skills/linked')));
  assert.throws(() => prepareNativeCompanionBundle(f), /link-or-submodule/);
});

test('missing runtime reference refuses instead of broadening the public allowlist', t => {
  const f = nativeCompanionSources(t, ({ expected, prefix }) => fs.writeFileSync(path.join(prefix, '.claude-plugin/plugin.json'), JSON.stringify({ name: expected.name, version: '1.0.0', license: 'MIT', skills: './excluded/' })));
  assert.throws(() => prepareNativeCompanionBundle(f), /manifest-reference/);
});

test('unknown dependency source and component omission refuse before any source query', t => {
  const f = nativeCompanionSources(t); f.lock.components[0].source.repository = 'https://example.invalid/companion';
  assert.throws(() => prepareNativeCompanionBundle(f), /lock-identity/);
  f.lock.components.pop(); assert.throws(() => prepareNativeCompanionBundle(f), /lock-profile/);
});

test('promisor object lookup refuses without invoking a configured transport helper', t => {
  const f = nativeCompanionSources(t), repo = f.repositories['beads@local'];
  const helper = path.join(f.base, 'uploadpack-fixture'), marker = helper + '.executed';
  fs.writeFileSync(helper, '#!/bin/sh\n: > "$0.executed"\nexit 1\n', { mode: 0o755 });
  const empty = path.join(f.base, 'empty.git'); execFileSync('/usr/bin/git', ['init', '--bare', '--quiet', empty]);
  for (const [key, value] of [['remote.origin.url', 'file://' + empty], ['remote.origin.promisor', 'true'], ['remote.origin.uploadpack', helper]]) {
    execFileSync('/usr/bin/git', ['--git-dir', repo, 'config', key, value]);
  }
  const commit = f.lock.components[0].source.commit;
  fs.unlinkSync(path.join(repo, 'objects', commit.slice(0, 2), commit.slice(2)));
  assert.throws(() => prepareNativeCompanionBundle(f), /promisor|source-query/);
  assert.equal(fs.existsSync(marker), false, 'object inspection never runs upload-pack');
});

test('corrupt nested tree cannot redirect a locked source to a different valid blob', t => {
  const f = nativeCompanionSources(t), repo = f.repositories['superpowers@superpowers-marketplace'];
  const git = args => execFileSync('/usr/bin/git', ['--git-dir', repo, ...args]);
  const tree = git(['rev-parse', f.lock.components[1].source.commit + ':skills/example']).toString().trim();
  const raw = git(['cat-file', 'tree', tree]);
  const bytes = Buffer.from('corrupt fixture replacement'), packet = Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]);
  const blob = createHash('sha1').update(packet).digest('hex');
  const blobFile = path.join(repo, 'objects', blob.slice(0, 2), blob.slice(2));
  fs.mkdirSync(path.dirname(blobFile), { recursive: true }); fs.writeFileSync(blobFile, deflateSync(packet));
  const at = raw.indexOf(0) + 1, changed = Buffer.from(raw); Buffer.from(blob, 'hex').copy(changed, at);
  const treePacket = Buffer.concat([Buffer.from(`tree ${changed.length}\0`), changed]);
  const treeFile = path.join(repo, 'objects', tree.slice(0, 2), tree.slice(2));
  fs.writeFileSync(treeFile + '.replacement', deflateSync(treePacket)); fs.renameSync(treeFile + '.replacement', treeFile);
  assert.throws(() => prepareNativeCompanionBundle(f), /tree.*identity|object.*identity/);
});

test('inline MCP missing local entry refuses during source projection', t => {
  const f = nativeCompanionSources(t, ({ expected, prefix }) => fs.writeFileSync(path.join(prefix, '.claude-plugin/plugin.json'), JSON.stringify({
    name: expected.name, version: '1.0.0', license: 'MIT', mcpServers: { local: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/missing.mjs'] } },
  })));
  assert.throws(() => prepareNativeCompanionBundle(f), /manifest-reference/);
});

test('implicit runtime settings refuse instead of silently disappearing from the projection', t => {
  const f = nativeCompanionSources(t, ({ prefix }) => fs.writeFileSync(path.join(prefix, 'settings.json'), '{}'));
  assert.throws(() => prepareNativeCompanionBundle(f), /implicit-runtime-unsupported/);
});
