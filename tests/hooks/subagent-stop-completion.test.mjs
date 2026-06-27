// tests/hooks/subagent-stop-completion.test.mjs — DEEPEN W2 completion teeth.
// Run: node --test tests/hooks/subagent-stop-completion.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readCompletionFlags, completionDecision, recentVerdict } from '../../scripts/hooks/subagent-stop-completion.mjs';

test('readCompletionFlags: reads [completion] booleans', () => {
  const toml = `[parallelism]\nmax = 5\n\n[completion]\nthree_state_completion = true\nacceptance_evidence_required = true\n\n[ownership]\n`;
  const f = readCompletionFlags(toml);
  assert.equal(f.threeState, true);
  assert.equal(f.acceptanceRequired, true);
});

test('readCompletionFlags: absent flags default false', () => {
  const f = readCompletionFlags('[ownership]\nstrict = true\n');
  assert.equal(f.threeState, false);
  assert.equal(f.acceptanceRequired, false);
});

test('completionDecision: off → always ok', () => {
  assert.equal(completionDecision({ threeState: false, recentVerdictExists: false }).ok, true);
});

test('completionDecision: on + no verdict → not ok', () => {
  const d = completionDecision({ threeState: true, recentVerdictExists: false });
  assert.equal(d.ok, false);
  assert.match(d.reason, /verdict/i);
});

test('completionDecision: on + verdict → ok', () => {
  assert.equal(completionDecision({ threeState: true, recentVerdictExists: true }).ok, true);
});

test('recentVerdict: true only when a log is within the window', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdicts-'));
  const vdir = join(dir, 'verdicts');
  mkdirSync(vdir);
  writeFileSync(join(vdir, 'architect.log'), 'x\n');
  const now = Date.now();
  assert.equal(recentVerdict(vdir, 5 * 60 * 1000, now), true, 'fresh file is recent');
  assert.equal(recentVerdict(vdir, 1, now + 10_000), false, '10s later, 1ms window → stale');
  assert.equal(recentVerdict(join(dir, 'nope'), 1000, now), false, 'missing dir → false');
});
