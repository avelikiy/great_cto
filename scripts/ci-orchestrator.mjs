#!/usr/bin/env node
// ci-orchestrator.mjs — run the great_cto full gate on the owner's local CI
// orchestrator and wait for a verdict bound to one exact commit.
//
//   node scripts/ci-orchestrator.mjs <sha|worktree> <label> [options]
//
//   --ref <ref>          ref the commit is on, as the orchestrator sees it
//                        (default: main; refs/pull/N/merge for a PR merge result)
//   --project <name>     orchestrator project (default: great_cto)
//   --out-dir <dir>      where gate-<label>.out and gates/<label>.log go
//                        (default: ~/.great_cto/release-chains)
//   --timeout-min <n>    give up waiting after n minutes (default: 150)
//   --allow-skips        accept "GREEN, N TEST(S) SKIPPED" as rc=0
//
// Environment: CI_ORCH_URL (the listener, https://host:port), CI_ORCH_TOKEN
// (never printed), NODE_EXTRA_CA_CERTS for the listener's self-signed certificate.
//
// Output contract: the same as gate-any.sh / remote-gate.sh, so a release or merge
// chain switches runner by switching the command and nothing else:
//   gate-<label>.out   "HEAD <sha>", "RUN <id>", "=== HH:MM gate start",
//                      "STOP: <why>" on any refusal, "=== HH:MM gate rc=N"
//   gates/<label>.log  the gate job's full log
//
// Exit codes — never 0 unless the gate ran on THIS commit and said green:
//   0 green   1 red   2 orchestrator unreachable / refused   3 timed out
//   4 cancelled   5 green with skips (without --allow-skips)   6 no verdict
//   (the run ended "succeeded" but the log has no banner or names another commit)
//
// Why a verdict check on top of the orchestrator's status: a run whose every job
// SKIPPED ends `succeeded` there, and ci-local exits 0 when tests were skipped.
// Both are "not checked", and neither may reach a merge as a pass.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isMainModule } from './lib/is-main.mjs';

export const PIPELINE_PATH = 'ci/orchestrator/gate.yml';
export const GATE_JOB = 'gate';
export const RC = Object.freeze({ GREEN: 0, RED: 1, UNREACHABLE: 2, TIMEOUT: 3, CANCELLED: 4, SKIPPED: 5, NO_VERDICT: 6 });

const GREEN_BANNER = 'CI-LOCAL: ALL GATES GREEN';
const SKIP_BANNER = /CI-LOCAL: GREEN, (\d+) TEST\(S\) SKIPPED/;
const RED_BANNER = 'CI-LOCAL: FAILURES ABOVE';

export function parseArgs(argv) {
  const opts = { ref: 'main', project: 'great_cto', outDir: join(homedir(), '.great_cto', 'release-chains'),
    timeoutMin: 150, allowSkips: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === '--ref') opts.ref = next();
    else if (a === '--project') opts.project = next();
    else if (a === '--out-dir') opts.outDir = next();
    else if (a === '--timeout-min') opts.timeoutMin = Number(next());
    else if (a === '--allow-skips') opts.allowSkips = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else pos.push(a);
  }
  if (pos.length !== 2) throw new Error('usage: ci-orchestrator.mjs <sha|worktree> <label> [--ref r] [--project p] [--out-dir d] [--timeout-min n] [--allow-skips]');
  if (!/^[A-Za-z0-9._-]+$/.test(pos[1])) throw new Error(`label must be [A-Za-z0-9._-]: ${pos[1]}`);
  if (!Number.isFinite(opts.timeoutMin) || opts.timeoutMin <= 0) throw new Error('--timeout-min must be a positive number');
  [opts.src, opts.label] = pos;
  return opts;
}

