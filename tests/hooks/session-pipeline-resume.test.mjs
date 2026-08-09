// This hook runs for every user at every session start. Before the freshness
// check below it took 847ms — 533ms of that shelling out to `bd` to read gate
// approval — against ~30ms for every other hook in this plugin. A session-start
// tax paid by everyone, to answer a question almost nobody is asking.
//
// The fix is not a micro-optimisation. A stage that succeeded last week is not
// work waiting for you, it is something that happened. The hook exists for "you
// approved a gate two hours ago", and that is what it should answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = path.join(ROOT, 'scripts/hooks/session-pipeline-resume.mjs');

function project({ verdictAgeMs = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-sr-'));
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'shared/pipeline.toml'), path.join(dir, 'shared/pipeline.toml'));
  fs.writeFileSync(path.join(dir, '.great_cto', 'PROJECT.md'), 'approval-level: gates-only\n');
  if (verdictAgeMs !== null) {
    const f = path.join(dir, '.great_cto', 'verdicts', 'architect.log');
    fs.writeFileSync(f, `{"v":1,"ts":"${new Date(Date.now() - verdictAgeMs).toISOString()}","agent":"architect","verdict":"APPROVED","cost_usd":0}\n`);
    const t = new Date(Date.now() - verdictAgeMs);
    fs.utimesSync(f, t, t);
  }
  return dir;
}
const clean = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };
const run = (cwd) => {
  const started = Date.now();
  const out = execFileSync('node', [HOOK], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return { out, ms: Date.now() - started };
};

// Why these assert on the BRANCH rather than on a stopwatch
// ---------------------------------------------------------
// Both of these used to assert `ms < 300`. That passed alone and failed at 444ms
// under `node --test`, which runs a dozen files at once — the assertion was
// measuring how busy the machine was, not what the hook did. The property that
// matters is that the hook took the early-out and never shelled out to `bd`; the
// 300ms was only ever a proxy for that, and a proxy that fails on a loaded
// laptop is a gate people learn to re-run rather than believe.
//
// The trace records which branch ran, so the test below asks directly — and for
// the idle case, `an idle project records that it ran and found nothing in
// flight` already asserted exactly that property, without a stopwatch.

test('a directory that is not a great_cto project says nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-plain-'));
  try {
    const { out } = run(dir);
    assert.equal(out.trim(), '');
    // Nothing is written either — a hook that creates `.great_cto` in whatever
    // directory a session happens to start in is worse than one that is slow.
    assert.equal(fs.existsSync(path.join(dir, '.great_cto')), false,
      'it must not initialise a directory it was only passing through');
  } finally { clean(dir); }
});

test('a project with no verdicts at all says nothing', () => {
  const dir = project();
  try { assert.equal(run(dir).out.trim(), ''); } finally { clean(dir); }
});

test('a session must start even when the state is nonsense', () => {
  // Nothing this hook answers is worth a failed session start.
  const dir = project({ verdictAgeMs: 60_000 });
  fs.writeFileSync(path.join(dir, 'shared/pipeline.toml'), 'this is not toml [[[');
  fs.writeFileSync(path.join(dir, '.great_cto/verdicts/architect.log'), 'not json\n');
  try {
    const r = execFileSync('node', [HOOK], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    assert.equal(r.trim(), '');
  } finally { clean(dir); }
});

test('a stage behind an unapproved gate is not announced as work waiting', () => {
  // gate:arch is active at gates-only and no bead approves it, so the honest
  // answer is silence — the CTO has not said yes.
  const dir = project({ verdictAgeMs: 60_000 });
  try { assert.equal(run(dir).out.trim(), ''); } finally { clean(dir); }
});

// ── a silent run and a run that never happened must not look the same ─────
//
// Silence is this hook's normal answer: nothing in flight, a gate unapproved, a
// transition already dispatched. But without a trace, "stayed silent" and "never
// ran" are indistinguishable from outside — the same defect this repo spent two
// days removing everywhere else, where a run that did not happen looked like a
// run that found nothing.

const traceOf = (dir) => {
  const p = path.join(dir, '.great_cto', '.session-resume');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : null;
};

test('an idle project records that it ran and found nothing in flight', () => {
  const dir = project({ verdictAgeMs: 7 * 24 * 3600_000 });
  try {
    assert.equal(run(dir).out.trim(), '');
    const t = traceOf(dir);
    assert.match(t, /idle/, 'the hook must leave proof it ran');
    assert.match(t, /history, not work waiting/);
  } finally { clean(dir); }
});

test('a project with no verdicts at all records that too', () => {
  const dir = project();
  try {
    run(dir);
    assert.match(traceOf(dir), /idle no verdicts recorded/);
  } finally { clean(dir); }
});

test('a stage behind an unapproved gate records WHY it said nothing', () => {
  // Not the same as idle: something is in flight, and the CTO has not said yes.
  const dir = project({ verdictAgeMs: 60_000 });
  try {
    assert.equal(run(dir).out.trim(), '');
    const t = traceOf(dir);
    assert.match(t, /silent/);
    assert.ok(!/idle/.test(t), 'an unapproved gate is a different answer from an idle project');
  } finally { clean(dir); }
});

test('the trace is overwritten, not grown', () => {
  // The question is "did it run this session and what did it say", not "how many
  // times has it ever run".
  const dir = project({ verdictAgeMs: 60_000 });
  try {
    run(dir); run(dir); run(dir);
    assert.equal(traceOf(dir).split('\n').length, 1);
  } finally { clean(dir); }
});

test('a trace that cannot be written does not stop the hook', () => {
  const dir = project({ verdictAgeMs: 7 * 24 * 3600_000 });
  try {
    fs.mkdirSync(path.join(dir, '.great_cto', '.session-resume'), { recursive: true });  // a directory where a file goes
    assert.equal(run(dir).out.trim(), '', 'still exits cleanly and says nothing');
  } finally { clean(dir); }
});
