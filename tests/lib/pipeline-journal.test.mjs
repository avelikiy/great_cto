// What the dispatcher decided, including when it decided nothing.
//
// The dispatcher printed text into a session and forgot. Which edge fired, which
// stage held, and above all why a run produced no output at all existed for the
// length of one turn and then did not exist. That is why every pipeline defect
// this week was found by a person asking "why is nothing happening" rather than
// by anything in this repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordRun, readRuns, OUTCOMES } from '../../scripts/lib/pipeline-journal.mjs';
import { readEvidence } from '../../scripts/lib/evidence-ledger.mjs';
import { recordVerdictEvidence } from '../../scripts/lib/evidence-adapters.mjs';

const sandbox = () => { const d = mkdtempSync(join(tmpdir(), 'pj-')); mkdirSync(join(d, '.great_cto')); return d; };
const clean = (d) => rmSync(d, { recursive: true, force: true });

test('a silent run is recorded with its reason', () => {
  // The most valuable record here, not the least. "Nothing should happen" and
  // "nothing could happen" produce identical output — no output — and only a
  // reason written at the moment separates them afterwards.
  const d = sandbox();
  try {
    recordRun(d, { agent: 'pm', verdict: 'WAT', outcome: 'unknown-verdict', why: 'no branch handles it' });
    const r = readRuns(d);
    assert.equal(r.state, 'some');
    assert.equal(r.rows[0].outcome, 'unknown-verdict');
    assert.match(r.rows[0].why, /no branch/);
  } finally { clean(d); }
});

test('the journal appends — a run never overwrites the one before it', () => {
  const d = sandbox();
  try {
    for (const o of ['dispatch', 'hold', 'stop']) recordRun(d, { agent: 'pm', outcome: o });
    assert.deepEqual(readRuns(d).rows.map((x) => x.outcome), ['dispatch', 'hold', 'stop']);
  } finally { clean(d); }
});

test('dispatcher decisions are dual-written to the canonical evidence ledger', () => {
  const d = sandbox();
  try {
    const r = recordRun(d, {
      at: '2026-09-13T10:00:00.000Z',
      startedAt: '2026-09-13T09:59:58.000Z',
      progressed: true,
      agent: 'pm', verdict: 'DONE', outcome: 'dispatch', next: ['senior-dev'], mapSource: 'plugin',
    });
    assert.equal(r.ok, true);
    assert.equal(r.evidence.state, 'appended');
    const evidence = readEvidence(d);
    assert.equal(evidence.state, 'some');
    assert.equal(evidence.rows[0].event_type, 'pipeline.dispatcher.completed');
    assert.equal(evidence.rows[0].stage_id, 'pm');
    assert.equal(evidence.rows[0].state, 'completed');
    assert.deepEqual(evidence.rows[0].details.next, ['senior-dev']);
    assert.equal(evidence.rows[0].details.join_key_state, 'unavailable');
    assert.equal(readRuns(d).rows[0].run_id, null);
  } finally { clean(d); }
});

test('a Claude verdict and the dispatcher decision consuming it share one run id', () => {
  const d = sandbox();
  try {
    const verdict = {
      v: 1, ts: '2026-09-13T10:00:00.000Z', agent: 'architect', verdict: 'APPROVED',
      project: 'join-test', cost_usd: 0.25, meta: { feature: 'ledger' },
    };
    const written = recordVerdictEvidence(d, verdict);
    const dispatched = recordRun(d, {
      at: '2026-09-13T10:00:01.000Z', agent: 'architect', verdict: 'APPROVED',
      verdictRecord: verdict, outcome: 'dispatch', next: ['pm'], mapSource: 'plugin',
    });
    assert.equal(written.state, 'appended');
    assert.equal(dispatched.evidence.state, 'appended');
    const [verdictEvent, dispatcherEvent] = readEvidence(d).rows;
    assert.equal(verdictEvent.run_id, dispatcherEvent.run_id);
    assert.equal(verdictEvent.details.join_key_state, 'derived');
    assert.equal(dispatcherEvent.details.join_key_state, 'derived');
    assert.equal(readRuns(d).rows[0].run_id, verdictEvent.run_id, 'legacy journal carries the additive join key');
  } finally { clean(d); }
});

test('a malformed declared run id stays invalid while retaining deterministic correlation', () => {
  const d = sandbox();
  try {
    const verdict = {
      v: 1, ts: '2026-09-13T10:00:00.000Z', agent: 'architect', verdict: 'APPROVED',
      project: 'join-test', meta: {},
    };
    recordVerdictEvidence(d, verdict, { runId: 'not a valid run id' });
    recordRun(d, {
      at: '2026-09-13T10:00:01.000Z', agent: 'architect', verdict: 'APPROVED',
      verdictRecord: verdict, runId: 'not a valid run id', outcome: 'dispatch', next: ['pm'],
    });
    const [verdictEvent, dispatcherEvent] = readEvidence(d).rows;
    assert.equal(verdictEvent.run_id, dispatcherEvent.run_id);
    assert.equal(verdictEvent.details.join_key_state, 'invalid');
    assert.equal(dispatcherEvent.details.join_key_state, 'invalid');
  } finally { clean(d); }
});

