// verdicts.mjs was 16% covered and held two of the data-corruption bugs found
// this week: the verdict parser that read prose as a field separator, and a
// security counter whose two halves summed to more than the number of reports.
// The correlation across the board package is exact — every corruption bug fixed
// this week lived in a module below 80%.
//
// Parsing moved to scripts/lib/verdict-record.mjs and is tested there. What is
// left here is the part that was never tested at all: which directories a read
// covers, how a project filter applies, and the join that fills in a cost the
// verdict line did not carry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { readVerdicts, readPlanCosts, readQAStats } = await import('./lib/verdicts.mjs');

function project({ verdicts = {}, costHistory = null, plans = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-verd-'));
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts'), { recursive: true });
  for (const [agent, body] of Object.entries(verdicts)) {
    fs.writeFileSync(path.join(dir, '.great_cto', 'verdicts', `${agent}.log`), body);
  }
  if (costHistory !== null) fs.writeFileSync(path.join(dir, '.great_cto', 'cost-history.log'), costHistory);
  if (Object.keys(plans).length) {
    fs.mkdirSync(path.join(dir, 'docs', 'plans'), { recursive: true });
    for (const [name, body] of Object.entries(plans)) {
      fs.writeFileSync(path.join(dir, 'docs', 'plans', name), body);
    }
  }
  return dir;
}
const clean = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };
const TS = '2026-08-01T10:00:00Z';

// ── reading ────────────────────────────────────────────────────────────────

test('the agent comes from the log filename', () => {
  const dir = project({ verdicts: { 'security-officer': `${TS} APPROVED all clear cost=$1.00\n` } });
  try {
    const v = readVerdicts(dir);
    assert.equal(v.length, 1);
    assert.equal(v[0].agent, 'security-officer', 'the space dialect never carried one in the line');
  } finally { clean(dir); }
});

test('every agent log in the directory is read, not just the first', () => {
  const dir = project({
    verdicts: {
      'qa-engineer': `${TS} DONE cost=$0.10\n`,
      'security-officer': `${TS} APPROVED cost=$0.20\n`,
      devops: `${TS} DONE cost=$0.30\n`,
    },
  });
  try {
    assert.deepEqual(readVerdicts(dir).map((v) => v.agent).sort(),
      ['devops', 'qa-engineer', 'security-officer']);
  } finally { clean(dir); }
});

test('an empty or missing verdicts directory reads as no verdicts, not a crash', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-none-'));
  try { assert.deepEqual(readVerdicts(dir), []); } finally { clean(dir); }
});

test('a blank line is not a verdict', () => {
  const dir = project({ verdicts: { 'qa-engineer': `\n\n${TS} DONE cost=$0.1\n\n` } });
  try { assert.equal(readVerdicts(dir).length, 1); } finally { clean(dir); }
});

// ── the cost join ──────────────────────────────────────────────────────────

test('a verdict with no cost is filled from cost-history by timestamp and agent', () => {
  const dir = project({
    verdicts: { 'qa-engineer': `${TS} DONE no cost on this line\n` },
    costHistory: `${TS} qa-engineer 0.42\n`,
  });
  try {
    assert.equal(readVerdicts(dir)[0].cost_usd, 0.42);
  } finally { clean(dir); }
});

test('a cost already on the verdict line wins over the history file', () => {
  const dir = project({
    verdicts: { 'qa-engineer': `${TS} DONE cost=$1.11\n` },
    costHistory: `${TS} qa-engineer 9.99\n`,
  });
  try {
    assert.equal(readVerdicts(dir)[0].cost_usd, 1.11, 'the line is the primary record');
  } finally { clean(dir); }
});

test('a history entry for another agent does not leak into this one', () => {
  const dir = project({
    verdicts: { 'qa-engineer': `${TS} DONE no cost\n` },
    costHistory: `${TS} security-officer 5.00\n`,
  });
  try {
    assert.equal(readVerdicts(dir)[0].cost_usd, null, 'an unknown cost is null, never someone else’s');
  } finally { clean(dir); }
});

test('a verdict with no cost anywhere reports null rather than zero', () => {
  const dir = project({ verdicts: { 'qa-engineer': `${TS} DONE nothing recorded\n` } });
  try {
    assert.equal(readVerdicts(dir)[0].cost_usd, null, 'zero is a measurement; unknown is not');
  } finally { clean(dir); }
});

// ── plan costs ─────────────────────────────────────────────────────────────

test('a single-value plan cost parses — a range is not required', () => {
  // The old regex demanded "0.5 – $2.30" and silently returned 0 for "~$0.30",
  // which made /api/metrics and the cost tile disagree.
  const dir = project({ plans: { 'PLAN-a.md': '# Plan\n\n- LLM: ~$0.30\n- Human: $1,200\n' } });
  try {
    const c = readPlanCosts(dir);
    assert.equal(c.llm_usd, 0.3);
    assert.equal(c.human_usd, 1200, 'every comma is stripped, not just the first');
    assert.equal(c.count, 1);
  } finally { clean(dir); }
});

test('a large human figure keeps all of its digits', () => {
  const dir = project({ plans: { 'PLAN-b.md': '# Plan\n\n- LLM: $2.00\n- Human: $1,234,567\n' } });
  try {
    assert.equal(readPlanCosts(dir).human_usd, 1234567);
  } finally { clean(dir); }
});

test('savings is zero rather than Infinity when no LLM cost was recorded', () => {
  const dir = project({ plans: { 'PLAN-c.md': '# Plan\n\n- Human: $500\n' } });
  try {
    const c = readPlanCosts(dir);
    assert.equal(c.savings_x, 0, 'dividing by a zero denominator must not reach the dashboard');
    assert.ok(Number.isFinite(c.savings_x));
  } finally { clean(dir); }
});

test('no plans directory reads as zeros', () => {
  const dir = project();
  try {
    assert.deepEqual(readPlanCosts(dir), { llm_usd: 0, human_usd: 0, savings_x: 0, count: 0 });
  } finally { clean(dir); }
});

// ── QA stats ───────────────────────────────────────────────────────────────

test('QA stats over a project with no reports are zeros, not undefined', () => {
  const dir = project();
  try {
    const q = readQAStats(dir);
    assert.equal(typeof q, 'object');
    for (const v of Object.values(q)) assert.ok(typeof v === 'number' || v === null, 'every field is a number or an explicit null');
  } finally { clean(dir); }
});
