// The UI must not make confident claims about data it failed to read.
//
// With an unreadable tasks.md the board headlined "Nothing urgent — back to deep
// work." and showed an "All clear. Nothing needs your decision" card, because
// every count was zero — maximum confidence at exactly the moment it knew least.
// A first attempt mounted the failure banner inside the tasks panel, where it
// was present in the DOM but invisible on every other tab.
//
// index.html is one inline bundle with no module boundary, so these are static
// assertions on the source rather than DOM tests — enough to catch the specific
// regressions above.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'index.html'), 'utf8');

test('api() captures the X-Board-Degraded header', () => {
  assert.match(html, /X-Board-Degraded/, 'reads the header the server sends');
  assert.match(html, /BOARD_DEGRADED/, 'keeps the reason for the view to render');
});

test('a degraded read clears its entry when the read recovers', () => {
  // Without the delete, a transient failure would leave a permanent banner.
  assert.match(html, /else delete BOARD_DEGRADED\[key\]/,
    'a successful read must clear the previous failure');
});

test('the banner mounts in the always-visible workspace, not inside a tab panel', () => {
  const fn = html.match(/function renderDegradedBanner[\s\S]*?\n\}/);
  assert.ok(fn, 'located renderDegradedBanner');
  assert.match(fn[0], /querySelector\('\.workspace'\)/,
    'mounting next to the failed section hides the notice on every other tab');
});

test('the banner is removed when there is no reason', () => {
  const fn = html.match(/function renderDegradedBanner[\s\S]*?\n\}/);
  assert.match(fn[0], /if \(!reason\) \{ if \(existing\) existing\.remove\(\); return; \}/,
    'a stale error banner is its own bug');
});

test('"All clear" is suppressed while any read is degraded', () => {
  assert.match(html, /attention === 0 && !anyDegraded\(\)/,
    'the all-clear card must require both no findings AND a successful read');
});

test('the greeting does not claim "nothing urgent" on degraded data', () => {
  const block = html.match(/const greetTail = anyDegraded\(\)[\s\S]{0,320}/);
  assert.ok(block, 'greeting branches on degradation');
  assert.match(block[0], /could not be read/i, 'says so instead of reassuring');
});

test('anyDegraded reflects the degradation map', () => {
  assert.match(html, /function anyDegraded\(\)\s*\{\s*return Object\.keys\(BOARD_DEGRADED\)\.length > 0; \}/);
});

test('the banner is announced as an alert, not a passive status', () => {
  const fn = html.match(/function renderDegradedBanner[\s\S]*?\n\}/);
  assert.match(fn[0], /setAttribute\('role', 'alert'\)/);
});

test('the reason is escaped before being written into the DOM', () => {
  const fn = html.match(/function renderDegradedBanner[\s\S]*?\n\}/);
  assert.match(fn[0], /esc\(reason\)/, 'server-supplied text must be escaped');
});
