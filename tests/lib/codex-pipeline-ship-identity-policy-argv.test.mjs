import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {fixture, invoke, calls} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

for (const form of ['equals-path', 'equals-empty', 'equals-malformed', 'separate-missing-value']) test(`N13 strict ship policy argv ${form} refuses before legacy persistence or worker dispatch`, t => {
  const f = fixture(t);
  const flags = {
    'equals-path': [`--ship-evidence-policy=${f.policyPath}`],
    'equals-empty': ['--ship-evidence-policy='],
    'equals-malformed': [`--ship-evidence-policy==${f.policyPath}`],
    'separate-missing-value': ['--ship-evidence-policy'],
  }[form];
  const out = invoke(f, ['start', '--dir', f.root, '--prompt', 'Synthetic requested strict source review', '--allow', 'src,docs', '--entry', 'qa-engineer', ...flags]);
  const runFiles = readdirSync(f.runs).filter(name => /^[a-f0-9-]{36}\.json$/.test(name));
  const workerCalls = calls(f).filter(row => row.kind === 'worker').length;
  assert.equal(runFiles.length, 0, `malformed requested strict mode cannot create legacy run; child exit=${out.status}, workerCalls=${workerCalls}`);
  assert.equal(workerCalls, 0);
  assert.equal(out.status, 2, out.stdout + out.stderr);
});
