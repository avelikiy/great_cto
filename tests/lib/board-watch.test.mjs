// One blocking wait instead of a polling loop — and it returns only what needs the caller.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { waitForChange, diffSnapshots } from '../../scripts/lib/board-watch.mjs';
import { recordHookEvent } from '../../scripts/lib/session-status.mjs';

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
function project() {
  const d = mkdtempSync(join(tmpdir(), 'board-watch-'));
  made.push(d);
  mkdirSync(join(d, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(d, '.great_cto', 'verdicts', 'architect.log'), `${JSON.stringify({ v: 1, ts: '2026-09-22T09:00:00Z', agent: 'architect', verdict: 'APPROVED' })}\n`);
  return d;
}
const verdict = (d, agent, v, ts) => appendFileSync(join(d, '.great_cto', 'verdicts', `${agent}.log`), `${JSON.stringify({ v: 1, ts, agent, verdict: v })}\n`);

test('the first call answers at once with a cursor and no changes', async () => {
  const r = await waitForChange({ cwd: project() });
  assert.equal(r.changes.length, 0);
  assert.equal(r.timedOut, false);
  assert.ok(r.cursor.length > 10);
});

test('a wait returns when a verdict lands, with its value — not before', async () => {
  const d = project();
  const { cursor } = await waitForChange({ cwd: d });
  const t0 = Date.now();
  setTimeout(() => verdict(d, 'qa-engineer', 'BLOCKED', '2026-09-22T10:00:00Z'), 300);
  const r = await waitForChange({ cwd: d, since: cursor, timeoutS: 10, pollMs: 50 });
  assert.ok(Date.now() - t0 >= 250, 'it waited');
  assert.deepEqual(r.changes, [{ type: 'verdict', agent: 'qa-engineer', verdict: 'BLOCKED', kind: 'negative', ts: '2026-09-22T10:00:00Z' }]);
  const again = await waitForChange({ cwd: d, since: r.cursor, timeoutS: 1, pollMs: 50 });
  assert.equal(again.timedOut, true, 'the same change is not reported twice');
});

test('a change made between two calls is not missed', async () => {
  const d = project();
  const { cursor } = await waitForChange({ cwd: d });
  verdict(d, 'senior-dev', 'DONE', '2026-09-22T11:00:00Z');
  const r = await waitForChange({ cwd: d, since: cursor, timeoutS: 1, pollMs: 50 });
  assert.equal(r.changes[0].agent, 'senior-dev');
});

test('a session blocked on a prompt comes first', () => {
  const prev = { verdicts: {}, blocked: {} };
  const next = { verdicts: { qa: { verdict: 'PASS', ts: 't', kind: 'positive' }, sec: { verdict: 'BLOCKED', ts: 't', kind: 'negative' } }, blocked: { s1: { since: 't', reason: 'permission' } } };
  assert.deepEqual(diffSnapshots(prev, next).map((c) => c.type + ':' + (c.agent || c.session)), ['blocked:s1', 'verdict:sec', 'verdict:qa']);
});

test('the session-status hook feeds it', async () => {
  const d = project();
  const { cursor } = await waitForChange({ cwd: d });
  recordHookEvent({ cwd: d, session_id: 'abc', hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' });
  const r = await waitForChange({ cwd: d, since: cursor, timeoutS: 1, pollMs: 50 });
  assert.equal(r.changes[0].type, 'blocked');
  assert.match(r.changes[0].reason, /permission/);
});

test('an unreadable cursor gets a fresh one, not an error and not a false change', async () => {
  const r = await waitForChange({ cwd: project(), since: 'garbage' });
  assert.deepEqual(r.changes, []);
  assert.match(r.note, /unreadable cursor/);
});
