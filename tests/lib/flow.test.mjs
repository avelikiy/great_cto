// tests/lib/flow.test.mjs — unit tests for the vertical flow + connector layer (autopilot pivot)
//
// Run: node --test tests/lib/flow.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateFlow, flowStats, flowSummary, renderFlow, renderConnectors } from '../../scripts/lib/flow.mjs';
import { getConnector, flowConnectors, unknownConnectors, stubCall, CONNECTORS } from '../../scripts/lib/connectors.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FLOWS_DIR = join(ROOT, 'flows');
const flowFiles = readdirSync(FLOWS_DIR).filter((f) => f.endsWith('.flow.json'));
const loadFlow = (f) => JSON.parse(readFileSync(join(FLOWS_DIR, f), 'utf8'));

const GOOD = {
  vertical: 'demo', autopilot: 'Demo autopilot', outcome: 'things done',
  steps: [
    { does: 'pull data', agent: 'intake', tools: ['ocr'] },
    { does: 'human signs', human: 'a person', gate: 'gate:demo' },
  ],
};

// ── shipped flow files all validate ──────────────────────────────────────────────

test('there are 25 vertical flow files', () => {
  assert.equal(flowFiles.length, 25);
});

for (const f of readdirSync(FLOWS_DIR).filter((x) => x.endsWith('.flow.json'))) {
  test(`flow ${f}: validates with no errors`, () => {
    const r = validateFlow(loadFlow(f));
    assert.deepEqual(r.errors, [], `errors in ${f}: ${r.errors.join('; ')}`);
    assert.equal(r.valid, true);
  });
  test(`flow ${f}: every connector is in the catalog`, () => {
    assert.deepEqual(unknownConnectors(loadFlow(f)), []);
  });
  test(`flow ${f}: has at least one human gate`, () => {
    const flow = loadFlow(f);
    assert.ok(flow.steps.some((s) => s.gate), `${f} has no human gate`);
  });
}

// ── validateFlow ──────────────────────────────────────────────────────────────────

test('validateFlow: good flow valid', () => {
  assert.equal(validateFlow(GOOD).valid, true);
});

test('validateFlow: missing required field fails', () => {
  assert.equal(validateFlow({ vertical: 'x', steps: [] }).valid, false);
});

test('validateFlow: step without agent or human fails', () => {
  const r = validateFlow({ ...GOOD, steps: [{ does: 'orphan' }] });
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /agent.*or.*human/);
});

test('validateFlow: unknown connector fails', () => {
  const r = validateFlow({ ...GOOD, steps: [{ does: 'x', agent: 'a', tools: ['no-such-connector'] }] });
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /unknown connector/);
});

test('validateFlow: no human gate is a warning, not an error', () => {
  const r = validateFlow({ ...GOOD, steps: [{ does: 'x', agent: 'a' }] });
  assert.equal(r.valid, true);
  assert.match(r.warnings.join(' '), /no human gate/);
});

// ── stats / summary / render ──────────────────────────────────────────────────────

test('flowStats: counts autonomous vs human steps', () => {
  const s = flowStats(GOOD);
  assert.equal(s.steps, 2);
  assert.equal(s.autonomous, 1);
  assert.equal(s.human, 1);
});

test('flowSummary: one-liner mentions counts', () => {
  assert.match(flowSummary(GOOD), /1 automated step.*1 human checkpoint/);
});

test('renderFlow: shows steps, human gate, and the trust-layer line', () => {
  const s = renderFlow(loadFlow('rcm.flow.json'));
  assert.match(s, /Medical-coding autopilot/);
  assert.match(s, /HUMAN GATE → gate:coding-signoff/);
  assert.match(s, /Under the hood:/);
  assert.match(s, /Anterior/); // startups
});

test('renderFlow: resolves connector ids to labels', () => {
  const s = renderFlow(loadFlow('rcm.flow.json'));
  assert.match(s, /EHR \(FHIR\)/); // ehr-fhir → label
});

// ── connectors ──────────────────────────────────────────────────────────────────

test('connectors: every catalog entry is stub or live-ready with capabilities', () => {
  for (const [id, spec] of Object.entries(CONNECTORS)) {
    assert.ok(['stub', 'live-ready'].includes(spec.status), `${id} status should be stub|live-ready`);
    assert.ok(spec.capabilities.length > 0, `${id} needs capabilities`);
  }
});

test('connectors: ehr-fhir is the first live-ready connector', () => {
  assert.equal(CONNECTORS['ehr-fhir'].status, 'live-ready');
});

test('flowConnectors: dedupes across steps', () => {
  const flow = { steps: [{ tools: ['ocr', 'ehr-fhir'] }, { tools: ['ocr'] }] };
  assert.deepEqual(flowConnectors(flow).map((c) => c.id), ['ocr', 'ehr-fhir']);
});

test('stubCall: known op returns ok stub data', () => {
  const r = stubCall('ehr-fhir', 'fetch-note', { id: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'stub');
  assert.equal(r.data._stub, true);
  assert.match(r.note, /STUB/);
});

test('stubCall: unknown connector / op fails cleanly', () => {
  assert.equal(stubCall('nope', 'x').ok, false);
  assert.equal(stubCall('ehr-fhir', 'no-such-op').ok, false);
});

test('renderConnectors: lists stub status + real provider', () => {
  const s = renderConnectors(loadFlow('rcm.flow.json'));
  assert.match(s, /stub/);
  assert.match(s, /Change Healthcare/);
});
