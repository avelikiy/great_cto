// The three instant triggers of design v16: agent.blocked, gate.local_red and
// gate.waiting. Detectors are pure; the sweep is driven directly with stub
// senders against a throwaway GREAT_CTO_HOME, so nothing reaches a relay.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const NOW = Date.parse('2026-11-06T12:00:00Z');
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000; const HOUR = 60 * MIN;

const state = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-instant-'));
process.env.GREAT_CTO_HOME = state;
const ia = await import('./lib/instant-alerts.mjs');
const { sweepInstantAlerts } = await import('./lib/alerts.mjs');
after(() => fs.rmSync(state, { recursive: true, force: true }));

test('agent.blocked: a permission prompt alerts; a finished turn (idle_prompt) and old or other states do not', () => {
  const ev = ia.blockedAgentEvents('proj', [
    { session: 's1', state: 'blocked', kind: 'permission_prompt', reason: 'Claude needs your permission to use Bash', since: iso(MIN) },
    { session: 's2', state: 'blocked', kind: 'idle_prompt', reason: 'Claude is waiting for your input', since: iso(MIN) },
    { session: 's3', state: 'waiting', since: iso(MIN) },
    { session: 's4', state: 'blocked', since: iso(25 * HOUR) },
  ], { now: NOW });
  assert.deepEqual(ev.map((e) => e.dedupeKey), [`agent.blocked:proj:s1:${iso(MIN)}`]);
  assert.match(ev[0].payload.title, /An agent is blocked/);
  assert.match(ev[0].payload.body, /Nothing is approved from a notification/);
  // the same session blocked again later is a new instance
  const again = ia.blockedAgentEvents('proj', [{ session: 's1', state: 'blocked', since: iso(0) }], { now: NOW });
  assert.notEqual(again[0].dedupeKey, ev[0].dedupeKey);
});

test('gate.local_red: only red runs from the last 24h, naming the failed steps', () => {
  const ev = ia.redGateRunEvents('proj', [
    { ts: iso(5 * MIN), result: 'red', branch: 'feat/x', sha: 'abc1234', failed: ['lib tests', 'board e2e (browser)'] },
    { ts: iso(5 * MIN), result: 'green', branch: 'feat/y', sha: 'def5678', failed: [] },
    { ts: iso(25 * HOUR), result: 'red', branch: 'old', sha: '0000000', failed: [] },
    { result: 'red' },
  ], { now: NOW });
  assert.equal(ev.length, 1);
  assert.match(ev[0].payload.title, /feat\/x @ abc1234/);
  assert.match(ev[0].payload.body, /lib tests/);
  assert.equal(ia.redGateRunEvents('proj', null, { now: NOW }).length, 0, 'an unread log sends nothing, it does not invent runs');
});

test('gate.waiting: an open gate younger than 2h, once per gate; older gates are left to gate.stale', () => {
  const ev = ia.waitingGateEvents('proj', [
    { id: 'g1', is_gate: true, raw_status: 'open', title: 'gate:ship x', created_at: iso(3 * MIN) },
    { id: 'g2', is_gate: true, raw_status: 'open', title: 'old gate', created_at: iso(3 * HOUR) },
    { id: 'g3', is_gate: true, raw_status: 'closed', title: 'done gate', created_at: iso(MIN) },
    { id: 't1', is_gate: false, raw_status: 'open', title: 'task', created_at: iso(MIN) },
  ], { now: NOW });
  assert.deepEqual(ev.map((e) => e.dedupeKey), ['gate.waiting:proj:g1']);
  assert.match(ev[0].payload.link, /task=g1/);
});

