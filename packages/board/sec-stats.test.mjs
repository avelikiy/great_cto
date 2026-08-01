// readSecStats counts security reports by outcome. It tested for APPROVED and
// for BLOCKED separately, so a report that says "initially BLOCKED, now
// APPROVED" — the normal shape of a resolved finding — counted as both. The two
// counters summed to more than the number of reports, and a finding stayed in
// the blocked count after it was fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSecStats } from './lib/verdicts.mjs';

function withReports(files) {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-sec-'));
  mkdirSync(join(dir, 'docs', 'security'), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, 'docs', 'security', name), body);
  }
  return dir;
}

test('a report that was blocked and then approved counts once, as approved', () => {
  const dir = withReports({ 'SEC-a.md': '# Report\n\nVerdict: BLOCKED\n\nAfter the fix: APPROVED\n' });
  try {
    assert.deepEqual(readSecStats(dir), { approved: 1, blocked: 0 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a still-blocked report counts as blocked', () => {
  const dir = withReports({ 'SEC-b.md': '# Report\n\nPreviously APPROVED, now BLOCKED on a new finding.\n' });
  try {
    assert.deepEqual(readSecStats(dir), { approved: 0, blocked: 1 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the counts never sum to more than the number of reports', () => {
  const dir = withReports({
    'SEC-a.md': 'BLOCKED then APPROVED\n',
    'SEC-b.md': 'APPROVED\n',
    'SEC-c.md': 'BLOCKED\n',
    'SEC-d.md': 'no verdict word at all\n',
  });
  try {
    const s = readSecStats(dir);
    assert.equal(s.approved + s.blocked, 3, 'a report with no verdict is not counted as either');
    assert.deepEqual(s, { approved: 2, blocked: 1 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a missing docs/security is zero, not a crash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-sec-none-'));
  try {
    assert.deepEqual(readSecStats(dir), { approved: 0, blocked: 0 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
