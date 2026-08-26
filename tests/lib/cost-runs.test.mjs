// `runs` was one field with two meanings, and it disagreed with the logs on disk
// in BOTH directions — +18 on one project over 90 days, −3 on two others.
//
// Two causes, both the same confusion. A closed task was counted as an agent run
// on any day that happened to have no cost data, so the number's meaning changed
// from day to day. And a verdict carrying no cost contributed nothing at all —
// not even its own existence — so "we do not know what it cost" was rendered as
// "it did not happen".
//
// The property asserted here is the one that was violated: the number of agent
// runs in a window equals the number of verdicts in that window. Nothing about
// pricing may change it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCostHistory } from '../../packages/board/lib/data-readers.mjs';

const iso = (daysAgo) => {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
};

function project(verdictsByAgent) {
  const root = mkdtempSync(join(tmpdir(), 'gcto-runs-'));
  mkdirSync(join(root, '.great_cto', 'verdicts'), { recursive: true });
  for (const [agent, lines] of Object.entries(verdictsByAgent)) {
    writeFileSync(join(root, '.great_cto/verdicts', `${agent}.log`), lines.join('\n') + '\n');
  }
  return root;
}

const rec = (agent, daysAgo, cost) => JSON.stringify({
  v: 1, ts: iso(daysAgo), agent, verdict: 'DONE', project: 't',
  ...(cost == null ? {} : { cost_usd: cost }),
});

test('a run with no cost still counts as a run', () => {
  const root = project({ 'senior-dev': [rec('senior-dev', 2, null), rec('senior-dev', 3, null)] });
  const h = getCostHistory(root, 30);
  assert.equal(h.total_agent_runs, 2,
    'a verdict with no cost_usd contributed nothing at all — not even its existence');
  assert.equal(h.total_llm, 0, 'and it must not invent a price to be counted');
});

test('priced and unpriced runs count the same', () => {
  const root = project({ architect: [rec('architect', 1, 0.5), rec('architect', 2, null)] });
  const h = getCostHistory(root, 30);
  assert.equal(h.total_agent_runs, 2);
  assert.equal(h.total_llm, 0.5);
});

test('agent runs and task estimates are separate facts', () => {
  const root = project({ qa: [rec('qa', 1, 0.25)] });
  const h = getCostHistory(root, 30);
  assert.equal(h.total_agent_runs, 1);
  assert.equal(typeof h.total_task_estimates, 'number',
    'the other half of the old `runs` must be answerable on its own');
  assert.equal(h.series.reduce((a, b) => a + b.runs, 0),
               h.total_agent_runs + h.total_task_estimates,
    '`runs` stays the sum, so existing readers keep working');
});

test('the window selects, and nothing outside it is counted', () => {
  const root = project({ pm: [rec('pm', 3, 1), rec('pm', 45, 1), rec('pm', 200, 1)] });
  assert.equal(getCostHistory(root, 30).total_agent_runs, 1);
  assert.equal(getCostHistory(root, 90).total_agent_runs, 2);
});

test('a run report is not a verdict', () => {
  const root = project({ architect: [rec('architect', 1, null)] });
  // The prose form written beside the verdict logs: `<agent>-YYYY-MM-DD-HHMMSS.log`.
  // Read as a verdict log it produced records whose timestamp was `DONE:` and
  // whose agent name included the file's own timestamp.
  writeFileSync(join(root, '.great_cto/verdicts', 'architect-2026-08-26-134109.log'),
    'DONE: ARCH written — 7 ADR decisions\n  artifact: docs/architecture/ARCH-x.md\n  next: gate:arch\n');
  assert.equal(getCostHistory(root, 30).total_agent_runs, 1,
    'three paragraph openings must not become three runs');
});
