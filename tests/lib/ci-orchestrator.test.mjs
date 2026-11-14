// The the orchestrator adapter may only say "green" when the gate ran on THIS commit and
// ci-local printed its green banner. Every other ending — skipped job, all-skipped
// run, a log for another commit, skips, an unreachable orchestrator — is a
// distinct non-zero code. These tests drive the adapter against a fake API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  parseArgs, verdict, submitBody, runGate, client, resolveCommit, RC, PIPELINE_PATH,
} from '../../scripts/ci-orchestrator.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const greenLog = `HEAD ${SHA}\n...\n CI-LOCAL: ALL GATES GREEN \n`;
const done = (status, gateStatus = status) => ({ run: { id: 7, sha: SHA, status }, jobs: [{ id: 70, job_id: 'gate', status: gateStatus }] });

test('verdict: green only with the banner and the right HEAD', () => {
  assert.equal(verdict({ sha: SHA, ...done('succeeded'), log: greenLog }).rc, RC.GREEN);
});

test('verdict: a skipped gate job is not a pass, even when the run "succeeded"', () => {
  const v = verdict({ sha: SHA, ...done('succeeded', 'skipped'), log: '' });
  assert.equal(v.rc, RC.NO_VERDICT);
  assert.match(v.why, /skipped/);
});

test('verdict: succeeded without a banner is no verdict', () => {
  assert.equal(verdict({ sha: SHA, ...done('succeeded'), log: `HEAD ${SHA}\n` }).rc, RC.NO_VERDICT);
});

test('verdict: a log that gated another commit is no verdict', () => {
  const v = verdict({ sha: SHA, ...done('succeeded'), log: greenLog.replace(SHA, OTHER) });
  assert.equal(v.rc, RC.NO_VERDICT);
  assert.match(v.why, /bbbbbbbbbbbb/);
});

test('verdict: a run for another sha is no verdict', () => {
  const r = done('succeeded'); r.run.sha = OTHER;
  assert.equal(verdict({ sha: SHA, ...r, log: greenLog }).rc, RC.NO_VERDICT);
});

test('verdict: skips are rc 5 unless --allow-skips', () => {
  const log = `HEAD ${SHA}\n CI-LOCAL: GREEN, 2 TEST(S) SKIPPED — NOT CHECKED \n`;
  assert.equal(verdict({ sha: SHA, ...done('succeeded'), log }).rc, RC.SKIPPED);
  assert.equal(verdict({ sha: SHA, ...done('succeeded'), log, allowSkips: true }).rc, RC.GREEN);
});

test('verdict: red, timed out, cancelled, missing job', () => {
  assert.equal(verdict({ sha: SHA, ...done('failed'), log: 'CI-LOCAL: FAILURES ABOVE' }).rc, RC.RED);
  assert.equal(verdict({ sha: SHA, ...done('failed', 'timed_out'), log: '' }).rc, RC.TIMEOUT);
  assert.equal(verdict({ sha: SHA, ...done('cancelled'), log: '' }).rc, RC.CANCELLED);
  assert.equal(verdict({ sha: SHA, run: { sha: SHA, status: 'succeeded' }, jobs: [], log: greenLog }).rc, RC.NO_VERDICT);
  // A green banner in the log never overrides a failed job.
  assert.equal(verdict({ sha: SHA, ...done('failed', 'lost'), log: greenLog }).rc, RC.RED);
});

test('parseArgs: defaults, options, refusals', () => {
  const o = parseArgs([SHA, 'pr12-x']);
  assert.equal(o.ref, 'main'); assert.equal(o.project, 'great_cto'); assert.equal(o.allowSkips, false);
  const p = parseArgs([SHA, 'l', '--ref', 'refs/pull/3/merge', '--allow-skips', '--timeout-min', '5']);
  assert.equal(p.ref, 'refs/pull/3/merge'); assert.equal(p.allowSkips, true); assert.equal(p.timeoutMin, 5);
  assert.throws(() => parseArgs([SHA]), /usage/);
  assert.throws(() => parseArgs([SHA, 'bad label']), /label/);
  assert.throws(() => parseArgs([SHA, 'l', '--nope']), /unknown/);
});

