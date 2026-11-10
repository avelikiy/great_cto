// 01.11.2026: a review of public agent repositories found the defect class of the
// 22.09 outage — a changed signature whose caller outside the diff was never read —
// covered by none of great_cto's agents. code-reviewer now reads the contracts the
// diff touches, and runs on the tier ADR-002 sets for reviewers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(p), 'utf8');

test('code-reviewer reads the contracts outside the diff, in the source and in the plugin bundle', () => {
  for (const file of ['agents/code-reviewer.md', 'agents-full/code-reviewer.md']) {
    const t = read(file);
    assert.match(t, /## Contracts beyond the diff/, `${file}: section`);
    assert.match(t, /callee's real declaration/, `${file}: changed calls are checked against the real signature`);
    assert.match(t, /grep every caller/, `${file}: a changed signature reaches its callers`);
    assert.match(t, /every\s+consumer that branches on it/, `${file}: a new enum value reaches its consumers`);
    assert.match(t, /\*\*Deleted code\*\*/, `${file}: a deletion names the contract it held`);
    assert.match(t, /try to prove each\s+claim\s+wrong/, `${file}: commit claims are tested, not trusted`);
  }
});

test('the contract check comes before calibration, where findings are graded', () => {
  const t = read('agents/code-reviewer.md');
  assert.ok(t.indexOf('## Contracts beyond the diff') < t.indexOf('## Calibration'),
    'the check produces findings that calibration then grades');
});

test('code-reviewer runs on the reviewer tier ADR-002 sets', () => {
  // It ran on haiku since June; the linter flagged it (CONS-MODEL) and nobody acted.
  for (const file of ['agents/code-reviewer.md', 'agents-full/code-reviewer.md']) {
    assert.match(read(file), /^model: sonnet$/m, file);
  }
});
