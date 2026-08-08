// Four of nine subagents in this repo were cut off mid-run and recorded no
// verdict. Every one died during VERIFICATION, not during the work: 97, 100, 105
// and 125 turns, each running a full-suite command at the moment it stopped. One
// had 105 passing tests in a worktree the pipeline could not see, because
// without a verdict the dispatcher names no next stage.
//
// The verdict is the cheapest artefact an agent produces and the only one the
// pipeline reads. The contract had it last, which made it the first thing lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SENIOR_DEV = fs.readFileSync(resolve(ROOT, 'agents/senior-dev.md'), 'utf8');

test('the verdict is recorded before the final regression pass, not after', () => {
  const recordAt = SENIOR_DEV.indexOf('Record the verdict HERE');
  const regressionAt = SENIOR_DEV.indexOf('Also run a final test pass');
  assert.ok(recordAt > 0, 'the contract must say where the verdict is recorded');
  assert.ok(regressionAt > 0);
  assert.ok(recordAt < regressionAt,
    'putting the verdict after verification is what lost four of them');
});

test('re-recording is offered, so the early verdict is not a lie', () => {
  // TASK_DONE recorded before the regression pass could turn out wrong. The
  // contract has to say that overwriting is expected and cheap, or an honest
  // agent will wait until it is certain — which is the behaviour being removed.
  assert.match(SENIOR_DEV, /re-record as BLOCKED/);
  assert.match(SENIOR_DEV, /Overwriting a\s+verdict is free/);
});

test('full-repo CI is named as the orchestrator\'s job, not the agent\'s', () => {
  // Agents asked to run it re-ran it seven and ten times, on runs that were
  // passing, and were cut off inside it.
  assert.match(SENIOR_DEV, /not the whole repository's CI/);
  assert.match(SENIOR_DEV, /run it ONCE/);
});

test('the closing section defers to the early one instead of duplicating it', () => {
  // Two places telling an agent to record a verdict, with no relation stated,
  // is how one of them becomes the one nobody follows.
  assert.match(SENIOR_DEV, /already have recorded this at step 10/);
});