/** The commit to gate and the pipeline text AT that commit. */
export function resolveCommit(src, { git = defaultGit } = {}) {
  const isDir = existsSync(src) && statSync(src).isDirectory();
  const cwd = isDir ? src : process.cwd();
  const sha = git(['rev-parse', '--verify', `${isDir ? 'HEAD' : src}^{commit}`], cwd).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`not a commit: ${src}`);
  let yaml;
  try { yaml = git(['show', `${sha}:${PIPELINE_PATH}`], cwd); }
  catch { throw new Error(`${PIPELINE_PATH} is not in commit ${sha.slice(0, 12)} — nothing to submit`); }
  return { sha, yaml };
}

function defaultGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function submitBody({ project, ref, sha, yaml, label }) {
  return { project, ref, sha, yaml, event: 'push', idempotency_key: `great-cto-gate-${sha}-${label}` };
}

/**
 * The verdict from the orchestrator's final answer and the gate job's log.
 * Pure: every branch is a test case.
 */
export function verdict({ sha, run, jobs, log, allowSkips = false }) {
  if (!run) return { rc: RC.NO_VERDICT, why: 'no run in the answer' };
  if (run.sha && run.sha !== sha) return { rc: RC.NO_VERDICT, why: `the run is for ${String(run.sha).slice(0, 12)}, not ${sha.slice(0, 12)}` };
  if (run.status === 'cancelled') return { rc: RC.CANCELLED, why: 'run cancelled' };
  const gate = (jobs || []).find((j) => j.job_id === GATE_JOB);
  if (!gate) return { rc: RC.NO_VERDICT, why: `no "${GATE_JOB}" job in the run` };
  if (gate.status === 'timed_out') return { rc: RC.TIMEOUT, why: 'gate job timed out on the orchestrator' };
  if (gate.status === 'skipped') return { rc: RC.NO_VERDICT, why: 'gate job was skipped — not checked' };
  const text = log || '';
  const headLine = text.match(/^HEAD ([0-9a-f]{40})\s*$/m);
  if (gate.status !== 'succeeded' || run.status !== 'succeeded') {
    return { rc: RC.RED, why: `gate job ${gate.status}${text.includes(RED_BANNER) ? ' — failures in the log' : ''}${gate.error ? `: ${gate.error}` : ''}` };
  }
  if (!headLine) return { rc: RC.NO_VERDICT, why: 'the log does not say which commit it gated' };
  if (headLine[1] !== sha) return { rc: RC.NO_VERDICT, why: `the log gated ${headLine[1].slice(0, 12)}, not ${sha.slice(0, 12)}` };
  if (text.includes(GREEN_BANNER)) return { rc: RC.GREEN, why: 'all gates green' };
  const skip = text.match(SKIP_BANNER);
  if (skip) return allowSkips ? { rc: RC.GREEN, why: `green, ${skip[1]} skipped (accepted by --allow-skips)` }
    : { rc: RC.SKIPPED, why: `green but ${skip[1]} test(s) skipped — not checked` };
  return { rc: RC.NO_VERDICT, why: 'run succeeded but the log has no ci-local verdict' };
}

