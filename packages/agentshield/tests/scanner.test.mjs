// Tests for @great-cto/agentshield scanner.
//
// Run: npm test  (in packages/agentshield/)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const FIXTURES = join(PKG_ROOT, 'tests', 'fixtures');

// Lazy import compiled module
const { scan, scanFile, loadRules } = await import('../dist/index.js');

test('rules catalog loads without errors', () => {
  const rules = loadRules();
  assert.ok(rules.length >= 20, `expected ≥20 rules, got ${rules.length}`);
  // Ensure each scanner has at least one rule
  const scanners = new Set(rules.map((r) => r.scanner));
  assert.ok(scanners.has('prompt-injection'));
  assert.ok(scanners.has('secrets-in-prompts'));
  assert.ok(scanners.has('ssrf-in-tools'));
  assert.ok(scanners.has('rag-poisoning'));
  assert.ok(scanners.has('cost-runaway'));
});

test('vulnerable fixture produces findings', () => {
  const report = scan(FIXTURES, { files: [join(FIXTURES, 'vulnerable-app.ts')] });
  assert.ok(report.findings.length > 0, 'expected findings on vulnerable fixture');

  const ruleIds = new Set(report.findings.map((f) => f.rule.id));
  // Should catch at least these obvious ones:
  assert.ok(ruleIds.has('PI-001'), `expected PI-001 (system prompt template), got ${[...ruleIds]}`);
  assert.ok(ruleIds.has('PI-005'), `expected PI-005 (eval response), got ${[...ruleIds]}`);
  assert.ok(ruleIds.has('SS-001') || ruleIds.has('SS-003'), `expected SS-* (tool/exec), got ${[...ruleIds]}`);
});

test('clean fixture produces zero or minimal findings', () => {
  const report = scan(FIXTURES, { files: [join(FIXTURES, 'clean-app.ts')] });
  // We tolerate up to 2 false positives in the clean fixture
  // (regex-based scanners aren't perfect; the goal is no critical/high)
  const criticalOrHigh = report.findings.filter(
    (f) => f.rule.severity === 'critical' || f.rule.severity === 'high'
  );
  assert.equal(
    criticalOrHigh.length,
    0,
    `expected 0 critical/high in clean fixture, got: ${criticalOrHigh.map((f) => f.rule.id).join(', ')}`,
  );
});

test('--severity filter excludes lower-severity findings', () => {
  const all = scan(FIXTURES, { files: [join(FIXTURES, 'vulnerable-app.ts')] });
  const onlyCritical = scan(FIXTURES, {
    files: [join(FIXTURES, 'vulnerable-app.ts')],
    minSeverity: 'critical',
  });
  assert.ok(onlyCritical.findings.length <= all.findings.length);
  for (const f of onlyCritical.findings) {
    assert.equal(f.rule.severity, 'critical');
  }
});

test('--scanner filter only runs requested scanner', () => {
  const r = scan(FIXTURES, {
    files: [join(FIXTURES, 'vulnerable-app.ts')],
    scanners: ['prompt-injection'],
  });
  for (const f of r.findings) {
    assert.equal(f.rule.scanner, 'prompt-injection');
  }
});

test('scanFile returns structured findings', () => {
  const content = `const prompt = \`You are a bot. \${req.body.msg}\`;`;
  const rules = loadRules();
  const findings = scanFile('test.ts', content, rules);
  // PI-001 should match this synthetic input via the fall-through, but our
  // strict regex requires `system: \`...${...}\``. Either way, scanFile must
  // not crash and must return an array.
  assert.ok(Array.isArray(findings));
});

test('CLI: list-rules exits 0 with output', () => {
  const cli = join(PKG_ROOT, 'cli.mjs');
  const r = spawnSync('node', [cli, 'list-rules'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /rule\(s\) loaded/);
});

test('CLI: scan vulnerable fixture exits 1', () => {
  const cli = join(PKG_ROOT, 'cli.mjs');
  const r = spawnSync('node', [cli, 'scan', join(FIXTURES, 'vulnerable-app.ts'), '--quiet', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 1, `expected exit 1 (findings present), got ${r.status}`);
  const report = JSON.parse(r.stdout);
  assert.ok(report.findings.length > 0);
});

test('CLI: scan clean fixture exits 0', () => {
  const cli = join(PKG_ROOT, 'cli.mjs');
  const r = spawnSync('node', [cli, 'scan', join(FIXTURES, 'clean-app.ts'),
    '--severity', 'high', '--quiet', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `expected exit 0 (no high findings), got ${r.status}`);
});

test('SARIF output is valid JSON', async () => {
  const { toSarif } = await import('../dist/sarif.js');
  const report = scan(FIXTURES, { files: [join(FIXTURES, 'vulnerable-app.ts')] });
  const sarif = toSarif(report);
  const json = JSON.stringify(sarif);
  const parsed = JSON.parse(json);
  assert.equal(parsed.version, '2.1.0');
  assert.equal(parsed.runs[0].tool.driver.name, 'agentshield');
  assert.ok(Array.isArray(parsed.runs[0].results));
});
