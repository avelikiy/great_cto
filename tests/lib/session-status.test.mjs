// Which sessions wait for a person — from Notification / Stop / UserPromptSubmit.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, utimesSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { recordHookEvent, readSessionStatus, STALE_WORKING_MS } from '../../scripts/lib/session-status.mjs';

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
function project() {
  const d = mkdtempSync(join(tmpdir(), 'sess-status-'));
  made.push(d);
  mkdirSync(join(d, '.great_cto'), { recursive: true });
  const tx = join(d, 't.jsonl');
  writeFileSync(tx, '{}\n');
  return { d, tx };
}
const T0 = Date.parse('2026-09-22T10:00:00Z');
const touch = (f, ms) => utimesSync(f, new Date(ms), new Date(ms));

test('a permission prompt is blocked, with the prompt as the reason', () => {
  const { d, tx } = project();
  touch(tx, T0 - 1000);
  recordHookEvent({ cwd: d, session_id: 'abc123', hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt', transcript_path: tx }, { now: T0 });
  const [s] = readSessionStatus(d, { now: T0 + 60_000 });
  assert.equal(s.state, 'blocked');
  assert.equal(s.reason, 'Claude needs your permission to use Bash');
  assert.equal(s.kind, 'permission_prompt');
});

test('blocked turns into working once the transcript moves — a granted prompt fires no event', () => {
  const { d, tx } = project();
  recordHookEvent({ cwd: d, session_id: 's1', hook_event_name: 'Notification', message: 'x', transcript_path: tx }, { now: T0 });
  touch(tx, T0 + 30_000);
  assert.equal(readSessionStatus(d, { now: T0 + 31_000 })[0].state, 'working');
});

test('a turn that ended is waiting; the next prompt makes it working; working with a silent transcript goes unknown', () => {
  const { d, tx } = project();
  touch(tx, T0);
  recordHookEvent({ cwd: d, session_id: 's2', hook_event_name: 'Stop', transcript_path: tx }, { now: T0 });
  assert.equal(readSessionStatus(d, { now: T0 + 5000 })[0].state, 'waiting');
  recordHookEvent({ cwd: d, session_id: 's2', hook_event_name: 'UserPromptSubmit', transcript_path: tx }, { now: T0 + 10_000 });
  assert.equal(readSessionStatus(d, { now: T0 + 20_000 })[0].state, 'working');
  assert.equal(readSessionStatus(d, { now: T0 + 10_000 + STALE_WORKING_MS + 1 })[0].state, 'unknown');
});

test('SessionEnd removes the session; blocked sorts first', () => {
  const { d, tx } = project();
  recordHookEvent({ cwd: d, session_id: 'a', hook_event_name: 'Stop', transcript_path: tx }, { now: T0 });
  recordHookEvent({ cwd: d, session_id: 'b', hook_event_name: 'Notification', message: 'm', transcript_path: tx }, { now: T0 });
  touch(tx, T0 - 5000);
  assert.deepEqual(readSessionStatus(d, { now: T0 + 1000 }).map((x) => x.session), ['b', 'a']);
  recordHookEvent({ cwd: d, session_id: 'a', hook_event_name: 'SessionEnd' });
  assert.deepEqual(readSessionStatus(d, { now: T0 + 1000 }).map((x) => x.session), ['b']);
});

test('outside a great_cto project nothing is written; a session id cannot escape the directory', () => {
  const plain = mkdtempSync(join(tmpdir(), 'sess-plain-'));
  made.push(plain);
  assert.equal(recordHookEvent({ cwd: plain, session_id: 'x', hook_event_name: 'Stop' }), null);
  assert.equal(existsSync(join(plain, '.great_cto')), false);
  const { d } = project();
  recordHookEvent({ cwd: d, session_id: '../../evil', hook_event_name: 'Stop' }, { now: T0 });
  assert.ok(existsSync(join(d, '.great_cto', 'status', 'evil.json')));
});

test('the hook script reads the payload from stdin and always exits 0', () => {
  const { d, tx } = project();
  const hook = resolve('scripts/hooks/session-status.mjs');
  const ok = spawnSync(process.execPath, [hook], { input: JSON.stringify({ cwd: d, session_id: 'h1', hook_event_name: 'Notification', message: 'waiting', transcript_path: tx }), encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout, '');
  assert.equal(JSON.parse(readFileSync(join(d, '.great_cto', 'status', 'h1.json'), 'utf8')).state, 'blocked');
  assert.equal(spawnSync(process.execPath, [hook], { input: 'not json', encoding: 'utf8' }).status, 0);
});

test('the plugin subscribes the hook to the four events', () => {
  const plugin = JSON.parse(readFileSync(resolve('.claude-plugin/plugin.json'), 'utf8'));
  for (const ev of ['Notification', 'Stop', 'UserPromptSubmit', 'SessionEnd']) {
    const cmds = (plugin.hooks[ev] || []).flatMap((h) => h.hooks.map((x) => x.command));
    assert.ok(cmds.some((c) => c.includes('scripts/hooks/session-status.mjs')), ev);
  }
});
