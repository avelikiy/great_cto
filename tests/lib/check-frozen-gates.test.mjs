// Tests for check-frozen-gates (architect-loop R2): a builder edit to a frozen
// gate file under docs/gates/ is an automatic slice FAIL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frozenGatesViolations, parseNameStatus } from '../../scripts/lib/check-frozen-gates.mjs';

test('frozen-gates: ADD of a new gate file is allowed', () => {
  const v = frozenGatesViolations([{ status: 'A', path: 'docs/gates/slice-1.md' }]);
  assert.equal(v.length, 0);
});

test('frozen-gates: MODIFY of an existing gate file is a violation', () => {
  const v = frozenGatesViolations([{ status: 'M', path: 'docs/gates/slice-1.md' }]);
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'docs/gates/slice-1.md');
});

test('frozen-gates: DELETE of a gate file is a violation', () => {
  const v = frozenGatesViolations([{ status: 'D', path: 'docs/gates/slice-1.md' }]);
  assert.equal(v.length, 1);
});

test('frozen-gates: changes OUTSIDE docs/gates/ are ignored', () => {
  const v = frozenGatesViolations([
    { status: 'M', path: 'src/foo.ts' },
    { status: 'M', path: 'docs/plans/PLAN-x.md' },
    { status: 'A', path: 'docs/gates/slice-2.md' },
  ]);
  assert.equal(v.length, 0);
});

test('frozen-gates: custom gate dir respected', () => {
  const v = frozenGatesViolations([{ status: 'M', path: 'acceptance/x.md' }], 'acceptance');
  assert.equal(v.length, 1);
});

test('frozen-gates: parseNameStatus handles rename → flags old path', () => {
  const entries = parseNameStatus('R100\tdocs/gates/a.md\tdocs/gates/b.md\nM\tsrc/x.ts');
  const v = frozenGatesViolations(entries);
  assert.equal(v.length, 1, 'rename of a gate file (moving it) is tampering');
  assert.equal(v[0].path, 'docs/gates/a.md');
});

test('frozen-gates: parseNameStatus drops blank lines', () => {
  assert.equal(parseNameStatus('\n\n').length, 0);
});
