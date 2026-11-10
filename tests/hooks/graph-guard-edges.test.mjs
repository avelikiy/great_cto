// ADR-039 rule 2: the edge being taken carries its contract.
//
// `produces` in shared/pipeline.toml was checked by the Codex controller before a
// transition, and on Claude Code by nothing: pipeline-dispatcher named the next
// stage whether or not the stage before it had named its output. Measured
// 2026-10-26 over local verdict logs since 2026-10-01: security-officer named its
// report in 1 of 30 successful runs — its own prompt never asked for `report=`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { edgeContract } from '../../scripts/lib/graph-guard.mjs';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'hooks', 'graph-guard.mjs');
// Hook-level fixtures are recent: rules only measure a dispatch against a verdict in scope
// (72 h, or named by the dispatch — great_cto-2u72.4).
const T0 = new Date(Date.now() - 2 * 3600e3).toISOString();
const T1 = new Date(Date.now() - 1 * 3600e3).toISOString();
const TMP = [];
after(() => { for (const d of TMP) fs.rmSync(d, { recursive: true, force: true }); });
const SANDBOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-edge-home-')); TMP.push(SANDBOX_HOME);

const GRAPH = {
  pm: { on: ['PLAN_READY', 'DONE'], produces: ['plan'], next: ['senior-dev'] },
  'senior-dev': { on: ['DONE'], produces: ['receipt'], next: ['code-reviewer', 'qa-engineer'] },
  'qa-engineer': { on: ['PASS'], produces: ['report'], next: ['devops'] },
  'code-reviewer': { on: ['APPROVED'], produces: ['receipt'], next: ['devops'] },
  architect: { on: ['APPROVED'], next: ['pm'] },
};
const rec = (ts, meta = {}, extra = {}) => ({ ts, verdict: 'X', meta, ...extra });
const latestFrom = (map) => (agent) => map[agent] ?? null;
const none = () => false;

// ── pure rule ────────────────────────────────────────────────────────────────
test('a stage dispatched after a predecessor that named nothing violates rule 2', () => {
  const r = edgeContract({ target: 'devops', graph: GRAPH, latest: latestFrom({ 'qa-engineer': rec('2026-10-20T10:00:00Z') }), exists: none });
  assert.equal(r.violated, true);
  assert.equal(r.rule, 'edge-contract');
  assert.match(r.why, /qa-engineer/);
  assert.match(r.why, /report/);
});

test('the newest predecessor is the edge being taken', () => {
  const latest = latestFrom({
    'qa-engineer': rec('2026-10-20T10:00:00Z'),                                       // older, incomplete
    'code-reviewer': rec('2026-10-20T11:00:00Z', {}, { receipt: { files: { 'a.js': 'h' } } }),
  });
  assert.equal(edgeContract({ target: 'devops', graph: GRAPH, latest, exists: none }).violated, false);
});

test('a receipt is evidence by its files, not by a meta key', () => {
  const ok = edgeContract({ target: 'code-reviewer', graph: GRAPH, exists: none,
    latest: latestFrom({ 'senior-dev': rec('2026-10-20T10:00:00Z', {}, { receipt: { files: { 'x.js': 'h' } } }) }) });
  assert.equal(ok.violated, false);
  const bad = edgeContract({ target: 'code-reviewer', graph: GRAPH, exists: none,
    latest: latestFrom({ 'senior-dev': rec('2026-10-20T10:00:00Z', { receipt: 'yes' }) }) });
  assert.equal(bad.violated, true, 'a meta string is not a receipt');
});

test('a named path must exist; a plain value is enough when it is not a path', () => {
  const named = (p) => latestFrom({ pm: rec('2026-10-20T10:00:00Z', { plan: p }) });
  assert.equal(edgeContract({ target: 'senior-dev', graph: GRAPH, latest: named('docs/plans/PLAN-a.md'), exists: (p) => p === 'docs/plans/PLAN-a.md' }).violated, false);
  const gone = edgeContract({ target: 'senior-dev', graph: GRAPH, latest: named('docs/plans/PLAN-a.md'), exists: none });
  assert.equal(gone.violated, true);
  assert.match(gone.why, /does not exist/);
  assert.equal(edgeContract({ target: 'senior-dev', graph: GRAPH, latest: named('approved'), exists: none }).violated, false);
});

test('rule 2 holds its scope: no predecessor run, or no declared contract, is not a violation', () => {
  assert.equal(edgeContract({ target: 'devops', graph: GRAPH, latest: latestFrom({}), exists: none }).violated, false, 'nothing ran before it');
  assert.equal(edgeContract({ target: 'pm', graph: GRAPH, latest: latestFrom({ architect: rec('2026-10-20T10:00:00Z') }), exists: none }).violated, false, 'architect declares no produces here');
  assert.equal(edgeContract({ target: 'nobody', graph: GRAPH, latest: latestFrom({}), exists: none }).violated, false, 'not in the graph');
  assert.equal(edgeContract({ target: 'devops', graph: null, latest: latestFrom({}), exists: none }).violated, false, 'no graph read');
});

test('stage variants (`senior-dev.SPEC-OBJECTION`) are the same agent with their own tokens', () => {
  const g = { 'senior-dev.SPEC-OBJECTION': { on: ['SPEC-OBJECTION'], next: ['pm'] }, pm: { on: ['DONE'], next: [] } };
  let asked = null;
  edgeContract({ target: 'pm', graph: g, latest: (agent, on) => { asked = { agent, on }; return null; }, exists: none });
  assert.deepEqual(asked, { agent: 'senior-dev', on: ['SPEC-OBJECTION'] });
});

