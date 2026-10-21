// ADR-039: the graph guards a dispatch it can prove wrong — observed first.
//
// Measured 2026-10-20 (great_cto-1puj.1): after product-owner, sessions went
// straight to design-advisor and on to senior-dev; in 84 of 93 cases architect
// never ran — the architecture stage and gate:arch skipped for UI features, in
// 12 projects, reported by nothing. Rule 1 catches exactly that.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { latestSuccess, architectureBeforeBuild, decide, guardMode } from '../../scripts/lib/graph-guard.mjs';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'hooks', 'graph-guard.mjs');
const TMP = [];
after(() => { for (const d of TMP) fs.rmSync(d, { recursive: true, force: true }); });
const SANDBOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-guard-home-')); TMP.push(SANDBOX_HOME);
const v = (agent, verdict, ts, meta) => JSON.stringify({ v: 1, ts, agent, verdict, ...(meta ? { meta } : {}) });

// ── pure rule ────────────────────────────────────────────────────────────────
test('latestSuccess picks the newest success verdict, ignoring failures', () => {
  const log = [v('architect', 'APPROVED', '2026-10-01T10:00:00Z'), v('architect', 'BLOCKED', '2026-10-02T10:00:00Z')].join('\n');
  assert.equal(latestSuccess(log, ['APPROVED', 'DONE']).ts, '2026-10-01T10:00:00Z');
  assert.equal(latestSuccess('', ['APPROVED']), null);
});

const po = (ts, meta, verdict = 'BRIEF_READY') => ({ ts, verdict, meta: meta || {} });
test('a build after a brief with no architecture after it violates rule 1', () => {
  const r = architectureBeforeBuild({ target: 'senior-dev', po: po('2026-10-20T10:00:00Z'), arch: null });
  assert.equal(r.violated, true);
  assert.match(r.why, /architect/);
  assert.equal(architectureBeforeBuild({ target: 'design-advisor', po: po('2026-10-20T10:00:00Z'), arch: { ts: '2026-10-19T10:00:00Z' } }).violated, true, 'architecture older than the brief');
});

test('rule 1 holds its exemptions and its scope', () => {
  const brief = po('2026-10-20T10:00:00Z');
  assert.equal(architectureBeforeBuild({ target: 'senior-dev', po: brief, arch: { ts: '2026-10-20T11:00:00Z' } }).violated, false, 'architecture after the brief');
  assert.equal(architectureBeforeBuild({ target: 'senior-dev', po: null, arch: null }).violated, false, 'no brief at all: a fix or a small task');
  assert.equal(architectureBeforeBuild({ target: 'senior-dev', po: po('2026-10-20T10:00:00Z', { depth: 'small' }), arch: null }).violated, false, 'small depth');
  assert.equal(architectureBeforeBuild({ target: 'senior-dev', po: po('2026-10-20T10:00:00Z', {}, 'NO_BUILD'), arch: null }).violated, false, 'no build');
  assert.equal(architectureBeforeBuild({ target: 'qa-engineer', po: brief, arch: null }).violated, false, 'not a build agent');
});

test('modes: observe records, enforce denies, off and exceptions allow', () => {
  const bad = { violated: true, why: 'x' };
  assert.equal(decide({ mode: 'observe', violation: bad }).action, 'record');
  assert.equal(decide({ mode: 'enforce', violation: bad }).action, 'deny');
  assert.equal(decide({ mode: 'enforce', violation: bad, excepted: true }).action, 'allow');
  assert.equal(decide({ mode: 'off', violation: bad }).action, 'allow');
  assert.equal(decide({ mode: 'enforce', violation: { violated: false } }).action, 'allow');
});

test('guardMode reads PROJECT.md and defaults to observe', () => {
  assert.equal(guardMode('archetype: web-service\n'), 'observe');
  assert.equal(guardMode('graph-guard: enforce\n'), 'enforce');
  assert.equal(guardMode('graph-guard: off\n'), 'off');
  assert.equal(guardMode('graph-guard: nonsense\n'), 'observe');
});

// ── the hook, end to end ─────────────────────────────────────────────────────
function project({ mode = null, poLog = null, archLog = null } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'graph-guard-'))); TMP.push(dir);
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.great_cto', 'PROJECT.md'), `archetype: web-service\n${mode ? `graph-guard: ${mode}\n` : ''}`);
  if (poLog !== null) fs.writeFileSync(path.join(dir, '.great_cto', 'verdicts', 'product-owner.log'), poLog + '\n');
  if (archLog !== null) fs.writeFileSync(path.join(dir, '.great_cto', 'verdicts', 'architect.log'), archLog + '\n');
  return dir;
}
const run = (dir, subagent, home) => spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Agent', cwd: dir, session_id: 's1', tool_input: { subagent_type: subagent } }),
  // HOME is a separate sandbox: projectRoot never treats the home directory as a project.
  encoding: 'utf8', env: { ...process.env, HOME: home || SANDBOX_HOME },
});
const events = (dir) => { try { return fs.readFileSync(path.join(dir, '.great_cto', 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
const BRIEF = v('product-owner', 'BRIEF_READY', '2026-10-20T10:00:00Z');

test('hook, observe (default): the skip is let through and recorded', () => {
  const dir = project({ poLog: BRIEF });
  const r = run(dir, 'great-cto:senior-dev');
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /"deny"/);
  const e = events(dir).find((x) => x.hook === 'graph-guard');
  assert.ok(e, 'a graph-guard event was written');
  assert.equal(e.kind, 'hint');
  assert.equal(e.agent, 'senior-dev');
  assert.match(e.outcome, /would-block/);
});

test('hook, enforce: the skip is denied with the reason and the way out', () => {
  const dir = project({ mode: 'enforce', poLog: BRIEF });
  const r = run(dir, 'design-advisor');
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /architect/);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /exception/);
  assert.equal(events(dir).find((x) => x.hook === 'graph-guard').kind, 'denied');
});

test('hook: the graph path is silent', () => {
  const dir = project({ mode: 'enforce', poLog: BRIEF, archLog: v('architect', 'APPROVED', '2026-10-20T11:00:00Z') });
  const r = run(dir, 'senior-dev');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
  assert.equal(events(dir).filter((x) => x.hook === 'graph-guard').length, 0);
});

test('hook: an unreadable verdict log never blocks', () => {
  const dir = project({ mode: 'enforce' });
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts', 'product-owner.log'));   // a directory: read fails
  const r = run(dir, 'senior-dev');
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /"deny"/);
});

test('hook: outside a great_cto project it does nothing', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'graph-guard-none-'))); TMP.push(dir);
  const r = run(dir, 'senior-dev');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
  assert.equal(fs.existsSync(path.join(dir, '.great_cto')), false);
});
