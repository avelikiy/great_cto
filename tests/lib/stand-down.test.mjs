// The record a gate leaves when it stands down instead of waiting.
//
// The invariant under test: a decision that could not be logged is refused.
// Every path that cannot produce a durable record must return `recorded: false`,
// because the caller's contract is that this restores the gate — so a single
// path here that returns success on doubt silently un-gates the pipeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordStandDown, readStandDowns, standDownRecorder, STAND_DOWN_PATH } from '../../scripts/lib/stand-down.mjs';

const AT = Date.parse('2026-08-17T12:00:00Z');
const sandbox = () => mkdtempSync(join(tmpdir(), 'gcto-standdown-'));
const clean = (d) => rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });

const REC = { gate: 'arch', agent: 'architect', tier: 'notify', evidence: '2 evals conclusively passed', at: AT };

test('a record is written, and says what stood down and when', () => {
  const dir = sandbox();
  try {
    const r = recordStandDown(dir, REC);
    assert.equal(r.recorded, true);
    const rows = readStandDowns(dir);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].gate, 'arch');
    assert.equal(rows[0].agent, 'architect');
    assert.equal(rows[0].tier, 'notify');
    assert.match(rows[0].evidence, /conclusively passed/);
    assert.equal(rows[0].ts, '2026-08-17T12:00:00.000Z');
  } finally { clean(dir); }
});

test('records append — the sequence is the audit, so nothing overwrites', () => {
  const dir = sandbox();
  try {
    recordStandDown(dir, REC);
    recordStandDown(dir, { ...REC, gate: 'ship', at: AT + 1000 });
    const rows = readStandDowns(dir);
    assert.deepEqual(rows.map((r) => r.gate), ['arch', 'ship']);
  } finally { clean(dir); }
});

test('the directory is created if it does not exist yet', () => {
  const dir = sandbox();
  try {
    assert.equal(recordStandDown(dir, REC).recorded, true);
    assert.ok(readFileSync(join(dir, STAND_DOWN_PATH), 'utf8').includes('architect'));
  } finally { clean(dir); }
});

// ── Every refusal ───────────────────────────────────────────────────────────

test('a record that cannot name the gate or the agent is refused', () => {
  // Writing a partial line would leave the file claiming a stand-down happened
  // without saying whose — worse than no line, because it counts.
  const dir = sandbox();
  try {
    assert.equal(recordStandDown(dir, { ...REC, gate: null }).recorded, false);
    assert.equal(recordStandDown(dir, { ...REC, agent: '' }).recorded, false);
    assert.deepEqual(readStandDowns(dir), [], 'and nothing was written');
  } finally { clean(dir); }
});

test('a record with no timestamp is refused rather than stamped from the clock', () => {
  // Reaching for Date.now() here would quietly opt this module out of the
  // reproducibility every caller in this repository maintains by resolving one
  // `now` at startup.
  const dir = sandbox();
  try {
    const r = recordStandDown(dir, { gate: 'arch', agent: 'architect', tier: 'notify', evidence: 'x' });
    assert.equal(r.recorded, false);
    assert.match(r.why, /must say when/);
  } finally { clean(dir); }
});

test('an unwritable path is refused, and the reason is the real error', () => {
  // Not a guess about the cause. A catch that invents one is how a ReferenceError
  // once reported itself as a missing build.
  const dir = sandbox();
  try {
    mkdirSync(join(dir, '.great_cto'), { recursive: true });
    // A directory where the file should be: the open fails for a real reason.
    mkdirSync(join(dir, STAND_DOWN_PATH), { recursive: true });
    const r = recordStandDown(dir, REC);
    assert.equal(r.recorded, false);
    assert.match(r.why, /could not write/);
    assert.ok(r.why.length > 'could not write .great_cto/stand-downs.jsonl: '.length, 'and carries the underlying message');
  } finally { clean(dir); }
});

// ── Reading ─────────────────────────────────────────────────────────────────

test('no file yet is an empty list — nothing has stood down', () => {
  const dir = sandbox();
  try { assert.deepEqual(readStandDowns(dir), []); } finally { clean(dir); }
});

test('a file that exists and cannot be read is null, not empty', () => {
  // "I could not look" and "I looked and there were none" are different answers.
  // Returning [] for both is the shape this module exists to remove.
  const dir = sandbox();
  try {
    mkdirSync(join(dir, '.great_cto'), { recursive: true });
    mkdirSync(join(dir, STAND_DOWN_PATH), { recursive: true });   // a directory reads as unreadable
    assert.equal(readStandDowns(dir), null);
  } finally { clean(dir); }
});

test('a torn line is skipped without losing the records around it', () => {
  const dir = sandbox();
  try {
    recordStandDown(dir, REC);
    const p = join(dir, STAND_DOWN_PATH);
    writeFileSync(p, readFileSync(p, 'utf8') + '{"v":1,"gate":"tru\n' + JSON.stringify({ v: 1, gate: 'ship', agent: 'devops' }) + '\n');
    const rows = readStandDowns(dir);
    assert.deepEqual(rows.map((r) => r.gate), ['arch', 'ship']);
  } finally { clean(dir); }
});

test('--limit returns the newest, since the tail is what a reader wants', () => {
  const dir = sandbox();
  try {
    for (let i = 0; i < 5; i++) recordStandDown(dir, { ...REC, gate: `g${i}`, at: AT + i });
    assert.deepEqual(readStandDowns(dir, { limit: 2 }).map((r) => r.gate), ['g3', 'g4']);
  } finally { clean(dir); }
});

// ── The injected shape ──────────────────────────────────────────────────────

test('standDownRecorder binds a project and carries an injected clock', () => {
  const dir = sandbox();
  try {
    const rec = standDownRecorder(dir, { at: AT });
    assert.equal(rec({ gate: 'arch', agent: 'architect', tier: 'notify', evidence: 'x' }).recorded, true);
    assert.equal(readStandDowns(dir)[0].ts, '2026-08-17T12:00:00.000Z');
  } finally { clean(dir); }
});

test('a missing tier or evidence is recorded as absent, not omitted', () => {
  // The line still has to say that nothing was known, or a reader cannot tell a
  // stand-down with no stated evidence from one whose evidence was lost.
  const dir = sandbox();
  try {
    recordStandDown(dir, { gate: 'arch', agent: 'architect', at: AT });
    const row = readStandDowns(dir)[0];
    assert.equal(row.tier, 'unknown');
    assert.match(row.evidence, /none recorded/);
  } finally { clean(dir); }
});
