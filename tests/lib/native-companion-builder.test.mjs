import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
