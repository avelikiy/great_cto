// release-receipt: "released" is a receipt the script wrote, not a sentence the
// agent typed. Each case below is a way a release looked done and was not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkReceipt, parseArgs } from '../../scripts/lib/release-receipt.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'lib', 'release-receipt.mjs');

const staged = () => ({
  stage: 'staged', kind: 'web', version: '1.4.0', sha: SHA, 'artifact-sha': SHA,
  artifact: 'dpl_123', 'ci-run': '987', 'ci-conclusion': 'success',
});
const released = () => ({
  ...staged(), stage: 'released', 'e2e-run': 'pw-55', 'e2e-result': 'pass',
  'e2e-target': 'https://preview.example.test', gate: 'gate:release#12', live: 'pass',
  rollback: 'vercel promote https://prev.example.test', cleanup: 'removed 3, df freed 4.1 GB',
});
const clean = { head: SHA, dirty: [] };

test('a complete staged receipt passes', () => {
  const r = checkReceipt(staged(), clean);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.equal(r.receipt.stage, 'staged');
  assert.equal(r.receipt.e2e, null);
});

test('a complete released receipt passes and records the rollback', () => {
  const r = checkReceipt(released(), clean);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.equal(r.receipt.rollback, 'vercel promote https://prev.example.test');
});

test('red CI is refused, whatever else is green', () => {
  const r = checkReceipt({ ...released(), 'ci-conclusion': 'failure' }, clean);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /no build on red CI/);
});

test('a dirty tree is refused — the build packs the directory, not HEAD', () => {
  const r = checkReceipt(staged(), { head: SHA, dirty: ['src/other-session.ts'] });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /other-session\.ts/);
});

test('a tree at another commit is refused', () => {
  const r = checkReceipt(staged(), { head: OTHER, dirty: [] });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /working tree is at b{40}/);
});

test('an artifact that carries another commit is refused', () => {
  const r = checkReceipt({ ...staged(), 'artifact-sha': OTHER }, clean);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /artifact carries/);
});

test('an artifact sha that was not read back is refused', () => {
  const r = checkReceipt({ ...staged(), 'artifact-sha': '' }, clean);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /read back FROM the artifact/);
});

test('released without gate, live check, rollback or cleanup names each one', () => {
  const input = released();
  for (const k of ['gate', 'live', 'rollback', 'cleanup']) delete input[k];
  const msg = checkReceipt(input, clean).problems.join('\n');
  for (const word of ['gate:release', 'live check', 'rollback', 'cleanup']) assert.match(msg, new RegExp(word));
});

test('released requires E2E; a failed or missing run is not rounded up', () => {
  assert.match(checkReceipt({ ...released(), 'e2e-result': 'fail' }, clean).problems.join('\n'), /e2e result is "fail"/);
  const noTarget = released(); delete noTarget['e2e-target'];
  assert.match(checkReceipt(noTarget, clean).problems.join('\n'), /e2e-target/);
});

test('a verified CI run on another commit is refused', () => {
  const r = checkReceipt(staged(), { ...clean, ciRun: { headSha: OTHER, conclusion: 'success' } });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /checked b{40}/);
});

test('a CI run that could not be read is not evidence', () => {
  const r = checkReceipt(staged(), { ...clean, ciRun: null });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /could not be read/);
});

test('unknown kind and short sha are refused', () => {
  const msg = checkReceipt({ ...staged(), kind: 'desktop', sha: 'abc123' }, clean).problems.join('\n');
  assert.match(msg, /kind must be/);
  assert.match(msg, /40-character/);
});

test('parseArgs reads values and bare flags', () => {
  assert.deepEqual(parseArgs(['--kind', 'ios', '--verify-ci', '--version', '2.0.0']), { kind: 'ios', 'verify-ci': true, version: '2.0.0' });
});

test('CLI: writes the receipt only when it holds, and exits 1 otherwise', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rr-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 't@example.test'); git('config', 'user.name', 't');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'a.txt'), 'x'); git('add', '.'); git('commit', '-qm', 'init');
  const head = git('rev-parse', 'HEAD');
  const base = ['--stage', 'staged', '--kind', 'android', '--version', '3.1.0', '--sha', head,
    '--artifact-sha', head, '--artifact', 'versionCode 42', '--ci-run', '1', '--repo', dir];

  const red = spawnSync(process.execPath, [SCRIPT, ...base, '--ci-conclusion', 'failure'], { encoding: 'utf8' });
  assert.equal(red.status, 1);
  assert.match(red.stderr, /NOT RELEASED/);
  assert.equal(existsSync(join(dir, '.great_cto/releases/3.1.0-android-staged.json')), false);

  const ok = spawnSync(process.execPath, [SCRIPT, ...base, '--ci-conclusion', 'success'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const rec = JSON.parse(readFileSync(join(dir, '.great_cto/releases/3.1.0-android-staged.json'), 'utf8'));
  assert.equal(rec.sha, head);
  assert.equal(rec.schema, 'great-cto/release-receipt@1');
});
