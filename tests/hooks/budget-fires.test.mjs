// Do agent spending caps actually refuse a dispatch?
//
// They could not, for as long as they existed. The rule they are built on — an
// ESTIMATE never refuses, only a MEASUREMENT does — is correct and was, in
// practice, a permanent open gate: nothing measured ever reached the judge, so
// every cap sat at `unmeasured` and every stage ran. The cap was real, the
// refusal was unreachable, and from outside those look identical.
//
// This walks the whole chain in a temp project — PROJECT.md declares a cap, a
// measured cost lands in cost-history.log, the verdict is enriched from it, and
// the dispatcher decides. Four states, and three of them must NOT block.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideNext } from '../../scripts/hooks/pipeline-dispatcher.mjs';
import { writeScore } from '../../scripts/lib/scores.mjs';
import { readVerdicts } from '../../packages/board/lib/verdicts.mjs';

const TS = '2026-08-26T10:00:00Z';
const TRANSITIONS = { architect: { on: ['APPROVED'], next: ['senior-dev'] } };

function project({ cap = 5, history = null, verdictCost = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gcto-budget-'));
  mkdirSync(join(root, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(root, '.great_cto/PROJECT.md'),
    `# t\n\nagent-budgets:\n  senior-dev: ${cap}\n`);
  writeFileSync(join(root, '.great_cto/verdicts/senior-dev.log'),
    JSON.stringify({ v: 1, ts: TS, agent: 'senior-dev', verdict: 'APPROVED',
                     project: 't', cost_usd: verdictCost }) + '\n');
  if (history) writeFileSync(join(root, '.great_cto/cost-history.log'), history);
  // The stage under test has been verified. These tests assert what the BUDGET
  // decides, and a stage that reaches the budget check in real life has already
  // passed the verification gate that sits in front of it — so the fixture says
  // so rather than disabling the gate, which would test a mode nobody runs.
  writeScore(root, { agent: 'architect', name: 'independent-verify',
                     state: 'verified', scorer: 'mechanical' });
  return root;
}

const dispatch = (root, costUsd) => decideNext({
  agent: 'architect', transitions: TRANSITIONS,
  verdict: { agent: 'architect', verdict: 'APPROVED', meta: { arch: 'README.md' }, hasCost: true },
  cwd: root,
  allVerdicts: [{ agent: 'senior-dev', verdict: 'APPROVED', costUsd }],
  activeGates: [], gateStates: {},
});

test('measured spend over the cap refuses the dispatch, and names the number', () => {
  const root = project({ cap: 5 });
  const r = dispatch(root, 7.5);
  assert.equal(r.kind, 'blocked', 'a cap that cannot refuse is not a cap');
  assert.match(r.text, /7\.50/);
  assert.match(r.text, /\$5/);
  assert.doesNotMatch(r.text, /spawn Agent/, 'the held stage must not also be dispatched');
});

test('measured spend under the cap proceeds', () => {
  assert.equal(dispatch(project({ cap: 5 }), 2).kind, 'next');
});

test('nothing measured does NOT refuse — an estimate never refuses', () => {
  const r = dispatch(project({ cap: 5 }), null);
  assert.equal(r.kind, 'next',
    'a limit firing on a number nobody measured is worse than no limit');
});

test('a measured zero is within the cap, not unmeasured', () => {
  assert.equal(dispatch(project({ cap: 5 }), 0).kind, 'next');
});

test('the measured figure reaches the verdict from cost-history', () => {
  // The link that was broken end to end: the verdict carries cost_usd: 0
  // because agents do not measure themselves, and the measurement lives in a
  // separate file. If this regresses, every cap silently returns to unmeasured.
  const root = project({ verdictCost: 0, history: `${TS} senior-dev 7.50 turns=120\n` });
  const [v] = readVerdicts(root);
  assert.equal(v.cost_usd, 7.5);
  assert.equal(v.cost_source, 'measured');
});

test('an unreadable PROJECT.md holds nothing back', () => {
  const root = mkdtempSync(join(tmpdir(), 'gcto-budget-none-'));
  // Scored, for the same reason the shared fixture is: this asserts what an
  // ABSENT budget does, and the verification gate in front of it would otherwise
  // answer first — a project with no PROJECT.md would look like a budget refusal
  // when it is nothing of the kind.
  mkdirSync(join(root, '.great_cto'), { recursive: true });
  writeScore(root, { agent: 'architect', name: 'independent-verify',
                     state: 'verified', scorer: 'mechanical' });
  const r = dispatch(root, 999);
  assert.equal(r.kind, 'next', 'a budget we could not read is not a budget that was exceeded');
});
