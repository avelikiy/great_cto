import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {fixture, scenario, invokeBound} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';
import {createRun, reassess, reviewAll} from '../fixtures/ship-evidence-identity/stage2/bound-run.mjs';
const REQUIRED = ['--readonly', '--sandbox', 'list', '--all', '--limit', '0', '--include-gates', '--include-infra', '--include-templates', '--include-ephemeral', '--max-rows', '10000', '--json'];
const rows = () => [...Array.from({length: 50}, (_, i) => ({id: `closed:${i}`, status: 'closed', labels: []})),
  ...['ordinary', 'gate', 'infra', 'template', 'ephemeral'].map((kind, i) => ({id: `foreign:${51 + i}:${kind}`, status: 'blocked', labels: [kind]}))];
test('full global reader requires bounded all-category readonly argv and disabled background side effects', t => {
  const f = fixture(t); scenario(f, {tasks: rows()});
  const execute = (argv, env = {}) => spawnSync(join(f.bin, 'bd'), argv, {cwd: f.root, env: {...f.env, ...env}, encoding: 'utf8'});
  const valid = execute(REQUIRED); assert.equal(valid.status, 0); assert.equal(JSON.parse(valid.stdout).length, 55);
  for (const argv of [['list', '--json'], REQUIRED.filter(v => v !== '--all'), REQUIRED.filter(v => v !== '--include-gates'), REQUIRED.filter(v => v !== '--include-infra'), REQUIRED.filter(v => v !== '--include-templates'), REQUIRED.filter(v => v !== '--include-ephemeral')]) assert.equal(execute(argv).status, 9);
  assert.equal(execute(REQUIRED, {BD_DOLT_AUTO_PUSH: 'true'}).status, 9);
  assert.equal(execute(REQUIRED, {BD_DISABLE_EVENT_FLUSH: '0'}).status, 9);
});
test('actual bound CLI retains 51st foreign blocker and gate infra template ephemeral rows', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f); f.release(); scenario(f, {tasks: rows()});
  const out = invokeBound(f, f.state.id, f.state.shipEvidence.revision); assert.equal(out.status, 2);
  const report = JSON.parse(out.stdout); assert.notEqual(report.state, 'PASS');
  assert.deepEqual(report.result.blockingTasks.map(row => row.id).sort(), rows().slice(50).map(row => row.id).sort());
});