test('submitBody: pins sha, inline yaml, stable idempotency key', () => {
  const b = submitBody({ project: 'great_cto', ref: 'main', sha: SHA, yaml: 'name: x', label: 'l1' });
  assert.deepEqual(b, { project: 'great_cto', ref: 'main', sha: SHA, yaml: 'name: x', event: 'push', idempotency_key: `great-cto-gate-${SHA}-l1` });
});

// ── runGate against a fake API ──

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'corch-'));
  const opts = { src: SHA, label: 't1', ref: 'main', project: 'great_cto', outDir: dir, timeoutMin: 1, allowSkips: false };
  const resolve = () => ({ sha: SHA, yaml: 'name: gate' });
  const out = () => readFileSync(join(dir, 'gate-t1.out'), 'utf8');
  return { dir, opts, resolve, out, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function fakeApi(statuses, { log = greenLog, submit } = {}) {
  const calls = { submit: [], status: 0 };
  return {
    calls,
    submit: async (b) => { calls.submit.push(b); if (submit) return submit(b); return { run_id: 7, sha: SHA }; },
    status: async () => { const s = statuses[Math.min(calls.status, statuses.length - 1)]; calls.status++; if (s instanceof Error) throw s; return s; },
    log: async () => log,
  };
}

const running = { run: { id: 7, sha: SHA, status: 'running' }, jobs: [{ id: 70, job_id: 'gate', status: 'running' }] };

test('runGate: green run writes the gate-any output contract', async () => {
  const s = setup();
  try {
    const api = fakeApi([running, done('succeeded')]);
    const rc = await runGate(s.opts, { api, resolve: s.resolve, sleep: async () => {} });
    assert.equal(rc, 0);
    const out = s.out();
    assert.match(out, new RegExp(`^HEAD ${SHA}$`, 'm'));
    assert.match(out, /^RUN 7$/m);
    assert.match(out, /=== \d\d:\d\d gate start/);
    assert.match(out, /=== \d\d:\d\d gate rc=0$/m);
    assert.equal(readFileSync(join(s.dir, 'gates', 't1.log'), 'utf8'), greenLog);
    assert.equal(api.calls.submit[0].sha, SHA);
  } finally { s.cleanup(); }
});

test('runGate: no token means rc 2 and the gate did not run', async () => {
  const s = setup();
  try {
    const rc = await runGate(s.opts, { api: null, resolve: s.resolve });
    assert.equal(rc, RC.UNREACHABLE);
    assert.match(s.out(), /STOP: .*did not run/);
    assert.match(s.out(), /gate rc=2/);
  } finally { s.cleanup(); }
});

test('runGate: refused or unreachable submit is rc 2, never green', async () => {
  const s = setup();
  try {
    const api = fakeApi([], { submit: () => { const e = new Error('submit refused: HTTP 403'); e.refused = true; throw e; } });
    assert.equal(await runGate(s.opts, { api, resolve: s.resolve }), RC.UNREACHABLE);
    assert.match(s.out(), /HTTP 403/);
  } finally { s.cleanup(); }
});

test('runGate: orchestrator resolving another sha is refused before waiting', async () => {
  const s = setup();
  try {
    const api = fakeApi([], { submit: () => ({ run_id: 9, sha: OTHER }) });
    assert.equal(await runGate(s.opts, { api, resolve: s.resolve }), RC.NO_VERDICT);
    assert.equal(api.calls.status, 0);
  } finally { s.cleanup(); }
});

test('runGate: losing the orchestrator mid-run is rc 2 after retries', async () => {
  const s = setup();
  try {
    const api = fakeApi([running, new Error('ECONNREFUSED')]);
    const rc = await runGate(s.opts, { api, resolve: s.resolve, sleep: async () => {}, maxNetErrors: 3 });
    assert.equal(rc, RC.UNREACHABLE);
    assert.match(s.out(), /lost the orchestrator/);
  } finally { s.cleanup(); }
});

test('runGate: a transient error then recovery still reaches the verdict', async () => {
  const s = setup();
  try {
    const api = fakeApi([running, new Error('reset'), done('succeeded')]);
    assert.equal(await runGate(s.opts, { api, resolve: s.resolve, sleep: async () => {} }), 0);
  } finally { s.cleanup(); }
});

test('runGate: deadline passes while running → rc 3', async () => {
  const s = setup();
  try {
    let t = 0;
    const api = fakeApi([running]);
    const rc = await runGate(s.opts, { api, resolve: s.resolve, now: () => (t += 30_000), sleep: async () => {} });
    assert.equal(rc, RC.TIMEOUT);
  } finally { s.cleanup(); }
});

test('runGate: missing pipeline file in the commit is no verdict, nothing submitted', async () => {
  const s = setup();
  try {
    const api = fakeApi([]);
    const rc = await runGate(s.opts, { api, resolve: () => { throw new Error(`${PIPELINE_PATH} is not in commit`); } });
    assert.equal(rc, RC.NO_VERDICT);
    assert.equal(api.calls.submit.length, 0);
  } finally { s.cleanup(); }
});

// ── client: HTTP shape and log paging ──

test('client: bearer header, submit body, paged log until X-Job-Done', async () => {
  const seen = [];
  const pages = [['part1-', '6', 'false'], ['part2', '11', 'true']];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    if (url.endsWith('/v1/runs') && init.method === 'POST') return new Response(JSON.stringify({ run_id: 3, sha: SHA }), { status: 202 });
    if (url.includes('/log')) {
      const [body, off, d] = pages.shift();
      return new Response(body, { status: 200, headers: { 'x-log-offset': off, 'x-job-done': d } });
    }
    return new Response('{}', { status: 404 });
  };
  const c = client({ url: 'https://gg.test:7444/', token: 'ggr_x_y', fetchImpl });
  const r = await c.submit({ project: 'p' });
  assert.equal(r.run_id, 3);
  assert.equal(seen[0].url, 'https://gg.test:7444/v1/runs');
  assert.equal(seen[0].init.headers.authorization, 'Bearer ggr_x_y');
  assert.equal(await c.log(70), 'part1-part2');
  assert.match(seen[2].url, /offset=6$/);
  await assert.rejects(c.status(1), /HTTP 404/);
});

