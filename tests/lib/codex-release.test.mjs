import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { validateArtifacts, bundleDigest, digest } from '../../scripts/lib/codex-artifacts.mjs';
import { prepareRelease, approveRelease, executeRelease, recoverRelease, validateReleasePolicy } from '../../scripts/lib/codex-release.mjs';
import { safePath, runStage, cancel, advance } from '../../scripts/lib/codex-pipeline.mjs';
import { runChecks } from '../../scripts/lib/codex-checks.mjs';
const image = process.env.GREAT_CTO_LIVE_DOCKER_IMAGE || `node@sha256:${'a'.repeat(64)}`;
const content = 'export const x = 2;\n';
const artifacts = () => validateArtifacts([{ path: 'dist/index.mjs', base64: Buffer.from(content).toString('base64') }]);
function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), 'codex-release-test-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'project'), releaseRoot = join(base, 'releases');
  mkdirSync(root); mkdirSync(releaseRoot); mkdirSync(join(root, 'src'));
  writeFileSync(join(releaseRoot, '.great-cto-release-root'), 'great-cto-release-root:v1\n');
  writeFileSync(join(root, 'src/index.mjs'), content);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', 'src'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base'], { cwd: root });
  const checkPolicy = { image, inputs: ['src'], commands: [['node', '-e', "require('fs').mkdirSync('dist');require('fs').copyFileSync('src/index.mjs','dist/index.mjs')"]], outputs: ['dist/index.mjs'], timeoutMs: 60000 };
  const releasePolicy = validateReleasePolicy({ adapter: 'local', releaseRoot, image,
    smokeCommands: [['node', '--input-type=module', '-e', "import assert from 'node:assert/strict';import {x} from './dist/index.mjs';assert.equal(x,2)"]], timeoutMs: 60000 }, root);
  const roles = ['senior-dev', 'code-reviewer', 'qa-engineer', 'security-officer'];
  const results = Object.fromEntries(roles.map(role => [role, { verification: { state: 'verified' } }]));
  results['qa-engineer'].checks = { state: 'passed', files: { 'src/index.mjs': digest(content) },
    policyDigest: digest(JSON.stringify(checkPolicy)), artifacts: artifacts(), artifactDigest: bundleDigest(artifacts()) };
  return { root, allowed: ['src'], checkPolicy, releasePolicy, results, released: roles, status: 'ready' };
}
const smoke = async () => ({ state: 'passed', code: 0, stdout: 'test fixture smoke', stderr: '' });

test('artifact validation rejects unsafe paths, bad data, duplicates and digest drift', () => {
  for (const candidate of [[], [{ path: '../escape', base64: 'eA==' }], [{ path: 'a', base64: 'garbage' }],
    [{ path: 'a', base64: 'eA==', sha256: 'bad' }], [artifacts()[0], artifacts()[0]]]) assert.throws(() => validateArtifacts(candidate));
});

test('local release requires independent explicit approval and stores exact candidate bytes', async t => {
  const s = fixture(t); prepareRelease(s);
  assert.equal(s.status, 'awaiting-release');
  await assert.rejects(executeRelease(s, { safePath, checks: smoke }), /not approved/);
  assert.deepEqual(readdirSync(s.releasePolicy.releaseRoot), ['.great-cto-release-root']);
  assert.throws(() => approveRelease(s, 'wrong'), /token/);
  const token = s.release.token; approveRelease(s, token);
  await executeRelease(s, { safePath, checks: smoke });
  assert.equal(s.release.status, 'verified');
  assert.equal(readFileSync(join(s.release.path, 'dist/index.mjs'), 'utf8'), content);
  assert.throws(() => approveRelease(s, token), /token/);
});

test('artifact, release root and source changes invalidate release approval', async t => {
  for (const mutate of [s => { s.release.artifacts[0].base64 = 'eA=='; }, s => { s.releasePolicy.smokeCommands = [['true']]; },
    s => { writeFileSync(join(s.root, 'src/index.mjs'), 'changed'); }, s => { s.release.releaseRoot = s.root; }]) {
    const s = fixture(t); prepareRelease(s); const token = s.release.token; mutate(s);
    assert.throws(() => approveRelease(s, token));
    assert.deepEqual(readdirSync(s.releasePolicy.releaseRoot), ['.great-cto-release-root']);
  }
});

test('controller routes local devops through release gate and then l3 without re-running build', async t => {
  const s = fixture(t);
  Object.assign(s, { graph: { devops: { on: ['DEPLOYED'], next: ['l3-support'] } }, queue: ['devops'], writes: {}, steps: 0, approvals: [], pending: null });
  await runStage(s, { checks: smoke }); assert.equal(s.status, 'awaiting-release');
  approveRelease(s, s.release.token);
  await runStage(s, { checks: smoke });
  assert.equal(s.release.status, 'verified'); assert.equal(s.results.devops.verdict, 'DEPLOYED');
  assert.deepEqual(s.queue, ['l3-support']);
});

