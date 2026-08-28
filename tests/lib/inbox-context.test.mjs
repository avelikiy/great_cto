// The wire format is not the message.
//
// Measured on a live board: of five "P0 open" rows in one project, one had no
// human prose at all. Its whole description was the block the pipeline appends
// to hand state from one stage to the next —
//
//   ## Context
//   [archetype:web3] [compliance:[owasp-api, owasp-masvs, pci-dss]]
//   [feature:web-wallet] [phase:implementation] | Why: see docs/plans/…
//
// — and the inbox printed the first 140 characters of it verbatim, under a
// heading that reads "Here's what needs your decision".
//
// The trap in parsing it is that the value NESTS: `compliance:[a, b]` sits
// inside its own brackets. The sidebar's ancestry banner already learned this
// the expensive way — a first version stripped `[` and `]` globally and produced
// `developer-tools [openssf, api-stability, soc2-type-2 implementation`, an
// unbalanced bracket and a lost separator. The inbox reuses that banner's
// nested-bracket regex; this test is what keeps it reused rather than
// re-invented as a global strip the next time someone touches the row renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(REPO, 'packages', 'board', 'public', 'index.html'), 'utf8');

/**
 * Pull one top-level `function name(…) { … }` out of the board's inline script.
 *
 * The board is a single zero-dependency HTML file with no module boundary, so
 * there is nothing to import. Reading the declaration out of the file and
 * evaluating it tests the bytes that actually ship, which is the point —
 * a copy of the function in this test would pass forever while the page broke.
 */
function extractFn(name) {
  const start = HTML.indexOf(`\nfunction ${name}(`);
  assert.notEqual(start, -1, `${name}() is no longer a top-level function in index.html`);
  const end = HTML.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `could not find the end of ${name}()`);
  const src = HTML.slice(start, end + 3);
  return new Function(`${src}; return ${name};`)();
}

const splitContextBlock = extractFn('splitContextBlock');
const ageHours = extractFn('ageHours');

const WIRE = '## Context\n[archetype:web3] [compliance:[owasp-api, owasp-masvs, pci-dss]] '
  + '[feature:web-wallet] [phase:implementation] | Why: see docs/plans/PLAN-web-wallet.md';

// ── Splitting prose from envelope ───────────────────────────────────────────

test('a description that is only the Context block leaves no prose to show', () => {
  const r = splitContextBlock(WIRE);
  assert.equal(r.prose, '');
  assert.ok(r.wire.startsWith('## Context'));
});

test('human prose above the block survives, and the block does not follow it', () => {
  const r = splitContextBlock(`REQ-1, PRD §2. Add the invite/accept/revoke routes.\n\n${WIRE}`);
  assert.equal(r.prose, 'REQ-1, PRD §2. Add the invite/accept/revoke routes.');
  assert.ok(!r.prose.includes('archetype'), 'the wire block leaked into the visible prose');
});

test('a description with no Context block is passed through untouched', () => {
  const r = splitContextBlock('SEC: rotate the leaked Postgres password.');
  assert.equal(r.prose, 'SEC: rotate the leaked Postgres password.');
  assert.equal(r.wire, '');
  assert.deepEqual(r.tags, {});
});

test('a null or missing description does not throw', () => {
  for (const v of [null, undefined, '']) {
    assert.deepEqual(splitContextBlock(v), { prose: '', tags: {}, wire: '' });
  }
});

// ── The nested value, which is the whole reason this is parsed ──────────────

test('a nested bracketed value is read whole, not truncated at its first "]"', () => {
  // This is the exact shape the naive global strip mangled on the sidebar.
  const { tags } = splitContextBlock(WIRE);
  assert.equal(tags.compliance, 'owasp-api, owasp-masvs, pci-dss');
});

test('the tags around the nested one are not swallowed by it', () => {
  // A regex that stops at the first `]` reads `compliance` as `owasp-api` and
  // then resyncs mid-string, losing `feature` and `phase` — silently, and only
  // for the projects that declare more than one compliance regime.
  const { tags } = splitContextBlock(WIRE);
  assert.equal(tags.archetype, 'web3');
  assert.equal(tags.feature, 'web-wallet');
  assert.equal(tags.phase, 'implementation');
});

test('no parsed tag value carries an unbalanced bracket', () => {
  const { tags } = splitContextBlock(WIRE);
  for (const [k, v] of Object.entries(tags)) {
    const opens = (v.match(/\[/g) || []).length;
    const closes = (v.match(/\]/g) || []).length;
    assert.equal(opens, closes, `tag ${k} = ${JSON.stringify(v)} is unbalanced`);
  }
});

test('the exact wire string is kept so nothing is deleted, only moved', () => {
  // The row hides this behind a tooltip and the side panel renders the whole
  // untouched description. Hiding and deleting are different things; this asserts
  // the reader still has the bytes to hide.
  const r = splitContextBlock(WIRE);
  assert.ok(r.wire.includes('[compliance:[owasp-api, owasp-masvs, pci-dss]]'));
});

// ── Age, the one field that separated five identical rows ───────────────────

test('a missing timestamp reads as null, never as zero', () => {
  // "no data" and "just now" are the pair this whole board keeps apart. A 0 here
  // would sort an undated task to the freshest end and strip its aged accent.
  assert.equal(ageHours(null), null);
  assert.equal(ageHours(undefined), null);
  assert.equal(ageHours(''), null);
});

test('an unparseable timestamp reads as null rather than NaN', () => {
  assert.equal(ageHours('not a date'), null);
});

test('a two-day-old timestamp crosses the board own 48h staleness line', () => {
  const twoDays = new Date(Date.now() - 48.5 * 36e5).toISOString();
  const h = ageHours(twoDays);
  assert.ok(h >= 48, `expected >= 48h, got ${h}`);
});

test('a same-day timestamp stays under it', () => {
  const h = ageHours(new Date(Date.now() - 23 * 36e5).toISOString());
  assert.ok(h > 22 && h < 48, `expected ~23h, got ${h}`);
});

// ── Where the non-actionable receipt line lands ─────────────────────────────

test('the receipt footer host exists and sits below the decision sections', () => {
  // "Could not check the review receipt" is true and careful, and it asks for
  // nothing. It was measured sitting in gate purple above the resume card, the
  // pipeline and all five P0s. The fix is positional, so the position is what
  // this asserts — and that the top host still exists, because `differs` (files
  // changed after approval) genuinely does need the top slot.
  const top = HTML.indexOf('id="inbox-receipt"');
  // Anchored on the queue: the four headed sections were merged into one ranked
  // list, so `inbox-p0-section` no longer exists. The property is unchanged — the
  // line that asks for a decision sits above the queue, the line that asks for
  // nothing sits below it.
  const p0 = HTML.indexOf('id="inbox-queue-section"');
  const foot = HTML.indexOf('id="inbox-receipt-foot"');
  assert.notEqual(top, -1, 'the actionable "differs" host was removed');
  assert.notEqual(foot, -1, 'the quiet footer host was removed');
  assert.ok(foot > p0, 'the quiet receipt line drifted back above the P0 section');
  assert.ok(top < p0, 'the actionable receipt line lost its top slot');
});