/** A small client over the orchestrator's HTTP API. `fetchImpl` is injectable for tests. */
export function client({ url, token, fetchImpl = globalThis.fetch }) {
  const base = String(url || '').replace(/\/+$/, '');
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  async function call(method, path, body) {
    const res = await fetchImpl(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return res;
  }
  return {
    async submit(body) {
      const res = await call('POST', '/v1/runs', body);
      const data = await res.json().catch(() => ({}));
      if (res.status !== 200 && res.status !== 202) {
        const e = new Error(`submit refused: HTTP ${res.status} ${data.error || data.message || ''}`.trim());
        e.refused = true; throw e;
      }
      return data;
    },
    async status(id, wait = 60) {
      const res = await call('GET', `/v1/runs/${id}?wait=${wait}`);
      if (res.status !== 200) throw new Error(`run ${id}: HTTP ${res.status}`);
      return res.json();
    },
    async log(jobId) {
      let offset = 0; let out = '';
      for (let i = 0; i < 10000; i++) {
        const res = await call('GET', `/v1/jobs/${jobId}/log?offset=${offset}`);
        if (res.status !== 200) throw new Error(`job ${jobId} log: HTTP ${res.status}`);
        const chunk = await res.text();
        out += chunk;
        const next = Number(res.headers.get('x-log-offset'));
        const done = res.headers.get('x-job-done') === 'true';
        if (done || !chunk || !Number.isFinite(next) || next <= offset) break;
        offset = next;
      }
      return out;
    },
  };
}

const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Submit, follow, decide. Writes the .out/.log files and returns the rc.
 * `now`/`sleep` are injectable so tests do not wait.
 */
export async function runGate(opts, deps = {}) {
  const { api, resolve = resolveCommit, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxNetErrors = 5 } = deps;
  mkdirSync(join(opts.outDir, 'gates'), { recursive: true });
  const outFile = join(opts.outDir, `gate-${opts.label}.out`);
  const logFile = join(opts.outDir, 'gates', `${opts.label}.log`);
  writeFileSync(outFile, '');
  const say = (line) => appendFileSync(outFile, `${line}\n`);
  const finish = (rc, why) => { if (why) say(rc === RC.GREEN ? `OK: ${why}` : `STOP: ${why}`); say(`=== ${hhmm()} gate rc=${rc}`); return rc; };

  let commit;
  try { commit = resolve(opts.src); } catch (e) { return finish(RC.NO_VERDICT, e.message); }
  say(`HEAD ${commit.sha}`);
  if (!api) return finish(RC.UNREACHABLE, 'CI_ORCH_URL / CI_ORCH_TOKEN not set — the gate did not run');

  let sub;
  try { sub = await api.submit(submitBody({ ...opts, ...commit })); }
  catch (e) { return finish(RC.UNREACHABLE, e.refused ? e.message : `orchestrator unreachable: ${e.message}`); }
  if (!sub || sub.run_id == null) return finish(RC.UNREACHABLE, 'submit answered without a run id');
  if (sub.sha && sub.sha !== commit.sha) return finish(RC.NO_VERDICT, `orchestrator resolved ${String(sub.sha).slice(0, 12)}, not ${commit.sha.slice(0, 12)}`);
  say(`RUN ${sub.run_id}${sub.existing || sub.idempotent_replay ? ' (existing run for this commit)' : ''}`);

  const deadline = now() + opts.timeoutMin * 60_000;
  let started = false; let netErrors = 0; let last;
  while (true) {
    if (now() > deadline) return finish(RC.TIMEOUT, `no verdict after ${opts.timeoutMin} min — run ${sub.run_id} left as it is`);
    try { last = await api.status(sub.run_id, 60); netErrors = 0; }
    catch (e) {
      if (++netErrors >= maxNetErrors) return finish(RC.UNREACHABLE, `lost the orchestrator while waiting: ${e.message}`);
      await sleep(15_000); continue;
    }
    const gate = (last.jobs || []).find((j) => j.job_id === GATE_JOB);
    if (!started && gate && gate.status === 'running') { started = true; say(`=== ${hhmm()} gate start`); }
    if (last.run && last.run.status !== 'running') break;
  }

  const gate = (last.jobs || []).find((j) => j.job_id === GATE_JOB);
  let log = '';
  if (gate && gate.id != null) {
    try { log = await api.log(gate.id); writeFileSync(logFile, log); }
    catch (e) { say(`WARN: could not read the gate log: ${e.message}`); }
  }
  const v = verdict({ sha: commit.sha, run: last.run, jobs: last.jobs, log, allowSkips: opts.allowSkips });
  return finish(v.rc, v.why);
}

async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(64); }
  const url = process.env.CI_ORCH_URL; const token = process.env.CI_ORCH_TOKEN;
  const api = url && token ? client({ url, token }) : null;
  const rc = await runGate(opts, { api });
  console.log(`gate ${opts.label}: rc=${rc} (see ${join(opts.outDir, `gate-${opts.label}.out`)})`);
  process.exit(rc);
}

if (isMainModule(import.meta.url)) main();
