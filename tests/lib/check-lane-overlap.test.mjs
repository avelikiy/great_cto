// Tests for check-lane-overlap (architect-loop R8): lanes must be file-disjoint
// before parallel dispatch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laneOverlaps } from '../../scripts/lib/check-lane-overlap.mjs';

test('lane-overlap: disjoint lanes → no conflicts', () => {
  const c = laneOverlaps([
    { lane: 'A', files: ['src/a.ts', 'src/a.test.ts'] },
    { lane: 'B', files: ['src/b.ts'] },
  ]);
  assert.equal(c.length, 0);
});

test('lane-overlap: a shared file is a conflict naming both lanes', () => {
  const c = laneOverlaps([
    { lane: 'A', files: ['src/shared.ts', 'src/a.ts'] },
    { lane: 'B', files: ['src/shared.ts', 'src/b.ts'] },
  ]);
  assert.equal(c.length, 1);
  assert.equal(c[0].file, 'src/shared.ts');
  assert.deepEqual(c[0].lanes, ['A', 'B']);
});

test('lane-overlap: normalizes ./ and trailing slash', () => {
  const c = laneOverlaps([
    { lane: 'A', files: ['./src/x.ts'] },
    { lane: 'B', files: ['src/x.ts/'] },
  ]);
  assert.equal(c.length, 1, 'same file via different spellings still conflicts');
});

test('lane-overlap: three lanes sharing one file lists all three', () => {
  const c = laneOverlaps([
    { lane: 'A', files: ['m.ts'] }, { lane: 'B', files: ['m.ts'] }, { lane: 'C', files: ['m.ts'] },
  ]);
  assert.deepEqual(c[0].lanes, ['A', 'B', 'C']);
});

test('lane-overlap: empty / missing files arrays are safe', () => {
  assert.equal(laneOverlaps([{ lane: 'A' }, { lane: 'B', files: [] }]).length, 0);
});
