// Isolated-HOME E2E, part 3: two `great-cto init` processes at once.
//
// The first is held inside its smoke — after the host files are written, before SMOKE_PASSED is
// journalled — by the fixture's own `packages/cli/index.mjs`, which waits for a release file. That puts
// the lock in the hands of a live process for as long as the test needs, without sleeping or racing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  newMachine, buildPackage, runInit, startInit, waitFor, seedHost, readHost, snapshot, executions,
  journals, stateRecords, alive, PHASES, PLUGIN_KEY, tail,
} from './harness.mjs';

test('two concurrent inits: the second refuses with installation-busy-lock and writes nothing', async t => {
  // However this test ends, the first init must not outlive it. Hooks run in the order they were
  // registered and newMachine() registers the removal of the machine, so this one goes first.
  let release = () => {};
  t.after(() => release());
  const machine = newMachine(t); seedHost(machine);
  const pkg = buildPackage(machine, { version: '3.72.0', hold: true });
  const first = startInit(machine, pkg);
  release = () => { first.child.kill('SIGKILL'); fs.writeFileSync(pkg.release, ''); };

  await waitFor('the first init to reach its smoke', () => executions(pkg).length === 1);
  const held = stateRecords(machine);
  assert.equal(held.owner.pid, first.child.pid, 'the lock belongs to the first init');
  assert.equal(alive(held.owner.pid), true);
  assert.deepEqual(journals(machine).map(j => j.phases), [PHASES.slice(0, -1)], 'host files written, SMOKE_PASSED not yet journalled');

  const before = snapshot(machine.claudeDir, { times: true });
  const second = runInit(machine, pkg);
  assert.equal(second.status, 1, tail(second.output));
  assert.match(second.output, /needs recovery: installation-busy-lock/);
  assert.match(second.output, /Another great-cto init is running/);
  assert.deepEqual(snapshot(machine.claudeDir, { times: true }), before, 'zero writes to the cache, registry, settings, marketplace or managed directories');
  assert.equal(fs.existsSync(path.join(second.project, '.great_cto')), false, 'the second init did not bootstrap its project');
  assert.equal(stateRecords(machine).owner.pid, first.child.pid, 'a live lock is not taken over, not even by recovery');
  assert.equal(executions(pkg).length, 1, 'the second init ran no candidate byte');

  fs.writeFileSync(pkg.release, '');
  const done = await first.done;
  assert.equal(done.status, 0, tail(done.output));
  assert.equal(readHost(machine).registry.plugins[PLUGIN_KEY][0].version, '3.72.0');
  assert.deepEqual(journals(machine).map(j => j.phases), [PHASES], 'only the first init ever opened a transaction');
  assert.equal(stateRecords(machine).pointer.state, 'COMPLETE');

  const third = runInit(machine, pkg);
  assert.equal(third.status, 0, tail(third.output));
  assert.match(third.output, /already active at/);
});
