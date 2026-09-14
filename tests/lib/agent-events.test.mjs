// ADR-021 phase 1: agent events, recorded as they happen.
//
// The board could not show a pipeline that had stopped: on 2026-09-14 a live run
// stalled after its first stage and the only record was a journal line read by
// hand. The hooks the plugin already runs now append one line per agent event to
// the project's .great_cto/events.jsonl, and the board streams it.
//
// What these pin is the part that can go wrong quietly: an event carries facts,
// never content; recording never breaks a hook; and the reader says which of three
// things it found — events, no file, or a file it could not read.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  EVENTS_FILE, EVENT_KINDS, EVENT_FIELDS, makeEvent, appendEvent, readEvents,
} from '../../scripts/lib/agent-events.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TMP_DIRS = [];
after(() => { for (const d of TMP_DIRS) { try { chmodSync(d, 0o755); } catch {} rmSync(d, { recursive: true, force: true }); } });
const stateDir = () => { const d = mkdtempSync(join(tmpdir(), 'gcto-events-')); TMP_DIRS.push(d); return join(d, '.great_cto'); };
const NOW = Date.parse('2026-09-14T12:00:00Z');
const lines = (dir) => readFileSync(join(dir, EVENTS_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

// ── what an event may carry ────────────────────────────────────────────────

test('an event carries only the allowed fields — no command, content, prompt or output', () => {
  const e = makeEvent({
    kind: 'tool', tool: 'Bash', session: 's-1', ok: true, duration_ms: 42,
    command: 'curl -H "Authorization: Bearer sk-live-123" https://x', tool_input: { command: 'rm -rf /tmp/x' },
    content: 'OPENROUTER_API_KEY=sk-or-abc', prompt: 'the user said…', tool_response: 'secret output',
  }, { now: NOW });
  for (const k of Object.keys(e)) assert.ok(EVENT_FIELDS.includes(k), `unexpected field ${k}`);
  const text = JSON.stringify(e);
  for (const leak of ['sk-live-123', 'rm -rf', 'OPENROUTER_API_KEY', 'the user said', 'secret output']) {
    assert.ok(!text.includes(leak), `event carried ${leak}`);
  }
  assert.equal(e.kind, 'tool');
  assert.equal(e.ts, '2026-09-14T12:00:00Z');
});

test('an unknown kind is not an event', () => {
  assert.equal(makeEvent({ kind: 'keystroke', tool: 'x' }, { now: NOW }), null);
  assert.ok(EVENT_KINDS.includes('pipeline') && EVENT_KINDS.includes('agent-stop'));
});

test('paths are bounded, and values are typed rather than trusted', () => {
  const e = makeEvent({
    kind: 'tool', tool: 'Edit', ok: 'yes', duration_ms: -5,
    paths: [...Array.from({ length: 30 }, (_, i) => `src/f${i}.mjs`), 42, 'x'.repeat(2000)],
    outcome: 'DROP TABLE', verdict: 'approved; rm',
  }, { now: NOW });
  assert.ok(e.paths.length <= 10, 'at most ten paths');
  assert.ok(e.paths.every((p) => typeof p === 'string' && p.length <= 300));
  assert.equal(e.ok, undefined, 'a non-boolean ok is dropped, not coerced');
  assert.equal(e.duration_ms, undefined, 'a negative duration is dropped');
  assert.equal(e.outcome, undefined, 'outcome must look like a journal outcome');
  assert.equal(e.verdict, undefined, 'verdict must look like a verdict token');
});

// ── recording ──────────────────────────────────────────────────────────────

test('appending writes one JSON line per event', () => {
  const dir = stateDir();
  assert.deepEqual(appendEvent(dir, { kind: 'agent-start', agent: 'qa-engineer' }, { now: NOW, env: {} }), { ok: true });
  appendEvent(dir, { kind: 'agent-stop', agent: 'qa-engineer', ok: true }, { now: NOW, env: {} });
  const got = lines(dir);
  assert.equal(got.length, 2);
  assert.equal(got[1].kind, 'agent-stop');
});

test('GREAT_CTO_DISABLE_EVENTS=1 records nothing, and says so', () => {
  const dir = stateDir();
  const r = appendEvent(dir, { kind: 'stop' }, { now: NOW, env: { GREAT_CTO_DISABLE_EVENTS: '1' } });
  assert.equal(r.ok, false);
  assert.match(r.why, /disabled/);
  assert.ok(!existsSync(join(dir, EVENTS_FILE)));
});

test('the file rotates at its cap and keeps one previous generation', () => {
  const dir = stateDir();
  for (let i = 0; i < 40; i++) appendEvent(dir, { kind: 'tool', tool: 'Read', paths: [`src/file-${i}.mjs`] }, { now: NOW, env: {}, maxBytes: 1024 });
  assert.ok(statSync(join(dir, EVENTS_FILE)).size <= 1024 + 400, 'the live file stays near its cap');
  assert.ok(existsSync(join(dir, 'events.1.jsonl')), 'one previous generation is kept');
});

test('the cap is bytes: paths in Cyrillic do not let the file grow past it', () => {
  // A character count under-measures a two-byte alphabet by half, and the board's
  // replay cursor is a byte offset into this file.
  const dir = stateDir();
  const path = `docs/${'обзор'.repeat(30)}.md`;     // 150 letters, ~300 bytes
  // Checked after every append, not once at the end: an over-cap generation can
  // rotate away and leave a small remainder that passes a final check.
  for (let i = 0; i < 20; i++) {
    appendEvent(dir, { kind: 'tool', tool: 'Edit', paths: [path] }, { now: NOW + i, env: {}, maxBytes: 1024 });
    const size = statSync(join(dir, EVENTS_FILE)).size;
    assert.ok(size <= 1024, `after append ${i + 1} the live file is ${size} bytes, over its 1024-byte cap`);
  }
});

test('a directory that cannot be written returns a reason instead of throwing', () => {
  const dir = stateDir();
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o500);
  let r;
  assert.doesNotThrow(() => { r = appendEvent(dir, { kind: 'stop' }, { now: NOW, env: {} }); });
  assert.equal(r.ok, false);
  assert.ok(r.why);
});

// ── reading: three states ──────────────────────────────────────────────────

test('no file is "none" — not an idle agent, and not an error', () => {
  const r = readEvents(stateDir());
  assert.equal(r.state, 'none');
  assert.deepEqual(r.events, []);
});

test('events are "live", newest last, and a bad line is counted rather than fatal', () => {
  const dir = stateDir();
  appendEvent(dir, { kind: 'agent-start', agent: 'senior-dev' }, { now: NOW, env: {} });
  writeFileSync(join(dir, EVENTS_FILE), readFileSync(join(dir, EVENTS_FILE), 'utf8') + 'not json\n');
  appendEvent(dir, { kind: 'agent-stop', agent: 'senior-dev' }, { now: NOW + 1000, env: {} });
  const r = readEvents(dir, { limit: 10 });
  assert.equal(r.state, 'live');
  assert.equal(r.events.length, 2);
  assert.equal(r.events.at(-1).kind, 'agent-stop');
  assert.equal(r.bad, 1);
});

test('a file that exists but cannot be read is "unreadable", with the reason', () => {
  const dir = stateDir();
  appendEvent(dir, { kind: 'stop' }, { now: NOW, env: {} });
  chmodSync(join(dir, EVENTS_FILE), 0o000);
  const r = readEvents(dir);
  chmodSync(join(dir, EVENTS_FILE), 0o644);
  if (process.getuid && process.getuid() === 0) return;   // root reads anything; the state cannot be produced
  assert.equal(r.state, 'unreadable');
  assert.ok(r.why);
});

test('limit returns the newest events', () => {
  const dir = stateDir();
  for (let i = 0; i < 20; i++) appendEvent(dir, { kind: 'tool', tool: `T${i}` }, { now: NOW + i, env: {} });
  const r = readEvents(dir, { limit: 5 });
  assert.deepEqual(r.events.map((e) => e.tool), ['T15', 'T16', 'T17', 'T18', 'T19']);
});

// ── the CLI an inline bash hook calls ──────────────────────────────────────

test('the --emit CLI records an event and always exits 0', () => {
  const dir = stateDir();
  const cli = join(ROOT, 'scripts/lib/agent-events.mjs');
  const ok = spawnSync(process.execPath, [cli, '--emit', 'denied', '--tool', 'Bash'], { env: { ...process.env, GREAT_CTO_DIR: dir }, encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.equal(lines(dir)[0].kind, 'denied');
  assert.equal(lines(dir)[0].tool, 'Bash');
  const bad = spawnSync(process.execPath, [cli, '--emit', 'not-a-kind'], { env: { ...process.env, GREAT_CTO_DIR: dir }, encoding: 'utf8' });
  assert.equal(bad.status, 0, 'a hook must never fail because an event was malformed');
});
