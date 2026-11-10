// Home (UX audit 2026-11, docs/design/UX-AUDIT-board-2026-11.md).
//
// The audit read four different answers to "how many things need me" on one
// project within ten minutes (51 on the sidebar badge, 18 in the list, 8 on
// Work, "nothing waiting" in the headline), and two answers to "is anything
// running" (0 on Work, 6 on Ledger). Each number had its own arithmetic. These
// tests hold the two functions that replaced them, by running them, and the
// layout bug found on the way.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('./public/assets/admin-shell.js', import.meta.url), 'utf8');

function fn(name) {
  const m = html.match(new RegExp(`\\nfunction ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(m, `located ${name}`);
  return m[0];
}
function sandbox(window) {
  const context = { window };
  vm.createContext(context);
  vm.runInContext(`${fn('homeNeedsYou')}\n${fn('homeSessionRowCount')}\n${fn('homeRunningNow')}`, context);
  return context;
}

test('one count: tasks are distinct, replies and a changed approval are added, stale is not', () => {
  const ctx = sandbox({
    __inboxData: {
      pending_gates: [{ id: 'g1' }],
      p0_open: [{ id: 'a' }],
      blocked: [{ id: 'a' }, { id: 'b' }],          // `a` is both P0 and blocked
      stale_in_progress: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
      summary: { needs_you: 3 },                      // the server's distinct count
      elsewhere: { p0: 43, gates: 2 },
    },
    __sessionStatus: { blocked: [{ session: 'x' }], waiting: 2 },
    __receiptDrift: { id: 'receipt' },
  });
  const n = ctx.homeNeedsYou();
  assert.equal(n.tasks, 3, 'a P0 that is also blocked is one item');
  assert.equal(n.replies, 3, 'one blocked session and two waiting ones');
  assert.equal(n.drift, 1);
  assert.equal(n.total, 7, 'stale work and other projects are not in the count');
  assert.equal(ctx.homeSessionRowCount(), 2, 'waiting sessions share one row');
});

test('one count: an unread project is not a zero', () => {
  const n = sandbox({}).homeNeedsYou();
  assert.equal(n.read, false);
  assert.equal(n.total, 0);
  assert.match(fn('renderHomeHead'), /if \(!n\.read\) \{[^}]*Reading project data/,
    'the headline says the data is being read instead of "Nothing needs you"');
});

test('the badge, the headline and the queue header all read the one function', () => {
  // The badge is written in exactly one place.
  assert.equal((html.match(/getElementById\('nav-inbox-count'\)/g) || []).length, 2,
    'renderHomeHead writes the number; renderInbox only sets the tooltip');
  assert.match(fn('renderHomeHead'), /if \(badge\) badge\.textContent = n\.total;/);
  assert.doesNotMatch(fn('renderInbox'), /badge\.textContent/);
  assert.doesNotMatch(html, /here \+ away/, 'other projects are no longer added to this project\'s badge');
  assert.match(fn('renderQueue'), /const total = homeNeedsYou\(\)\.total;/);
  assert.match(fn('renderHomeHead'), /const n = homeNeedsYou\(\);/);
});

test('stale in-progress work is listed from the Agents tile, not in the queue', () => {
  const q = fn('renderQueue');
  const queueLiteral = q.slice(q.indexOf('const queue = ['), q.indexOf('];', q.indexOf('const queue = [')));
  assert.doesNotMatch(queueLiteral, /stale_in_progress/);
  assert.match(q, /renderInboxList\('home-stale-list', stale/);
});

test('gates are never folded behind "Show more"', () => {
  assert.match(fn('renderQueue'), /const room = Math\.max\(gates, HOME_ROWS - sessionRows\);/);
});

test('running now: one source, and "not read" is not zero', () => {
  assert.equal(sandbox({}).homeRunningNow(), null);
  const ctx = sandbox({ GctoWork: { getSnapshot: () => ({ entries: [
    { phase: 'working' }, { phase: 'publishing' }, { phase: 'working', terminal: true }, { phase: 'accepted' },
  ] }) } });
  assert.equal(ctx.homeRunningNow(), 2);
  // Cost no longer draws its own "Running now" (it used to count pipeline
  // stages); Home is the one place that answers it.
  const cost = fn('renderLedgerHead');
  assert.doesNotMatch(cost, /Running now/);
  assert.doesNotMatch(cost, /ledger-strip|ledger-stuck/);
});

test('the closed task panel cannot scroll the board sideways', () => {
  // Found in the audit: tabbing into the off-canvas panel scrolled `.board`
  // 464px left; `overflow: hidden` allows that and offers no way back.
  const board = html.match(/\n\.board \{[\s\S]*?\n\}/)[0];
  assert.match(board, /overflow: clip;/);
  const side = html.match(/\n\.side \{[\s\S]*?\n\}/)[0];
  assert.match(side, /visibility: hidden;/, 'closed means out of the tab order');
  assert.match(html, /\.side\.open \{[^}]*visibility: visible;/);
});

test('navigation: Home first, old links still land somewhere', () => {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(shell, context);
  const ui = context.window.GctoAdmin;
  for (const input of ['home', 'decisions', 'inbox']) {
    assert.equal(ui.route(input).canonical, 'home');
    assert.equal(ui.route(input).panel, 'inbox');
  }
  assert.equal(ui.route('cost').canonical, 'insights/ledger');
  assert.match(shell, /\['home','work','insights','knowledge','settings'\]/);
  assert.match(shell, /insights:'Cost'/);
  assert.match(shell, /location\.hash\|\|'#\/home'/, 'an address with no route opens Home');
});

test('one primary action in the top bar', () => {
  const bar = html.slice(html.indexOf('<div class="topbar-actions">'), html.indexOf('<div class="panel active" id="panel-work"'));
  assert.equal((bar.match(/<button /g) || []).length, 2, 'Install app (shown only when installable) and New task');
  assert.match(bar, /id="topbar-task-count" hidden/);
  assert.match(html, /label: 'New issue', run: \(\) => openNewIssueModal\(\)/, 'creating a Beads issue stays in the command palette');
});

// Cost (UX audit F4, approved mockup): one screen, one alert, two totals.
function costContext(over, usage) {
  const els = { 'ledger-head': { innerHTML: '' }, 'cost-title': { textContent: '', innerHTML: '' }, 'cost-sub': { textContent: '' } };
  const context = {
    document: { getElementById: (id) => els[id] || null },
    currentPeriod: 30, fleetState: { agents: [] },
    periodLabel: (d) => `${d} days`, fmtMoney: (n) => String(Math.round(n)),
    fmtUsdEq: (n) => `$${Math.round(n)}`,
    esc: (x) => String(x).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
    absent: (kind, why) => `<span class="abs" data-kind="${kind}" title="${why}">·</span>`,
  };
  vm.createContext(context);
  vm.runInContext(`${fn('costOverCap')}\n${fn('costRange')}\n${fn('renderLedgerHead')}`, context);
  context.renderLedgerHead({ cost: {}, metrics: { cost: { real_llm_usd: 60 }, tasks: { done_in_window: 349 }, avg_completion_min: 45, acceptance: { cost_per_accepted: 1.05 } }, usage, over });
  return els;
}

test('cost: one alert names the agent over its cap; none when nothing is over', () => {
  const els = costContext([{ slug: 'senior-dev', spent: 48.36, cap: 25 }], null);
  assert.match(els['ledger-head'].innerHTML, /role="alert"[\s\S]*senior-dev is over its cap:<\/b> \$48\.36 spent of \$25/);
  assert.match(els['ledger-head'].innerHTML, /Change cap/);
  assert.equal(els['cost-title'].innerHTML, 'Cost · <span class="cost-long">last </span>30 days');
  assert.doesNotMatch(costContext([], null)['ledger-head'].innerHTML, /role="alert"/);
});

test('cost: list price is a figure only when counted and priced, never $0', () => {
  const priced = costContext([], { state: 'counted', seen: { claude: true }, hosts: { claude: { usd: 1719 } } })['ledger-head'].innerHTML;
  assert.match(priced, /\$1719/);
  assert.match(priced, /On a subscription this is not a charge/);
  assert.match(priced, /Token detail/);
  // Desktop wording; the phone hides the long part (approved CostPhone mockup).
  assert.match(priced, /349 tasks done · median 45 min<span class="cost-long"> from start to done<\/span> · \$1\.05 per accepted task/);
  assert.match(priced, /<span class="cost-short">Caps are checked against it\.<\/span>/);
  const unpriced = costContext([], { state: 'counted', seen: { claude: true }, hosts: { claude: { usd: null } } })['ledger-head'].innerHTML;
  assert.match(unpriced, /data-kind="uncomputable"/);
  assert.match(costContext([], { state: 'computing' })['ledger-head'].innerHTML, /counting…/);
  assert.match(costContext([], null)['ledger-head'].innerHTML, /data-kind="unloaded"/);
});

test('cost: the nav opens one screen, no sub-tabs; old links still land', () => {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(shell, context);
  const ui = context.window.GctoAdmin;
  for (const input of ['insights', 'cost', 'ledger', 'budgets', 'insights/ledger']) {
    assert.equal(ui.route(input).canonical, 'insights/ledger', input);
    assert.equal(ui.route(input).panel, 'budgets', input);
  }
  assert.equal(ui.route('insights/consumption').panel, 'usage', 'Token detail');
  assert.equal(ui.route('insights/outcomes').panel, 'admin-outcomes', 'Outcomes stays reachable by route');
  assert.doesNotMatch(shell, /Ledger & budgets/);
  const panel = html.slice(html.indexOf('<div class="panel" id="panel-budgets"'), html.indexOf('<div class="panel" id="panel-docs">'));
  assert.deepEqual([...panel.matchAll(/data-period="(\d+)"/g)].map((m) => m[1]), ['7', '30', '90']);
});

