import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync, readFileSync, existsSync, unlinkSync, renameSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {captureShipContext, recheckShipContext, readShipPolicy} from '../../scripts/lib/ship-evidence-context.mjs';
import {shellQuote} from '../../scripts/lib/codex-checks.mjs';
import {fixture, git, commit} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

function filterFixture(t) {
  const f = fixture(t); writeFileSync(join(f.root, '.gitattributes'), 'src/app.mjs filter=synthetic-owned\n'); commit(f, 'synthetic filter attribute before command configuration');
  const descriptor = readShipPolicy({root: f.root, path: f.policyPath});
  const args = {root: f.root, registration: descriptor.registration, taskId: 'synthetic:task', runId: 'synthetic:run', gateId: 'gate:ship', policy: descriptor.policy, requirements: descriptor.requirements};
  const initial = captureShipContext(args); assert.equal(initial.state, 'COMPLETE');
  const path = join(f.root, 'src/app.mjs'), original = readFileSync(path, 'utf8');
  const controlBytes = original.replace('42', '24'), probeBytes = original.replace('42', '13');
  assert.notEqual(controlBytes, original); assert.notEqual(probeBytes, original);
  assert.equal(Buffer.byteLength(controlBytes), Buffer.byteLength(original)); assert.equal(Buffer.byteLength(probeBytes), Buffer.byteLength(original));
  const replace = bytes => {const temporary = `${path}.owned-filter-temp`; writeFileSync(temporary, bytes); renameSync(temporary, path);};
  const sentinel = join(f.base, 'owned-clean-filter-sentinel'), script = join(f.base, 'owned-clean-filter.mjs');
  writeFileSync(script, [`#!${process.execPath}`, `import {readFileSync,writeFileSync} from 'node:fs';`,
    `writeFileSync(${JSON.stringify(sentinel)}, 'owned clean filter executed', {mode:0o600});`,
    `process.stdout.write(readFileSync(0, 'utf8').replace(/24|13/g, '42'));`, ''].join('\n'), {mode: 0o700});
  git(f, 'config', 'filter.synthetic-owned.clean', shellQuote(script)); git(f, 'config', 'filter.synthetic-owned.required', 'true');
  const configPath = join(f.root, '.git/config'), configBytes = readFileSync(configPath);
  replace(controlBytes);
  const control = spawnSync('/usr/bin/git', ['-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '--untracked-files=all'], {cwd: f.root, env: f.env, encoding: 'utf8'});
  assert.equal(control.status, 0, `UNSUPPORTED: synthetic clean-filter control failed: ${control.stderr}`);
  assert.ok(existsSync(sentinel), 'UNSUPPORTED: direct Git status did not execute owned clean filter; cannot claim safety PASS');
  assert.equal(control.stdout.trim(), '', 'valid control filter must return exact committed bytes');
  unlinkSync(sentinel); replace(probeBytes); // Equal byte length, new inode; no timestamp race/sleep.
  return {f, args, initial, sentinel, configPath, configBytes, path, original, probeBytes};
}
function noFilterExecution(probe) {
  assert.equal(existsSync(probe.sentinel), false, 'read-only collector cannot execute repository clean/process filter');
  assert.deepEqual(readFileSync(probe.configPath), probe.configBytes, 'collector cannot rewrite filter configuration');
  assert.equal(readFileSync(probe.path, 'utf8'), probe.probeBytes, 'collector cannot rewrite source bytes');
  assert.equal(git(probe.f, '-c', 'filter.synthetic-owned.clean=', '-c', 'filter.synthetic-owned.process=', '-c', 'filter.synthetic-owned.required=false', 'rev-parse', 'HEAD'), probe.initial.expected.source.head);
}
test('N09 capture does not execute repository clean filter while reading tracked source status', t => {
  const probe = filterFixture(t); const result = captureShipContext(probe.args); noFilterExecution(probe);
  assert.equal(result.state, 'UNKNOWN', 'unsafe filter cannot hide raw tracked source drift');
});
test('N09 recheck does not execute repository clean filter while reading tracked source status', t => {
  const probe = filterFixture(t); const result = recheckShipContext({root: probe.f.root, registration: probe.args.registration, expected: probe.initial.expected}); noFilterExecution(probe);
  assert.notEqual(result.state, 'MATCH', 'unsafe filter cannot turn raw tracked source drift into a matching context');
});
