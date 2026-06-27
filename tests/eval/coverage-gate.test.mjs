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
