// The board reads verdict logs written in two formats by different agents, and
// picked between them by asking whether the line contained ' | '. Agents write
// prose in the details field, and prose contains pipes — so an ordinary
// space-separated verdict got read as the pipe form and the board displayed
// whatever followed the second pipe as the agent's verdict.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdictLine } from './lib/verdicts.mjs';

test('the space-separated form reads its verdict', () => {
  const r = parseVerdictLine('2026-07-30T10:00:00Z APPROVED no blocking findings cost=$0.42');
  assert.equal(r.ts, '2026-07-30T10:00:00Z');
  assert.equal(r.verdict, 'APPROVED');
});

test('a pipe in the details does not turn a line into the pipe format', () => {
  const r = parseVerdictLine('2026-07-30T10:00:00Z BLOCKED 3 findings | all in the auth path cost=$0.9');
  assert.equal(r.verdict, 'BLOCKED', 'the verdict is the second field, not the text after a prose pipe');
});

test('the pipe-separated form reads its verdict', () => {
  const r = parseVerdictLine('2026-07-30T10:00:00Z | security-officer | APPROVED | 0 critical | cost=$1.10');
  assert.equal(r.ts, '2026-07-30T10:00:00Z');
  assert.equal(r.verdict, 'APPROVED');
});

test('a pipe line whose details also contain pipes still reads the verdict', () => {
  const r = parseVerdictLine('2026-07-30T10:00:00Z | qa-engineer | DONE | 12 pass | 0 fail | cost=$0.3');
  assert.equal(r.verdict, 'DONE');
});

test('a two-field pipe line is read as a verdict, not dropped', () => {
  assert.equal(parseVerdictLine('2026-07-30T10:00:00Z | APPROVED').verdict, 'APPROVED');
});

test('a blank or malformed line yields empty strings, never a crash', () => {
  assert.deepEqual(parseVerdictLine(''), { ts: '', verdict: '' });
  assert.deepEqual(parseVerdictLine(null), { ts: '', verdict: '' });
});
