import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pinChangeBase, assessChange } from '../../scripts/lib/runtime-gate-policy.mjs';
import { specialistPlan } from '../../scripts/lib/specialist-plan.mjs';
import { scopedReviewInput } from '../../scripts/lib/scoped-review-reuse.mjs';

function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'adaptive-git-boundary-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, 'project'); mkdirSync(root); mkdirSync(join(root, '.great_cto'));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-q']); writeFileSync(join(root, 'sample.txt'), 'before\n');
  writeFileSync(join(root, '.great_cto/PROJECT.md'), 'archetype: fintech\n');
  git(['add', '.']);
  git(['-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'baseline']);
  const base = pinChangeBase(root, 'HEAD');
  writeFileSync(join(root, 'sample.txt'), 'after\n');
  const marker = join(temp, 'executed'), helper = join(temp, 'helper.mjs');
  writeFileSync(helper, `import {appendFileSync} from 'node:fs';appendFileSync(${JSON.stringify(marker)},'invoked\\n');process.stdout.write('converted\\n');`);
  const quote = s => `'${s.replaceAll("'", "'\\''")}'`;
  const command = `${quote(process.execPath)} ${quote(helper)}`;
  const state = { root, graphHash: 'frozen', prompt: 'Inspect dependency',
    graph: { 'pci-reviewer': { on: ['PASS'], gate: ['gate:ship'], next: [] } },
    specialistReview: { roles: ['pci-reviewer'] }, specialistPolicy: { workflow: 'existing-change' } };
  return { root, base, marker, command, git, state, temp };
}

function configure(f, mode) {
  if (mode === 'fsmonitor') {
    const monitor = join(f.temp, 'monitor.sh');
    writeFileSync(monitor, `#!/bin/sh\n${f.command}\n`); chmodSync(monitor, 0o700);
    f.git(['config', 'core.fsmonitor', monitor]);
  } else if (mode === 'external') f.git(['config', 'diff.external', f.command]);
  else if (mode === 'textconv') {
    writeFileSync(join(f.root, '.gitattributes'), '*.txt diff=fixture\n');
    f.git(['config', 'diff.fixture.textconv', f.command]);
  } else {
    writeFileSync(join(f.root, '.gitattributes'), '*.txt filter=fixture\n');
    f.git(['config', `filter.fixture.${mode}`, f.command]);
    f.git(['config', 'filter.fixture.required', 'true']);
  }
  // Actual harmless helper execution demonstrates the fixture is live. The
  // process-filter protocol intentionally fails after recording its launch.
  try { f.git(mode === 'fsmonitor' ? ['ls-files'] : ['diff', 'HEAD']); }
  catch (error) { assert.equal(mode, 'process', error.message); }
  assert.equal(existsSync(f.marker), true, 'configured helper must actually run in the unprotected witness');
  rmSync(f.marker);
}

const observers = {
  risk(f) { const result = assessChange(f.root, f.base); assert.equal(result.known, true); assert.ok(result.files.includes('sample.txt')); },
  specialists(f) { const result = specialistPlan({ root: f.root, base: f.base, rules: [] }); assert.equal(result.state, 'planned', result.reason); assert.match(result.fingerprint, /^[a-f0-9]{64}$/); },
  reuse(f) { const result = scopedReviewInput(f.state, 'pci-reviewer', ['sample.txt']); assert.match(result.digest, /^[a-f0-9]{64}$/); assert.equal(result.binding.inputs.length, 1); },
};
for (const [name, observe] of Object.entries(observers)) {
  for (const mode of ['fsmonitor', 'clean', 'process', 'external', 'textconv']) {
    test(`${name} observer reads real evidence without executing configured ${mode} helper`, t => {
      const f = fixture(t); configure(f, mode); observe(f);
      assert.equal(existsSync(f.marker), false, 'observer must never execute project helpers before sandbox');
    });
  }
}

test('failed Git evidence cannot produce known risk, selective plan or reusable dependency digest', t => {
  const f = fixture(t); f.git(['config', 'core.repositoryFormatVersion', '999']);
  assert.equal(assessChange(f.root, f.base).known, false);
  const plan = specialistPlan({ root: f.root, base: f.base, rules: [] });
  assert.equal(plan.state, 'unknown'); assert.equal(plan.fingerprint, null);
  assert.throws(() => scopedReviewInput(f.state, 'pci-reviewer', ['sample.txt']), /read-only Git evidence unavailable/);
});

test('unbounded filter configuration fails closed before adaptive evidence inspection', t => {
  const f = fixture(t);
  for (let i = 0; i < 129; i++) f.git(['config', `filter.fixture${i}.clean`, f.command]);
  assert.equal(assessChange(f.root, f.base).known, false);
  assert.equal(specialistPlan({ root: f.root, base: f.base, rules: [] }).state, 'unknown');
  assert.equal(existsSync(f.marker), false);
});
