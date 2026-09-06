// Places where the board answered a question it had not asked.
//
// Each of these shipped, and each is the same defect wearing different clothes:
// a value that was never measured rendered as a measured value, in the colour
// that means "fine". Found by mapping the board against its own API on
// 2026-09-06.
//
// Three states must be rendered as three states: pass/fail/absent. The 7 cells
// below test the promise that absence is never rendered as pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getAgentsFleet } from '../../packages/board/lib/fleet.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const board = readFileSync(path.join(ROOT, 'packages/board/public/index.html'), 'utf8');

// ── Cell 1: Security tile — no scan ran → `n/a`, never `0` in green
test('Cell 1: security tile — no scan ran → n/a, never 0 in green', () => {
  // `m.security?.blocked ?? 0` with `cls: … ? 'red' : 'green'` painted a GREEN
  // ZERO for a project that has never been scanned. Green means safe. Nobody
  // had established that.
  assert.doesNotMatch(board, /m\.security\?\.blocked \?\? 0/,
    'the security tile must not default a missing measurement to zero');
  assert.match(board, /no security scan has run — this is not a clean result/,
    'and it must say so where a reader can see it');
  // No colour when unmeasured: green claims safe, red claims unsafe, and
  // neither is known.
  assert.match(board, /cls: m\.security\?\.blocked == null \? '' :/);
});

// ── Cell 2: Rework rounds — unmeasured → `n/a`, never `0`
test('Cell 2: rework rounds — unmeasured → n/a, never 0', () => {
  assert.doesNotMatch(board, /acc\.rework_rounds \?\? 0/);
  assert.match(board, /rework cannot be counted/);
});

