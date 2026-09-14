// ADR-021 phase 2 (great_cto-c0hb): the board resumes the agent stream where it left off.
//
// Phase 1 pushed the newest twenty events whenever the file changed, with no `id`
// on the frame. A board that lost its connection for a minute came back to a
// snapshot, and anything older than those twenty was gone from its view — the
// events a later approval flow must not miss. Now each push carries a cursor, the
// board sends it back, and the server replays exactly what came after.
//
// The cursor is `<inode>-<byte offset>`. Everything below pins the ways a cursor
// can stop meaning what it meant: the file rotated, was truncated, was replaced,
// or the cursor is not one of ours. In each the answer is a full snapshot, never a
// read from the wrong place in the wrong file.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync, truncateSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EVENTS_FILE, appendEvent, readEventsSince } from '../../scripts/lib/agent-events.mjs';

const TMP_DIRS = [];
after(() => { for (const d of TMP_DIRS) { try { chmodSync(d, 0o755); } catch {} rmSync(d, { recursive: true, force: true }); } });
const stateDir = () => { const d = mkdtempSync(join(tmpdir(), 'gcto-since-')); TMP_DIRS.push(d); return join(d, '.great_cto'); };
const NOW = Date.parse('2026-09-14T12:00:00Z');
const add = (dir, e, i = 0, opts = {}) => appendEvent(dir, e, { now: NOW + i, env: {}, ...opts });

test('no cursor is a snapshot that ends at the file’s last complete line', () => {
  const dir = stateDir();
  add(dir, { kind: 'agent-start', agent: 'senior-dev' }, 0);
  add(dir, { kind: 'agent-stop', agent: 'senior-dev' }, 1);
  const r = readEventsSince(dir, null);
  assert.equal(r.state, 'live');
  assert.equal(r.mode, 'snapshot');
  assert.equal(r.events.length, 2);
  const size = statSync(join(dir, EVENTS_FILE)).size;
  assert.match(r.cursor, new RegExp(`^\\d+-${size}$`));
});

test('a cursor returns only what was appended after it, and advances', () => {
  const dir = stateDir();
  add(dir, { kind: 'agent-start', agent: 'qa-engineer' }, 0);
  const first = readEventsSince(dir, null);
  add(dir, { kind: 'tool', tool: 'Edit', paths: ['src/a.mjs'] }, 1);
  add(dir, { kind: 'agent-stop', agent: 'qa-engineer' }, 2);
  const next = readEventsSince(dir, first.cursor);
  assert.equal(next.mode, 'delta');
  assert.deepEqual(next.events.map((e) => e.kind), ['tool', 'agent-stop']);
  const again = readEventsSince(dir, next.cursor);
  assert.equal(again.mode, 'delta');
  assert.deepEqual(again.events, [], 'nothing new is nothing — not the last events twice');
  assert.equal(again.cursor, next.cursor);
});

test('a line still being written is not consumed', () => {
  const dir = stateDir();
  add(dir, { kind: 'stop' }, 0);
  const c = readEventsSince(dir, null).cursor;
  const file = join(dir, EVENTS_FILE);
  writeFileSync(file, readFileSync(file, 'utf8') + '{"v":1,"ts":"2026-09-14T12:00:01Z","kind":"to');
  const mid = readEventsSince(dir, c);
  assert.deepEqual(mid.events, []);
  assert.equal(mid.cursor, c, 'the cursor stays before the half-written line');
  writeFileSync(file, readFileSync(file, 'utf8') + 'ol","tool":"Read"}\n');
  const done = readEventsSince(dir, mid.cursor);
  assert.deepEqual(done.events.map((e) => e.tool), ['Read'], 'and it arrives whole once finished');
});

test('offsets are bytes: a path with non-ASCII characters does not shift the next read', () => {
  const dir = stateDir();
  add(dir, { kind: 'tool', tool: 'Edit', paths: ['docs/обзор-архитектуры.md'] }, 0);
  const c = readEventsSince(dir, null).cursor;
  add(dir, { kind: 'tool', tool: 'Read', paths: ['src/ok.mjs'] }, 1);
  const r = readEventsSince(dir, c);
  assert.deepEqual(r.events.map((e) => e.tool), ['Read']);
  assert.equal(r.bad, 0, 'a byte/char mix-up would cut a line and count it bad');
});

test('after rotation the cursor points into a file that no longer exists: snapshot', () => {
  const dir = stateDir();
  add(dir, { kind: 'stop' }, 0, { maxBytes: 400 });
  const c = readEventsSince(dir, null).cursor;
  for (let i = 1; i < 12; i++) add(dir, { kind: 'tool', tool: `T${i}`, paths: [`src/file-${i}.mjs`] }, i, { maxBytes: 400 });
  const r = readEventsSince(dir, c);
  assert.equal(r.mode, 'snapshot', 'a different inode is a different file');
  assert.ok(r.events.length > 0);
  assert.notEqual(r.cursor, c);
});

