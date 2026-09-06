// The two affordances a gate is made of: how hard it is to say yes, and whether
// you can reach the thing that needs one.
//
// A design audit of this board found the friction pointing the wrong way.
// Rejecting a gate had always opened a prompt for a reason; approving one — the
// human signature the whole pipeline waits on, which appends a verdict, wakes
// the next stage, and republishes a public URL when sharing is on — fired on a
// single click with no dialog at all. The cheaper action was the irreversible
// one.
//
// The same audit found Inbox, the default tab, to be the only one of six with
// no `role`, no `tabindex` and no key handler: reachable by mouse only. The
// other five were correct, which is why nobody noticed.
//
// index.html is one inline bundle with no module boundary, so these are static
// assertions on the source — the same idiom as degraded-ui.test.mjs, and enough
// to catch exactly these regressions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'index.html'), 'utf8');

const gateAction = html.match(/async function gateAction\([\s\S]*?\n\}/)?.[0];

// ── Saying yes costs at least one deliberate act ────────────────────────────

test('approving asks before it posts', () => {
  assert.ok(gateAction, 'located gateAction');
  const confirmAt = gateAction.indexOf('confirm(approveConsequence');
  assert.ok(confirmAt > 0, 'the approve branch confirms');
  assert.ok(confirmAt < gateAction.indexOf('/api/gates/'),
    'the confirm must come BEFORE the request, or it is a receipt, not a gate');
  assert.match(gateAction, /if \(!runAgent && !confirm\(approveConsequence\(id\)\)\) return;/,
    'a dismissed confirm returns without approving');
});

