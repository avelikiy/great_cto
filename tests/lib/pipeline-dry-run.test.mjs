// pipeline-dry-run: the whole map walked with stub verdicts, against a written-down key.
// The shipped map is checked here so a change to shared/pipeline.toml that breaks a path,
// a hold or a branch is caught like code, not on a paid run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lintGraph, dryRun } from '../../scripts/lib/pipeline-dry-run.mjs';
import { parsePipelineToml } from '../../scripts/lib/pipeline-toml.mjs';
import { gatesForApprovalLevel } from '../../scripts/lib/approval-level.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/lib/pipeline-dry-run.mjs');
const SHIPPED = parsePipelineToml(fs.readFileSync(path.join(ROOT, 'shared/pipeline.toml'), 'utf8'));

const walk = ({ stubs = {}, level = 'gates-only', archetype, start = 'product-owner', transitions = SHIPPED } = {}) =>
  dryRun({ transitions, start, stubs, activeGates: gatesForApprovalLevel(level, { archetype }) });
const path_ = (r) => r.steps.map((s) => s.agent);
const holds = (r) => r.steps.filter((s) => s.kind === 'gate').map((s) => `${s.agent}:${s.gates.join('+')}`);

// ── the shipped map ──────────────────────────────────────────────────────────

test('the shipped map has no static problems', () => {
  assert.deepEqual(lintGraph(SHIPPED), []);
});

const SCENARIOS = [
  {
    what: 'default level: the main chain holds at product, arch and ship, and ends at l3-support',
    given: {},
    path: ['product-owner', 'architect', 'pm', 'senior-dev', 'code-reviewer', 'qa-engineer', 'security-officer', 'devops', 'l3-support'],
    holds: ['product-owner:gate:product', 'architect:gate:arch', 'security-officer:gate:ship'],
  },
  {
    what: 'a regulated archetype at `auto` still holds at security, compliance and ship — the floor',
    given: { level: 'auto', archetype: 'fintech' },
    holds: ['security-officer:gate:security+gate:compliance+gate:ship'],
  },
  {
    what: 'NO_BUILD ends the chain at the product decision',
    given: { stubs: { 'product-owner': 'NO_BUILD' } },
    path: ['product-owner'],
    holds: [],
  },
  {
    what: 'APPROVED_UI routes through design-advisor before planning',
    given: { stubs: { architect: 'APPROVED_UI' } },
    path: ['product-owner', 'architect', 'design-advisor', 'pm', 'senior-dev', 'code-reviewer', 'qa-engineer', 'security-officer', 'devops', 'l3-support'],
  },
  {
    what: 'a client release goes through staging and e2e, and the production promote waits for gate:release',
    given: { stubs: { devops: 'CLIENT_RELEASE', 'release-manager': ['STAGED', 'RELEASED'], 'e2e-test-engineer': 'ARTIFACT_PASSED' } },
    holdsInclude: ['e2e-test-engineer:gate:release'],
    pathEndsWith: ['devops', 'release-manager', 'e2e-test-engineer', 'release-manager', 'l3-support'],
  },
  {
    what: 'SPEC-OBJECTION sends the build back to planning once',
    given: { stubs: { 'senior-dev': ['SPEC-OBJECTION', 'TASK_DONE'] } },
    pathIncludes: ['pm', 'senior-dev', 'pm', 'senior-dev'],
  },
  {
    what: 'depth=small skips pm when no active gate sits on that edge',
    given: { stubs: { architect: { verdict: 'APPROVED', meta: { depth: 'small' } } } },
    path: ['product-owner', 'architect', 'senior-dev', 'code-reviewer', 'qa-engineer', 'security-officer', 'devops', 'l3-support'],
  },
];

for (const s of SCENARIOS) {
  test(`shipped map: ${s.what}`, () => {
    const r = walk(s.given);
    assert.deepEqual(r.problems, [], JSON.stringify(r.problems));
    assert.equal(r.ended, true, 'the walk reached an end of chain');
    if (s.path) assert.deepEqual(path_(r), s.path);
    if (s.holds) assert.deepEqual(holds(r), s.holds);
    if (s.holdsInclude) for (const h of s.holdsInclude) assert.ok(holds(r).includes(h), `${h} in ${holds(r)}`);
    if (s.pathEndsWith) assert.deepEqual(path_(r).slice(-s.pathEndsWith.length), s.pathEndsWith);
    if (s.pathIncludes) assert.ok(path_(r).join(',').includes(s.pathIncludes.join(',')), path_(r).join(','));
  });
}

