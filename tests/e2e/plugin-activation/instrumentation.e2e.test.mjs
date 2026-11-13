// Isolated-HOME E2E, part 6: the instrument itself.
//
// Every scenario that says "no candidate byte ran" reads one marker file. That is only worth something if
// EVERY executable member of the fixture set writes to it when it runs, in every language the plugin
// ships (JavaScript as a module and as CommonJS, shell, Python). This file runs each member on its own
// and checks the marker, so a member that were left uninstrumented would be reported by name, and shows
// that a member WITHOUT the instrument really would go unseen (the control).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { newMachine, buildPackage, executions, ranFiles, EXECUTABLE, SMOKE_FILES, AFTER_ACTIVATION_FILES, SUCCESSFUL_INIT_RUNS } from './harness.mjs';

const interpreterFor = rel => rel.endsWith('.py') ? 'python3' : rel.endsWith('.sh') ? 'sh' : process.execPath;

function runMember(root, member) {
  // Outside the package root: its package.json says "type": "module", which would make a .js member a module.
  const target = path.join(root, 'probe', member.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, member.bytes);
  const r = spawnSync(interpreterFor(member.path), [target, 'probe'], { encoding: 'utf8', cwd: root });
  assert.equal(r.error, undefined, `${member.path}: ${r.error?.message}`);
  assert.equal(r.status, 0, `${member.path} did not run cleanly: ${r.stderr}`);
}

test('every executable member of the fixture set is instrumented, in every language, and says so when it runs', t => {
  const machine = newMachine(t), pkg = buildPackage(machine, { version: '3.72.0' });
  const members = pkg.set.files.filter(f => EXECUTABLE.test(f.path));
  const kinds = new Set(members.map(f => path.extname(f.path)));
  assert.deepEqual([...kinds].sort(), ['.js', '.mjs', '.py', '.sh'], 'the set holds each kind of executable the plugin ships');
  assert.ok(members.length >= 8, `only ${members.length} executable members: the fixture set shrank`);
  for (const member of members) assert.ok(member.bytes.includes(pkg.marker), `${member.path} is not instrumented: it could run and nobody would know`);

  assert.deepEqual(executions(pkg), [], 'nothing has run yet');
  for (const member of members) runMember(machine.root, member);
  assert.deepEqual(ranFiles(pkg).sort(), members.map(f => f.path).sort(), 'each member left exactly one marker, under its own name');
  const entry = executions(pkg).find(e => e.file === 'packages/cli/index.mjs');
  assert.deepEqual(entry.argv, ['probe'], 'the marker records the arguments');
});

test('control: a member that is not instrumented leaves no marker, so the check above can tell the difference', t => {
  const machine = newMachine(t), pkg = buildPackage(machine, { version: '3.72.0' });
  const bare = { path: 'scripts/hooks/bare.mjs', bytes: Buffer.from('console.log("ran");\n') };
  assert.equal(bare.bytes.includes(pkg.marker), false);
  runMember(machine.root, bare);
  assert.deepEqual(executions(pkg), [], 'an uninstrumented run is invisible: that is what the instrument check exists to prevent');
});

test('the entry points init reaches on purpose are named: the smoke and the discovery script, and nothing else', () => {
  assert.deepEqual(SMOKE_FILES, ['packages/cli/index.mjs', 'scripts/lib/gate-plan.mjs']);
  assert.deepEqual(AFTER_ACTIVATION_FILES, ['scripts/skill-discover.sh']);
  assert.deepEqual(SUCCESSFUL_INIT_RUNS, [...SMOKE_FILES, ...AFTER_ACTIVATION_FILES]);
});
