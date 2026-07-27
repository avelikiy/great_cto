// A change can pass every check great_cto runs — tests green, scope respected,
// security clean — and still be unreviewable. Measured in the 2026-07 benchmark:
// single commits of 12,306 and 10,687 insertions. Whatever review those got was
// not review.
//
// The interesting cases are the exclusions: a lockfile is not review effort, and
// counting it would make the warning fire on changes that are genuinely small.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumstat, isGenerated, assessDiff, renderAssessment, DEFAULT_LIMITS,
} from '../../scripts/lib/diff-size-gate.mjs';

const row = (file, added, removed = 0) => ({ file, added, removed });

test('parses numstat, including binary markers', () => {
  const r = parseNumstat('10\t2\tsrc/a.ts\n-\t-\tlogo.png\n5\t0\tsrc/b.ts\n');
  assert.equal(r.length, 3);
  assert.deepEqual(r[0], { file: 'src/a.ts', added: 10, removed: 2, binary: false });
  assert.equal(r[1].binary, true);
  assert.equal(r[1].added, 0, 'a binary file contributes no reviewable lines');
});

test('ignores lines that are not numstat rows', () => {
  assert.equal(parseNumstat('\nnot a row\n3\t1\tsrc/x.ts\n').length, 1);
});

test('lockfiles, builds, vendored code and snapshots are not review effort', () => {
  for (const f of [
    'package-lock.json', 'pnpm-lock.yaml', 'Cargo.lock', 'go.sum',
    'dist/bundle.js', 'vendor/lib.js', 'node_modules/x/y.js',
    'app.min.js', 'assets/logo.svg', '__snapshots__/a.snap',
  ]) {
    assert.equal(isGenerated(f), true, `${f} should be excluded`);
  }
  assert.equal(isGenerated('src/lock.ts'), false, 'a source file merely named "lock" is not generated');
});

test('a small change is ok', () => {
  const a = assessDiff([row('src/a.ts', 30, 10), row('src/b.ts', 20)]);
  assert.equal(a.status, 'ok');
  assert.equal(a.reviewable.lines, 60);
});

test('a big lockfile does NOT make a small change look large', () => {
  const a = assessDiff([row('src/a.ts', 12, 3), row('package-lock.json', 8000, 7000)]);
  assert.equal(a.status, 'ok', 'the human still only reads 15 lines');
  assert.equal(a.reviewable.lines, 15);
  assert.equal(a.generated.lines, 15000, 'but the volume is reported, not hidden');
});

test('over the line limit is large', () => {
  const a = assessDiff([row('src/a.ts', 500)]);
  assert.equal(a.status, 'large');
  assert.match(a.reason, /500 reviewable lines/);
});

test('many small files trip the file limit even when line count is fine', () => {
  const rows = Array.from({ length: 25 }, (_, i) => row(`src/f${i}.ts`, 2));
  const a = assessDiff(rows);
  assert.equal(a.status, 'large');
  assert.match(a.reason, /25 source files/);
});

test('3x over the limit is huge, not merely large', () => {
  const a = assessDiff([row('src/a.ts', 2000)]);
  assert.equal(a.status, 'huge');
});

test('the benchmark reality: a 12k-insertion commit is huge', () => {
  const a = assessDiff([row('api/src/big.ts', 12306)]);
  assert.equal(a.status, 'huge');
});

test('names the heaviest files — "split this" is useless without saying where', () => {
  const a = assessDiff([row('src/small.ts', 5), row('src/huge.ts', 900), row('src/mid.ts', 200)]);
  assert.equal(a.worst[0].file, 'src/huge.ts');
  assert.equal(a.worst[0].lines, 900);
  assert.ok(a.worst.length <= 3);
});

test('removals count toward review effort as much as additions', () => {
  const a = assessDiff([row('src/a.ts', 0, 500)]);
  assert.equal(a.reviewable.lines, 500);
  assert.equal(a.status, 'large', 'deleting 500 lines still has to be understood');
});

test('an empty diff is ok, not an error', () => {
  const a = assessDiff([]);
  assert.equal(a.status, 'ok');
  assert.equal(a.reviewable.lines, 0);
});

test('custom limits are honoured', () => {
  const a = assessDiff([row('src/a.ts', 100)], { lines: 50, files: 10 });
  assert.equal(a.status, 'large');
});

test('the message tells the reader what to do about it', () => {
  const out = renderAssessment(assessDiff([row('src/a.ts', 900)]));
  assert.match(out, /approved, not reviewed/);
  assert.match(out, /Split it/);
  assert.match(out, /why this one cannot be split/, 'an escape hatch that requires stating a reason');
});

test('the ok message still reports the numbers', () => {
  const out = renderAssessment(assessDiff([row('src/a.ts', 10)]));
  assert.match(out, /10 reviewable lines/);
});

test('default limits are stated, not hidden in the code', () => {
  assert.equal(DEFAULT_LIMITS.lines, 400);
  assert.equal(DEFAULT_LIMITS.files, 20);
});
