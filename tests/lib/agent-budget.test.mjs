// A limit that fires on a number nobody measured is worse than no limit.
//
// The board's cost model already draws the line this module depends on:
// `agents_cost[].cost_source` is `'estimate'` unless verdicts carry real token
// spend, and `real_llm_usd` is DELETED rather than set to zero when there is
// none. An enforcement built on `llm_usd` would stop work on time multiplied by
// a rate constant, and tell the operator their agent had overspent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentBudgets, judgeAgentBudget, budgetAllowsDispatch, upsertAgentBudget, removeAgentBudget } from '../../scripts/lib/agent-budget.mjs';

const BUDGETS = new Map([['senior-dev', 50]]);
const judge = (spend, agent = 'senior-dev') => judgeAgentBudget({ agent, budgets: BUDGETS, spend });

// ── Reading the declaration ─────────────────────────────────────────────────

test('the block is read, and the flat keys around it are not', () => {
  const { budgets } = parseAgentBudgets(
    'phase: implementation\nagent-budgets:\n  senior-dev: $50\n  architect: 20\nstack: node\n');
  assert.deepEqual([...budgets], [['senior-dev', 50], ['architect', 20]]);
});

test('a dedent ends the block', () => {
  const { budgets } = parseAgentBudgets('agent-budgets:\n  a: $1\nphase: x\n  b: $2\n');
  assert.deepEqual([...budgets.keys()], ['a'], 'b is under `phase`, not under the block');
});

test('a malformed line is returned, never dropped', () => {
  // A budget the operator wrote and the parser silently ignored is a limit they
  // believe they have. That is the defect this repository is built around.
  const { budgets, malformed } = parseAgentBudgets('agent-budgets:\n  qa: soon\n  ok: $3\n');
  assert.deepEqual([...budgets], [['ok', 3]]);
  assert.equal(malformed.length, 1);
  assert.match(malformed[0].why, /not a dollar amount/);
});

test('no block at all is empty, not an error', () => {
  const { budgets, malformed } = parseAgentBudgets('phase: x\n');
  assert.equal(budgets.size, 0);
  assert.deepEqual(malformed, []);
});

// ── The four states ─────────────────────────────────────────────────────────

test('an agent with no declared budget is no-limit, not zero', () => {
  const v = judge({ llm_usd: 999, real_llm_usd: 999 }, 'architect');
  assert.equal(v.state, 'no-limit');
  assert.equal(budgetAllowsDispatch(v), true, 'an undeclared budget cannot be exceeded');
});

test('measured spend under the cap is within', () => {
  assert.equal(judge({ llm_usd: 9, real_llm_usd: 3 }).state, 'within');
});

test('measured spend over the cap is exceeded, and only this state refuses', () => {
  const v = judge({ llm_usd: 9, real_llm_usd: 51 });
  assert.equal(v.state, 'exceeded');
  assert.equal(budgetAllowsDispatch(v), false);
  assert.match(v.why, /measured from verdicts/, 'the refusal says what it is based on');
});

test('exactly at the cap is within — the limit is a ceiling, not a trigger', () => {
  assert.equal(judge({ llm_usd: 9, real_llm_usd: 50 }).state, 'within');
});

test('a measured zero is within, not unmeasured', () => {
  // `real_llm_usd` is deleted when zero upstream, so a 0 that DOES arrive is a
  // real measurement. `> 0` here would read it as "never measured" — the exact
  // confusion the four states exist to prevent.
  const v = judge({ llm_usd: 9, real_llm_usd: 0 });
  assert.equal(v.state, 'within');
  assert.equal(v.measuredUsd, 0);
});

// ── The rule that keeps it honest ───────────────────────────────────────────

test('an estimate never refuses, however large', () => {
  const v = judge({ llm_usd: 5000, cost_source: 'estimate' });
  assert.equal(v.state, 'unmeasured');
  assert.equal(budgetAllowsDispatch(v), true,
    'halting a pipeline on time multiplied by a rate constant is the defect, not the feature');
});

