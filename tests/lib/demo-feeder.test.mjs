// tests/lib/demo-feeder.test.mjs — the demo case feeder (opt-in console liveliness).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { feedOnce, DEMO_VERTICALS } from '../../scripts/lib/demo-feeder.mjs';
import { listRuns } from '../../scripts/lib/run-store.mjs';

function tmp() { const d = mkdtempSync(join(tmpdir(), 'demo-feed-')); process.env.GREAT_CTO_RUNS_DIR = d; return d; }

test('feedOnce injects a demo case that awaits a signature', async () => {
  const d = tmp();
  try {
    const run = await feedOnce({});
    assert.ok(run && run.id, 'a run is created');
    assert.equal(run.source, 'demo', 'tagged source:demo');
    assert.equal(run.status, 'awaiting-approval', 'paused at the human gate');
    assert.ok(DEMO_VERTICALS.includes(run.vertical), 'a demo vertical');
    const persisted = listRuns({}).find(r => r.id === run.id);
    assert.ok(persisted, 'persisted to the run store');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('feedOnce round-robins across multiple verticals', async () => {
  const d = tmp();
  try {
    const verticals = new Set();
    for (let i = 0; i < 6; i++) { const r = await feedOnce({}); if (r && r.vertical) verticals.add(r.vertical); }
    assert.ok(verticals.size >= 3, `covers several verticals (got ${verticals.size})`);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('feedOnce honours a restricted vertical list', async () => {
  const d = tmp();
  try {
    for (let i = 0; i < 4; i++) {
      const r = await feedOnce({ verticals: ['rcm'] });
      assert.equal(r.vertical, 'rcm');
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});
