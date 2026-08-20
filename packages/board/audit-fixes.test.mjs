// The five things a design audit scored the board down for, and the rules each
// bought. Audit put the board at 82/100 against Linear, Datadog, Grafana,
// GitHub Actions and Sentry, with three named systemic gaps.
//
// index.html is one inline bundle with no module boundary, so these are static
// assertions on the source — the same idiom as degraded-ui.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'public', 'index.html'), 'utf8');

// ── A chart that can only be hovered hides its own numbers ──────────────────

test('cost bars are reachable and readable without a pointer', () => {
  // Every bar was a div whose only reading was a hover tooltip. This chart is
  // money, and the reader most likely to need an exact figure is the one least
  // able to hover for it.
  const bar = html.match(/return `<div class="cost-bar[^`]*`;/)?.[0];
  assert.ok(bar, 'located the bar render');
  assert.match(bar, /tabindex="0"/, 'in the tab order');
  assert.match(bar, /aria-label="\$\{esc\(tip\)\}"/, 'carrying the same string the tooltip shows');
  assert.match(html, /\.cost-bar:focus-visible \.tip \{ display: block; \}/,
    'focus opens the tip, so keyboard and pointer agree');
});

test('the series is also a table', () => {
  // Grafana and Datadog always let you read the exact value without a pointer.
  assert.match(html, /<details class="cost-table">/);
  assert.match(html, /<th scope="col">Spend<\/th>/, 'headers are scoped, not bare cells');
  assert.match(html, /overflow-x:auto/, 'and it scrolls inside itself rather than the page');
});

// ── A number without a comparison is not a reading ──────────────────────────

test('the delta has four states and three of them are silence', () => {
  const fn = html.match(/function deltaBadge\([\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located deltaBadge');
  assert.match(fn, /if \(!comparable[\s\S]*?\) return '';/,
    'no previous period means no comparison — not 0%');
  assert.match(fn, /if \(prev === 0 && current === 0\) return '';/, 'nothing either side is not news');
  assert.match(fn, /if \(prev === 0\) return/, 'a ratio against zero is undefined, and says so');
  assert.match(fn, /invert/, 'spend rising is not good news, and the badge knows which is which');
});

test('the backend refuses to invent a previous period', () => {
  // A project three weeks old has no previous 30 days. Rendering that as a fall
  // from zero would be inventing the comparison.
  const metrics = readFileSync(join(HERE, 'lib', 'metrics.mjs'), 'utf8');
  assert.match(metrics, /comparable: Number\.isFinite\(oldestSignal\) && oldestSignal <= prevEnd/);
});

// ── A failure that only offers what every success offers ────────────────────

test('a failed stage offers recovery, not the same filter as every other stage', () => {
  // GitHub Actions puts "Re-run failed jobs" on the failure itself. This offered
  // "filter the Kanban by this stage" — identical to what a passing stage offers.
  assert.match(html, /const failed = s\.status === 'failed' \|\| s\.status === 'blocked';/);
  assert.match(html, /drillToVerdict\('\$\{esc\(s\.stage\)\}'\)/, 'why it failed');
  assert.match(html, /copyRerun\('\$\{esc\(s\.stage\)\}'\)/, 'and how to run it again');
});

test('re-run copies the command instead of dispatching it', () => {
  // A re-run spends money and writes to the project, and this surface has no
  // gate for that. The operator stays the one who decides.
  const fn = html.match(/function copyRerun\(stage\)[\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located copyRerun');
  assert.match(fn, /clipboard\.writeText/);
  assert.ok(!/api\/agent|fetch\(/.test(fn), 'it must not dispatch');
});

// ── A feed you cannot filter ────────────────────────────────────────────────

test('activity facets are derived from the data, never a fixed list', () => {
  // A chip for a source with no entries is a filter that can only return
  // nothing, and clicking it teaches the reader something false.
  const fn = html.match(/function logFacets\(\)[\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located logFacets');
  assert.match(fn, /for \(const l of allLogs\)/, 'counted from the logs in hand');
});

test('a filter that hides everything says so', () => {
  assert.match(html, /No activity matches <b>\$\{esc\(logFacet \|\| ''\)\}<\/b>/);
});

test('one facet is not a filter', () => {
  assert.match(html, /facets\.length > 1 \?/, 'the bar appears only when there is a choice');
});

// ── A palette that executes, not a box that finds ───────────────────────────

test('the palette is built from the board\'s own verbs', () => {
  // A second implementation of these actions would be a second place for the
  // safety rules to be missing from.
  const fn = html.match(/function cmdkActions\(\)[\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located cmdkActions');
  for (const verb of ['switchTab', 'openNewIssueModal', 'toggleBoardTheme', 'gateAction']) {
    assert.match(fn, new RegExp(verb), `${verb} is reused, not reimplemented`);
  }
});

test('approving from the palette still goes through the confirm', () => {
  // gateAction names its consequences and waits. Reaching it by keyboard must
  // not be a way around that.
  const fn = html.match(/function cmdkActions\(\)[\s\S]*?\n\}/)?.[0];
  assert.match(fn, /gateAction\(t\.id, 'approve'\)/, 'the same call the button makes');
  const run = html.match(/function cmdkRun\(i\)[\s\S]*?\n\}/)?.[0];
  assert.match(run, /setTimeout\(\(\) => a\.run\(\), 0\)/,
    'the palette closes first, so a confirm is not stacked underneath it');
});

test('Cmd+K opens the palette rather than focusing a search box', () => {
  const h = html.match(/if \(\(e\.metaKey \|\| e\.ctrlKey\) && e\.key === 'k'\)[\s\S]{0,120}/)?.[0];
  assert.ok(h, 'located the handler');
  assert.match(h, /cmdkOpen\(\)/);
  assert.ok(!/search-input'\)\.focus\(\)/.test(h), 'a find is not a command');
});

test('the palette is a dialog and is escapable', () => {
  assert.match(html, /role="dialog" aria-modal="true" aria-label="Command palette"/);
  assert.match(html, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); cmdkClose\(\); return; \}/);
  assert.match(html, /role="listbox"/);
  assert.match(html, /aria-selected="\$\{i === cmdkIndex\}"/);
});