// ── the hook, end to end ─────────────────────────────────────────────────────
const line = (agent, verdict, ts, meta, extra = {}) => JSON.stringify({ v: 1, ts, agent, verdict, ...(meta ? { meta } : {}), ...extra });
function project({ mode = null, logs = {} } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'graph-edge-'))); TMP.push(dir);
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.great_cto', 'PROJECT.md'), `archetype: web-service\n${mode ? `graph-guard: ${mode}\n` : ''}`);
  for (const [agent, text] of Object.entries(logs)) fs.writeFileSync(path.join(dir, '.great_cto', 'verdicts', `${agent}.log`), text + '\n');
  return dir;
}
const run = (dir, subagent) => spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Agent', cwd: dir, session_id: 's1', tool_input: { subagent_type: subagent } }),
  encoding: 'utf8', env: { ...process.env, HOME: SANDBOX_HOME },
});
const events = (dir) => { try { return fs.readFileSync(path.join(dir, '.great_cto', 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
const QA_NO_REPORT = line('qa-engineer', 'PASS', T0, { feature: 'x' });

test('hook, observe: an unmet contract is let through and recorded', () => {
  const dir = project({ logs: { 'qa-engineer': QA_NO_REPORT } });
  const r = run(dir, 'devops');
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /"deny"/);
  const e = events(dir).find((x) => x.hook === 'graph-guard');
  assert.ok(e, 'a graph-guard event was written');
  assert.equal(e.outcome, 'would-block-edge-contract');
});

test('hook, observe: the event names the rule, the predecessor and the key it did not name', () => {
  const dir = project({ logs: { 'qa-engineer': QA_NO_REPORT } });
  run(dir, 'devops');
  const e = events(dir).find((x) => x.hook === 'graph-guard');
  assert.equal(e.why, 'edge-contract: qa-engineer named no report');
  assert.equal(e.outcome, 'would-block-edge-contract', 'the existing fields stay');
});

test('hook, enforce: the denied event carries the why too', () => {
  const dir = project({ mode: 'enforce', logs: { 'qa-engineer': QA_NO_REPORT } });
  run(dir, 'devops');
  const e = events(dir).find((x) => x.hook === 'graph-guard');
  assert.equal(e.kind, 'denied');
  assert.equal(e.why, 'edge-contract: qa-engineer named no report');
});

test('hook: a named path that is missing is reported without the path', () => {
  const dir = project({ logs: { 'qa-engineer': line('qa-engineer', 'PASS', T0, { report: '/srv/someone/private/QA-x.md' }) } });
  run(dir, 'devops');
  const e = events(dir).find((x) => x.hook === 'graph-guard');
  assert.equal(e.why, 'edge-contract: qa-engineer report path does not exist');
  assert.ok(!JSON.stringify(e).includes('someone'), 'the path stays in the verdict log');
});

test('hook: a receipt-less predecessor is reported by key', () => {
  const dir = project({ logs: { 'senior-dev': line('senior-dev', 'DONE', T0, { task: 't' }) } });
  run(dir, 'code-reviewer');
  assert.equal(events(dir).find((x) => x.hook === 'graph-guard').why, 'edge-contract: senior-dev named no receipt');
});

test('hook: an unreadable predecessor log is allowed and recorded once, naming the stage and the code', () => {
  const dir = project({ mode: 'enforce' });
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts', 'qa-engineer.log'));   // EISDIR
  const r = run(dir, 'devops');
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /"deny"/);
  const all = events(dir).filter((x) => x.hook === 'graph-guard');
  assert.equal(all.length, 1);
  assert.equal(all[0].outcome, 'unreadable');
  assert.equal(all[0].kind, 'hint');
  assert.equal(all[0].agent, 'devops');
  assert.match(all[0].why, /qa-engineer=EISDIR/);
});

test('hook, enforce: an unmet contract is denied with the stage, the key and the way out', () => {
  const dir = project({ mode: 'enforce', logs: { 'qa-engineer': QA_NO_REPORT } });
  const out = JSON.parse(run(dir, 'great-cto:devops').stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /qa-engineer.*report/);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /exception graph/);
});

test('hook, enforce: a met contract with the file present is silent', () => {
  const dir = project({ mode: 'enforce', logs: { 'qa-engineer': line('qa-engineer', 'PASS', T0, { report: 'docs/qa/QA-x.md' }) } });
  fs.mkdirSync(path.join(dir, 'docs', 'qa'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'qa', 'QA-x.md'), 'ok\n');
  const r = run(dir, 'devops');
  assert.equal(r.stdout.trim(), '');
  assert.equal(events(dir).filter((x) => x.hook === 'graph-guard').length, 0);
});

test('scope: an old predecessor verdict is not the edge an unrelated dispatch takes', () => {
  const now = Date.parse('2026-10-28T16:00:00Z');
  const old = latestFrom({ 'qa-engineer': rec('2026-09-01T10:00:00Z', { feature: 'billing' }) });
  assert.equal(edgeContract({ target: 'devops', graph: GRAPH, latest: old, exists: none, now, prompt: 'deploy the docs fix' }).violated, false);
  assert.equal(edgeContract({ target: 'devops', graph: GRAPH, latest: old, exists: none, now, prompt: 'ship billing' }).violated, true, 'names the feature');
  const fresh = latestFrom({ 'qa-engineer': rec('2026-10-28T12:00:00Z') });
  assert.equal(edgeContract({ target: 'devops', graph: GRAPH, latest: fresh, exists: none, now, prompt: '' }).violated, true, 'recent: in scope');
});