// ── what it catches ──────────────────────────────────────────────────────────

const map = (rules) => rules;

test('lint: an edge into a stage with no rule, and into an agent that does not exist', () => {
  const p = lintGraph(map({ a: { on: ['DONE'], next: ['ghost'] } }), { agents: ['a'] });
  assert.deepEqual(p.map((x) => x.kind).sort(), ['dangling-next', 'unknown-agent']);
});

test('lint: a reviewer stage needs no rule (the dispatcher has a default for *-reviewer)', () => {
  assert.deepEqual(lintGraph(map({ a: { on: ['DONE'], next: ['db-reviewer'] } }), { agents: null }), []);
});

test('lint: an asymmetric join, a join to a different next, a join partner with no rule', () => {
  const p = lintGraph(map({
    a: { on: ['DONE'], next: ['z'], join: ['b'] },
    b: { on: ['DONE'], next: ['y'] },
    c: { on: ['DONE'], next: ['z'], join: ['nobody'] },
    y: { on: ['DONE'], next: [] }, z: { on: ['DONE'], next: [] },
  }), { agents: null });
  const details = p.map((x) => x.detail).join('\n');
  assert.match(details, /a waits for b, but b does not wait for a/);
  assert.match(details, /a and its join partner b go to different next stages/);
  assert.match(details, /c joins nobody, which has no rule of its own/);
});

test('lint: a rule that accepts no verdict', () => {
  assert.deepEqual(lintGraph(map({ a: { on: [], next: [] } }), { agents: null }).map((x) => x.kind), ['no-tokens']);
});

test('walk: a stage with no rule, and a token no rule accepts, are named', () => {
  const t = map({ a: { on: ['DONE'], next: ['b'] }, c: { on: ['DONE'], next: [] } });
  const r1 = dryRun({ transitions: t, start: 'a' });
  assert.deepEqual(r1.problems.map((p) => p.kind), ['no-rule']);
  assert.equal(r1.ended, false);
  const r2 = dryRun({ transitions: t, start: 'c', stubs: { c: 'WEIRD' } });
  assert.deepEqual(r2.problems.map((p) => [p.kind, p.at]), [['unknown-verdict', 'c']]);
});

test('walk: a join partner nobody runs is "join-never-met"', () => {
  const t = map({
    a: { on: ['DONE'], next: ['b'] },
    b: { on: ['DONE'], next: ['z'], join: ['c'] },
    c: { on: ['DONE'], next: ['z'], join: ['b'] },
    z: { on: ['DONE'], next: [] },
  });
  const r = dryRun({ transitions: t, start: 'a' });
  assert.deepEqual(r.problems.map((p) => [p.kind, p.at]), [['join-never-met', 'b']]);
});

test('walk: a stub loop stops at the visit cap and says how to end it', () => {
  const r = walk({ stubs: { 'l3-support': 'INCIDENT' } });
  const loop = r.problems.find((p) => p.kind === 'loop');
  assert.ok(loop, JSON.stringify(r.problems));
  assert.match(loop.detail, /give it a list ending in a passing token/);
});

test('walk: a blocked reviewer stops the walk and the stop is named', () => {
  const r = walk({ stubs: { 'code-reviewer': 'BLOCKED' } });
  assert.deepEqual(r.problems.map((p) => [p.kind, p.at]), [['stopped', 'code-reviewer']]);
});

// ── the command ──────────────────────────────────────────────────────────────

test('CLI: 0 on the shipped map, 1 on a broken override, 2 on unusable input', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-dryrun-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: 'utf8' });
  const ok = run();
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /hold at gate:ship → devops/);
  assert.match(ok.stdout, /ok: the walk reached the end of the chain/);
  const broken = path.join(dir, 'pipeline.toml');
  fs.writeFileSync(broken, fs.readFileSync(path.join(ROOT, 'shared/pipeline.toml'), 'utf8').replace(/next = \["devops"\]/g, 'next = ["deployer"]'));
  const bad = run('--pipeline', broken);
  assert.equal(bad.status, 1, bad.stdout);
  assert.match(bad.stdout, /dangling-next at code-reviewer: code-reviewer → deployer/);
  assert.equal(run('--pipeline', path.join(dir, 'missing.toml')).status, 2);
  const stubs = path.join(dir, 'stubs.json');
  fs.writeFileSync(stubs, '{ not json');
  assert.equal(run('--stubs', stubs).status, 2);
  fs.writeFileSync(stubs, JSON.stringify({ 'product-owner': 'NO_BUILD' }));
  const json = JSON.parse(run('--stubs', stubs, '--json').stdout);
  assert.deepEqual(json.reached, ['product-owner']);
  assert.equal(json.ended, true);
});

