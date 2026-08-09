// The board answers a CTO's questions one project at a time. With twenty-two in
// the registry, "what needs me right now across everything" had no answer, and
// switching to each project by hand was the substitute.
//
// Every assertion below is about the same property: a fleet view built on
// readers that return zero when they fail multiplies one silent lie by
// twenty-two, and the screen most likely to be trusted becomes the one most
// likely to mislead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { projectRow, portfolio, needsAttention } from './lib/portfolio.mjs';

function project({ verdicts = [], initialised = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-pf-'));
  if (initialised) {
    const vd = path.join(dir, '.great_cto', 'verdicts');
    fs.mkdirSync(vd, { recursive: true });
    for (const [agent, lines] of Object.entries(groupBy(verdicts))) {
      fs.writeFileSync(path.join(vd, `${agent}.log`), lines.join('\n') + '\n');
    }
  }
  return dir;
}
const groupBy = (vs) => vs.reduce((a, v) => {
  (a[v.agent] ||= []).push(JSON.stringify({ v: 1, ts: v.ts, agent: v.agent, verdict: v.verdict, cost_usd: v.cost_usd }));
  return a;
}, {});
const clean = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };

// ── a cell that cannot be read says so ────────────────────────────────────

test('a project whose directory is gone is unread, not empty', () => {
  const r = projectRow({ slug: 'ghost', path: '/nonexistent/anywhere' });
  assert.match(r.unread, /no longer exists/);
  assert.equal(r.stages, undefined, 'an unread project contributes no numbers at all');
});

test('a directory with no .great_cto is unread, and says which', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-plain-'));
  try {
    assert.match(projectRow({ slug: 'x', path: dir }).unread, /not initialised/);
  } finally { clean(dir); }
});

test('an unreadable registry is not "no projects"', () => {
  const p = portfolio({ unread: 'projects.json could not be read: EACCES' });
  assert.match(p.registryUnread, /EACCES/);
  assert.deepEqual(p.projects, []);
});

// ── numbers only over what was actually read ──────────────────────────────

test('a verdict with no recorded cost is not zero spend', () => {
  // Adding it as zero is how a dashboard reports a number smaller than the
  // invoice.
  const dir = project({ verdicts: [
    { agent: 'a', ts: '2026-08-08T10:00:00Z', verdict: 'DONE', cost_usd: 1.5 },
    { agent: 'b', ts: '2026-08-08T11:00:00Z', verdict: 'DONE' },
  ] });
  try {
    const r = projectRow({ slug: 'x', path: dir });
    assert.equal(r.spend, 1.5);
    assert.equal(r.spendKnownFor, 1);
    assert.equal(r.spendUnknownFor, 1, 'the unpriced stage is counted, not absorbed');
  } finally { clean(dir); }
});

test('a project with no priced verdicts reports no spend rather than zero', () => {
  const dir = project({ verdicts: [{ agent: 'a', ts: '2026-08-08T10:00:00Z', verdict: 'DONE' }] });
  try {
    assert.equal(projectRow({ slug: 'x', path: dir }).spend, null);
  } finally { clean(dir); }
});

test('the fleet total says how many projects it covers', () => {
  // A sum that silently excludes four projects is a different number from the
  // one it claims to be.
  const priced = project({ verdicts: [{ agent: 'a', ts: '2026-08-08T10:00:00Z', verdict: 'DONE', cost_usd: 2 }] });
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-bare-'));
  try {
    const p = portfolio({ projects: [{ slug: 'a', path: priced }, { slug: 'b', path: bare }] });
    assert.equal(p.spend, 2);
    assert.equal(p.spendCoveredProjects, 1);
    assert.equal(p.unreadable, 1);
    assert.equal(p.total, 2);
  } finally { clean(priced); clean(bare); }
});

// ── what "needs you" claims, and what it does not ─────────────────────────

test('a blocking verdict names the stage rather than raising a flag', () => {
  assert.match(needsAttention({ agent: 'security-officer', verdict: 'REJECTED' }), /security-officer returned REJECTED/);
  for (const v of ['BLOCKED', 'FAIL', 'FAILED']) {
    assert.ok(needsAttention({ agent: 'qa', verdict: v }), v);
  }
});

test('a healthy stage claims nothing about gate approval', () => {
  // Gate state is not read here — it costs about half a second per project — so
  // "nothing blocking" must not be read as "a gate was approved".
  assert.equal(needsAttention({ agent: 'architect', verdict: 'APPROVED' }), null);
  assert.equal(needsAttention(null), null);
});

test('a project that never ran is distinguishable from one that ran long ago', () => {
  const never = project({ verdicts: [] });
  const old = project({ verdicts: [{ agent: 'a', ts: '2026-01-01T00:00:00Z', verdict: 'DONE' }] });
  try {
    assert.equal(projectRow({ slug: 'n', path: never }).idleMs, null, 'never ran has no age');
    assert.ok(projectRow({ slug: 'o', path: old }).idleMs > 0);
  } finally { clean(never); clean(old); }
});
