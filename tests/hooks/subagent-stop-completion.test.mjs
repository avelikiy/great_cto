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

// ── a verdict in the wrong format is not a recorded verdict ────────────────
//
// Presence was the whole check. On the first live pipeline run architect wrote
// {"v":1,...,"verdict":"APPROVED"} — a verdict, so this hook passed — and the
// dispatcher read no verdict, named no next stage, and the run stalled at the
// first transition while the agent reported success. The canonical command was
// inlined verbatim in the agent's own file, with the reason attached, and was
// still not used; so the format is checked here rather than argued there.

test('a legacy-dialect verdict passes, and is only noted', () => {
  // This assertion was the other way round for one commit, on the belief that
  // the pipe form was canonical. scripts/log-verdict.sh has written versioned
  // JSON since dda79037; the pipe dialects are history the readers accept.
  // Failing an agent for using the helper correctly is worse than the stall.
  const d = completionDecision({ threeState: true, recentVerdictExists: true, canonical: false });
  assert.equal(d.ok, true);
  assert.match(d.reason, /legacy/);
});

test('a canonical verdict with no cost tag fails — the dashboard would read zero', () => {
  const d = completionDecision({ threeState: true, recentVerdictExists: true, canonical: true, hasCost: false });
  assert.equal(d.ok, false);
  assert.match(d.reason, /cost=/);
});

test('a canonical verdict with a cost tag passes', () => {
  assert.equal(completionDecision({ threeState: true, recentVerdictExists: true, canonical: true, hasCost: true }).ok, true);
});

test('format is only judged when a verdict exists at all', () => {
  // Missing beats malformed: telling an agent its format is wrong when it wrote
  // nothing points at the wrong repair.
  const d = completionDecision({ threeState: true, recentVerdictExists: false, canonical: false, hasCost: false });
  assert.equal(d.ok, false);
  assert.match(d.reason, /without recording a verdict/);
});

test('the check stays off when three-state completion is not enabled', () => {
  assert.equal(completionDecision({ threeState: false, recentVerdictExists: false, canonical: false }).ok, true);
});

// ── the artefact a verdict names must exist ────────────────────────────────
//
// The hook checked that a verdict existed and parsed — that the agent reported,
// not that it did anything. Six agents in one session: one left its work in a
// worktree, one reported coverage=100% having run a third of the suite, one
// re-verification produced no output at all.

test('a verdict naming an artefact that does not exist fails completion', () => {
  const d = completionDecision({
    threeState: true, recentVerdictExists: true,
    artifacts: { ok: false, checked: [{ key: 'arch', path: 'docs/x.md' }], missing: [{ key: 'arch', path: 'docs/x.md' }], thin: [] },
  });
  assert.equal(d.ok, false);
  assert.match(d.reason, /named but absent/);
  assert.match(d.reason, /docs\/x\.md/, 'the operator has to know which claim');
});

test('a verdict claiming no artefact still passes', () => {
  // Requiring every agent to name one is a different rule, and enforcing it here
  // would fail the whole fleet at once for something nobody agreed to.
  assert.equal(completionDecision({
    threeState: true, recentVerdictExists: true,
    artifacts: { ok: true, checked: [], missing: [], thin: [] },
  }).ok, true);
});

test('a missing artefact outranks a missing cost tag', () => {
  // Both are wrong; only one means the work may not exist. Reporting the cost
  // tag first sends the agent to fix the smaller thing.
  const d = completionDecision({
    threeState: true, recentVerdictExists: true, hasCost: false,
    artifacts: { ok: false, checked: [{ key: 'a', path: 'x.md' }], missing: [{ key: 'a', path: 'x.md' }], thin: [] },
  });
  assert.match(d.reason, /named but absent/);
});