// Codex review on #292: one finished branch must not make a walk with a held branch "ended".
test('walk: a branch held at a gate keeps the walk from counting as ended', () => {
  const t = {
    'product-owner': { on: ['DONE'], next: ['architect', 'l3-support'] },
    architect: { on: ['DONE'], next: ['pm'], gate: 'gate:arch' },
    pm: { on: ['DONE'], next: [] },
    'l3-support': { on: ['DONE'], next: [] },
  };
  const held = dryRun({ transitions: t, start: 'product-owner', holdAtGates: true });
  assert.equal(held.ended, false, 'pm was never reached');
  assert.deepEqual(held.held, [{ agent: 'architect', gates: ['gate:arch'], nexts: ['pm'] }]);
  assert.deepEqual(held.problems, []);
  const walked = dryRun({ transitions: t, start: 'product-owner' });
  assert.equal(walked.ended, true);
  assert.deepEqual(walked.held, []);
  assert.ok(walked.reached.includes('pm'));
});

test('CLI --hold-at-gates: says where it stopped, never "reached the end"', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--hold-at-gates'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /held at gate:product after product-owner; not walked: architect/);
  assert.match(r.stdout, /stopped at the holds above \(--hold-at-gates\)/);
  assert.doesNotMatch(r.stdout, /reached the end of the chain/);
});

// Codex review on #292 (second pass).
test('walk: a stage routed only by verdict branches takes its default token from a branch', () => {
  const t = {
    'product-owner': { on: ['DONE'], next: ['architect'] },
    'architect.APPROVED': { on: ['APPROVED'], next: ['pm'] },
    pm: { on: ['DONE'], next: [] },
  };
  assert.deepEqual(lintGraph(t, { agents: null }), []);
  const r = dryRun({ transitions: t, start: 'product-owner' });
  assert.deepEqual(r.problems, []);
  assert.equal(r.ended, true);
  assert.deepEqual(r.steps.map((s) => [s.agent, s.verdict]), [['product-owner', 'DONE'], ['architect', 'APPROVED'], ['pm', 'DONE']]);
});

test('walk: a join partner behind a requested hold is not reported as a broken join', () => {
  const t = {
    'product-owner': { on: ['DONE'], next: ['architect', 'code-reviewer'] },
    architect: { on: ['DONE'], next: ['qa-engineer'], gate: 'gate:arch' },
    'code-reviewer': { on: ['APPROVED'], next: ['devops'], join: ['qa-engineer'] },
    'qa-engineer': { on: ['PASS'], next: ['devops'], join: ['code-reviewer'] },
    devops: { on: ['DONE'], next: [] },
  };
  assert.deepEqual(lintGraph(t, { agents: null }), []);
  const held = dryRun({ transitions: t, start: 'product-owner', holdAtGates: true });
  assert.deepEqual(held.problems, [], JSON.stringify(held.problems));
  assert.equal(held.ended, false);
  const walked = dryRun({ transitions: t, start: 'product-owner' });
  assert.deepEqual(walked.problems, []);
  assert.equal(walked.ended, true);
});

// Codex review on #292 (third pass): join partners routed only by verdict branches.
test('lint and walk: join partners with only verdict-keyed rules are a valid join', () => {
  const t = {
    'senior-dev': { on: ['DONE'], next: ['code-reviewer', 'qa-engineer'] },
    'code-reviewer.APPROVED': { on: ['APPROVED'], next: ['devops'], join: ['qa-engineer'] },
    'qa-engineer.PASS': { on: ['PASS'], next: ['devops'], join: ['code-reviewer'] },
    devops: { on: ['DONE'], next: [] },
  };
  assert.deepEqual(lintGraph(t, { agents: null }), []);
  const r = dryRun({ transitions: t, start: 'senior-dev' });
  assert.deepEqual(r.problems, []);
  assert.equal(r.ended, true);
  // …and a real asymmetry among verdict-only rules is still caught.
  const broken = { ...t, 'qa-engineer.PASS': { on: ['PASS'], next: ['elsewhere'] }, elsewhere: { on: ['DONE'], next: [] } };
  const kinds = lintGraph(broken, { agents: null }).map((p) => p.detail).join('\n');
  assert.match(kinds, /code-reviewer.APPROVED waits for qa-engineer, but qa-engineer does not wait for code-reviewer/);
  assert.match(kinds, /go to different next stages/);
});