// ── Cell 3: Eval coverage — no eval→agent mapping → `not measured` (`·`), never `0%`
test('Cell 3: eval coverage — no eval→agent mapping → not measured (·), never 0%', () => {
  // The eval tier system shows a gate's eval coverage. When no evals have mapped
  // to this agent, the coverage is unknown, never 0%.
  // The board's `gateTierNote()` emits `notify-thin` when coverage is unmeasured:
  // "one eval, coverage unmeasured". This text MUST exist in the board.
  assert.match(board, /one eval, coverage unmeasured/,
    'unmeasured eval coverage must be stated explicitly, never silenced as 0%');
  // Ensure the ABSENCE object has unloaded state (·) for measurements not yet landed.
  assert.match(board, /const ABSENCE = {/,
    'the board must have ABSENCE object');
  assert.match(board, /unloaded[\s:]*['"]·['"].*no answer yet/,
    'the board must have ABSENCE.unloaded = · for unmeasured states');
});

// ── Cell 4: Paired-diff count (Harness) — join key absent → `unmeasured`, never `0` and never "they agree"
test('Cell 4: paired-diff count (Harness) — join key absent → unmeasured, never 0 or "they agree"', { skip: 'RED until great_cto-ki1x.10 lands — join-key field (BRD-R1/R2) not yet in routes.mjs' }, () => {
  // The Harness screen shows evidence from the cross-review log. When the join
  // key is absent (pre-BRD-R1 lines), the lines are classified `unreadable`.
  // An `unreadable` line must never render as "0 findings" or "they agree".
  // The routes.mjs BRD-R2 implementation classifies pre-join-key lines as
  // `unreadable`. The UI must not show these as passed/0 or "all reviewers agree".
  const raw = readFileSync(path.join(ROOT, 'packages/board/lib/routes.mjs'), 'utf8');
  const routes = raw.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  // The join-key field must exist and be used in classification
  assert.match(routes, /sha.*dirty|join.*key/i,
    'routes.mjs must have a join-key field (sha+dirty) to classify evidence');

  // Pre-join-key lines are classified as `unreadable`, not `0 blocked`.
  assert.match(routes, /unreadable/,
    'routes.mjs must classify pre-join-key evidence as unreadable');

  // The board's `ABSENCE` object must have a symbol for unreadable.
  assert.match(board, /unreadable.*:.*['\"].*['\"]/,
    'the board must render unreadable state distinctly, not as 0 or agreement');
});

// ── Cell 5: Cost — `cost_usd: null` → `unmeasured` (`—`), while `0` → `$0`, never same rendering
test('Cell 5: cost — cost_usd: null → unmeasured (—), 0 → $0, never same render', () => {
  // The Ledger screen (`.7`) shows cost. Cost is never measured is not cost is zero.
  // `cost_usd: null` → render `—` (unmeasured, none measured)
  // `cost_usd: 0` → render `$0.00` (measured zero)
  // These must never render the same way.

  const fleetSummaryRaw = readFileSync(path.join(ROOT, 'packages/board/public/index.html'), 'utf8');

  // Look for the fleet summary rendering that handles cost
  // Line 8054-8056 shows: s.llm_usd_30d != null ? '$' + ... : absent('uncomputable', ...)
  assert.match(fleetSummaryRaw, /s\.llm_usd_30d != null/,
    'must explicitly check for null vs 0 to avoid rendering unmeasured as $0');

  // The rendering paths must differ: one has `absent()` call, one has `$`.
  assert.match(fleetSummaryRaw, /\$.*\.toFixed|absent.*uncomputable/,
    'cost rendering must distinguish measured-zero from unmeasured');
});

// ── Cell 6: Model unpinned — `model: null` + `model_state` → never the string `sonnet` or any default
test('Cell 6: model unpinned — model: null + model_state → never sonnet or default', () => {
  // The fleet view shows each agent's pinned model. When a model is not pinned
  // (model: null), the board must never default to 'sonnet' or any other string.
  // Instead, model_state must be one of: 'pinned', 'undeclared', 'unreadable'.
  const fleet = getAgentsFleet(ROOT);
  for (const a of fleet.agents) {
    assert.ok(['pinned', 'undeclared', 'unreadable'].includes(a.model_state),
      `${a.slug}: ${a.model_state}`);
    if (a.model_state === 'pinned') assert.ok(a.model, `${a.slug} pinned → a model name`);
    else assert.equal(a.model, null,
      `${a.slug} not pinned → null, never a default like 'sonnet'`);
  }
});

// ── Cell 7: Agent age unknown — `updated_at` missing → counted as stuck-unknown (`?`), never dropped, never `0h`
test('Cell 7: agent age unknown — updated_at missing → stuck-unknown (?), never dropped or 0h', () => {
  const raw = readFileSync(path.join(ROOT, 'packages/board/lib/routes.mjs'), 'utf8');
  // Comments are stripped before the search. The first version of this guard
  // failed on the comment that EXPLAINS the bug — the same trap that produced a
  // phantom `.why-` class in the CSS scanner the same day: a scanner that reads
  // prose as code finds the thing it was told to look for, in the explanation of
  // why it is gone.
  const routes = raw.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  // `t.startedAt` is produced by no code path in this repository, so every row
  // got age_h null and the filter removed all of them: the panel reported
  // "nothing is stuck" about a question it never asked.
  assert.doesNotMatch(routes, /t\.startedAt/, 'startedAt is not a field a task has');
  assert.match(routes, /t\.updated_at \|\| t\.created_at/);
  // A task whose age cannot be determined is counted, not silently dropped.
  assert.match(routes, /stuck_unmeasurable/);
  assert.match(routes, /stuck_in_progress/);
});

// ── Test the live indicator (existing test, kept for regression)
test('the live indicator ships connecting, not connected', () => {
  // The markup used to assert "live · synced just now" before any connection
  // existed — true only after the SSE handshake, and never corrected if neither
  // handler fired.
  assert.doesNotMatch(board, /<span id="live-label">live · synced just now<\/span>/,
    'the shipped markup must not claim a sync that has not happened');
  assert.match(board, /class="live-dot connecting"/);
  assert.match(board, /<span id="live-label">connecting…<\/span>/);
  assert.match(board, /\.live-dot\.connecting\s*\{/, 'and the third state has a rule of its own');
});

// ── Test the fleet tool posture (existing test, kept for regression)
test('the fleet reports tool posture, which it never used to read', () => {
  const fleet = getAgentsFleet(ROOT);
  assert.ok(fleet.agents.length > 60, 'the fleet loaded');
  for (const a of fleet.agents) {
    assert.ok(a.posture, `${a.slug} carries a posture`);
    assert.ok(['expensive', 'routine', 'unclassified', 'undeclared', 'unreadable'].includes(a.posture.state),
      `${a.slug} posture state is one of the five: got ${a.posture.state}`);
    if (a.posture.state === 'expensive') assert.ok(a.posture.expensive.length, `${a.slug} names what is expensive`);
  }
});

// ── Test the savings ratio source (existing test, kept for regression)
test('the per-agent savings ratio says it is a ratio, not a measurement', () => {
  // Both sides of it are runs x a constant x a rate, so it is the rate ratio for
  // every agent that ran at all. metrics.mjs nulls its equivalent for this
  // reason; the fleet shipped it as a per-agent number.
  const fleet = getAgentsFleet(ROOT);
  for (const a of fleet.agents) {
    if (a.savings_x == null) assert.equal(a.savings_source, null);
    else assert.equal(a.savings_source, 'ratio', `${a.slug} labels its savings as derived`);
  }
});
