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
import { latestSuccess, architectureBeforeBuild, decide, guardMode, malformedLog, errorCode, unreadableWhy } from '../../scripts/lib/graph-guard.mjs';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'hooks', 'graph-guard.mjs');
// Hook-level fixtures are recent: rules only measure a dispatch against a verdict in scope
// (72 h, or named by the dispatch — great_cto-2u72.4).
const T0 = new Date(Date.now() - 2 * 3600e3).toISOString();
const T1 = new Date(Date.now() - 1 * 3600e3).toISOString();
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

test('malformedLog: content with not one parseable record — and nothing else', () => {
  assert.equal(malformedLog(''), false, 'empty is a stage that never ran');
  assert.equal(malformedLog('\n  \n'), false, 'blank lines are empty');
  assert.equal(malformedLog(v('architect', 'APPROVED', '2026-10-20T11:00:00Z')), false);
  assert.equal(malformedLog('{"v":1,"ts":"2026-10-20T11:00:00Z","agent":"arch'), true, 'cut off mid-record');
  assert.equal(malformedLog(`{"v":1,"ts"\n${v('architect', 'APPROVED', '2026-10-20T11:00:00Z')}`), false, 'one good record is enough to read');
});

test('unreadable reasons are codes, never messages or paths', () => {
  assert.equal(errorCode({ code: 'EISDIR', message: "EISDIR: illegal operation on a directory, read '/home/x/y.log'" }), 'EISDIR');
  assert.equal(errorCode({ code: 'eacces' }), 'EACCES');
  assert.equal(errorCode(new Error('no code at all')), 'UNKNOWN');
  assert.equal(errorCode({ code: '../../etc' }), 'ETC');
  assert.equal(unreadableWhy(new Map([['product-owner', 'EISDIR'], ['architect', 'MALFORMED']])), 'product-owner=EISDIR,architect=MALFORMED');
});

test('a violation carries a short cause beside its prose: rule id, predecessor, key', () => {
  const r = architectureBeforeBuild({ target: 'senior-dev', po: po('2026-10-20T10:00:00Z'), arch: null });
  assert.equal(r.cause, 'architecture-before-build: architect has not run since the product-owner brief');
  assert.doesNotMatch(r.cause, /2026/, 'no timestamp');
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
const BRIEF = v('product-owner', 'BRIEF_READY', T0);

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

// ADR-039 says an observe event carries `why`; the 04.11 enforce decision is made by reading
// why each call would have been blocked, so an event without it cannot be judged.
test('hook, observe: the recorded event says why the call would have been blocked', () => {
  const dir = project({ poLog: BRIEF });
  run(dir, 'great-cto:senior-dev');
  const e = events(dir).find((x) => x.hook === 'graph-guard');
  assert.match(e.why, /^architecture-before-build: /, 'the rule id leads');
  assert.match(e.why, /architect/, 'names the missing predecessor');
  assert.equal(e.outcome, 'would-block-architecture-before-build', 'the existing fields stay');
  assert.equal(e.kind, 'hint');
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

test('hook, enforce: the denied event carries the same why', () => {
  const dir = project({ mode: 'enforce', poLog: BRIEF });
  run(dir, 'design-advisor');
  const e = events(dir).find((x) => x.hook === 'graph-guard');
  assert.equal(e.kind, 'denied');
  assert.equal(e.outcome, 'blocked-architecture-before-build');
  assert.match(e.why, /^architecture-before-build: .*architect/);
});

test('hook: the recorded why is a fixed-vocabulary reason — no timestamp, no path, no prose from the log', () => {
  const dir = project({ poLog: BRIEF });
  run(dir, 'senior-dev');
  const e = events(dir).find((x) => x.hook === 'graph-guard');
  assert.ok(e.why.length <= 120);
  assert.doesNotMatch(e.why, /2026-10-20/, 'the brief timestamp stays in the verdict log');
  assert.doesNotMatch(e.why, /[\\/]/, 'no path of any kind');
});

test('hook: the graph path is silent', () => {
  const dir = project({ mode: 'enforce', poLog: BRIEF, archLog: v('architect', 'APPROVED', T1) });
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

// A guard that saw nothing and a guard that could not look must not read the same in
// events.jsonl (audit 2026-10-28, G7): the first is a clean route, the second is a blind spot.
const unreadableEvents = (dir) => events(dir).filter((x) => x.hook === 'graph-guard' && x.outcome === 'unreadable');

test('hook: an unreadable verdict log is allowed and recorded once, with the error code', () => {
  const dir = project({ mode: 'enforce' });
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts', 'product-owner.log'));   // EISDIR
  const r = run(dir, 'senior-dev');
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /"deny"/);
  const all = events(dir).filter((x) => x.hook === 'graph-guard');
  assert.equal(all.length, 1, 'exactly one event');
  const e = unreadableEvents(dir)[0];
  assert.ok(e, 'an unreadable event was written');
  assert.equal(e.kind, 'hint');
  assert.equal(e.agent, 'senior-dev');
  assert.match(e.why, /product-owner=EISDIR/);
  assert.doesNotMatch(JSON.stringify(e), /illegal operation|EISDIR:/, 'the code, not the error message');
  assert.ok(!JSON.stringify(e).includes(dir), 'no absolute path');
});

test('hook, observe: an unreadable log is recorded the same way', () => {
  const dir = project();
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts', 'architect.log'));
  const r = run(dir, 'design-advisor');
  assert.equal(r.status, 0);
  assert.equal(unreadableEvents(dir).length, 1);
  assert.match(unreadableEvents(dir)[0].why, /architect=EISDIR/);
});

test('hook: two unreadable logs are still one event naming both', () => {
  const dir = project();
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts', 'product-owner.log'));
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts', 'architect.log'));
  run(dir, 'senior-dev');
  assert.equal(events(dir).filter((x) => x.hook === 'graph-guard').length, 1);
  const { why } = unreadableEvents(dir)[0];
  assert.match(why, /product-owner=EISDIR/);
  assert.match(why, /architect=EISDIR/);
});

test('hook: a log it may not read is recorded as EACCES and allowed', { skip: process.getuid?.() === 0 && 'root reads everything' }, () => {
  const dir = project({ mode: 'enforce', poLog: BRIEF });
  const file = path.join(dir, '.great_cto', 'verdicts', 'architect.log');
  fs.writeFileSync(file, '');
  fs.chmodSync(file, 0o000);
  try {
    const r = run(dir, 'senior-dev');
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /"deny"/, 'a brief with an unreadable architect log is not a proven skip');
    assert.match(unreadableEvents(dir)[0].why, /architect=EACCES/);
  } finally { fs.chmodSync(file, 0o644); }
});

test('hook: a log with nothing parseable is malformed — recorded, allowed, and does not read as "architect never ran"', () => {
  // A write cut short: the parser reads loosely (any two tokens are a legacy line), but JSON that stops is rejected.
  const cut = '{"v":1,"ts":"2026-10-20T11:00:00Z","agent":"architect","verd\n{"v":1,"ts"';
  const dir = project({ mode: 'enforce', poLog: BRIEF, archLog: cut });
  const r = run(dir, 'senior-dev');
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /"deny"/);
  assert.match(unreadableEvents(dir)[0].why, /architect=MALFORMED/);
  assert.equal(events(dir).filter((x) => x.outcome?.startsWith('blocked-')).length, 0);
});

test('hook: a log that does not exist is the clean case — no unreadable event', () => {
  const dir = project({ poLog: BRIEF, archLog: v('architect', 'APPROVED', T1) });
  run(dir, 'senior-dev');
  assert.equal(events(dir).filter((x) => x.hook === 'graph-guard').length, 0);
  const none = project();
  run(none, 'senior-dev');
  assert.equal(events(none).length, 0, 'no logs at all: nothing to say');
});

test('hook: an unreadable log the decision does not need is not an event', () => {
  const dir = project();
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts', 'product-owner.log'));
  run(dir, 'qa-engineer');   // rule 1 only looks at build and design stages
  assert.equal(events(dir).length, 0);
});

test('hook: outside a great_cto project it does nothing', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'graph-guard-none-'))); TMP.push(dir);
  const r = run(dir, 'senior-dev');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
  assert.equal(fs.existsSync(path.join(dir, '.great_cto')), false);
});

