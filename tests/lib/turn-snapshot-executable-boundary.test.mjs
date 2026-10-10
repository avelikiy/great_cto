import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { snapshotTurn, listTurns, turnPatch, turnDiff, pruneTurns } from '../../scripts/lib/turn-snapshot.mjs';
import { commitFixture } from '../helpers/committed-fixture.mjs';
import { newRun, runStage } from '../../scripts/lib/codex-pipeline.mjs';

function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'turn-executable-boundary-')), root = join(temp, 'candidate');
  t.after(() => rmSync(temp, { recursive: true, force: true })); mkdirSync(root);
  writeFileSync(join(root, 'sample.txt'), 'before\n'); commitFixture(root);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
  const marker = join(temp, 'executed'), helper = join(temp, 'helper.mjs');
  writeFileSync(helper, `import {appendFileSync} from 'node:fs'; appendFileSync(${JSON.stringify(marker)}, 'invoked\\n'); process.stdout.write('converted\\n');`);
  const command = `'${process.execPath.replace(/'/g, "'\\''")}' '${helper.replace(/'/g, "'\\''")}'`;
  const executable = (name, body) => { const path = join(temp, name); writeFileSync(path, `#!/bin/sh\n${body}\n`); chmodSync(path, 0o700); return path; };
  writeFileSync(join(root, 'sample.txt'), 'after\n');
  return { root, git, marker, command, executable };
}

test('automatic snapshot does not invoke clean filters and leaves user index/HEAD unchanged', t => {
  const f = fixture(t); writeFileSync(join(f.root, '.gitattributes'), '*.txt filter=oracle\n');
  f.git(['config', 'filter.oracle.clean', f.command]);
  const converted = f.git(['hash-object', '--', 'sample.txt']).trim(); assert.ok(existsSync(f.marker)); rmSync(f.marker);
  const raw = f.git(['hash-object', '--no-filters', '--', 'sample.txt']).trim(); assert.notEqual(raw, converted);
  const index = readFileSync(join(f.root, '.git/index')), head = f.git(['rev-parse', 'HEAD']);
  const r = snapshotTurn(f.root, { session: 'clean', env: {} }); assert.equal(r.state, 'recorded', r.why);
  assert.equal(existsSync(f.marker), false);
  assert.equal(f.git(['rev-parse', `${r.commit}:sample.txt`]).trim(), raw);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index); assert.equal(f.git(['rev-parse', 'HEAD']), head);
  assert.equal(readFileSync(join(f.root, 'sample.txt'), 'utf8'), 'after\n');
});

test('automatic snapshot suppresses required process filters before launch', t => {
  const f = fixture(t); writeFileSync(join(f.root, '.gitattributes'), '*.txt filter=oracle\n');
  f.git(['config', 'filter.oracle.process', f.command]); f.git(['config', 'filter.oracle.required', 'true']);
  assert.throws(() => f.git(['hash-object', '--', 'sample.txt'])); assert.ok(existsSync(f.marker)); rmSync(f.marker);
  const r = snapshotTurn(f.root, { session: 'process', env: {} }); assert.equal(r.state, 'recorded', r.why);
  assert.equal(existsSync(f.marker), false); assert.equal(f.git(['show', `${r.commit}:sample.txt`]), 'after\n');
});

test('automatic snapshot disables filesystem-monitor executables', t => {
  const f = fixture(t); const monitor = f.executable('monitor.sh', f.command);
  f.git(['config', 'core.fsmonitor', monitor]); f.git(['ls-files']); assert.ok(existsSync(f.marker)); rmSync(f.marker);
  const r = snapshotTurn(f.root, { session: 'monitor', env: {} }); assert.equal(r.state, 'recorded', r.why);
  assert.equal(existsSync(f.marker), false);
});

test('turn creation and pruning do not invoke project reference-transaction hooks', t => {
  const f = fixture(t); const hook = f.executable('reference-transaction', `${f.command} >/dev/null`);
  f.git(['config', 'core.hooksPath', join(hook, '..')]);
  const head = f.git(['rev-parse', 'HEAD']).trim(); f.git(['update-ref', 'refs/fixture/witness', head]);
  assert.ok(existsSync(f.marker)); rmSync(f.marker);
  const r = snapshotTurn(f.root, { session: 'hooks', env: {} }); assert.equal(r.state, 'recorded', r.why);
  assert.equal(existsSync(f.marker), false);
  assert.equal(pruneTurns(f.root, { session: 'hooks', keep: 0 }).deleted.length, 1);
  assert.equal(existsSync(f.marker), false);
});

