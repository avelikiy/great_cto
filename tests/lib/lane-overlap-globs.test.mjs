/**
 * Lane overlap across GLOBS, not just identical strings.
 *
 * `laneOverlaps` compared normalised path strings, so `src/auth/*.ts` and
 * `src/auth/login.ts` were "disjoint" and the checker returned ok:true — a
 * green light to fan out two agents onto the same file. `coordinator.md` told
 * readers the opposite in so many words ("it expands globs; a naive line-level
 * uniq -d misses src/auth/*.ts vs src/auth/login.ts"), which is how the gap
 * survived: the documentation described the behaviour everyone assumed.
 *
 * The asymmetry that governs every judgement call here: a false overlap costs
 * some parallelism, a missed overlap costs the work of two agents racing on one
 * file. When two patterns cannot be told apart, they overlap.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laneOverlaps } from '../../scripts/lib/check-lane-overlap.mjs';

const lanes = (a, b) => [{ lane: 'A', files: [a] }, { lane: 'B', files: [b] }];
const overlaps = (a, b) => laneOverlaps(lanes(a, b)).length > 0;

test('identical paths still overlap', () => {
  assert.equal(overlaps('src/a.ts', 'src/a.ts'), true);
});

test('a glob overlaps a file it matches', () => {
  assert.equal(overlaps('src/auth/*.ts', 'src/auth/login.ts'), true);
  assert.equal(overlaps('src/auth/login.ts', 'src/auth/*.ts'), true, 'order must not matter');
});

test('a glob does not overlap a file it does not match', () => {
  assert.equal(overlaps('src/auth/*.ts', 'src/billing/charge.ts'), false);
  assert.equal(overlaps('src/auth/*.ts', 'src/auth/notes.md'), false);
});

test('* does not cross a directory boundary, ** does', () => {
  assert.equal(overlaps('src/*.ts', 'src/auth/login.ts'), false);
  assert.equal(overlaps('src/**/*.ts', 'src/auth/login.ts'), true);
});

test('two globs over the same space overlap', () => {
  assert.equal(overlaps('src/auth/*.ts', 'src/auth/*.ts'), true);
  assert.equal(overlaps('src/**/*.ts', 'src/auth/*.ts'), true);
});

test('two globs over different spaces do not', () => {
  assert.equal(overlaps('src/auth/*.ts', 'migrations/*.sql'), false);
  assert.equal(overlaps('packages/cli/**', 'packages/board/**'), false);
});

test('a directory claim overlaps what is under it', () => {
  assert.equal(overlaps('src/auth/', 'src/auth/login.ts'), true);
  assert.equal(overlaps('src/auth', 'src/auth/login.ts'), true);
});

test('the conflict names the file and both lanes', () => {
  const c = laneOverlaps(lanes('src/auth/*.ts', 'src/auth/login.ts'));
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].lanes, ['A', 'B']);
  assert.match(c[0].file, /auth/);
});

test('three lanes on one file name all three', () => {
  const c = laneOverlaps([
    { lane: 'A', files: ['src/a.ts'] },
    { lane: 'B', files: ['src/*.ts'] },
    { lane: 'C', files: ['src/**'] },
  ]);
  assert.equal(c.length >= 1, true);
  const named = new Set(c.flatMap((x) => x.lanes));
  assert.deepEqual([...named].sort(), ['A', 'B', 'C']);
});

test('one lane claiming a file twice is not a conflict with itself', () => {
  assert.deepEqual(laneOverlaps([{ lane: 'A', files: ['src/*.ts', 'src/a.ts'] }]), []);
});
