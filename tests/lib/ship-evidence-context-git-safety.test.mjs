import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync, unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readShipPolicy, captureShipContext, recheckShipContext} from '../../scripts/lib/ship-evidence-context.mjs';
import {shellQuote} from '../../scripts/lib/codex-checks.mjs';
import {fixture, git} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

function monitoredFixture(t) {
  const f = fixture(t); const descriptor = readShipPolicy({root: f.root, path: f.policyPath});
  const args = {root: f.root, registration: descriptor.registration, taskId: 'synthetic:task', runId: 'synthetic:run', gateId: 'gate:ship', policy: descriptor.policy, requirements: descriptor.requirements};
  const initial = captureShipContext(args); assert.equal(initial.state, 'COMPLETE');
  const sentinel = join(f.base, 'owned-fsmonitor-sentinel'); const hook = join(f.base, 'owned-fsmonitor-hook.mjs');
  writeFileSync(hook, [`#!${process.execPath}`, `import {writeFileSync} from 'node:fs';`,
    `writeFileSync(${JSON.stringify(sentinel)}, 'synthetic fsmonitor executed', {mode:0o600});`,
    `process.stdout.write(Buffer.from('synthetic-token\\0/\\0'));`, ''].join('\n'), {mode: 0o700});
  git(f, 'config', 'core.fsmonitor', shellQuote(hook)); git(f, 'config', 'core.fsmonitorHookVersion', '2');
  const configPath = join(f.root, '.git/config'); const configBytes = readFileSync(configPath);
  const control = spawnSync('/usr/bin/git', ['status', '--porcelain=v1', '--untracked-files=all'], {cwd: f.root, env: f.env, encoding: 'utf8'});
  assert.equal(control.status, 0, `UNSUPPORTED: direct synthetic fsmonitor control failed: ${control.stderr}`);
  assert.ok(existsSync(sentinel), 'UNSUPPORTED: installed Git did not execute explicit synthetic fsmonitor control; cannot claim safety PASS');
  assert.doesNotMatch(control.stderr, /invalid.*fsmonitor|fsmonitor.*invalid|invalid result/i, 'UNSUPPORTED: synthetic control must speak valid fsmonitor protocol');
  assert.equal(control.stdout.trim(), '', 'control hook protocol must preserve clean product status');
  unlinkSync(sentinel); // This exact owned temporary sentinel is the only removed probe file.
  assert.deepEqual(readFileSync(configPath), configBytes);
  return {f, args, initial, sentinel, configPath, configBytes};
}
function unchanged(test) {
  const {f, sentinel, configPath, configBytes, initial} = test;
  assert.equal(existsSync(sentinel), false, 'collector must not execute untrusted repository fsmonitor');
  assert.deepEqual(readFileSync(configPath), configBytes, 'collector must not rewrite repository configuration');
  assert.equal(git(f, '-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'), initial.expected.source.head);
  assert.equal(git(f, '-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD^{tree}'), initial.expected.source.tree);
  assert.equal(git(f, '-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '--untracked-files=all'), '');
}
test('N09 capture reads configured Git source without executing repository fsmonitor hook', t => {
  const probe = monitoredFixture(t); const out = captureShipContext(probe.args); unchanged(probe);
  assert.equal(out.state, 'COMPLETE'); assert.equal(out.contextDigest, probe.initial.contextDigest);
});
test('N09 recheck reads configured Git source without executing repository fsmonitor hook', t => {
  const probe = monitoredFixture(t); const out = recheckShipContext({root: probe.f.root, registration: probe.args.registration, expected: probe.initial.expected}); unchanged(probe);
  assert.equal(out.state, 'MATCH'); assert.equal(out.contextDigest, probe.initial.contextDigest);
});
