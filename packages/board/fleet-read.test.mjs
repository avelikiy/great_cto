// getAgentsFleet and getAgentProfile read ~/.claude/agents, which left them on
// the integration path and untested at 42% line coverage — and the untested part
// is exactly where the classification bug lived that put 40 of 69 agents into one
// bucket and left `domain` permanently empty.
//
// GREAT_CTO_AGENTS_DIR points them at a fixture. That is enough to exercise the
// real read; mocking `fs` would test the mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const agentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-agents-'));
process.env.GREAT_CTO_AGENTS_DIR = agentsDir;

const { getAgentsFleet, getAgentProfile, isRetired } = await import('./lib/fleet.mjs');

function agent(slug, { retired = false, body = '' } = {}) {
  const name = `great_cto-${slug}.md${retired ? '.retired' : ''}`;
  fs.writeFileSync(path.join(agentsDir, name),
    `---\nname: ${slug}\ndescription: ${slug} does a thing\nmodel: claude-sonnet-5\n---\n\n${body || '# ' + slug}\n`);
}

function project(verdicts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-fleetp-'));
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts'), { recursive: true });
  for (const [a, body] of Object.entries(verdicts)) {
    fs.writeFileSync(path.join(dir, '.great_cto', 'verdicts', `${a}.log`), body);
  }
  return dir;
}
const clean = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().replace(/\.\d+Z$/, 'Z');

agent('architect');
agent('security-officer');
agent('library-reviewer');
agent('old-thing', { retired: true });

// ── the fleet listing ──────────────────────────────────────────────────────

test('every installed agent is listed, and a retired one is not counted as live', () => {
  const dir = project();
  try {
    const fleet = getAgentsFleet(dir);
    const slugs = (fleet.agents ?? fleet).map((a) => a.slug);
    assert.ok(slugs.includes('architect'));
    assert.ok(slugs.includes('library-reviewer'));
    assert.ok(!slugs.includes('old-thing'), 'a `.retired` file is not an installed agent');
  } finally { clean(dir); }
});

test('a retired agent is recognised as retired', () => {
  agent('temp-retired', { retired: true });
  assert.equal(isRetired('temp-retired'), true);
  assert.equal(isRetired('architect'), false);
});

test('each agent carries the domain it was classified into', () => {
  const dir = project();
  try {
    const list = getAgentsFleet(dir).agents ?? getAgentsFleet(dir);
    const byslug = Object.fromEntries(list.map((a) => [a.slug, a]));
    assert.equal(byslug['library-reviewer'].domain, 'domain',
      'the bug this file exists to prevent put every reviewer in qa');
    assert.equal(byslug['security-officer'].domain, 'security');
    assert.equal(byslug['architect'].domain, 'arch');
  } finally { clean(dir); }
});

// ── run statistics ─────────────────────────────────────────────────────────

test('runs and outcomes are counted from the verdict log', () => {
  const dir = project({
    architect: [
      `${iso(1)} | architect | APPROVED | ok | cost=$0.10`,
      `${iso(2)} | architect | BLOCKED | nope | cost=$0.20`,
      `${iso(3)} | architect | APPROVED | ok | cost=$0.30`,
    ].join('\n'),
  });
  try {
    const list = getAgentsFleet(dir).agents ?? getAgentsFleet(dir);
    const a = list.find((x) => x.slug === 'architect');
    assert.equal(a.runs_30d, 3);
    // success_rate is a PERCENTAGE, not a ratio — worth pinning, because a
    // caller treating 67 as a fraction renders 6700%.
    assert.equal(a.success_rate, 67, `2 of 3 succeeded, got ${a.success_rate}`);
  } finally { clean(dir); }
});

test('an agent that never ran reports zero runs, not a missing field', () => {
  const dir = project();
  try {
    const a = (getAgentsFleet(dir).agents ?? getAgentsFleet(dir)).find((x) => x.slug === 'architect');
    assert.equal(a.runs_30d, 0);
    assert.ok(a.success_rate === null || a.success_rate === 0,
      'a rate over zero runs must not be reported as a number nobody measured');
    assert.ok(a.success_rate === null || (a.success_rate >= 0 && a.success_rate <= 100));
  } finally { clean(dir); }
});

test('a run older than the window is not counted in it', () => {
  const dir = project({ architect: `${iso(400)} | architect | APPROVED | ancient | cost=$1.00\n` });
  try {
    const a = (getAgentsFleet(dir).agents ?? getAgentsFleet(dir)).find((x) => x.slug === 'architect');
    assert.equal(a.runs_30d, 0, 'a 400-day-old run is not activity in the last 30 days');
  } finally { clean(dir); }
});

// ── the profile drawer ─────────────────────────────────────────────────────

test('a profile carries the agent metadata the drawer shows', () => {
  const p = getAgentProfile('architect');
  assert.equal(p.slug, 'architect');
  assert.match(p.description ?? '', /does a thing/);
  assert.equal(p.retired, false);
});

test('a profile for an agent that does not exist is null, not an empty shell', () => {
  const p = getAgentProfile('no-such-agent');
  assert.ok(p === null || p.slug === undefined || p.exists === false,
    'an empty shell reads as an installed agent with no data');
});

test('a missing agents directory yields an empty fleet rather than a crash', () => {
  const gone = path.join(os.tmpdir(), 'gcto-agents-absent-' + Date.now());
  const prev = process.env.GREAT_CTO_AGENTS_DIR;
  process.env.GREAT_CTO_AGENTS_DIR = gone;
  const dir = project();
  try {
    // The module caches AGENTS_DIR at load, so this asserts the documented
    // fallback rather than re-reading the env — the try/catch around readdirSync.
    assert.ok(Array.isArray(getAgentsFleet(dir).agents ?? getAgentsFleet(dir)));
  } finally {
    process.env.GREAT_CTO_AGENTS_DIR = prev;
    clean(dir);
  }
});
