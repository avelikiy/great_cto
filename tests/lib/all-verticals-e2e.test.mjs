// tests/lib/all-verticals-e2e.test.mjs — durable-runtime e2e across EVERY shipped vertical.
//
// For each flows/<v>.flow.json this drives the real Layer-D lifecycle through run-store:
//   startRun → (pauses at a human gate, nothing irreversible has run) → approve every gate →
//   completed (the irreversible write executed) → the audit hash-chain still verifies.
//
// It is the permanent regression guard for the v2.43.0 safety invariant ("the permission was the
// wound"): an irreversible step runs ONLY after a human signs its protecting gate. The list is read
// from the flows directory, so a newly-added vertical is covered automatically — no edit here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startRun, approve, verifyAudit } from '../../scripts/lib/run-store.mjs';

const FLOWS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'flows');
const VERTICALS = readdirSync(FLOWS_DIR)
  .filter((f) => f.endsWith('.flow.json'))
  .map((f) => f.replace('.flow.json', ''))
  .sort();

const isWrite = (s) => s.blastRadius === 'high' || s.blastRadius === 'medium';
const ranWrite = (run) => run.steps.filter(isWrite).flatMap((s) => s.toolCalls || []).filter((c) => c.ok);

function tmp() { const d = mkdtempSync(join(tmpdir(), 'ap-e2e-')); process.env.GREAT_CTO_RUNS_DIR = d; return d; }

// Sanity: the suite must actually cover the shipped roster (guards against a glob that finds nothing).
test('e2e: the flows directory holds the full vertical roster', () => {
  assert.ok(VERTICALS.length >= 25, `expected ≥25 verticals, found ${VERTICALS.length}`);
});

for (const v of VERTICALS) {
  test(`e2e ${v}: start → gate(s) → sign → irreversible write; safety invariant holds`, async () => {
    const d = tmp();
    try {
      // 1. Starts and PAUSES at a human gate — with a named signer.
      const run = await startRun(v, { mode: 'stub' });
      assert.equal(run.status, 'awaiting-approval', `${v}: should pause at a gate`);
      assert.ok(run.pausedAt && /^gate:/.test(run.pausedAt), `${v}: pausedAt should be a gate id`);
      assert.ok(run.signer, `${v}: a named human signer is required`);

      // 2. SAFETY: nothing irreversible has executed before the signature.
      assert.equal(ranWrite(run).length, 0, `${v}: an irreversible write ran BEFORE the gate was signed`);

      // 3. Sign every gate (multi-gate flows pause again at the next one) until the run completes.
      let cur = run, guard = 0;
      while (cur.status === 'awaiting-approval' && guard++ < 8) {
        cur = await approve(cur.id, `Signer ${v}`, '', 'approved', 'LIC-1');
      }
      assert.equal(cur.status, 'completed', `${v}: should complete after all gates are signed (got '${cur.status}')`);

      // 4. The post-gate irreversible write actually executed, ok.
      const writes = ranWrite(cur);
      assert.ok(writes.length > 0, `${v}: the post-gate write should have executed`);

      // 5. The tamper-evident audit chain still verifies end to end.
      assert.equal(verifyAudit(cur), true, `${v}: audit hash-chain must verify`);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
}