test('readGateRuns: missing file is no runs, unreadable is null, a bad line does not hide the rest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runs-'));
  try {
    assert.deepEqual(ia.readGateRuns(dir), []);
    fs.mkdirSync(path.join(dir, '.great_cto'));
    fs.writeFileSync(path.join(dir, '.great_cto', 'gate-runs.jsonl'), '{"result":"red","ts":"x"}\nnot json\n{"result":"green"}\n');
    assert.equal(ia.readGateRuns(dir).length, 2);
    fs.rmSync(path.join(dir, '.great_cto', 'gate-runs.jsonl'));
    fs.mkdirSync(path.join(dir, '.great_cto', 'gate-runs.jsonl')); // a directory: exists, cannot be read
    assert.equal(ia.readGateRuns(dir), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sweep: sends nothing until a trigger is ticked, then each instance once on every channel', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-proj-'));
  fs.mkdirSync(path.join(proj, '.great_cto'));
  fs.writeFileSync(path.join(proj, '.great_cto', 'gate-runs.jsonl'),
    JSON.stringify({ ts: iso(MIN), result: 'red', branch: 'b', sha: 's', failed: ['lib tests'] }) + '\n');
  const calls = [];
  const send = {
    email: async (e, k) => calls.push(['email', e, k]),
    push: async (e, k) => calls.push(['push', e, k]),
    history: (e, _p, k) => calls.push(['history', e, k]),
  };
  const opts = { now: NOW, projects: [{ slug: 'proj', path: proj }], send };
  try {
    assert.deepEqual(await sweepInstantAlerts(opts), [], 'nothing ticked: nothing sent on any channel');
    assert.equal(calls.length, 0);

    fs.writeFileSync(path.join(state, 'notifications.json'), JSON.stringify({ triggers: ['gate.local_red'] }));
    const first = await sweepInstantAlerts(opts);
    assert.equal(first.length, 1);
    assert.deepEqual(calls.map((c) => c[0]).sort(), ['email', 'history', 'push']);

    calls.length = 0;
    assert.deepEqual(await sweepInstantAlerts(opts), [], 'the next minute does not repeat it');
    assert.equal(calls.length, 0);

    // an unreadable dedupe map must not be overwritten from nothing
    const firedFile = path.join(state, 'alerts-fired.json');
    fs.writeFileSync(firedFile, '{not json');
    fs.writeFileSync(path.join(proj, '.great_cto', 'gate-runs.jsonl'),
      JSON.stringify({ ts: iso(0), result: 'red', branch: 'b', sha: 't', failed: [] }) + '\n');
    assert.deepEqual(await sweepInstantAlerts(opts), []);
    assert.equal(fs.readFileSync(firedFile, 'utf8'), '{not json');
  } finally {
    fs.rmSync(proj, { recursive: true, force: true });
    fs.rmSync(path.join(state, 'notifications.json'), { force: true });
    fs.rmSync(path.join(state, 'alerts-fired.json'), { force: true });
  }
});

test('the three triggers are offered on the page and accepted by the settings API', () => {
  const html = fs.readFileSync(path.join(HERE, 'public', 'index.html'), 'utf8');
  const routes = fs.readFileSync(path.join(HERE, 'lib', 'routes.mjs'), 'utf8');
  for (const t of ia.INSTANT_TRIGGERS) assert.match(html, new RegExp(`data-trigger="${t.replace('.', '\\.')}"[^\\n]*notif-new`));
  assert.match(routes, /KNOWN_TRIGGERS = \[[^\]]*\.\.\.INSTANT_TRIGGERS\]/);
  assert.doesNotMatch(html, /same 5 triggers/);
});

test('ci-local records its run in the MAIN checkout, also from a worktree', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-repo-'));
  const g = (args, cwd = repo) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  try {
    g(['init', '-q', '-b', 'main']);
    g(['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'init']);
    fs.mkdirSync(path.join(repo, '.great_cto'));
    fs.writeFileSync(path.join(repo, '.great_cto', 'PROJECT.md'), '# p\n');
    const wt = path.join(repo, 'wt');
    g(['worktree', 'add', '-q', '-b', 'feat/x', wt]);
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/lib/gate-run-record.mjs'), '--result', 'red', '--failed', 'lib tests\nboard e2e'], { cwd: wt, encoding: 'utf8' });
    assert.match(out, /run recorded/);
    const lines = fs.readFileSync(path.join(repo, '.great_cto', 'gate-runs.jsonl'), 'utf8').trim().split('\n');
    const rec = JSON.parse(lines.at(-1));
    assert.equal(rec.result, 'red');
    assert.equal(rec.branch, 'feat/x');
    assert.deepEqual(rec.failed, ['lib tests', 'board e2e']);
    assert.equal(fs.existsSync(path.join(wt, '.great_cto', 'gate-runs.jsonl')), false, 'not into the worktree');
    // a bad argument never fails the gate
    const r = execFileSync(process.execPath, [path.join(ROOT, 'scripts/lib/gate-run-record.mjs'), '--result', 'purple'], { cwd: wt, encoding: 'utf8' });
    assert.match(r, /run not recorded/);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});
