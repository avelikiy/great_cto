// tests/eval/coverage-gate.test.mjs — unit tests for the agent→EVAL coverage gate.
// Run: node --test tests/eval/coverage-gate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { coverageReport, coveredAgents } from '../../scripts/coverage-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATE = join(__dirname, '..', '..', 'scripts', 'coverage-gate.mjs');

const EVALS = [
  { name: 'EVAL-security-officer-secrets.md', content: '> Agent: security-officer · Reviewer: cso\n## Scenario\nx' },
  { name: 'EVAL-pci-checkout.md', content: '> Pack: commerce · Reviewer: pci-reviewer\n## Scenario\ny' },
];

test('coveredAgents: picks up "> Agent:" bindings', () => {
  const set = coveredAgents(EVALS);
  assert.ok(set.has('security-officer'));
});

test('coveredAgents: picks up "Reviewer:" mapping', () => {
  const set = coveredAgents(EVALS);
  assert.ok(set.has('pci-reviewer'));
});

test('coverageReport: splits covered vs uncovered', () => {
  const rep = coverageReport(['security-officer', 'pci-reviewer', 'architect'], EVALS);
  assert.deepEqual(rep.covered.sort(), ['pci-reviewer', 'security-officer']);
  assert.deepEqual(rep.uncovered, ['architect']);
});

test('coverageReport: filename fallback counts as covered', () => {
  const rep = coverageReport(['security-officer'], [{ name: 'EVAL-security-officer-x.md', content: '## Scenario' }]);
  assert.deepEqual(rep.uncovered, []);
});

// ── CLI behaviour ─────────────────────────────────────────────────────────────

test('CLI --changed with a covered agent exits 0', () => {
  // security-officer has real EVAL files in the repo
  const res = spawnSync(process.execPath, [GATE, '--changed', 'agents/security-officer.md'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test('CLI --changed with non-agent paths exits 0 (nothing to check)', () => {
  const res = spawnSync(process.execPath, [GATE, '--changed', 'README.md', 'scripts/x.mjs'], { encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.ok(res.stdout.includes('no agent files changed'));
});

test('CLI --json emits parseable report', () => {
  const res = spawnSync(process.execPath, [GATE, '--json'], { encoding: 'utf8' });
  const parsed = JSON.parse(res.stdout);
  assert.ok(typeof parsed.total === 'number');
  assert.ok(Array.isArray(parsed.uncovered));
});

// ─── the evidence ladder ───────────────────────────────────────────────────
//
// "Covered" meant an EVAL file names the agent. Reported as one percentage it
// read as a test result, and it is not one: 33 EVAL files exist and 2 have ever
// been executed. A mechanism that exists and a mechanism that runs are different
// facts, and the gate now keeps them apart.
import { agentEvidence, evidenceReport, meetsEvidence, EVIDENCE } from '../../scripts/coverage-gate.mjs';

const evalFile = (agent, name = `EVAL-${agent}.md`) => ({
  name,
  content: `# ${name}\n\n> Agent: ${agent} · phase 2\n\n## Pass threshold\n2/2 tuning · 1/1 holdout.\n`,
});
const run = (evalName, o = {}) => ({
  eval: evalName.replace(/\.md$/, ''), agent: 'x', split: 'holdout',
  rate: 1, threshold: 0.8, ts: '2026-07-30T00:00:00Z', ...o,
});
const NOW = Date.parse('2026-07-31T00:00:00Z');

test('an agent no EVAL mentions is missing, not merely uncovered', () => {
  const e = agentEvidence('nobody', [evalFile('architect')], [], NOW);
  assert.equal(e.level, 'missing');
  assert.deepEqual(e.evals, []);
});

test('an EVAL that exists but never ran is present, never exercised', () => {
  const e = agentEvidence('architect', [evalFile('architect')], [], NOW);
  assert.equal(e.level, 'present');
  assert.match(e.why, /none ever executed/, 'the reason says what is missing, not just the rung');
});

test('a run that did not pass is exercised, not passing', () => {
  const e = agentEvidence('architect', [evalFile('architect')],
    [run('EVAL-architect', { rate: 0.3, threshold: 0.8 })], NOW);
  assert.equal(e.level, 'exercised');
});

test('a run that met its own threshold is passing', () => {
  const e = agentEvidence('architect', [evalFile('architect')], [run('EVAL-architect')], NOW);
  assert.equal(e.level, 'passing');
  assert.match(e.why, /100%/);
});

test('an agent rises to the strongest rung any of its evals reaches', () => {
  const files = [evalFile('architect', 'EVAL-architect-a.md'), evalFile('architect', 'EVAL-architect-b.md')];
  const e = agentEvidence('architect', files, [run('EVAL-architect-b')], NOW);
  assert.equal(e.level, 'passing', 'one file that runs and passes is real evidence');
});

test('an old pass still counts as measured — stale is old, not absent', () => {
  const e = agentEvidence('architect', [evalFile('architect')],
    [run('EVAL-architect', { ts: '2026-01-01T00:00:00Z' })], NOW);
  assert.equal(e.level, 'passing');
  assert.match(e.why, /\d+d ago/, 'and the age is stated rather than hidden');
});

test('the report counts every rung and never collapses them into one number', () => {
  const files = [evalFile('a'), evalFile('b')];
  const r = evidenceReport(['a', 'b', 'c'], files, [run('EVAL-a')], NOW);
  assert.deepEqual(r.counts, { missing: 1, present: 1, exercised: 0, passing: 1 });
  assert.equal(r.total, 3);
});

test('the rungs are ordered, and comparison follows that order', () => {
  assert.deepEqual(EVIDENCE, ['missing', 'present', 'exercised', 'passing']);
  assert.ok(meetsEvidence('passing', 'present'));
  assert.ok(meetsEvidence('present', 'present'));
  assert.ok(!meetsEvidence('present', 'exercised'), 'a file that exists does not clear a bar that asks for a run');
  assert.ok(!meetsEvidence('missing', 'present'));
});

test('--require rejects an unknown rung instead of falling back to the weakest', () => {
  const r = spawnSync('node', [GATE, '--require', 'sortof'], { encoding: 'utf8' });
  assert.equal(r.status, 2, 'silently accepting an unknown value would turn a raised bar into no bar');
  assert.match(r.stderr, /must be one of/);
});

test('--require exercised blocks an agent whose EVAL has never run', () => {
  const r = spawnSync('node', [GATE, '--strict', '--require', 'exercised'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /present-only/);
});
