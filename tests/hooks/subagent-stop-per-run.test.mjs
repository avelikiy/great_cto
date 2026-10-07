// The completion check asks an agent that finished without a verdict to record
// one. On one project over 30 days it asked code-reviewer once — on 15.09 — and
// never again: 43 of 46 runs ended with no verdict and no question. Three
// defects, each tested here against the hook itself:
//
//   - "asked before" was remembered per agent NAME, forever, not per run;
//   - "a verdict exists" meant ANY verdict log touched in five minutes — a
//     parallel agent's verdict answered for this one;
//   - the remedy said `bash scripts/log-verdict.sh`, a path that exists only in
//     the great_cto repository, not in the project the agent works in.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { logVerdictCommand } from '../../scripts/lib/log-verdict-path.mjs';
import { stopRemedy } from '../../scripts/lib/stop-shape.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.resolve(HERE, '../../scripts/hooks/subagent-stop-completion.mjs');
const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

/** A project, and one agent run that finished normally (one end_turn) at `startedAgoMs`. */
function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-run-'));
  made.push(root);
  const gc = path.join(root, '.great_cto');
  fs.mkdirSync(path.join(gc, 'verdicts'), { recursive: true });
  return { root, gc };
}

function run(p, { id = 'agent-a1', agent = 'great-cto:senior-dev', startedAgoMs = 60_000 } = {}) {
  const tp = path.join(p.root, `${id}.jsonl`);
  const started = new Date(Date.now() - startedAgoMs).toISOString();
  fs.writeFileSync(tp, [
    { type: 'user', timestamp: started, message: { content: 'do the task' } },
    { type: 'assistant', timestamp: new Date().toISOString(), message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] } },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');
  return spawnSync(process.execPath, [HOOK], {
    cwd: p.root,
    input: JSON.stringify({ agent_type: agent, agent_transcript_path: tp, session_id: 's1', hook_event_name: 'SubagentStop' }),
    env: { ...process.env, GREAT_CTO_DIR: p.gc, GREAT_CTO_NO_MEASURED_COST: '1', GREAT_CTO_ENFORCE_COMPLETION: '' },
    encoding: 'utf8',
  });
}

function verdict(p, agent, agoMs) {
  const f = path.join(p.gc, 'verdicts', `${agent}.log`);
  fs.writeFileSync(f, `${JSON.stringify({ v: 1, ts: new Date(Date.now() - agoMs).toISOString().replace(/\.\d+Z$/, 'Z'), agent, verdict: 'APPROVED', cost_usd: 0.1 })}\n`);
  const t = new Date(Date.now() - agoMs);
  fs.utimesSync(f, t, t);
}

test('a parallel agent\'s fresh verdict does not answer for this one', () => {
  const p = project();
  verdict(p, 'code-reviewer', 10_000);
  const r = run(p);
  assert.equal(r.status, 2, `senior-dev wrote nothing and is asked to — stderr: ${r.stderr}`);
});

test('its own verdict, written during the run, completes it', () => {
  const p = project();
  verdict(p, 'senior-dev', 10_000);
  const r = run(p, { startedAgoMs: 60_000 });
  assert.equal(r.status, 0, r.stderr);
});

test('a fresh malformed log cannot stand in for a verdict', () => {
  const p = project();
  fs.writeFileSync(path.join(p.gc, 'verdicts', 'senior-dev.log'), 'NOT A VERDICT\n');
  assert.equal(run(p).status, 2);
});

test('a valid record for another role in this role log cannot complete it', () => {
  const p = project();
  verdict(p, 'code-reviewer', 10_000);
  fs.copyFileSync(path.join(p.gc, 'verdicts', 'code-reviewer.log'), path.join(p.gc, 'verdicts', 'senior-dev.log'));
  assert.equal(run(p).status, 2);
});

test('touching a stale record does not make it evidence for this run', () => {
  const p = project();
  verdict(p, 'senior-dev', 120_000);
  const f = path.join(p.gc, 'verdicts', 'senior-dev.log');
  fs.utimesSync(f, new Date(), new Date());
  assert.equal(run(p, { startedAgoMs: 60_000 }).status, 2);
});

test('unknown verdict words do not satisfy completion', () => {
  const p = project();
  fs.writeFileSync(path.join(p.gc, 'verdicts', 'senior-dev.log'), `${new Date().toISOString()} senior-dev NONSENSE cost=$0.1\n`);
  assert.equal(run(p).status, 2);
});

test('legacy records without an embedded role retain filename attribution', () => {
  const p = project();
  fs.writeFileSync(path.join(p.gc, 'verdicts', 'senior-dev.log'), `${new Date().toISOString()} APPROVED cost=$0.1\n`);
  assert.equal(run(p).status, 0);
});

test('a verdict from before this run started is the previous run\'s, not this one\'s', () => {
  const p = project();
  verdict(p, 'senior-dev', 120_000);
  const r = run(p, { startedAgoMs: 60_000 });
  assert.equal(r.status, 2, r.stderr);
});

test('asked once per RUN: a new run of the same agent is asked again, the same run is not', () => {
  const p = project();
  assert.equal(run(p, { id: 'agent-first' }).status, 2, 'first run asked');
  assert.equal(run(p, { id: 'agent-first' }).status, 0, 'the same run is not asked twice — no hang');
  assert.equal(run(p, { id: 'agent-second' }).status, 2, 'a later run of senior-dev is asked too');
});

test('the remedy names a log-verdict.sh that exists, by absolute path', () => {
  const p = project();
  const r = run(p);
  const cmd = logVerdictCommand();
  const file = cmd.match(/'([^']+log-verdict\.sh)'/)?.[1];
  assert.ok(file && path.isAbsolute(file) && fs.existsSync(file), `a real script: ${cmd}`);
  assert.ok(r.stderr.includes(file), `the agent is told where it is: ${r.stderr}`);
  assert.ok(!/bash scripts\/log-verdict\.sh/.test(r.stderr), 'not a path that exists only in the great_cto repository');
  assert.ok(stopRemedy({ shape: 'reported', turns: 3, agent: 'qa-engineer', hasVerdict: false }).text.includes(file));
});

test('markers of runs older than a week are cleared', () => {
  const p = project();
  const old = path.join(p.gc, '.completion-asked-senior-dev-agent-old');
  fs.writeFileSync(old, 'x');
  const t = new Date(Date.now() - 8 * 86400000);
  fs.utimesSync(old, t, t);
  run(p);
  assert.equal(fs.existsSync(old), false);
});

test('an agent starting work is told where log-verdict.sh is', () => {
  const r = spawnSync(process.execPath, [path.resolve(HERE, '../../scripts/hooks/orchestrator-check.mjs')], {
    input: JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: 'senior-dev' }), encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(logVerdictCommand()), `the command, by absolute path: ${r.stdout.slice(0, 300)}`);
});

test('every stop leaves one event saying how the run ended', () => {
  const p = project();
  const events = () => fs.readFileSync(path.join(p.gc, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.kind === 'agent-stop');
  run(p, { id: 'agent-x' });                       // finished, no verdict → sent back
  run(p, { id: 'agent-x' });                       // stops again, still none
  verdict(p, 'senior-dev', 5_000);
  run(p, { id: 'agent-y' });                       // recorded its verdict
  assert.deepEqual(events().map((e) => e.outcome), ['asked', 'no-verdict-reported', 'verdict']);
});