test('automatic diagnostic commits do not invoke configured signing programs', t => {
  const f = fixture(t); const signing = f.executable('signing.sh', `${f.command} >/dev/null\nexit 1`);
  f.git(['config', 'gpg.format', 'openpgp']); f.git(['config', 'gpg.program', signing]); f.git(['config', 'commit.gpgsign', 'true']);
  const tree = f.git(['rev-parse', 'HEAD^{tree}']).trim();
  // Plumbing commit-tree does not automatically inherit commit.gpgsign here.
  // Explicit -S proves the configured signer is executable, not a prior vulnerability.
  assert.throws(() => f.git(['commit-tree', '-S', tree, '-m', 'witness'])); assert.ok(existsSync(f.marker)); rmSync(f.marker);
  const r = snapshotTurn(f.root, { session: 'signing', env: {} }); assert.equal(r.state, 'recorded', r.why);
  assert.equal(existsSync(f.marker), false);
});

for (const driver of ['external', 'textconv']) test(`reading turn patches does not invoke ${driver} diff helper`, t => {
  const f = fixture(t); const r = snapshotTurn(f.root, { session: 'patch', env: {} }); assert.equal(r.state, 'recorded', r.why);
  if (driver === 'external') f.git(['config', 'diff.external', f.command]);
  else { writeFileSync(join(f.root, '.gitattributes'), '*.txt diff=oracle\n'); f.git(['config', 'diff.oracle.textconv', f.command]); }
  f.git(['diff', `${r.commit}^`, r.commit]); assert.ok(existsSync(f.marker)); rmSync(f.marker);
  assert.equal(turnPatch(f.root, { session: 'patch', turn: r.turn }).state, 'ok');
  assert.equal(turnDiff(f.root, { session: 'patch', turn: r.turn }).state, 'ok');
  assert.equal(existsSync(f.marker), false);
});

test('unbounded filter configuration refuses a snapshot instead of executing helpers', t => {
  const f = fixture(t);
  for (let i = 0; i < 129; i++) f.git(['config', `filter.fixture${i}.clean`, f.command]);
  const r = snapshotTurn(f.root, { session: 'over-cap', env: {} }); assert.equal(r.state, 'failed');
  assert.equal(existsSync(f.marker), false); assert.deepEqual(listTurns(f.root, { session: 'over-cap' }), []);
});

for (const failed of [false, true]) test(`controller finally snapshot suppresses helpers after ${failed ? 'failed' : 'verified'} worker`, async t => {
  const f = fixture(t), pluginRoot = join(f.root, '..', 'plugin');
  mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), '[transitions.writer]\non=["DONE"]\ngate="gate:ship"\nnext=[]');
  writeFileSync(join(f.root, '.gitattributes'), '*.txt filter=oracle\n');
  f.git(['config', 'filter.oracle.clean', f.command]); f.git(['config', 'filter.oracle.process', f.command]);
  f.git(['config', 'filter.oracle.required', 'true']);
  f.git(['config', 'core.fsmonitor', f.executable('monitor.sh', f.command)]);
  const hook = f.executable('reference-transaction', `${f.command} >/dev/null`);
  f.git(['config', 'core.hooksPath', join(hook, '..')]);
  f.git(['config', 'gpg.format', 'openpgp']);
  f.git(['config', 'gpg.program', f.executable('signing.sh', `${f.command} >/dev/null\nexit 1`)]);
  f.git(['config', 'commit.gpgsign', 'true']);
  const state = newRun({ root: f.root, pluginRoot, entry: 'writer', prompt: 'fixture', allowed: ['docs'] });
  await runStage(state, { execute: async () => {
    if (failed) throw Error('fixture worker failure');
    return { state: 'ok', code: 0, errors: [], finalText: JSON.stringify({ verdict: 'DONE', summary: 'fixture',
      files: [{ path: 'docs/report.md', before: null, content: 'fixture report' }] }) };
  }, verify: async () => ({ state: 'verified', findings: [], checks: ['fixture report bytes'] }) });
  assert.equal(state.status, failed ? 'blocked' : 'awaiting-gate');
  assert.equal(listTurns(f.root, { session: state.id }).length, 1, 'the actual finally path recorded its diagnostic turn');
  assert.equal(existsSync(f.marker), false); assert.equal(state.approvals.length, 0);
});
