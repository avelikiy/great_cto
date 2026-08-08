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

test('a project with no pipeline in flight is left alone, cheaply', () => {
  // The common case: someone opens a project they have not touched in a week.
  const dir = project({ verdictAgeMs: 7 * 24 * 3600_000 });
  try {
    const { out, ms } = run(dir);
    assert.equal(out.trim(), '', 'a week-old stage is history, not work waiting');
    assert.ok(ms < 300, `must not pay the gate-read cost here (took ${ms}ms)`);
  } finally { clean(dir); }
});

test('a directory that is not a great_cto project says nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-plain-'));
  try {
    const { out, ms } = run(dir);
    assert.equal(out.trim(), '');
    assert.ok(ms < 300, `${ms}ms`);
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
