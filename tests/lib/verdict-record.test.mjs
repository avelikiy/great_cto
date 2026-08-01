// Verdicts were free text in two dialects, and the reader chose between them by
// asking whether the line contained ' | '. Agents write prose in the details
// field and prose contains pipes, so "BLOCKED 3 findings | all in the auth path"
// was read as the pipe dialect and the verdict came back as "all in the auth
// path" — which the board displayed as the agent's verdict.
//
// That was fixed by guessing more carefully. This removes the guess. What the
// tests pin is the pair of properties that makes a format worth having: a writer
// cannot emit something a reader will misread, and a reader cannot silently
// half-understand a record it does not know.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VERDICT_FORMAT_VERSION, makeVerdict, formatVerdict, validateVerdict,
  parseVerdictLine, parseVerdictLog,
} from '../../scripts/lib/verdict-record.mjs';

const base = { ts: '2026-08-01T10:00:00Z', agent: 'security-officer', verdict: 'APPROVED' };

// ── writing ────────────────────────────────────────────────────────────────

test('a record round-trips through the line format unchanged', () => {
  const rec = makeVerdict({ ...base, project: 'great-cto', cost_usd: 1.25, meta: { feature: 'auth' } });
  const back = parseVerdictLine(formatVerdict(rec));
  assert.equal(back.ok, true);
  assert.deepEqual(back.rec, rec);
  assert.equal(back.legacy, false);
});

test('prose full of pipes cannot move one field into another', () => {
  const rec = makeVerdict({ ...base, verdict: 'BLOCKED', meta: { note: '3-findings' } });
  const parsed = parseVerdictLine(formatVerdict({ ...rec, meta: { note: '3 findings | all in the auth path' } }));
  assert.equal(parsed.rec.verdict, 'BLOCKED', 'the field that says BLOCKED is the one named verdict');
  assert.equal(parsed.rec.meta.note, '3 findings | all in the auth path', 'and the prose survives intact');
});

test('the verdict is normalised so APPROVED and approved are one value', () => {
  assert.equal(makeVerdict({ ...base, verdict: 'approved' }).verdict, 'APPROVED');
});

test('a record that cannot be read later is refused at write time', () => {
  assert.throws(() => makeVerdict({ ...base, agent: '' }), /agent is required/);
  assert.throws(() => makeVerdict({ ...base, ts: 'yesterday' }), /ISO-8601/);
  assert.throws(() => makeVerdict({ ...base, cost_usd: -1 }), /non-negative/);
  assert.throws(() => makeVerdict({ ...base, verdict: '' }), /verdict is required/);
});

test('optional fields are absent rather than empty', () => {
  const rec = makeVerdict(base);
  assert.ok(!('project' in rec), 'an empty string would be a second way to say unknown');
  assert.ok(!('cost_usd' in rec));
  assert.ok(!('meta' in rec));
});

test('cost of zero is a real measurement and is kept', () => {
  assert.equal(makeVerdict({ ...base, cost_usd: 0 }).cost_usd, 0);
});

// ── version discipline ─────────────────────────────────────────────────────

test('a record from an unknown format version is reported, not half-read', () => {
  const line = JSON.stringify({ v: 99, ts: base.ts, agent: 'x', verdict: 'APPROVED' });
  const r = parseVerdictLine(line);
  assert.equal(r.ok, false);
  assert.match(r.reason, /unsupported format version 99/,
    'reading the fields we happen to recognise is how a format change becomes a data bug');
});

test('the version is stamped on every record without the caller asking', () => {
  assert.equal(makeVerdict(base).v, VERDICT_FORMAT_VERSION);
});

test('validate accepts a good record and names what is wrong with a bad one', () => {
  assert.equal(validateVerdict(makeVerdict(base)).valid, true);
  const bad = validateVerdict({ v: 1, ts: base.ts, agent: 'a', verdict: 'X', meta: ['nope'] });
  assert.equal(bad.valid, false);
  assert.match(bad.errors[0], /meta must be an object/);
});

// ── reading history ────────────────────────────────────────────────────────

test('the pipe dialect still parses', () => {
  const r = parseVerdictLine('2026-07-30T10:00:00Z | security-officer | APPROVED | 0 critical | project=demo | cost=$1.10');
  assert.equal(r.ok, true);
  assert.equal(r.legacy, true);
  assert.equal(r.rec.agent, 'security-officer');
  assert.equal(r.rec.verdict, 'APPROVED');
  assert.equal(r.rec.project, 'demo');
  assert.equal(r.rec.cost_usd, 1.1);
});

test('the space dialect still parses, and a prose pipe does not hijack it', () => {
  const r = parseVerdictLine('2026-07-30T10:00:00Z BLOCKED 3 findings | all in the auth path cost=$0.9');
  assert.equal(r.rec.verdict, 'BLOCKED', 'the original bug, kept as a test');
  assert.equal(r.rec.cost_usd, 0.9);
});

test('the space dialect takes its agent from the filename, which is where it lived', () => {
  const { records } = parseVerdictLog('2026-07-30T10:00:00Z APPROVED all clear cost=$0.1\n', { agent: 'qa-engineer' });
  assert.equal(records[0].agent, 'qa-engineer');
});

test('a log holding both dialects and the new one reads as a single list', () => {
  const text = [
    '2026-07-01T10:00:00Z APPROVED early run cost=$0.1',
    '2026-07-15T10:00:00Z | qa-engineer | DONE | 12 pass | cost=$0.3',
    formatVerdict(makeVerdict({ ts: '2026-08-01T10:00:00Z', agent: 'qa-engineer', verdict: 'DONE', cost_usd: 0.2 })),
  ].join('\n');
  const { records, rejected } = parseVerdictLog(text, { agent: 'qa-engineer' });
  assert.equal(records.length, 3, 'a new format must not orphan the history it replaces');
  assert.deepEqual(rejected, []);
  assert.deepEqual(records.map((r) => r.verdict), ['APPROVED', 'DONE', 'DONE']);
});

// ── what the parser refuses to hide ────────────────────────────────────────

test('an unreadable line is returned, not skipped', () => {
  const { records, rejected } = parseVerdictLog('{not json\n2026-08-01T10:00:00Z APPROVED ok\n', { agent: 'a' });
  assert.equal(records.length, 1);
  assert.equal(rejected.length, 1, 'silently dropping a line reports a clean file and a short list');
  assert.match(rejected[0].reason, /malformed JSON/);
});

test('blank lines are not errors', () => {
  const { records, rejected } = parseVerdictLog('\n\n  \n', { agent: 'a' });
  assert.deepEqual(records, []);
  assert.deepEqual(rejected, []);
});

test('a JSON line missing a required field is rejected with the reason', () => {
  const r = parseVerdictLine(JSON.stringify({ v: 1, ts: base.ts, verdict: 'APPROVED' }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /agent is required/);
});

test('a two-field pipe line is read as a verdict rather than dropped', () => {
  // "<ts> | APPROVED" has no agent field. Taking field 2 unconditionally would
  // read an empty verdict off a line that plainly states one.
  assert.equal(parseVerdictLine('2026-07-30T10:00:00Z | APPROVED').rec.verdict, 'APPROVED');
});

test('a pipe line whose details also contain pipes still reads the verdict', () => {
  const r = parseVerdictLine('2026-07-30T10:00:00Z | qa-engineer | DONE | 12 pass | 0 fail | cost=$0.3');
  assert.equal(r.rec.verdict, 'DONE');
});