test('cancellation revokes unexecuted release approval', async t => {
  const s = fixture(t); prepareRelease(s); const token = s.release.token; cancel(s);
  assert.throws(() => approveRelease(s, token), /token/);
  await assert.rejects(executeRelease(s, { safePath, checks: smoke }), /not approved/);
  assert.deepEqual(readdirSync(s.releasePolicy.releaseRoot), ['.great-cto-release-root']);
});

test('post-release incident invalidates release identity and dependent approvals', t => {
  const s = fixture(t); prepareRelease(s); const id = s.release.id;
  Object.assign(s, { graph: {
    'senior-dev': { on: ['DONE'], next: ['devops'] }, devops: { on: ['DEPLOYED'], next: ['l3-support'] },
    'l3-support': { on: ['OK'], next: [] }, 'l3-support.INCIDENT': { on: ['INCIDENT'], next: ['senior-dev'] },
  }, results: { 'senior-dev': { verdict: 'DONE' }, devops: { verdict: 'DEPLOYED' }, 'l3-support': { verdict: 'INCIDENT' } },
  released: ['senior-dev', 'devops'], queue: [], pending: null, approvals: [], attempts: [], maxAttempts: 3 });
  advance(s); assert.equal(s.release, null); assert.deepEqual(s.queue, ['senior-dev']);
  assert.equal(s.invalidations[0].release.id, id);
});

test('source changed after QA cannot be prepared for release', t => {
  const s = fixture(t); writeFileSync(join(s.root, 'src/index.mjs'), 'changed');
  assert.throws(() => prepareRelease(s), /source changed since QA/);
});

test('failed smoke is not success; recovery reuses publication without overwriting it', async t => {
  let s = fixture(t); prepareRelease(s); approveRelease(s, s.release.token);
  await assert.rejects(executeRelease(s, { safePath, checks: async () => ({ state: 'failed', code: 1 }) }), /smoke/);
  assert.equal(s.release.status, 'failed'); const path = s.release.path;
  s = JSON.parse(JSON.stringify(s)); recoverRelease(s);
  await executeRelease(s, { safePath, checks: smoke });
  assert.equal(s.release.path, path); assert.equal(readdirSync(s.releasePolicy.releaseRoot).length, 2);
  assert.equal(s.release.status, 'verified');
});

test('an arbitrary outside directory, including the workspace parent, is not a release root', t => {
  const s = fixture(t); const parent = join(s.root, '..');
  assert.throws(() => validateReleasePolicy({ ...s.releasePolicy, releaseRoot: parent }, s.root), /not designated/);
  const unmarked = join(parent, 'unmarked'); mkdirSync(unmarked);
  assert.throws(() => validateReleasePolicy({ ...s.releasePolicy, releaseRoot: unmarked }, s.root), /not designated/);
});

test('reconciliation refuses to overwrite a tampered published artifact', async t => {
  const s = fixture(t); prepareRelease(s); approveRelease(s, s.release.token);
  await assert.rejects(executeRelease(s, { safePath, checks: async () => ({ state: 'failed', code: 1 }) }));
  const file = join(s.release.path, 'dist/index.mjs');
  // Same-OS-user tampering is not prevented, but must not be silently accepted.
  execFileSync('chmod', ['u+w', file]); writeFileSync(file, 'tampered');
  recoverRelease(s);
  await assert.rejects(executeRelease(s, { safePath, checks: smoke }), /differs/);
  assert.equal(readFileSync(file, 'utf8'), 'tampered');
});

test('live build export -> explicit release approval -> artifact smoke without rebuilding', { skip: !process.env.GREAT_CTO_LIVE_DOCKER_IMAGE }, async t => {
  const s = fixture(t);
  s.results['qa-engineer'].checks = await runChecks(s, { safePath });
  assert.equal(s.results['qa-engineer'].checks.state, 'passed', JSON.stringify(s.results['qa-engineer'].checks));
  assert.equal(s.results['qa-engineer'].checks.artifacts[0].base64, artifacts()[0].base64);
  prepareRelease(s); approveRelease(s, s.release.token);
  await executeRelease(s, { safePath });
  assert.equal(s.release.status, 'verified', JSON.stringify(s.release.smoke));
  assert.equal(s.release.smoke.code, 0);
  assert.deepEqual(Object.keys(s.release.smoke.files), ['dist/index.mjs']);
});
