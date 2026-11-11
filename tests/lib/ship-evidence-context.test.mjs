import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync, readFileSync, chmodSync, symlinkSync, mkdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {readShipPolicy, captureShipContext, recheckShipContext} from '../../scripts/lib/ship-evidence-context.mjs';
import {stableDigest} from '../../scripts/lib/ship-evidence-identity.mjs';
import {fixture, git, commit, writeJSON, readJSON, artifactHashes} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

function capture(f, overrides = {}) {
  const descriptor = readShipPolicy({root: f.root, path: f.policyPath});
  return captureShipContext({root: f.root, registration: descriptor.registration, taskId: 'task:synthetic', runId: 'run:synthetic', gateId: 'gate:ship', policy: descriptor.policy, requirements: descriptor.requirements, ...overrides});
}
test('P07 real Git context binds exact committed head/tree, policy/requirements and empty exclusions', t => {
  const f = fixture(t); const descriptor = readShipPolicy({root: f.root, path: f.policyPath}); const out = capture(f);
  assert.equal(out.state, 'COMPLETE'); assert.deepEqual(out.diagnostics, []);
  assert.equal(out.expected.source.head, git(f, 'rev-parse', 'HEAD')); assert.equal(out.expected.source.tree, git(f, 'rev-parse', 'HEAD^{tree}'));
  assert.equal(out.expected.source.clean, true); assert.equal(out.expected.source.dirtyDigest, null);
  assert.equal(out.expected.source.exclusionsDigest, stableDigest([]));
  assert.equal(out.expected.policyDigest, descriptor.policyDigest); assert.equal(out.expected.requirementsDigest, stableDigest(descriptor.requirements));
  assert.equal(out.contextDigest, stableDigest(out.expected)); assert.equal(recheckShipContext({root: f.root, registration: f.registration, expected: out.expected}).state, 'MATCH');
});
test('N02 tracked, untracked and report changes never silently recapture/exclude source', t => {
  for (const path of ['src/app.mjs', 'new-untracked.txt', 'docs/qa-engineer.md', '.great_cto/PROJECT.md']) {
    const f = fixture(t); const before = capture(f); const expected = JSON.stringify(before.expected);
    writeFileSync(join(f.root, path), path === '.great_cto/PROJECT.md' ? readFileSync(join(f.root, path), 'utf8') + '# changed synthetic candidate\n' : 'changed synthetic candidate\n');
    assert.equal(capture(f).state, 'UNKNOWN', path);
    assert.notEqual(recheckShipContext({root: f.root, registration: f.registration, expected: before.expected}).state, 'MATCH');
    assert.equal(JSON.stringify(before.expected), expected);
  }
});
test('N01/N02 equal tree with another commit head cannot inherit source review', t => {
  const f = fixture(t); const before = capture(f); commit(f, 'same tree new identity'); const after = capture(f);
  assert.equal(before.expected.source.tree, after.expected.source.tree); assert.notEqual(before.expected.source.head, after.expected.source.head);
  assert.equal(recheckShipContext({root: f.root, registration: f.registration, expected: before.expected}).state, 'DRIFT');
});
test('N01 registration must bind actual canonical git common directory', t => {
  const f = fixture(t); const other = fixture(t); writeJSON(join(f.store, 'registration.json'), {...f.registration, gitCommonDirDigest: other.registration.gitCommonDirDigest});
  assert.throws(() => readShipPolicy({root: f.root, path: f.policyPath}), {code: 'SHIP_REGISTRATION_MISMATCH'});
  assert.equal(captureShipContext({root: f.root, registration: {...f.registration, gitCommonDirDigest: '0'.repeat(64)}, taskId: 'x', runId: 'y', gateId: 'gate:ship', policy: f.policy, requirements: []}).state, 'UNKNOWN');
});
test('P07/N09 external store rejects workspace stores, symlink aliases, unsafe modes and unknown policy fields', t => {
  const f = fixture(t); const before = artifactHashes(f);
  const inside = join(f.root, 'private'); mkdirSync(inside, {mode: 0o700}); writeJSON(join(inside, 'policy.json'), f.policy); writeJSON(join(inside, 'registration.json'), f.registration);
  assert.throws(() => readShipPolicy({root: f.root, path: join(inside, 'policy.json')}), {code: 'SHIP_PATH_UNSAFE'});
  const alias = join(f.base, 'alias'); symlinkSync(f.store, alias); assert.throws(() => readShipPolicy({root: f.root, path: join(alias, 'policy.json')}), {code: 'SHIP_PATH_UNSAFE'});
  chmodSync(f.policyPath, 0o644); assert.throws(() => readShipPolicy({root: f.root, path: f.policyPath}), {code: 'SHIP_PATH_UNSAFE'}); assert.equal(readFileSync(f.policyPath).length > 0, true); chmodSync(f.policyPath, 0o600);
  writeJSON(f.policyPath, {...f.policy, approvedBy: 'synthetic self'}); assert.throws(() => readShipPolicy({root: f.root, path: f.policyPath}), {code: 'SHIP_POLICY_INVALID'});
  assert.deepEqual(artifactHashes(f), before);
});
test('N03 policy cannot omit lifetime, overflow expiry, waive reviewer floors or invent check IDs', t => {
  for (const delta of [{assignmentLifetimeMs: null}, {assignmentLifetimeMs: 0}, {assignmentLifetimeMs: Number.MAX_SAFE_INTEGER + 1}, {requiredReviewers: [{role: 'qa-engineer', requiredChecks: ['arbitrary-model-pass']}]}]) {
    const f = fixture(t); writeJSON(f.policyPath, {...f.policy, ...delta}); assert.throws(() => readShipPolicy({root: f.root, path: f.policyPath}));
  }
  const f = fixture(t); writeJSON(f.policyPath, {...f.policy, requiredReviewers: [{role: 'library-reviewer', requiredChecks: ['independent-verifier']}]});
  const out = readShipPolicy({root: f.root, path: f.policyPath}); assert.ok(out.requirements.some(r => r.role === 'qa-engineer')); assert.ok(out.requirements.some(r => r.role === 'security-officer')); assert.ok(out.requirements.some(r => r.role === 'library-reviewer'));
});
test('N09 unreadable or ambiguous PROJECT requirement declaration fails closed', t => {
  const f = fixture(t); writeFileSync(join(f.root, '.great_cto/PROJECT.md'), 'archetype: commerce\ncompliance: [unknown-compliance]\nrequired-reviewers: [not-a-role]\n'); commit(f);
  assert.throws(() => readShipPolicy({root: f.root, path: f.policyPath}), {code: 'SHIP_REQUIREMENTS_UNKNOWN'});
});
test('P01/N08 actual devtools domain reviewer merges independently despite baseline-only operator policy', t => {
  const f = fixture(t); writeFileSync(join(f.root, '.great_cto/PROJECT.md'), 'primary: devtools\narchetype: devtools\ncompliance: []\npacks: []\n'); commit(f);
  const descriptor = readShipPolicy({root: f.root, path: f.policyPath});
  assert.deepEqual(descriptor.requirements.map(row => row.role).sort(), ['devtools-reviewer', 'qa-engineer', 'security-officer']);
  const out = capture(f); assert.equal(out.state, 'COMPLETE'); assert.deepEqual(out.expected.requiredReviewers.map(row => row.role).sort(), ['devtools-reviewer', 'qa-engineer', 'security-officer']);
});
test('N09 context reader failures never create files or repair unknown external files', t => {
  const f = fixture(t); const registration = {...f.registration, journalOriginId: ''};
  const out = captureShipContext({root: join(f.base, 'missing-root'), registration, taskId: 't', runId: 'r', gateId: 'gate:ship', policy: f.policy, requirements: []});
  assert.equal(out.state, 'UNKNOWN'); assert.equal(out.contextDigest, null); assert.equal(out.expected, null); assert.equal(existsSync(join(f.base, 'missing-root')), false);
});
test('N09 conflicting recognized primary and archetype refuse instead of hiding required domain floors', t => {
  const f = fixture(t); writeFileSync(join(f.root, '.great_cto/PROJECT.md'), 'primary: web-service\narchetype: commerce\ncompliance: []\npacks: []\n'); commit(f);
  assert.throws(() => readShipPolicy({root: f.root, path: f.policyPath}), {code: 'SHIP_REQUIREMENTS_UNKNOWN'});
});
test('P01 unknown display primary preserves recognized devtools archetype and derived reviewer', t => {
  const f = fixture(t); writeFileSync(join(f.root, '.great_cto/PROJECT.md'), 'primary: developer-tools\narchetype: devtools\ncompliance: []\npacks: []\n'); commit(f);
  const descriptor = readShipPolicy({root: f.root, path: f.policyPath});
  assert.deepEqual(descriptor.requirements.map(row => row.role).sort(), ['devtools-reviewer', 'qa-engineer', 'security-officer']);
});