// great_cto-2u72.4: the first real Claude Code events (2026-10-28) were six false positives —
// maintenance dispatches measured against a seven-week-old brief of another feature.
test('scope: an old brief does not hold a dispatch that does not name its feature', () => {
  const now = Date.parse('2026-10-28T16:00:00Z');
  const old = po('2026-09-09T07:12:27Z', { feature: 'story-rewrite-2026-09', brief: 'docs/product/BRIEF-story-rewrite-2026-09.md' });
  assert.equal(architectureBeforeBuild({ target: 'senior-dev', po: old, arch: null, now, prompt: 'Fix the guard event shape' }).violated, false, 'unrelated maintenance');
  assert.equal(architectureBeforeBuild({ target: 'senior-dev', po: old, arch: null, now, prompt: 'Implement story-rewrite-2026-09 page' }).violated, true, 'names the feature');
  assert.equal(architectureBeforeBuild({ target: 'senior-dev', po: old, arch: null, now, prompt: 'see docs/product/BRIEF-story-rewrite-2026-09.md' }).violated, true, 'names the brief');
  const fresh = po('2026-10-28T10:00:00Z', { feature: 'checkout' });
  assert.equal(architectureBeforeBuild({ target: 'senior-dev', po: fresh, arch: null, now, prompt: 'anything' }).violated, true, 'a brief within 72 h is the route being taken');
  assert.equal(architectureBeforeBuild({ target: 'senior-dev', po: old, arch: null }).violated, true, 'no clock: every verdict is in scope, as before');
});

test('hook: an old brief and an unrelated dispatch record nothing', () => {
  const dir = project({ poLog: v('product-owner', 'APPROVED', '2026-09-09T07:12:27Z', { feature: 'story-rewrite-2026-09' }) });
  const r = run(dir, 'great-cto:senior-dev', SANDBOX_HOME);
  assert.equal(r.status, 0);
  let events = [];
  try { events = fs.readFileSync(path.join(dir, '.great_cto', 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean); } catch {}
  assert.equal(events.length, 0, events.join('\n'));
});
