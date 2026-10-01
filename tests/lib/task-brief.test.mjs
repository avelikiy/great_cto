// The task brief: the proposal an operator approves with one word says how the
// work counts as done. Baseline (request-quality, 25.09): 0 of 965 approvals were
// of a proposal carrying a "Done when"; 83 "it doesn't work" reports in 60 days.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasDoneWhen } from '../../scripts/lib/request-quality.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const BRIEF = read('agents/_shared/task-brief.md');

test('the brief carries what the costly corrections were missing', () => {
  for (const field of ['Target', 'Done when', 'Gates', 'Invariants', 'Assumed', 'Ask', 'Not doing']) {
    assert.match(BRIEF, new RegExp(`^${field}\\s`, 'm'), field);
  }
  assert.match(BRIEF, /≤3/, 'a question budget');
  assert.match(BRIEF, /Repro:/, 'a bug is reproduced before it is fixed');
  assert.match(BRIEF, /Tiny: `Done when` alone/, 'sized — a small task is not buried in process');
});

test('the line the brief asks for is the line request-quality counts', () => {
  // If these two drift, B1 ships and the metric keeps saying 0%.
  assert.ok(hasDoneWhen(BRIEF));
  assert.ok(hasDoneWhen('Done when   the E2E suite passes on the build that ships'));
});

test('the agents that implement, deploy and fix incidents follow it; the coordinator dispatches with it', () => {
  for (const a of ['senior-dev', 'devops', 'l3-support', 'coordinator']) {
    assert.match(read(`agents/${a}.md`), /agents\/_shared\/task-brief\.md/, a);
  }
});
