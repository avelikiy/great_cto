// metrics.mjs was 10% covered, and the board's headline numbers come out of it:
// tasks done, velocity, cost per accepted change. The MCP `project_status` tool
// read `metrics.done` and `metrics.total` off the response root — they live under
// `metrics.tasks` — so every project reported "0/0 done" no matter how much had
// shipped. Nothing failed; the numbers were simply undefined, and undefined
// renders as zero.
//
// A shape nobody tests is a shape callers guess at. These tests pin the contract
// the board, the MCP server, and /api/metrics all read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { getMetrics, acceptanceMetrics } = await import('./lib/metrics.mjs');

function project({ tasks = '', verdicts = {}, costHistory = '' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-metrics-'));
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts'), { recursive: true });
  if (tasks) fs.writeFileSync(path.join(dir, '.great_cto', 'tasks.md'), tasks);
  for (const [agent, body] of Object.entries(verdicts)) {
    fs.writeFileSync(path.join(dir, '.great_cto', 'verdicts', `${agent}.log`), body);
  }
  if (costHistory) fs.writeFileSync(path.join(dir, '.great_cto', 'cost-history.log'), costHistory);
  return dir;
}
const clean = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().replace(/\.\d+Z$/, 'Z');

// ── the shape callers read ─────────────────────────────────────────────────

test('task counts live under `tasks`, which is where callers must look', () => {
  const dir = project({ tasks: '- [x] T-1: done thing\n- [ ] T-2: open thing\n' });
  try {
    const m = getMetrics(dir);
    assert.ok(m.tasks && typeof m.tasks === 'object', 'the MCP tool read these off the root and got undefined');
    for (const k of ['total', 'done', 'done_in_window', 'in_progress', 'backlog']) {
      assert.equal(typeof m.tasks[k], 'number', `tasks.${k} must be a number`);
    }
    assert.equal(m.tasks.total, 2);
    assert.equal(m.tasks.done, 1);
    assert.ok(!('done' in m) && !('total' in m), 'no second home for the same fact');
  } finally { clean(dir); }
});

test('the response always carries the window it was computed over', () => {
  const dir = project();
  try {
    assert.equal(getMetrics(dir, 7).window_days, 7);
    assert.equal(getMetrics(dir).window_days, 30, 'a default nobody states is a default nobody can check');
  } finally { clean(dir); }
});

test('velocity keeps its deprecated aliases in step with the canonical keys', () => {
  const dir = project({ tasks: '- [x] T-1: shipped\n' });
  try {
    const v = getMetrics(dir).velocity;
    assert.equal(v.this_week, v.last_7d, 'an alias that drifts is worse than no alias');
    assert.equal(v.this_month, v.last_30d);
  } finally { clean(dir); }
});

test('an empty project reports zeros, not absent fields', () => {
  const dir = project();
  try {
    const m = getMetrics(dir);
    assert.equal(m.tasks.total, 0);
    assert.equal(m.tasks.done, 0);
    assert.ok(Array.isArray(m.verdicts), 'a missing list would read as a crash to every caller');
  } finally { clean(dir); }
});

// ── acceptance: the number that must not be invented ───────────────────────

test('cost per accepted change is null when nothing was accepted', () => {
  const a = acceptanceMetrics([{ verdict: 'BLOCKED' }], 12.5);
  assert.equal(a.accepted, 0);
  assert.equal(a.cost_per_accepted, null, 'dividing a real cost by zero approvals would invent a number');
  assert.equal(a.rework_rounds, 1);
});

test('cost per accepted change is computed when there is a denominator', () => {
  const a = acceptanceMetrics([{ verdict: 'APPROVED' }, { verdict: 'APPROVED' }], 10);
  assert.equal(a.accepted, 2);
  assert.equal(a.cost_per_accepted, 5);
});

test('cost per accepted change is null when the cost itself is unknown', () => {
  assert.equal(acceptanceMetrics([{ verdict: 'APPROVED' }], null).cost_per_accepted, null);
});

test('rework counts every way a change was sent back, and an approval is not one', () => {
  const a = acceptanceMetrics(
    ['BLOCKED', 'REJECTED', 'FAILED', 'CHANGES_REQUESTED', 'APPROVED', 'DONE'].map((verdict) => ({ verdict })),
  );
  assert.equal(a.rework_rounds, 4);
  assert.equal(a.accepted, 1, 'DONE is not an approval — only a gate approving is');
});

test('a verdict with no value is neither accepted nor rework', () => {
  const a = acceptanceMetrics([{ verdict: '' }, { }, { verdict: null }]);
  assert.equal(a.accepted, 0);
  assert.equal(a.rework_rounds, 0);
});

// ── verdicts reach metrics whatever dialect they were written in ───────────

test('verdicts are read from all three log formats and windowed', () => {
  const dir = project({
    verdicts: {
      'security-officer': [
        `${iso(2)} | security-officer | APPROVED | 0 critical | cost=$1.00`,
        JSON.stringify({ v: 1, ts: iso(1), agent: 'security-officer', verdict: 'APPROVED', cost_usd: 2 }),
        `${iso(400)} APPROVED ancient run cost=$9.00`,
      ].join('\n'),
    },
  });
  try {
    const m = getMetrics(dir, 30);
    assert.equal(m.verdicts.length, 3, 'the list itself is not windowed — the acceptance metric is');
    assert.equal(m.acceptance.accepted, 2, 'the 400-day-old run is outside a 30-day window');
  } finally { clean(dir); }
});

test('a verdict log holding an unreadable line does not take the metrics down', () => {
  const dir = project({
    verdicts: { 'qa-engineer': `{not json\n${iso(1)} | qa-engineer | DONE | cost=$0.5\n` },
  });
  try {
    const m = getMetrics(dir);
    assert.equal(m.verdicts.length, 1, 'one bad line must not cost the reader the good ones');
  } finally { clean(dir); }
});
