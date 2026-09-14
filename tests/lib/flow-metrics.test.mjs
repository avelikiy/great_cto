// How long a decision waits.
//
// Gate beads carry created_at and closed_at, and nothing computed the difference.
// The one place that tried — /inbox's stale-gate block — could not fire: it took
// the task id as the first field of `bd list`, which is the status symbol `○`,
// and then grepped `created:` where bd prints `Created:`. Checked 2026-09-14 in
// two projects whose gates had been open since 2026-07-11: neither was ever
// reported stale.
//
// What these pin: a store that could not be read is "not measured", never zero;
// a sample under five is listed, not summarised; a bead whose timestamps do not
// parse is counted apart, never as a zero-hour wait.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gateWaits, formatInboxSections, MIN_SAMPLE } from '../../scripts/lib/flow-metrics.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const NOW = Date.parse('2026-09-14T12:00:00Z');
const H = 3600 * 1000;
const iso = (hoursAgo) => new Date(NOW - hoursAgo * H).toISOString().replace(/\.\d+Z$/, 'Z');
const closed = (id, openedHoursAgo, waitedHours) => ({
  id, title: `gate:ship — ${id}`, status: 'closed', created_at: iso(openedHoursAgo), closed_at: iso(openedHoursAgo - waitedHours),
});
const open = (id, openedHoursAgo) => ({ id, title: `gate:arch — ${id}`, status: 'open', created_at: iso(openedHoursAgo) });

test('a store that could not be read is not measured — not zero gates, not zero wait', () => {
  const beads = [];
  beads.unreadable = true;
  beads.why = 'bd did not answer within 20000ms';
  const r = gateWaits(beads, { now: NOW });
  assert.equal(r.state, 'unmeasured');
  assert.match(r.why, /did not answer/);
  assert.equal(r.closed, undefined, 'no numbers at all when nothing was read');
});

test('closed gates: the wait is closed_at minus created_at, summarised once there are enough', () => {
  assert.equal(MIN_SAMPLE, 5);
  const r = gateWaits([closed('a', 100, 1), closed('b', 100, 2), closed('c', 100, 3), closed('d', 100, 10), closed('e', 100, 50)], { now: NOW });
  assert.equal(r.state, 'measured');
  assert.equal(r.closed.n, 5);
  assert.equal(r.closed.median_h, 3);
  assert.equal(r.closed.max_h, 50);
});

test('under five closed gates the values are listed and there is no median', () => {
  const r = gateWaits([closed('a', 100, 1), closed('b', 100, 7)], { now: NOW });
  assert.equal(r.closed.n, 2);
  assert.equal(r.closed.median_h, null, 'a median of two is a number that looks like a trend');
  assert.deepEqual(r.closed.values_h, [1, 7]);
});

test('open gates: the oldest is named, and only those past the threshold are stale', () => {
  const r = gateWaits([open('fresh', 3), open('old', 1500), open('mid', 30)], { now: NOW, staleHours: 24 });
  assert.equal(r.open.n, 3);
  assert.equal(r.open.oldest.id, 'old');
  assert.equal(r.open.oldest.age_h, 1500);
  assert.deepEqual(r.open.stale.map((g) => g.id), ['old', 'mid'], 'oldest first');
});

test('a bead whose timestamps do not parse is counted apart, never as a zero-hour wait', () => {
  const r = gateWaits([
    closed('ok', 10, 2),
    { id: 'x', title: 'gate:qa', status: 'closed', created_at: 'yesterday', closed_at: '2026-09-14T11:00:00Z' },
    { id: 'y', title: 'gate:qa', status: 'open' },
  ], { now: NOW });
  assert.equal(r.untimed, 2);
  assert.equal(r.closed.n, 1);
  assert.equal(r.open.n, 0);
});

test('no gates at all is a measurement, and says so', () => {
  const r = gateWaits([], { now: NOW });
  assert.equal(r.state, 'measured');
  assert.equal(r.closed.n, 0);
  assert.equal(r.open.n, 0);
  assert.equal(r.open.oldest, null);
});

// ── what /inbox reads ──────────────────────────────────────────────────────

test('inbox: not measured is printed under its heading, not left out', () => {
  const beads = []; beads.unreadable = true; beads.why = 'bd not found';
  const out = formatInboxSections(gateWaits(beads, { now: NOW }));
  assert.match(out, /^## GATE_WAIT$/m);
  assert.match(out, /not measured: bd not found/);
});

test('inbox: stale gates keep the STALE:<id> age:<h>h line under a real heading', () => {
  const out = formatInboxSections(gateWaits([open('old', 1500), open('fresh', 2)], { now: NOW, staleHours: 24 }));
  assert.match(out, /^## STALE_GATES$/m);
  assert.match(out, /^STALE:old age:1500h /m);
  assert.doesNotMatch(out, /STALE:fresh/);
  assert.match(out, /^## GATE_WAIT$/m);
  assert.match(out, /oldest open: old/);
});

test('inbox: no stale gate means no STALE_GATES section, but the wait is still reported', () => {
  const out = formatInboxSections(gateWaits([closed('a', 10, 2)], { now: NOW }));
  assert.doesNotMatch(out, /## STALE_GATES/);
  assert.match(out, /^## GATE_WAIT$/m);
  assert.match(out, /closed n=1: 2h/);
});

test('inbox: every section ends with a blank line, which is how the command separates them', () => {
  // Found by running the real helper: GATE_WAIT ran straight into the next
  // block's output, so a reader taking "until the blank line" read git log as
  // gate data.
  const beads = []; beads.unreadable = true; beads.why = 'x';
  for (const r of [gateWaits([open('old', 1500)], { now: NOW }), gateWaits([], { now: NOW }), gateWaits(beads, { now: NOW })]) {
    assert.match(formatInboxSections(r), /\n\n$/);
  }
});

test('the inbox helper asks flow-metrics instead of parsing bd list by its first field', () => {
  const sh = read('scripts/cmd-data/inbox-data.sh');
  assert.match(sh, /flow-metrics\.mjs/);
  assert.doesNotMatch(sh, /bd list --label gate --status open 2>\/dev\/null \| while read line/,
    'that loop read the status symbol as the task id');
  assert.match(read('commands/inbox.md'), /## GATE_WAIT/, 'the command must name the section the helper prints');
});

test('the path the inbox helper calls is a file that exists', () => {
  // The text check above passes on a comment naming the module; a helper that
  // calls a misspelt path would pass it too, and print "not measured" forever.
  const sh = read('scripts/cmd-data/inbox-data.sh');
  const m = sh.match(/^_FM="\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]:-\$0\}"\)\/([^"]+)" 2>\/dev\/null && pwd\)\/([^"]+)"$/m);
  assert.ok(m, 'the _FM definition changed shape — update this test to follow it');
  const target = resolve(ROOT, 'scripts/cmd-data', m[1], m[2]);
  assert.ok(existsSync(target), `inbox-data.sh calls ${target}, which does not exist`);
});

function read(rel) { return readFileSync(join(ROOT, rel), 'utf8'); }
