import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNativeCompanionProjection, projectNativeCompanionBytes, originalNativeCompanionMember } from '../../packages/cli/src/native-companion-projection.mjs';
import { requiredHardenedMembers } from '../../packages/cli/src/native-companion-hardening.mjs';

const beads = { id: 'beads@local', name: 'beads', version: '1.3.2', projection: 'beads-offline-guidance-v2', source: {
  repository: 'https://github.com/gastownhall/beads', commit: '43f41374a34d82ecf40903451eea277fbb4f1e75', tree: '28f79ffc36555222f62fe82410410e69e60d8b79', subdirectory: 'plugins/beads' } };
const superpowers = { id: 'superpowers@superpowers-marketplace', name: 'superpowers', version: '6.2.0', projection: 'superpowers-offline-runtime-v1', source: {
  repository: 'https://github.com/obra/superpowers', commit: '3dcbd5c4b48e02263fbf4a3c01e3fe4f81d584d9', tree: 'da1e7bb99212a060f90ffd6def69ff606775a79c', subdirectory: '.' } };

for (const component of [beads, superpowers]) {
  test(component.name + ': hardened recipe requires exact upstream identity', () => {
    assert.doesNotThrow(() => assertNativeCompanionProjection(component));
    for (const field of ['repository', 'commit', 'tree', 'subdirectory']) {
      assert.throws(() => assertNativeCompanionProjection({ ...component, source: { ...component.source, [field]: 'changed' } }));
    }
    for (const field of ['id', 'name', 'version', 'projection']) assert.throws(() => assertNativeCompanionProjection({ ...component, [field]: 'changed' }));
  });
  test(component.name + ': changed member bytes cannot borrow a known recipe in either direction', () => {
    const paths = requiredHardenedMembers(component);
    assert.equal(paths.length, 2);
    for (const member of paths) {
      for (const bytes of [Buffer.alloc(0), Buffer.from('changed source'), Buffer.from('offline-companion-existing-pid-refused')]) {
        assert.throws(() => projectNativeCompanionBytes(component, member, bytes), /hardening-refused/);
        assert.throws(() => originalNativeCompanionMember(component, member, bytes), /hardening-refused/);
      }
    }
  });
  test(component.name + ': unrelated members preserve raw bytes and original path', () => {
    const bytes = Buffer.from([0xff, 0x00, 0x0d, 0x0a]);
    const output = projectNativeCompanionBytes(component, 'LICENSE', bytes);
    assert.deepEqual(output, bytes);
    assert.deepEqual(originalNativeCompanionMember(component, 'LICENSE', output), { path: 'LICENSE', bytes });
  });
}
test('Beads hardened projection retains exact guide mapping without decoding source', () => {
  const bytes = Buffer.from('resources/AGENTS.md\r\nresources/AGENTS.md\n');
  const output = projectNativeCompanionBytes(beads, 'skills/beads/SKILL.md', bytes);
  assert.deepEqual(originalNativeCompanionMember(beads, 'skills/beads/SKILL.md', output).bytes, bytes);
});
test('legacy projections do not claim hardened member requirements', () => {
  assert.deepEqual(requiredHardenedMembers({ ...beads, projection: 'beads-runtime-guidance-v1' }), []);
  assert.deepEqual(requiredHardenedMembers({ ...superpowers, projection: 'verbatim-runtime-allowlist-v1' }), []);
});