test('unmeasured says so, and labels the number it does show', () => {
  const v = judge({ llm_usd: 5000, cost_source: 'estimate' });
  assert.equal(v.measuredUsd, null);
  assert.equal(v.estimateUsd, 5000);
  assert.match(v.why, /no verdict cost data/);
  assert.match(v.why, /time-based estimate, not spend/);
});

test('no spend data at all is unmeasured, not within', () => {
  // Absence of a cost record is not evidence of no cost.
  const v = judge(undefined);
  assert.equal(v.state, 'unmeasured');
  assert.equal(budgetAllowsDispatch(v), true);
});

test('every state is one of the four, for any input shape', () => {
  const shapes = [undefined, {}, { llm_usd: 0 }, { real_llm_usd: 0 }, { llm_usd: 1, real_llm_usd: 999 }];
  for (const s of shapes) {
    const v = judge(s);
    assert.ok(['no-limit', 'within', 'exceeded', 'unmeasured'].includes(v.state), JSON.stringify(s));
    assert.ok(v.why && v.why.length > 10, `${v.state} must explain itself`);
  }
});

// ── The zero that was never measured ────────────────────────────────────────

test('a cost that was never measured must not reach this module as 0', () => {
  // `log-verdict.sh <agent> <verdict> auto` is what all 35 agents write. The
  // meter needs LLM_INPUT_TOKENS / LLM_OUTPUT_TOKENS from the API response;
  // agents do not export them, so it returned 0 and `|| echo 0` turned even its
  // refusal into a zero. Every verdict in every project recorded a MEASURED
  // zero — the portfolio reported $0.00 spend for twelve projects, and this
  // module would have answered `within` at "$0.00 of $25, measured from
  // verdicts" forever. A limit that can never fire, wearing the word measured.
  //
  // The meter exits 2 with no output now and the field is omitted. This asserts
  // the shape that arrives here, so the two cannot drift apart again.
  const budgets = new Map([['senior-dev', 25]]);
  const unmeasured = judgeAgentBudget({ agent: 'senior-dev', budgets, spend: { llm_usd: 3 } });
  assert.equal(unmeasured.state, 'unmeasured', 'no cost field means no measurement');

  const measuredZero = judgeAgentBudget({ agent: 'senior-dev', budgets, spend: { llm_usd: 3, real_llm_usd: 0 } });
  assert.equal(measuredZero.state, 'within',
    'a cost field that IS present and zero is a real measurement and must read differently');
});

// ── One parser, not two ─────────────────────────────────────────────────────

test('the deprecated singular key still reads, and says it is deprecated', () => {
  // The board had its own inline regex for `agent-budget:` in routes.mjs,
  // meaning "$X per run" and displayed only; this module then arrived with
  // `agent-budgets:`, meaning a total and enforced. Two definitions of one
  // concept differing by a letter, neither aware of the other — the drift the
  // dispatcher's own comment warns about, built while writing the module that
  // prevents it elsewhere.
  //
  // No project, template or doc used the singular form, so consolidating cost
  // nothing. It still reads, and reports itself, because a config someone wrote
  // must not stop working in silence.
  const old = parseAgentBudgets('agent-budget:\n  senior-dev: 50\n');
  assert.deepEqual([...old.budgets], [['senior-dev', 50]]);
  assert.equal(old.deprecatedKey, 'agent-budget');

  const now = parseAgentBudgets('agent-budgets:\n  senior-dev: $50\n');
  assert.deepEqual([...now.budgets], [['senior-dev', 50]]);
  assert.equal(now.deprecatedKey, null, 'the current spelling is not flagged');
});

test('the plural key wins when a file somehow carries both', () => {
  const r = parseAgentBudgets('agent-budgets:\n  a: $1\nagent-budget:\n  b: 2\n');
  assert.deepEqual([...r.budgets.keys()], ['a']);
  assert.equal(r.deprecatedKey, null);
});

// ── Editing PROJECT.md ──────────────────────────────────────────────────────
//
// The board writes these, which means writing to a file the operator owns and
// git tracks. Everything not the budget block must survive byte for byte.

const FILE = 'project: demo\nphase: implementation\nagent-budgets:\n  senior-dev: $25\nstack: node\n';

