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
  assert.ok(items.length >= 6, `expected the full nav, found ${items.length}`);
  const broken = items.filter((el) =>
    !/role="tab"/.test(el) || !/tabindex="0"/.test(el) || !/onkeydown=/.test(el));
  assert.deepEqual(broken, [],
    'a tab with an onclick and no key handler is reachable by mouse only (WCAG 2.1.1)');
});

// ── A thumb is not a cursor ─────────────────────────────────────────────────

test('gate buttons grow to a real touch target on touch input', () => {
  const block = html.match(/@media \(pointer: coarse\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(block, 'a coarse-pointer block exists');
  assert.match(block, /\.gate-btn \{ height: 44px/, '44px is the iOS minimum; 24px is a coin flip');
  assert.match(block, /gap: 12px/, 'Approve 4px from Reject is a mis-tap on the expensive one');
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
  assert.match(html, /v: doneKnown \? done : '—'/,
    'the dash is reserved for a payload with no tasks section at all');
});

test('spending nothing yet renders as $0.00, not as an absence', () => {
  assert.ok(!/v: aiSpend > 0 \?/.test(html), 'a measured $0 is a measurement');
  assert.match(html, /v: costKnown \? `\$\$\{aiSpend/, 'the dash means the cost section is missing');
});

test('cycle time keeps its dash, and says why', () => {
  // Not the same shape as the two above: the backend emits 0 when no completion
  // could be timed, so 0 genuinely means not-computable here. Asserted so a
  // future sweep for falsy checks does not "fix" it into a literal 0 m.
  assert.match(html, /v: avgMin \? `\$\{avgMin\}` : '—'/, 'unchanged');
  assert.match(html, /means "could not be computed", not "took no time"/,
    'and the reason is written down where the next reader will look');
});
