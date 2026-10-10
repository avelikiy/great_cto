import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYaml } from '../../scripts/lib/workflow-security.mjs';

test('Evals Runner installs and builds the CLI before library tests import its runtime', () => {
  const workflow = parseYaml(readFileSync(new URL('../../.github/workflows/evals-runner.yml', import.meta.url), 'utf8'));
  const steps = workflow.get('jobs').get('unit').get('steps').items;
  const install = steps.findIndex(step => step.get('run')?.value === 'npm ci --no-audit --no-fund');
  const build = steps.findIndex(step => step.get('run')?.value === 'npm run build');
  const tests = steps.findIndex(step => step.get('run')?.value.includes("'tests/lib/*.test.mjs'"));
  assert.ok(install >= 0, 'clean runners need CLI dependencies, including TypeScript');
  assert.ok(build > install, 'CLI dist must be built after dependency installation');
  assert.ok(tests > build, 'library tests must run after the CLI runtime is built');
  for (const index of [install, build]) {
    assert.equal(steps[index].get('working-directory')?.value, 'packages/cli');
    assert.equal(steps[index].get('continue-on-error')?.value, undefined);
    assert.equal(steps[index].get('if')?.value, undefined, 'runtime preparation cannot be conditional');
  }
});