test('replaying the identical dispatcher fact does not duplicate canonical evidence', () => {
  const d = sandbox();
  try {
    const entry = { at: '2026-09-13T10:00:00.000Z', agent: 'pm', outcome: 'dispatch', next: ['senior-dev'] };
    assert.equal(recordRun(d, entry).evidence.state, 'appended');
    assert.equal(recordRun(d, entry).evidence.state, 'duplicate');
    assert.equal(readRuns(d).rows.length, 2, 'legacy behavior remains append-only during migration');
    assert.equal(readEvidence(d).rows.length, 1, 'canonical identity suppresses the replay');
  } finally { clean(d); }
});

test('an unreadable evidence ledger is reported but cannot erase the legacy dispatcher fact', () => {
  const d = sandbox();
  try {
    writeFileSync(join(d, '.great_cto', 'evidence-ledger.jsonl'), 'torn\n');
    const r = recordRun(d, { agent: 'pm', outcome: 'dispatch' });
    assert.equal(r.ok, true);
    assert.equal(r.evidence.state, 'unreadable');
    assert.equal(readRuns(d).rows.length, 1);
  } finally { clean(d); }
});

test('a journal that cannot be written never fails the run', () => {
  // A journal whose failure stops the pipeline is very much worse than none.
  // `recorded` is not the same as `happened`: a dispatch that occurred is a fact
  // whether or not we managed to say so.
  const d = sandbox();
  try {
    chmodSync(join(d, '.great_cto'), 0o500);
    const r = recordRun(d, { agent: 'pm', outcome: 'dispatch' });
    assert.equal(r.ok, false);
    assert.match(r.why, /.+/, 'and it says what went wrong rather than swallowing it');
  } finally { chmodSync(join(d, '.great_cto'), 0o700); clean(d); }
});

test('three states: no runs, some runs, unreadable', () => {
  // A journal that exists and cannot be read must never render the same as one
  // that is empty — the whole reason it exists is that a run nobody can see is
  // indistinguishable from a run that never happened.
  const d = sandbox();
  try {
    assert.equal(readRuns(d).state, 'none');
    recordRun(d, { agent: 'pm', outcome: 'dispatch' });
    assert.equal(readRuns(d).state, 'some');
    writeFileSync(join(d, '.great_cto', 'pipeline-runs.jsonl'), 'not json at all\nnor this\n');
    assert.equal(readRuns(d).state, 'unreadable');
  } finally { clean(d); }
});

test('one bad line among good ones is skipped and counted, not fatal', () => {
  const d = sandbox();
  try {
    recordRun(d, { agent: 'pm', outcome: 'dispatch' });
    writeFileSync(join(d, '.great_cto', 'pipeline-runs.jsonl'),
      '{"v":1,"outcome":"dispatch"}\ntorn write\n{"v":1,"outcome":"hold"}\n');
    const r = readRuns(d);
    assert.equal(r.state, 'some');
    assert.equal(r.rows.length, 2);
    assert.match(r.why, /1 unparseable line/);
  } finally { clean(d); }
});

test('every outcome the dispatcher can emit is a declared one', () => {
  // Otherwise a new branch invents a label nothing aggregates, which is the
  // declared-but-not-consumed shape arriving through the back door.
  const src = readFileSync(new URL('../../scripts/hooks/pipeline-dispatcher.mjs', import.meta.url), 'utf8');
  const used = new Set([
    ...[...src.matchAll(/outcome: '([a-z-]+)'/g)].map((m) => m[1]),
    ...[...src.matchAll(/return '([a-z-]+)';/g)].map((m) => m[1]),
  ]);
  const known = new Set(OUTCOMES);
  const unknown = [...used].filter((u) => !known.has(u) && /^(dispatch|hold|stop|blocked-budget|no-verdict|no-rule|unknown-verdict|no-map|disabled)$/.test(u) === false);
  // Only assert over the ones that look like outcomes; other short returns exist.
  const outcomeish = [...used].filter((u) => /^(dispatch|hold|stop|blocked|no|unknown)/.test(u));
  for (const o of outcomeish) assert.ok(known.has(o), `dispatcher emits "${o}" which OUTCOMES does not declare`);
  assert.ok(known.has('launched'), 'the async-launch journal outcome is part of the public vocabulary');
});