test('rotation is caught by the inode even when the new file has a line boundary at the old offset', () => {
  // The rotation test above would pass without the inode check: its new file is
  // shorter, or the old offset lands mid-line. Identical lines put a newline exactly
  // on the old offset, so only "this is a different file" can tell a resume from a
  // replay that silently skips what the new file holds.
  const dir = stateDir();
  const same = { kind: 'tool', tool: 'Read', paths: ['src/same.mjs'] };
  add(dir, same, 0);
  const lineBytes = statSync(join(dir, EVENTS_FILE)).size;
  const opts = { maxBytes: lineBytes * 3 };
  add(dir, same, 0, opts);
  add(dir, same, 0, opts);                         // 3 lines: exactly at the cap
  const c = readEventsSince(dir, null).cursor;     // offset = 3 lines
  for (let i = 0; i < 3; i++) add(dir, same, 0, opts); // the first rotates; the new file ends at the same offset
  const r = readEventsSince(dir, c);
  assert.equal(r.mode, 'snapshot', 'a different inode is a different file, whatever the offset says');
  assert.equal(r.events.length, 3, 'the three events in the new file are shown, not skipped');
});

test('a truncated file, a malformed cursor, and a cursor past the end are snapshots', () => {
  const dir = stateDir();
  for (let i = 0; i < 3; i++) add(dir, { kind: 'stop' }, i);
  const c = readEventsSince(dir, null).cursor;
  for (const bad of ['garbage', '12', '-5', '1-2-3', `${c.split('-')[0]}-99999999`, '']) {
    assert.equal(readEventsSince(dir, bad).mode, 'snapshot', `cursor ${JSON.stringify(bad)}`);
  }
  truncateSync(join(dir, EVENTS_FILE), 0);
  add(dir, { kind: 'agent-start', agent: 'devops' }, 9);
  const r = readEventsSince(dir, c);
  assert.equal(r.mode, 'snapshot', 'same inode, but the file is shorter than the cursor');
  assert.deepEqual(r.events.map((e) => e.kind), ['agent-start']);
});

test('a file truncated and grown back past the cursor is a snapshot, not a read from mid-line', () => {
  const dir = stateDir();
  for (let i = 0; i < 3; i++) add(dir, { kind: 'stop' }, i);
  const c = readEventsSince(dir, null).cursor;
  truncateSync(join(dir, EVENTS_FILE), 0);
  // Longer lines, so the old offset lands inside one of them.
  for (let i = 0; i < 4; i++) add(dir, { kind: 'tool', tool: `Long${i}`, paths: [`src/a-much-longer-path-number-${i}.mjs`] }, 10 + i);
  const r = readEventsSince(dir, c);
  assert.equal(r.mode, 'snapshot', 'the offset no longer sits after a newline');
  assert.equal(r.bad, 0, 'no half line counted as a bad event');
  assert.equal(r.events.length, 4);
});

test('the three states pass through: none and unreadable carry no cursor', () => {
  const none = readEventsSince(stateDir(), 'garbage');
  assert.equal(none.state, 'none');
  assert.equal(none.cursor, null);
  const dir = stateDir();
  add(dir, { kind: 'stop' }, 0);
  chmodSync(join(dir, EVENTS_FILE), 0o000);
  const r = readEventsSince(dir, null);
  chmodSync(join(dir, EVENTS_FILE), 0o644);
  if (process.getuid && process.getuid() === 0) return;
  assert.equal(r.state, 'unreadable');
  assert.equal(r.cursor, null);
  assert.ok(r.why);
});

test('a snapshot is bounded by limit; a delta is not silently cut', () => {
  const dir = stateDir();
  add(dir, { kind: 'stop' }, 0);
  const c = readEventsSince(dir, null).cursor;
  for (let i = 1; i <= 30; i++) add(dir, { kind: 'tool', tool: `T${i}` }, i);
  assert.equal(readEventsSince(dir, null, { limit: 5 }).events.length, 5);
  const d = readEventsSince(dir, c, { limit: 5 });
  assert.equal(d.mode, 'delta');
  assert.equal(d.events.length, 30, 'replay means everything after the cursor');
});

test('a replay larger than the cap is a snapshot that says so, not a cut delta', () => {
  // After a long disconnect the gap can be the whole 5 MB file. Sending it as one
  // frame is not a resume; cutting it and calling it a delta would hide the loss.
  const dir = stateDir();
  add(dir, { kind: 'stop' }, 0);
  const c = readEventsSince(dir, null).cursor;
  for (let i = 1; i <= 12; i++) add(dir, { kind: 'tool', tool: `T${i}` }, i);
  const r = readEventsSince(dir, c, { limit: 4, maxDelta: 10 });
  assert.equal(r.mode, 'snapshot');
  assert.equal(r.gap, true, 'the board can say that events were skipped');
  assert.deepEqual(r.events.map((e) => e.tool), ['T9', 'T10', 'T11', 'T12']);
});
