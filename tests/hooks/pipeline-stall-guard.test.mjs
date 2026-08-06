// The dispatcher computes every transition correctly — a mechanical walk of all
// nine stages at four approval levels emits a directive every time. But it only
// injects advice, and the orchestrating model has to act on it. That is the same
// shape as the devops instruction measured at 18% adherence this week; removing
// the dependence on remembering took it to 92%.
//
// So the turn does not end with a dispatch outstanding. What these tests pin is
// the other half: the cases where ending IS correct, because a guard that can
// refuse to end a turn is a hang if it is wrong about even one of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { decideStall, newestStage } from '../../scripts/hooks/pipeline-stall-guard.mjs';

const dir = (name) => ({ kind: name, text: `PIPELINE-NEXT: do the thing` });

test('a pending dispatch holds the turn open', () => {
  const d = decideStall({ directive: dir('next'), alreadyDispatched: false, stopHookActive: false, blockedBefore: false });
  assert.equal(d.block, true);
  assert.match(d.reason, /PIPELINE-NEXT/);
  assert.match(d.reason, /will not hold the turn again/, 'the model must know the guard is one-shot');
});

test('a gate ends the turn — the CTO answers it after the turn, not during', () => {
  // Blocking here would make "wait for the CTO" a loop the CTO cannot answer.
  const d = decideStall({ directive: dir('gate'), alreadyDispatched: false, stopHookActive: false, blockedBefore: false });
  assert.equal(d.block, false);
  assert.match(d.why, /not a pending dispatch/);
});

test('the other honest endings are left alone', () => {
  for (const kind of ['blocked', 'done', 'join-wait', 'no-verdict']) {
    assert.equal(decideStall({ directive: dir(kind), alreadyDispatched: false, stopHookActive: false, blockedBefore: false }).block,
      false, `${kind} is a real end of turn`);
  }
});

test('a turn already continuing from a block is not blocked again', () => {
  // stop_hook_active means this Stop IS the previous block's continuation.
  // Blocking again is the hang this guard exists not to be.
  const d = decideStall({ directive: dir('next'), alreadyDispatched: false, stopHookActive: true, blockedBefore: false });
  assert.equal(d.block, false);
});

test('one transition is blocked once, never twice', () => {
  // If a block did not produce the dispatch, something is wrong that a second
  // block will not fix.
  const d = decideStall({ directive: dir('next'), alreadyDispatched: false, stopHookActive: false, blockedBefore: true });
  assert.equal(d.block, false);
  assert.match(d.why, /already/);
});

test('a dispatch that already happened does not hold the turn', () => {
  const d = decideStall({ directive: dir('next'), alreadyDispatched: true, stopHookActive: false, blockedBefore: false });
  assert.equal(d.block, false);
});

test('no pipeline in flight is not a stall', () => {
  assert.equal(decideStall({ directive: null, alreadyDispatched: false, stopHookActive: false, blockedBefore: false }).block, false);
});

// ── locating the stage ──────────────────────────────────────────────────────

test('the freshest verdict names where the pipeline is', () => {
  // Stop carries no tool payload, so unlike PostToolUse the hook is not told
  // which agent just ran. mtime is the only handle.
  const root = mkdtempSync(join(tmpdir(), 'stall-'));
  try {
    mkdirSync(join(root, 'verdicts'), { recursive: true });
    const v = join(root, 'verdicts');
    writeFileSync(join(v, 'architect.log'), 'x | architect | APPROVED | ok\n');
    writeFileSync(join(v, 'pm.log'), 'x | pm | PLAN_READY | ok\n');
    const now = Date.now();
    utimesSync(join(v, 'architect.log'), new Date(now - 60_000), new Date(now - 60_000));
    assert.equal(newestStage(v, now).agent, 'pm');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a stale pipeline is not resumed hours later', () => {
  const root = mkdtempSync(join(tmpdir(), 'stall-'));
  try {
    mkdirSync(join(root, 'verdicts'), { recursive: true });
    const v = join(root, 'verdicts');
    writeFileSync(join(v, 'pm.log'), 'x | pm | PLAN_READY | ok\n');
    const now = Date.now();
    utimesSync(join(v, 'pm.log'), new Date(now - 7_200_000), new Date(now - 7_200_000));
    assert.equal(newestStage(v, now), null, "yesterday's run must not hold today's turn open");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a project with no verdict directory is silent', () => {
  assert.equal(newestStage('/nowhere/at/all'), null);
});
