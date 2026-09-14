// `need` — who a halting verdict is for.
//
// qa-engineer and security-officer already wrote, in prose, whether a blocking
// finding was "senior-dev fix <finding>" or "CTO waive risk". No verdict line
// carried it: across the registered projects the reviewers' meta held feature,
// findings, coverage and report, and never need. So the dispatcher halted on
// every BLOCKED, and the board could not tell a pass that went back from a
// question that waited for a human.
//
// Three states. `implementer` and `decision` are declared; anything else —
// absent, empty, misspelt — is `undeclared`, and undeclared never routes.
//
// Where the refusal lives matters. An unknown value is refused when the record is
// WRITTEN, where the agent sees the error and can fix its call. On READ the same
// value is kept and read as undeclared: rejecting the line would throw away the
// verdict itself, which is worse than not knowing who it was for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NEED_VALUES, needOf, makeVerdict, formatVerdict, parseVerdictLine,
} from '../../scripts/lib/verdict-record.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const base = { ts: '2026-09-14T10:00:00Z', agent: 'qa-engineer', verdict: 'FAIL' };

// ── the library ────────────────────────────────────────────────────────────

test('the two declared values, and nothing else', () => {
  assert.deepEqual([...NEED_VALUES], ['implementer', 'decision']);
  assert.ok(Object.isFrozen(NEED_VALUES), 'a mutable list is a list someone appends a third value to');
});

test('needOf reads the declared value', () => {
  assert.equal(needOf({ ...base, meta: { need: 'implementer' } }), 'implementer');
  assert.equal(needOf({ ...base, meta: { need: 'decision' } }), 'decision');
});

test('needOf reads silence, an empty value and a misspelling as undeclared', () => {
  for (const rec of [base, { ...base, meta: {} }, { ...base, meta: { need: '' } }, { ...base, meta: { need: 'Implementer ' } }, { ...base, meta: { need: 'maybe' } }, null, undefined]) {
    assert.equal(needOf(rec), 'undeclared', `for ${JSON.stringify(rec)}`);
  }
});

test('an unknown need is refused when the verdict is written', () => {
  assert.throws(
    () => makeVerdict({ ...base, meta: { need: 'maybe' } }),
    /need must be one of implementer, decision/,
  );
  assert.doesNotThrow(() => makeVerdict({ ...base, meta: { need: 'decision' } }));
  assert.doesNotThrow(() => makeVerdict(base), 'a verdict with no need is still a verdict');
});

test('an unknown need already on disk is read, not dropped — the verdict survives as undeclared', () => {
  const line = JSON.stringify({ v: 1, ...base, meta: { need: 'maybe', finding: 'F1' } });
  const r = parseVerdictLine(line);
  assert.equal(r.ok, true, 'rejecting the line would lose the FAIL itself');
  assert.equal(needOf(r.rec), 'undeclared');
});

test('need survives the write-and-read round trip', () => {
  const r = parseVerdictLine(formatVerdict(makeVerdict({ ...base, meta: { need: 'implementer', finding: 'F2' } })));
  assert.equal(needOf(r.rec), 'implementer');
  assert.equal(r.rec.meta.finding, 'F2');
});

// ── the agents that write halting verdicts ─────────────────────────────────

test('the canonical verdict format documents need and its three states', () => {
  const t = read('agents/_shared/verdict-format.md');
  assert.match(t, /`need`/);
  assert.match(t, /implementer/);
  assert.match(t, /decision/);
  assert.match(t, /undeclared/, 'the format must say what silence means');
});

// Every call to the helper for this agent, with a backslash-continued second line
// joined on: qa and security split the call over two lines, code-reviewer writes
// it on one.
function helperCalls(text, agent) {
  const lines = text.split('\n');
  const calls = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(`log-verdict.sh ${agent}`)) continue;
    let call = lines[i];
    while (/\\\s*$/.test(call) && i + 1 < lines.length) call = call.replace(/\\\s*$/, ' ') + lines[++i];
    calls.push(call);
  }
  return calls;
}

for (const [agent, token] of [['qa-engineer', 'FAIL'], ['security-officer', 'BLOCKED'], ['code-reviewer', 'BLOCKED']]) {
  test(`${agent} writes need= on its ${token} verdict`, () => {
    const t = read(`agents/${agent}.md`);
    const calls = helperCalls(t, agent);
    assert.ok(calls.some((c) => c.includes(token)), `${agent} no longer records ${token} through the helper — update this test`);
    assert.ok(calls.some((c) => c.includes(token) && /need=<implementer\|decision>/.test(c)),
      `${agent}'s ${token} call does not write need=<implementer|decision>`);
    assert.match(t, /agents\/_shared\/verdict-format\.md/, `${agent} must point at the format that defines need`);
  });
}
