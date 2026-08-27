// Verification was a sentence in a directive, and a sentence is followed when
// the reader chooses to. Measured on this repository: 31 agent runs, 10 scores,
// and most of those ten were run by hand rather than by the pipeline. A check
// that executes on a third of the work is a suggestion with good intentions.
//
// The dispatch is now conditional on a score for THIS run. The properties below
// are the ones that make it a gate rather than another suggestion — including
// the two that keep it from becoming a trap.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideNext } from '../../scripts/hooks/pipeline-dispatcher.mjs';
import { writeScore } from '../../scripts/lib/scores.mjs';

const TS = '2026-08-26T20:00:00Z';
const TRANSITIONS = { architect: { on: ['APPROVED'], next: ['pm'] } };

function project() {
  const root = mkdtempSync(join(tmpdir(), 'gcto-vgate-'));
  mkdirSync(join(root, '.great_cto', 'verdicts'), { recursive: true });
  mkdirSync(join(root, 'docs', 'architecture'), { recursive: true });
  writeFileSync(join(root, 'docs/architecture/ARCH-x.md'), '# ARCH\n' + 'x'.repeat(400));
  return root;
}
const verdict = (ts = TS) => ({
  agent: 'architect', verdict: 'APPROVED', ts,
  meta: { arch: 'docs/architecture/ARCH-x.md' }, hasCost: true,
});
const decide = (root, v) => decideNext({
  agent: 'architect', transitions: TRANSITIONS, verdict: v, cwd: root,
  activeGates: [], gateStates: {},
});
const score = (root, ts, state = 'verified') => writeScore(root, {
  agent: 'architect', runTs: ts, name: 'independent-verify', state, scorer: 'mechanical',
});

test('an unchecked stage does not dispatch', () => {
  const r = decide(project(), verdict());
  assert.equal(r.kind, 'verify-wait');
  assert.match(r.text, /independent-verify/, 'and the directive names the command to run');
});

test('a scored stage dispatches, and the directive says what was recorded', () => {
  const root = project();
  score(root, TS);
  const r = decide(root, verdict());
  assert.equal(r.kind, 'next');
  assert.match(r.text, /VERIFIED: independent-verify recorded `verified`/);
});

test('a score from an earlier run does not satisfy a later one', () => {
  const root = project();
  score(root, TS);
  const r = decide(root, verdict('2026-08-26T21:00:00Z'));
  assert.equal(r.kind, 'verify-wait',
    'otherwise a stage verified once is waved through forever after');
});

test('unverifiable is a recorded answer and unblocks — the look is what is required', () => {
  const root = project();
  score(root, TS, 'unverifiable');
  assert.equal(decide(root, verdict()).kind, 'next',
    'a gate nothing can satisfy is a deadlock, not a gate');
});

test('rework is also a recorded answer — the gate is about having looked', () => {
  const root = project();
  score(root, TS, 'rework');
  assert.equal(decide(root, verdict()).kind, 'next',
    'acting on a rework finding is the orchestrator’s job; this gate only asks that one exists');
});

test('the escape hatch says the stage was not checked, rather than implying it passed', () => {
  const root = project();
  const prev = process.env.GREAT_CTO_REQUIRE_VERIFY;
  process.env.GREAT_CTO_REQUIRE_VERIFY = '0';
  try {
    const r = decide(root, verdict());
    assert.equal(r.kind, 'next');
    assert.match(r.text, /NOT VERIFIED/, 'a bypass that reads like a pass is worse than no bypass');
  } finally {
    if (prev === undefined) delete process.env.GREAT_CTO_REQUIRE_VERIFY;
    else process.env.GREAT_CTO_REQUIRE_VERIFY = prev;
  }
});

test('no project directory means no gate — the hook cannot check what it cannot read', () => {
  const r = decideNext({
    agent: 'architect', transitions: TRANSITIONS, verdict: verdict(), cwd: null,
    activeGates: [], gateStates: {},
  });
  assert.equal(r.kind, 'next', 'fail-open: a broken checker must not halt every transition');
});
