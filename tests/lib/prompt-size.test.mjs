// Inlining `agents/_shared/*.md` into the actor prompt grew devops from 41,993
// to 58,415 characters — 39% on the single input that turned out to be ~97% of a
// run's cost. Nobody noticed at commit time. It surfaced two runs and roughly
// twenty dollars later, while working out where the money went.
//
// The cost was knowable before spending it: the prompt is a file, the price is
// published, the run shape is a flag. What these tests pin is that the number
// stays knowable — and that it keeps saying it is an estimate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { estimateTokens, promptProfile, fleetProfile, runCost, formatFleet } from '../../scripts/lib/prompt-size.mjs';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-ps-'));
  fs.mkdirSync(path.join(root, '_shared'), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    const p = path.join(root, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return root;
}
const clean = (r) => { try { fs.rmSync(r, { recursive: true, force: true }); } catch {} };

// ── counting ───────────────────────────────────────────────────────────────

test('an empty or missing body is zero tokens, not NaN', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens(undefined), 0);
});

test('dense markdown counts denser than prose of the same length', () => {
  // A table row and a code fence tokenize worse than English: punctuation and
  // long identifiers rarely merge. Averaging them into one ratio is wrong for
  // both, and agent files are full of both.
  const n = 400;
  const prose = 'the deploy proceeds when the gate is approved and not before. '.repeat(8).slice(0, n);
  const table = '| a | b |\n'.repeat(40).slice(0, n);
  assert.ok(estimateTokens(table) > estimateTokens(prose),
    'a prompt made of tables must not be reported as cheap as a prompt made of sentences');
});

test('the estimate lands in the range a real tokenizer would', () => {
  // Not a claim of exactness — a claim that it is the right order. English prose
  // runs near four characters per token.
  const text = 'the agent refuses to deploy without an approved gate. '.repeat(50);
  const t = estimateTokens(text);
  assert.ok(t > text.length / 5 && t < text.length / 3, `${t} tokens for ${text.length} chars is not plausible`);
});

// ── the effective prompt, which is the point ───────────────────────────────

test('the profile counts the shared contracts, not just the file', () => {
  // Reporting the file alone is exactly the measurement that missed the 39%
  // growth: the file did not change size, the prompt did.
  const root = fixture({
    'x.md': 'Body of x. See agents/_shared/verdict-format.md for the format.',
    '_shared/verdict-format.md': 'VERDICT CONTRACT. '.repeat(200),
  });
  try {
    const p = promptProfile('x', { root });
    assert.ok(p.sharedTokens > 500, 'the inlined contract has to appear in the count');
    assert.equal(p.tokens, p.ownTokens + p.sharedTokens);
    assert.deepEqual(p.shared, ['verdict-format.md']);
  } finally { clean(root); }
});

test('an agent with no contracts reports zero shared, not null', () => {
  const root = fixture({ 'plain.md': 'Just a body.' });
  try {
    const p = promptProfile('plain', { root });
    assert.equal(p.sharedTokens, 0);
    assert.deepEqual(p.shared, []);
  } finally { clean(root); }
});

test('frontmatter is not billed — it never reaches the model', () => {
  const root = fixture({
    'f.md': '---\nname: f\ndescription: ' + 'x'.repeat(2000) + '\n---\nShort body.',
  });
  try {
    assert.ok(promptProfile('f', { root }).tokens < 100,
      'counting frontmatter would inflate every agent by its description');
  } finally { clean(root); }
});

test('a missing agent is null rather than a throw mid-report', () => {
  assert.equal(promptProfile('does-not-exist'), null);
});

test('the fleet is ordered by what it costs, largest first', () => {
  const root = fixture({ 'small.md': 'tiny', 'big.md': 'word '.repeat(3000) });
  try {
    assert.deepEqual(fleetProfile({ root }).map((r) => r.agent), ['big', 'small']);
  } finally { clean(root); }
});

// ── cost ───────────────────────────────────────────────────────────────────

test('the system prompt is billed per send, not once', () => {
  // The prompt is re-sent on every turn of every case. Treating a 16k-token
  // prompt as a 16k-token expense is the arithmetic that made a $10 run look
  // like a rounding error before it was run.
  const one = runCost({ tokens: 10_000, cases: 1, turns: 1, outputTokens: 0 });
  const many = runCost({ tokens: 10_000, cases: 40, turns: 2, outputTokens: 0 });
  assert.equal(many.sends, 80);
  assert.ok(many.uncached > one.uncached * 70, 'the multiplier is cases x turns and must show up in the number');
});

test('caching is priced with the same multipliers cost-meter applies', () => {
  // One write at 1.25x, the rest reads at 0.1x. If this drifted from cost-meter
  // the estimate would promise a saving the bill does not deliver.
  const c = runCost({ tokens: 16_000, cases: 40, turns: 2, outputTokens: 600 });
  assert.ok(c.cached < c.uncached);
  assert.ok(c.savedPct > 0.5 && c.savedPct < 0.95,
    `an 80-send run should save most of the input cost, got ${(c.savedPct * 100).toFixed(0)}%`);
});

test('a one-send run saves nothing, because the write costs more than the read', () => {
  const c = runCost({ tokens: 16_000, cases: 1, turns: 1, outputTokens: 0 });
  assert.ok(c.cached > c.uncached, 'caching a prefix used once is a surcharge, and the report must not hide that');
});

test('an unknown model returns null rather than a confident zero', () => {
  assert.equal(runCost({ tokens: 1000, model: '' }), null);
});

// ── the report ─────────────────────────────────────────────────────────────

test('the report says the number is an estimate', () => {
  // The whole failure this file exists to prevent is a number more precise than
  // the thing behind it. A report that drops the caveat invites billing from it.
  const out = formatFleet([{ agent: 'a', tokens: 100, sharedTokens: 0, shared: [] }]);
  assert.match(out, /[Ee]stimate/);
});

test('over-budget agents are named in the report, not only counted', () => {
  const out = formatFleet(
    [{ agent: 'huge', tokens: 20_000, sharedTokens: 0, shared: [] },
     { agent: 'fine', tokens: 500, sharedTokens: 0, shared: [] }],
    { maxTokens: 10_000 },
  );
  assert.match(out, /huge.*over budget/);
  assert.ok(!/fine.*over budget/.test(out));
});

// ── against the real fleet ─────────────────────────────────────────────────

test('every agent in the repo profiles without throwing', () => {
  const rows = fleetProfile();
  assert.ok(rows.length > 50, 'the fleet is 69 agents; a much smaller number means the walk broke');
  for (const r of rows) {
    assert.ok(Number.isFinite(r.tokens) && r.tokens > 0, `${r.agent}: ${r.tokens}`);
    assert.ok(r.tokens >= r.ownTokens, `${r.agent}: shared expansion cannot shrink a prompt`);
  }
});
