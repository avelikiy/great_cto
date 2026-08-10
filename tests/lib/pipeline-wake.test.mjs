// Approving a gate is evidence the pipeline is waiting. Before this, it was the
// one fact the resume hook never read.
//
// `session-pipeline-resume` opens with a freshness shortcut — a pipeline whose
// newest verdict is over a day old is "history, not work waiting" — and returns
// before touching gate state. Approve `gate:arch` on a stage that ran three days
// ago and nothing happens, ever, which is precisely the case the hook was
// written for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordWake, readWake, clearWake, WAKE_TTL_MS } from '../../scripts/lib/pipeline-wake.mjs';

const proj = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-wake-'));
const clean = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };

test('an approval is recorded and reads back as pending', () => {
  const d = proj();
  try {
    const r = recordWake(d, { gate: 'gate:arch — payment service', id: 'proj-1a2b' });
    assert.equal(r.ok, true);
    const w = readWake(d);
    assert.equal(w.pending, true);
    assert.equal(w.wake.id, 'proj-1a2b');
    assert.match(w.wake.gate, /gate:arch/);
  } finally { clean(d); }
});

test('no approval is "none recorded", not an error', () => {
  const d = proj();
  try {
    const w = readWake(d);
    assert.equal(w.pending, false);
    assert.match(w.why, /no approval recorded/);
    assert.ok(!w.unreadable, 'absence is not the same as unreadable');
  } finally { clean(d); }
});

test('an unreadable record says so rather than reporting no approval', () => {
  // The distinction this repository keeps having to restore: a read that failed
  // must not look like a fact that is absent.
  const d = proj();
  try {
    fs.mkdirSync(path.join(d, '.great_cto'), { recursive: true });
    fs.writeFileSync(path.join(d, '.great_cto', '.pipeline-wake'), '{ this is not json');
    const w = readWake(d);
    assert.equal(w.pending, false);
    assert.equal(w.unreadable, true);
  } finally { clean(d); }
});

test('an approval nobody acted on stops announcing itself', () => {
  const d = proj();
  try {
    recordWake(d, { gate: 'gate:ship', id: 'x', at: Date.now() - WAKE_TTL_MS - 1000 });
    const w = readWake(d);
    assert.equal(w.pending, false);
    assert.equal(w.expired, true);
    assert.match(w.why, /days old/);
  } finally { clean(d); }
});

test('an approval from Friday still stands on Monday', () => {
  // The whole point: it must outlive the 24h freshness shortcut it exists to
  // override.
  const d = proj();
  try {
    recordWake(d, { gate: 'gate:arch', id: 'x', at: Date.now() - 3 * 24 * 3600_000 });
    assert.equal(readWake(d).pending, true);
  } finally { clean(d); }
});

test('a clock that ran backwards does not discard a human decision', () => {
  const d = proj();
  try {
    recordWake(d, { gate: 'gate:ship', id: 'x', at: Date.now() + 60_000 });
    const w = readWake(d);
    assert.equal(w.pending, true, 'arithmetic must not overrule an approval');
  } finally { clean(d); }
});

test('consuming an approval leaves nothing pending', () => {
  const d = proj();
  try {
    recordWake(d, { gate: 'gate:arch', id: 'x' });
    assert.equal(readWake(d).pending, true);
    clearWake(d);
    assert.equal(readWake(d).pending, false);
  } finally { clean(d); }
});

test('a board that cannot write the record still reports it, rather than claiming success', () => {
  const r = recordWake('/nonexistent/path/that/cannot/be/created\0bad', { gate: 'g', id: 'x' });
  assert.equal(r.ok, false);
  assert.ok(r.why, 'and it says why');
});