test('the confirm names consequences rather than asking "are you sure"', () => {
  const fn = html.match(/function approveConsequence\([\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located approveConsequence');
  assert.match(fn, /verdict log/i, 'says what is recorded');
  assert.match(fn, /pipeline/i, 'says what proceeds');
  assert.match(fn, /public report/i, 'says what leaves the machine');
  assert.match(fn, /shareState/, 'and only claims the public part when sharing is actually on');
});

test('the runAgent path is not confirmed twice', () => {
  // It already shows an editable prompt naming what it will approve and run,
  // and cancelling it aborts the whole action. A second dialog is friction with
  // no information in it.
  assert.match(gateAction, /!runAgent && !confirm/,
    'the extra confirm is skipped when the agent prompt already asked');
});

test('rejecting still asks for a reason', () => {
  // Guarding the approve path must not quietly cost the reject path its prompt.
  assert.match(gateAction, /const reason = prompt\(`Reject \$\{id\}\. Reason \(optional\)\?`\);/);
  assert.match(gateAction, /if \(reason === null\) return;/);
});

// ── Every tab is reachable without a mouse ──────────────────────────────────

test('every nav-item is keyboard reachable — including the default one', () => {
  const items = html.match(/<div class="nav-item[^"]*"[^>]*>/g) || [];
  // Four destinations since the redesign (great_cto-ki1x.5): Decisions, Ledger,
  // Fleet, Harness. Settings is a topbar button, kanban a deep link.
  assert.ok(items.length >= 4, `expected the full nav, found ${items.length}`);
  const broken = items.filter((el) =>
    !/role="tab"/.test(el) || !/tabindex="0"/.test(el) || !/onkeydown=/.test(el));
  assert.deepEqual(broken, [],
    'a tab with an onclick and no key handler is reachable by mouse only (WCAG 2.1.1)');
});

// ── A thumb is not a cursor ─────────────────────────────────────────────────

test('touch targets are a floor over every control, not a list of remembered ones', () => {
  // The first version of this block named .gate-btn and stopped, because those
  // were the buttons a review had pointed at. The hamburger this same file added
  // (40px) and the topbar's icon buttons (~32px) were under the minimum from the
  // day they were written and nothing objected — the rule was a list of what
  // somebody remembered, not a property of the page.
  const block = html.match(/@media \(pointer: coarse\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(block, 'a coarse-pointer block exists');
  assert.match(block, /button, \[role="button"\][^{]*\{ min-height: 44px; \}/,
    'every control gets the floor; one that must stay small opts out in writing');
  assert.match(block, /\.gate-btn[^{]*\{ height: 44px/, '44px is the iOS minimum; 24px is a coin flip');
  assert.match(block, /gap: 12px/, 'Approve 4px from Reject is a mis-tap on the expensive one');
});

test('the coarse block sits AFTER the rules it overrides', () => {
  // Bought twice. Written above `.inbox-row .actions`, its `gap: 12px` lost to
  // that rule's 4px declared 900 lines below — so on a touch screen Approve and
  // Reject sat 4px apart while a block reading as correct sat above saying 12.
  // A declaration that loses is not a declaration, and asserting the text of one
  // is not asserting its effect.
  const at = html.indexOf('@media (pointer: coarse) {');
  for (const base of ['.inbox-row .actions {', '.menu-btn {', '.btn-bell {', '.gate-btn {']) {
    assert.ok(html.indexOf(base) < at, `${base} must be declared before the block that overrides it`);
  }
});

test('the desktop density is left alone', () => {
  // The fix is scoped, not global: a long gate list stays scannable with a mouse.
  assert.match(html, /\.gate-btn \{\n  flex: 1;[\s\S]*?height: 24px;/,
    'the base rule still sets the compact height');
});

// ── A measured zero is not a missing measurement ────────────────────────────

test('zero tasks done renders as 0, not as an absence', () => {
  assert.ok(!/v: done \|\| '—'/.test(html),
    "`done || '—'` renders a real zero as a dash next to a trend line reading +0");
  assert.match(html, /v: doneKnown \? done : absent\('unloaded'/,
    'the absence marker is reserved for a payload with no tasks section at all');
});

test('a zero ESTIMATE is not a measured zero, and does not render as $0.00', () => {
  // This test asserted the opposite this morning, on a premise that was wrong.
  //
  // The reasoning was sound for a measured zero — "$0.00 spent is a
  // measurement; a dash would claim we never looked". But the value being
  // rendered is `aiSpend`, which falls back to `llm_usd`: the TIME-BASED
  // ESTIMATE, used when no verdict carries a cost. So on a project with dozens
  // of agent runs and no recorded costs, the tile said "$0.00 AI spend" — a
  // confident zero produced by an estimator with nothing to estimate from.
  //
  // Three states, not two. A measured figure prints. An estimate with no inputs
  // is uncomputable. A payload with no cost section at all is unloaded.
  assert.ok(!/v: aiSpend > 0 \?/.test(html), 'the original falsy check stays gone');
  assert.match(html, /realLlmUsd === 0 && llmUsd === 0/, 'the empty-estimate case is separated');
  assert.match(html, /absent\('uncomputable', 'no verdict carries a cost/,
    'and named as uncomputable rather than printed as zero');
  assert.match(html, /absent\('unloaded', 'the metrics payload carried no cost section'\)/,
    'the missing-section case is still distinct from it');
});

test('cycle time keeps its dash, and says why', () => {
  // Not the same shape as the two above: the backend emits 0 when no completion
  // could be timed, so 0 genuinely means not-computable here. Asserted so a
  // future sweep for falsy checks does not "fix" it into a literal 0 m.
  assert.match(html, /v: avgMin \? `\$\{avgMin\}` : absent\('uncomputable'/,
    'still an absence, now labelled as the uncomputable kind rather than a bare dash');
  assert.match(html, /means "could not be computed", not "took no time"/,
    'and the reason is written down where the next reader will look');
});

// ── Typed-name confirmation for expensive and unclassified gates ──────────────

test('approveConsequence accepts reversibility info with categories', { skip: 'RED until great_cto-ki1x.6 lands' }, () => {
  const fn = html.match(/function approveConsequence\([\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located approveConsequence');
  // After implementation, approveConsequence should accept a second parameter
  // for reversibility info containing categories array
  assert.match(fn, /reversibility/i,
    'approveConsequence accepts reversibility parameter (or extracted from context)');
  assert.match(fn, /categories/i,
    'function handles gate categories from reversibility state');
});

test('approveConsequence includes category words for expensive gates', { skip: 'RED until great_cto-ki1x.6 lands' }, () => {
  const fn = html.match(/function approveConsequence\([\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located approveConsequence');
  // For expensive gates, the consequence text should include human-readable
  // category names like "escapes-the-machine" or "costs-money"
  assert.match(fn, /escapes[\s\S]*machine|costs[\s\S]*money/i,
    'consequence text references the category vocabulary (expensive gate categories)');
});

test('approveConsequence labels unclassified gates as such', { skip: 'RED until great_cto-ki1x.6 lands' }, () => {
  const fn = html.match(/function approveConsequence\([\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located approveConsequence');
  // For unclassified (unknown) gates, the text should warn that cost is unknown
  assert.match(fn, /unclassified|not.*harmless|unknown.*cost/i,
    'consequence text for unclassified gates includes warning about unknown cost');
});

test('expensive gates require typed-name confirmation in gateAction', { skip: 'RED until great_cto-ki1x.6 lands' }, () => {
  assert.ok(gateAction, 'located gateAction');
  // For expensive and unclassified gates, before posting the approval,
  // gateAction should require the operator to type the gate name exactly
  // to prove they read the consequences.
  // The logic should check reversibility state and only allow confirm dismissal
  // if typed value === gate id (case-sensitive)
  assert.match(gateAction, /typed|typed.*name|confirmName/i,
    'gateAction logic includes typed-name confirmation for expensive gates');
  assert.match(gateAction, /expensive|unclassified/i,
    'gateAction references reversibility state (expensive or unclassified)');
});

test('routine gates do not require typed-name confirmation', { skip: 'RED until great_cto-ki1x.6 lands' }, () => {
  assert.ok(gateAction, 'located gateAction');
  // For routine gates (cheap to undo), the single confirm dialog is enough.
  // No typed-name affordance should be required.
  // The condition that branches on gate type should explicitly handle routine case
  assert.match(gateAction, /routine|state.*routine/i,
    'gateAction has logic path for routine gates');
});

test('typed-name input is disabled until exact match', { skip: 'RED until great_cto-ki1x.6 lands' }, () => {
  // After implementation, look for a UI affordance that:
  // 1. Shows an input field for expensive/unclassified gates
  // 2. Disables the approve button by default
  // 3. Enables it only when input value === gate id (case-sensitive)
  // This may appear in gateAction or in a separate approve dialog handler
  assert.match(html, /disabled|disabled[^}]*|input.*type|confirm.*typed/i,
    'UI includes disabled state management for typed-name affordance');
});

test('approveConsequence invariants: verdict log, pipeline, public report', { skip: 'RED until great_cto-ki1x.6 lands' }, () => {
  const fn = html.match(/function approveConsequence\([\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located approveConsequence');
  // Original invariants must remain: the consequence always names the three effects
  assert.match(fn, /verdict log/i, 'still says what is recorded');
  assert.match(fn, /pipeline/i, 'still says what proceeds');
  assert.match(fn, /public report/i, 'still says what leaves the machine');
  assert.match(fn, /shareState/, 'and still claims the public part only when sharing is on');
});
