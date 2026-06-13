// tests/flow-connector-ops.test.mjs — a flow step must call the connector OP it intends, not
// silently fall back to the connector's first capability (which, for write-capable connectors,
// is the write op). Locks in the Phase-4 monitor fix and the `connector:op` tool syntax.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFlow } from '../scripts/lib/flow-runner.mjs';
import { CONNECTORS, toolConnectorId } from '../scripts/lib/connectors.mjs';

const FLOWS_DIR = join(fileURLToPath(new URL('..', import.meta.url)), 'flows');
const flows = readdirSync(FLOWS_DIR).filter((f) => f.endsWith('.flow.json'))
  .map((f) => ({ name: f, flow: JSON.parse(readFileSync(join(FLOWS_DIR, f), 'utf8')) }));

// Connectors whose FIRST capability is a write (so a bare reference would call the write op).
const WRITE_FIRST = new Set(Object.entries(CONNECTORS)
  .filter(([, c]) => /^(submit|file|send|stage|post|run|transmit)/.test(c.capabilities?.[0] || ''))
  .map(([id]) => id));

test('a monitor step never re-runs a write op — it uses an explicit read op', () => {
  for (const { name, flow } of flows) {
    for (const s of flow.steps || []) {
      if ((s.agent || '') !== 'monitor') continue;
      for (const t of s.tools || []) {
        const id = toolConnectorId(t);
        if (WRITE_FIRST.has(id)) {
          assert.ok(t.includes(':'), `${name}: monitor uses "${t}" — must specify a read op (else it re-runs the write "${CONNECTORS[id].capabilities[0]}")`);
        }
      }
    }
  }
});

test('rcm monitor reads the remittance (fetch-835), it does not re-submit', async () => {
  const flow = JSON.parse(readFileSync(join(FLOWS_DIR, 'rcm.flow.json'), 'utf8'));
  const trace = await runFlow(flow, { mode: 'stub', stopAtGate: false });
  const monitor = trace.steps.find((s) => s.agent === 'monitor');
  assert.ok(monitor, 'monitor step ran');
  const ch = (monitor.toolCalls || []).find((c) => c.connector === 'clearinghouse');
  assert.ok(ch, 'monitor touches the clearinghouse');
  assert.equal(ch.op, 'fetch-835', 'monitor fetches the 835 remittance, not submit-837');
});

test('the connector:op tool syntax resolves to the explicit op', async () => {
  const flow = {
    vertical: 'test', autopilot: 'T', owner: 'Owner', qualityScore: 90,
    steps: [{ does: 'read remittance', agent: 'monitor', reversible: true, tools: ['clearinghouse:fetch-835'] }],
  };
  const trace = await runFlow(flow, { mode: 'stub', stopAtGate: false });
  const c = trace.steps[0].toolCalls[0];
  assert.equal(c.connector, 'clearinghouse');
  assert.equal(c.op, 'fetch-835');
});
