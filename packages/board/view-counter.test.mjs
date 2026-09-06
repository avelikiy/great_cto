// Tests for great_cto-ki1x.15 (BRD-R9): a local, per-view request counter.
//
// No network call anywhere in this file or in lib/view-counter.mjs — the
// counter exists so the K2/K3 kill-criteria in
// docs/product/BRIEF-board-redesign-2026-09.md have a source, and per
// docs/PRIVACY.md telemetry stays opt-in and off by default. This is not
// telemetry: it never leaves the machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { recordView, summarizeViews } = await import('./lib/view-counter.mjs');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-viewcounter-'));
}
const clean = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };
const logPath = (root) => path.join(root, '.great_cto', 'view-counter.log');

test('recordView appends one JSON line to .great_cto/view-counter.log', () => {
  const root = tmpRoot();
  try {
    const at = new Date('2026-09-06T12:00:00.000Z');
    recordView({ root, view: 'decisions', at });
    const raw = fs.readFileSync(logPath(root), 'utf8');
    const lines = raw.trim().split('\n');
    assert.equal(lines.length, 1);
    const row = JSON.parse(lines[0]);
    assert.deepEqual(row, { ts: '2026-09-06T12:00:00.000Z', view: 'decisions' });
  } finally { clean(root); }
});

test('recordView creates .great_cto/ if it does not exist yet', () => {
  const root = tmpRoot(); // fresh dir, no .great_cto subdir at all
  try {
    assert.equal(fs.existsSync(path.join(root, '.great_cto')), false);
    recordView({ root, view: 'fleet', at: new Date('2026-09-06T00:00:00.000Z') });
    assert.equal(fs.existsSync(logPath(root)), true);
  } finally { clean(root); }
});

test('recordView is append-only across multiple calls, never truncates', () => {
  const root = tmpRoot();
  try {
    recordView({ root, view: 'ledger', at: new Date('2026-09-01T00:00:00.000Z') });
    recordView({ root, view: 'ledger', at: new Date('2026-09-02T00:00:00.000Z') });
    recordView({ root, view: 'harness', at: new Date('2026-09-03T00:00:00.000Z') });
    const lines = fs.readFileSync(logPath(root), 'utf8').trim().split('\n');
    assert.equal(lines.length, 3);
  } finally { clean(root); }
});

test('recordView rejects an unknown view name and writes nothing at all', () => {
  const root = tmpRoot();
  try {
    assert.throws(() => recordView({ root, view: 'kanbans', at: new Date() }), /unknown view/i);
    // Not "wrote an error marker" — no file, no directory. Rejected before any fs write.
    assert.equal(fs.existsSync(logPath(root)), false);
  } finally { clean(root); }
});

test('summarizeViews reports {state:"absent"} when the file has never been written — not zeros', () => {
  const root = tmpRoot();
  try {
    const summary = summarizeViews({ root, since: null });
    assert.deepEqual(summary, { state: 'absent' });
  } finally { clean(root); }
});

test('summarizeViews reports {state:"ok"} with real zeros once the file exists but a view has no opens', () => {
  const root = tmpRoot();
  try {
    recordView({ root, view: 'settings', at: new Date('2026-09-06T00:00:00.000Z') });
    const summary = summarizeViews({ root, since: null });
    assert.equal(summary.state, 'ok');
    assert.deepEqual(summary.views.decisions, { opens: 0, days_with_opens: 0, first: null, last: null });
  } finally { clean(root); }
});

test('summarizeViews aggregates opens, days_with_opens, first and last per view', () => {
  const root = tmpRoot();
  try {
    recordView({ root, view: 'decisions', at: new Date('2026-09-01T09:00:00.000Z') });
    recordView({ root, view: 'decisions', at: new Date('2026-09-01T15:00:00.000Z') }); // same day
    recordView({ root, view: 'decisions', at: new Date('2026-09-03T09:00:00.000Z') }); // different day
    recordView({ root, view: 'fleet', at: new Date('2026-09-02T00:00:00.000Z') });
    const summary = summarizeViews({ root, since: null });
    assert.equal(summary.state, 'ok');
    assert.deepEqual(summary.views.decisions, {
      opens: 3,
      days_with_opens: 2,
      first: '2026-09-01T09:00:00.000Z',
      last: '2026-09-03T09:00:00.000Z',
    });
    assert.equal(summary.views.fleet.opens, 1);
  } finally { clean(root); }
});

test('summarizeViews with `since` excludes opens before the window, without touching unreadable_lines', () => {
  const root = tmpRoot();
  try {
    recordView({ root, view: 'ledger', at: new Date('2026-08-01T00:00:00.000Z') }); // before window
    recordView({ root, view: 'ledger', at: new Date('2026-09-05T00:00:00.000Z') }); // inside window
    const summary = summarizeViews({ root, since: '2026-09-01T00:00:00.000Z' });
    assert.equal(summary.state, 'ok');
    assert.equal(summary.views.ledger.opens, 1);
    assert.equal(summary.views.ledger.first, '2026-09-05T00:00:00.000Z');
    assert.equal(summary.unreadable_lines, 0);
  } finally { clean(root); }
});

test('summarizeViews counts a line that fails to parse in unreadable_lines, and does not drop the good lines around it', () => {
  const root = tmpRoot();
  try {
    recordView({ root, view: 'harness', at: new Date('2026-09-01T00:00:00.000Z') });
    fs.appendFileSync(logPath(root), 'not json at all\n');
    recordView({ root, view: 'harness', at: new Date('2026-09-02T00:00:00.000Z') });
    const summary = summarizeViews({ root, since: null });
    assert.equal(summary.state, 'ok', 'a bad line degrades the count, not the file-level state — matches the /api/harnesses evidence-log idiom');
    assert.equal(summary.unreadable_lines, 1);
    assert.equal(summary.views.harness.opens, 2, 'the two good lines either side of the bad one are still counted');
  } finally { clean(root); }
});

test('summarizeViews reports {state:"unreadable", why} when the file exists but cannot be read at all', () => {
  const root = tmpRoot();
  try {
    // A directory where the log file should be: fs.readFileSync throws EISDIR,
    // not ENOENT — this is "present but unreadable", distinct from "absent".
    fs.mkdirSync(logPath(root), { recursive: true });
    const summary = summarizeViews({ root, since: null });
    assert.equal(summary.state, 'unreadable');
    assert.ok(typeof summary.why === 'string' && summary.why.length > 0);
  } finally { clean(root); }
});
