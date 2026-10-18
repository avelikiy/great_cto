import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { selectWorkers, planVerification, sourceSnapshot, watchSource, receiptCurrent, summarizeGate } from '../../scripts/lib/verification-lane.mjs';

function repo(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'verification-lane-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, bytes] of Object.entries({ 'scripts/ci-local.sh': '# fixture gate\n', ...files })) {
    mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), bytes);
  }
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q'); git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'base');
  return { root, git };
}
const resources = { cpus: 10, freeBytes: 4 * 1024 ** 3, load: 4 };
test('worker policy stays bounded and responds to memory/load instead of enlarging deadlines', () => {
  assert.equal(selectWorkers(resources).workers, 2);
  assert.equal(selectWorkers({ ...resources, load: 25 }).workers, 1);
  assert.equal(selectWorkers({ ...resources, freeBytes: 512 * 1024 ** 2 }).workers, 1);
  assert.equal(selectWorkers({ ...resources, cpus: NaN }).workers, 1);
  assert.equal(selectWorkers({ ...resources, freeBytes: 200 * 1024 ** 2, availableBytes: 8 * 1024 ** 3 }).workers, 2);
  assert.equal(selectWorkers({ ...resources, availableBytes: NaN }).workers, 1);
  assert.equal(selectWorkers({ ...resources, requested: '1' }).workers, 1);
  for (const requested of ['0', '3', '99', '--serial']) assert.throws(() => selectWorkers({ ...resources, requested }));
});
test('unsupported TS runner coverage stays explicit even when a JS test also maps', t => {
  const { root } = repo(t, { 'src/a.ts': '', 'src/a.test.ts': '', 'tests/b.test.mjs': '' });
  const p = planVerification({ cwd: root, base: 'HEAD', changed: ['src/a.ts', 'tests/b.test.mjs'] });
  assert.equal(p.fullRequired, true); assert.deepEqual(p.unsupportedTests, ['src/a.test.ts']);
});
test('docs route chooses existing docs checks; feedback never qualifies a merge', t => {
  const { root } = repo(t, { 'README.md': 'hello', 'tests/docs/guide.test.mjs': '', 'tests/lib/doc-links.test.mjs': '' });
  const p = planVerification({ cwd: root, base: 'HEAD', changed: ['README.md'] });
  assert.equal(p.route, 'docs'); assert.equal(p.mergeEligible, false);
  assert.deepEqual(p.tests, ['tests/docs/guide.test.mjs', 'tests/lib/doc-links.test.mjs']);
});
test('partial mappings and unknown configuration are explicit full-required', t => {
  const { root } = repo(t, { 'src/a.mjs': '', 'tests/a.test.mjs': '', 'src/b.mjs': '', 'custom.toml': '' });
  for (const changed of [['src/a.mjs', 'src/b.mjs'], ['custom.toml'], ['package-lock.json'], ['scripts/hooks/approve.mjs']]) {
    const p = planVerification({ cwd: root, base: 'HEAD', changed });
    assert.equal(p.fullRequired, true, changed.join(','));
    assert.equal(p.mergeEligible, false);
  }
});
test('selected files are argv entries, not interpolated commands', t => {
  const name = 'tests/a ; echo injected.test.mjs';
  const { root } = repo(t, { [name]: '' });
  const p = planVerification({ cwd: root, base: 'HEAD', changed: [name] });
  assert.deepEqual(p.tests, [name]);
  assert.equal(p.steps.at(-1).args.at(-1), `./${name}`);
  assert.equal(p.steps.at(-1).shell, undefined);
});
test('deleted tests cannot become selected runnable paths and invalid bases fail closed', t => {
  const { root } = repo(t, { 'README.md': 'hello' });
  assert.equal(planVerification({ cwd: root, base: 'HEAD', changed: ['tests/deleted.test.mjs'] }).fullRequired, true);
  assert.throws(() => planVerification({ cwd: root, base: '--bad' }));
});
test('clean branch still includes committed changes against the explicit base', t => {
  const { root, git } = repo(t, { 'README.md': 'a', 'tests/docs/guide.test.mjs': '' });
  writeFileSync(join(root, 'README.md'), 'b'); git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'change');
  assert.deepEqual(planVerification({ cwd: root, base: 'HEAD~1' }).changed, ['README.md']);
});
test('final admission refuses dirty and untracked candidates', t => {
  const { root } = repo(t, { 'README.md': 'a' });
  const first = sourceSnapshot(root); assert.match(first.head, /^[a-f0-9]{40,64}$/);
  writeFileSync(join(root, 'README.md'), 'b'); assert.throws(() => sourceSnapshot(root), /clean/);
  writeFileSync(join(root, 'README.md'), 'a'); writeFileSync(join(root, 'new.mjs'), '');
  assert.throws(() => sourceSnapshot(root), /clean/);
});
test('source epoch detects a tracked edit even if the bytes are restored', async t => {
  const { root } = repo(t, { 'README.md': 'a' });
  const guard = watchSource(root); t.after(() => guard.close());
  writeFileSync(join(root, 'README.md'), 'b'); writeFileSync(join(root, 'README.md'), 'a');
  await new Promise(r => setTimeout(r, 60));
  assert.equal(guard.unchanged(), false);
});
test('ignored generated output does not invalidate source; receipts are never approvals', async t => {
  const { root } = repo(t, { '.gitignore': 'out/\n', 'README.md': 'a' });
  const before = sourceSnapshot(root), guard = watchSource(root); t.after(() => guard.close());
  mkdirSync(join(root, 'out')); writeFileSync(join(root, 'out/result'), 'artifact');
  await new Promise(r => setTimeout(r, 60));
  assert.equal(guard.unchanged(), true);
  assert.equal(receiptCurrent({ version: 1, mode: 'final', result: 'passed', source: before, mergeEligible: false }, root), true);
  assert.equal(receiptCurrent({ version: 1, mode: 'feedback', result: 'passed', source: before, mergeEligible: false }, root), false);
  assert.equal(receiptCurrent({ version: 1, mode: 'final', result: 'passed', source: before, mergeEligible: true }, root), false);
  writeFileSync(join(root, 'README.md'), 'changed');
  assert.equal(receiptCurrent({ version: 1, mode: 'final', result: 'passed', source: before, mergeEligible: false }, root), false);
});
test('summary preserves skipped/unreadable/failed states instead of granting acceptance', () => {
  assert.equal(summarizeGate({ code: 0, text: '# skipped 6\n' }).result, 'passed-with-not-checked');
  assert.equal(summarizeGate({ code: 1, text: '# skipped 0\n' }).result, 'failed');
  assert.equal(summarizeGate({ code: 0, text: '' }).result, 'unknown');
  assert.equal(summarizeGate({ code: 0, text: '# skipped 0\n' }).result, 'passed');
});