test('setting a cap leaves the rest of the file untouched', () => {
  const { text } = upsertAgentBudget(FILE, 'architect', 10);
  assert.match(text, /^project: demo$/m);
  assert.match(text, /^phase: implementation$/m);
  assert.match(text, /^stack: node$/m, 'the key after the block is still there and still last');
  assert.deepEqual([...parseAgentBudgets(text).budgets], [['senior-dev', 25], ['architect', 10]]);
});

test('setting an existing cap replaces it and reports what it was', () => {
  const r = upsertAgentBudget(FILE, 'senior-dev', 40);
  assert.equal(r.previousUsd, 25, 'the caller can say what changed');
  assert.equal(parseAgentBudgets(r.text).budgets.get('senior-dev'), 40);
  assert.equal((r.text.match(/senior-dev/g) || []).length, 1, 'replaced, not appended twice');
});

test('a file with no block gets one, and says it created it', () => {
  const r = upsertAgentBudget('phase: x\n', 'pm', 5);
  assert.equal(r.created, true);
  assert.equal(parseAgentBudgets(r.text).budgets.get('pm'), 5);
});

test('the key already in the file wins — a deprecated block is not silently renamed', () => {
  // Rewriting somebody's config to a different spelling while they asked for an
  // unrelated change is the kind of helpfulness that loses trust.
  const old = 'agent-budget:\n  senior-dev: 25\n';
  const r = upsertAgentBudget(old, 'architect', 5);
  assert.match(r.text, /^agent-budget:$/m);
  assert.ok(!/^agent-budgets:$/m.test(r.text));
  assert.deepEqual([...parseAgentBudgets(r.text).budgets], [['senior-dev', 25], ['architect', 5]]);
});

test('a cap of zero or nonsense is refused', () => {
  // Zero would hold every dispatch of that agent forever, and an accident must
  // not be able to do that.
  for (const bad of [0, -5, 'soon', null, undefined, NaN]) {
    assert.throws(() => upsertAgentBudget(FILE, 'pm', bad), /positive number/, String(bad));
  }
});

test('an agent slug that is not one is refused', () => {
  for (const bad of ['../etc/passwd', 'a b', '', 'Agent!']) {
    assert.throws(() => upsertAgentBudget(FILE, bad, 5), /agent slug/, bad);
  }
});

test('removing a cap reports what it was, and removing a missing one says so', () => {
  const r = removeAgentBudget(FILE, 'senior-dev');
  assert.equal(r.removed, true);
  assert.equal(r.previousUsd, 25);

  const none = removeAgentBudget(FILE, 'never-had-one');
  assert.equal(none.removed, false, 'the caller must tell "now none" from "never any"');
  assert.equal(none.text, FILE, 'and the file is untouched');
});

test('removing the last cap removes the empty header too', () => {
  // A bare `agent-budgets:` reads as a declaration that produced no limits,
  // which is a different and more confusing thing than having none.
  const r = removeAgentBudget(FILE, 'senior-dev');
  assert.ok(!/agent-budgets:/.test(r.text));
  assert.match(r.text, /^stack: node$/m, 'and the rest of the file survives');
});

test('a blank line ends the block — a new cap is not appended below the gap', () => {
  // A blank is not a dedent: it starts with no non-space character. Scanning
  // only for `^\S` walked past the gap at the end of the file and inserted the
  // cap below it, leaving a block split by an empty line. The parser tolerates
  // that; a person reading their own PROJECT.md should not have to.
  const withGap = 'agent-budgets:\n  a: $1\n\nphase: x\n';
  const { text } = upsertAgentBudget(withGap, 'b', 2);
  assert.equal(text, 'agent-budgets:\n  a: $1\n  b: $2\n\nphase: x\n');
});

test('a trailing block at end of file gets the cap inside it', () => {
  const atEnd = 'phase: x\nagent-budgets:\n  a: $1\n';
  const { text } = upsertAgentBudget(atEnd, 'b', 2);
  assert.equal(text, 'phase: x\nagent-budgets:\n  a: $1\n  b: $2\n');
});