test('client: a 4xx submit is marked refused', async () => {
  const c = client({ url: 'https://gg.test', token: 't', fetchImpl: async () => new Response(JSON.stringify({ error: 'no such project' }), { status: 404 }) });
  await assert.rejects(c.submit({}), (e) => e.refused === true && /no such project/.test(e.message));
});

// ── resolveCommit reads the pipeline from the commit, not the working tree ──

test('resolveCommit: pipeline text comes from the gated commit', () => {
  const repo = mkdtempSync(join(tmpdir(), 'corch-repo-'));
  try {
    const g = (...a) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: repo, encoding: 'utf8' });
    g('init', '-q');
    execFileSync('mkdir', ['-p', join(repo, 'ci/orchestrator')]);
    execFileSync('sh', ['-c', `printf 'name: committed\n' > ci/orchestrator/gate.yml`], { cwd: repo });
    g('add', '.'); g('commit', '-qm', 'one');
    execFileSync('sh', ['-c', `printf 'name: dirty\n' > ci/orchestrator/gate.yml`], { cwd: repo });
    const { sha, yaml } = resolveCommit(repo);
    assert.match(sha, /^[0-9a-f]{40}$/);
    assert.equal(yaml, 'name: committed\n');
    assert.ok(existsSync(join(repo, 'ci/orchestrator/gate.yml')));
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
