import test from 'node:test';
import assert from 'node:assert/strict';
import { projectNativeCompanionPath, projectNativeCompanionBytes, originalNativeCompanionMember, assertNativeCompanionProjection } from '../../packages/cli/src/native-companion-projection.mjs';
import { releaseArchivePath } from '../../packages/cli/src/release-archive.mjs';

const component = { id: 'beads@local', name: 'beads', version: '1.3.2', projection: 'beads-runtime-guidance-v1',
  source: { repository: 'https://github.com/gastownhall/beads', commit: '43f41374a34d82ecf40903451eea277fbb4f1e75', tree: '28f79ffc36555222f62fe82410410e69e60d8b79', subdirectory: 'plugins/beads' } };
const oldLink = 'resources/AGENTS.md', newLink = 'resources/AGENT_TRACKING.md';

test('fixed forward/inverse link mapping preserves all other raw bytes', () => {
  const raw = Buffer.concat([Buffer.from([0xff]), Buffer.from('before\r\n' + oldLink + '\r\n' + oldLink + '\n')]);
  const output = projectNativeCompanionBytes(component, 'skills/beads/SKILL.md', raw);
  assert.equal(output.includes(Buffer.from(oldLink)), false);
  assert.equal(output.toString().split(newLink).length - 1, 2);
  const original = originalNativeCompanionMember(component, 'skills/beads/SKILL.md', output);
  assert.deepEqual(original.bytes, raw); assert.equal(original.path, 'skills/beads/SKILL.md');
});

test('guide rename preserves bytes and original source path, excludes maintenance only', () => {
  assert.equal(projectNativeCompanionPath(component, 'skills/beads/CLAUDE.md'), null);
  assert.equal(projectNativeCompanionPath(component, 'skills/beads/resources/AGENTS.md'), 'skills/beads/resources/AGENT_TRACKING.md');
  const bytes = Buffer.from('inert guide');
  assert.deepEqual(projectNativeCompanionBytes(component, 'skills/beads/resources/AGENTS.md', bytes), bytes);
  const original = originalNativeCompanionMember(component, 'skills/beads/resources/AGENT_TRACKING.md', bytes);
  assert.equal(original.path, 'skills/beads/resources/AGENTS.md'); assert.deepEqual(original.bytes, bytes);
});

test('unexpected counts, preexisting tokens and replacement-path collisions refuse', () => {
  for (const value of ['', oldLink, oldLink.repeat(3), oldLink.repeat(2) + newLink]) {
    assert.throws(() => projectNativeCompanionBytes(component, 'skills/beads/SKILL.md', Buffer.from(value)));
  }
  for (const value of [newLink, newLink.repeat(3), newLink.repeat(2) + oldLink]) {
    assert.throws(() => originalNativeCompanionMember(component, 'skills/beads/SKILL.md', Buffer.from(value)));
  }
  for (const name of ['skills/beads/resources/AGENT_TRACKING.md', 'skills/BEADS/resources/agent_tracking.md']) {
    assert.throws(() => projectNativeCompanionPath(component, name));
  }
});

test('unknown recipe or altered fixed source identity refuses', () => {
  for (const value of [{ ...component, projection: 'arbitrary-rewrite' }, { ...component, name: 'superpowers' },
    { ...component, source: { ...component.source, commit: 'a'.repeat(40) } }]) assert.throws(() => assertNativeCompanionProjection(value));
});

test('archive privacy guard remains unchanged for all service-file names', () => {
  for (const name of ['AGENTS.md', 'CLAUDE.md', 'vendor/native/beads/skills/beads/CLAUDE.md', 'vendor/native/beads/skills/beads/resources/AGENTS.md']) {
    assert.throws(() => releaseArchivePath(name), /private archive/);
  }
  assert.equal(releaseArchivePath('vendor/native/beads/skills/beads/resources/AGENT_TRACKING.md'), 'vendor/native/beads/skills/beads/resources/AGENT_TRACKING.md');
});
