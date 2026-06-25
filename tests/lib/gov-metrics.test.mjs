// Tests for gov-metrics (TAKE 1, borrow-santander): governance metrics over the
// verdict trail — block rate, R1/R2 regime split, false-block proxy, overrides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadDecisions, computeMetrics } from '../../scripts/lib/gov-metrics.mjs';

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'govm-'));
  for (const [name, lines] of Object.entries(files)) writeFileSync(join(dir, name), lines.join('\n'));
  return dir;
}

test('gov-metrics: parses verdict lines and ignores malformed/non-gate', () => {
  const dir = fixture({
    'architect.log': [
      '2026-06-01T10:00:00Z | architect | APPROVED | feature=auth',
      'garbage line with no pipes',
      '2026-06-01T11:00:00Z | architect | BLOCKED | feature=billing',
    ],
    'continuous-learner.log': ['2026-06-01T12:00:00Z | continuous-learner | DONE | feature=x'], // not a gate agent
  });
  try {
    const ds = loadDecisions(dir);
    assert.equal(ds.length, 3, 'three valid lines parsed (garbage dropped)');
    const m = computeMetrics(ds);
    assert.equal(m.decisions, 2, 'only the 2 gate-agent decisions count (learner excluded)');
    assert.equal(m.block_rate_pct, 50, 'one of two architect verdicts blocked');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('gov-metrics: R1/R2 regime split is correct', () => {
  const dir = fixture({
    'architect.log': ['2026-06-01T10:00:00Z | architect | APPROVED | feature=a'],         // R1
    'qa-engineer.log': ['2026-06-01T10:05:00Z | qa-engineer | PASS | feature=a'],          // R2
    'security-officer.log': ['2026-06-01T10:10:00Z | security-officer | APPROVED | feature=a'], // R2
  });
  try {
    const m = computeMetrics(loadDecisions(dir));
    assert.equal(m.decisions, 3);
    assert.equal(m.r2_mechanical_share_pct, 66.7, 'qa + security are R2 of 3');
    assert.equal(m.r1_textual_share_pct, 33.3, 'architect is R1');
    assert.equal(m.by_agent['qa-engineer'].regime, 'R2');
    assert.equal(m.by_agent['architect'].regime, 'R1');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('gov-metrics: false-block proxy + override rate', () => {
  const dir = fixture({
    'security-officer.log': [
      '2026-06-01T10:00:00Z | security-officer | BLOCKED | feature=pay',   // block...
      '2026-06-01T10:30:00Z | security-officer | APPROVED | feature=pay',  // ...then passed → false-block
      '2026-06-02T10:00:00Z | security-officer | BLOCKED | feature=auth | waiver=cto', // override
    ],
  });
  try {
    const m = computeMetrics(loadDecisions(dir));
    assert.equal(m.false_block_rate_pct, 50, '1 of 2 blocked features later passed unchanged');
    assert.equal(m.override_rate_pct, 33.3, '1 of 3 decisions carried a waiver');
    assert.ok(m.median_minutes_between_gate_decisions > 0, 'time-in-gate computed from timestamps');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('gov-metrics: empty dir → zeroed metrics, no throw', () => {
  const m = computeMetrics(loadDecisions('/nonexistent/path/xyz'));
  assert.equal(m.decisions, 0);
  assert.equal(m.block_rate_pct, 0);
});
