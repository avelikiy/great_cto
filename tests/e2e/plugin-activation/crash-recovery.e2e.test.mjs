// Isolated-HOME E2E, part 2: a crash at every durable boundary of the activation transaction, and what the
// next real `great-cto init` does about it. The crash is real — a separate process that dies when a
// boundary has been journalled, through the transaction's own `onPhase` hook — and so is the recovery:
// nothing here calls the recovery function; `init` finds the dead owner's lock and does it itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  newMachine, buildPackage, runInit, crashAt, recoverCrashed, hostFiles, paths, versionDir, seedHost, readHost,
  inventoryOf, executions, ranFiles, SMOKE_FILES, SUCCESSFUL_INIT_RUNS, journals, stateRecords, alive, PHASES, PLUGIN_KEY, tail,
} from './harness.mjs';

/** Boundaries after which the host may already differ from where it started: recovery restores it. */
const ROLLS_BACK = ['ACTIVATING', 'REGISTRY_WRITTEN', 'SETTINGS_WRITTEN', 'MARKETPLACE_WRITTEN', 'ACTIVE'];

test('the transaction journals exactly the eight boundaries the crash tests cover', t => {
  const machine = newMachine(t); seedHost(machine);
  const pkg = buildPackage(machine, { version: '3.72.0' });
  const run = crashAt(machine, pkg);
  assert.equal(run.status, 0, run.stderr);
  const { result, phases } = JSON.parse(run.stdout);
  assert.equal(result.state, 'SMOKE_PASSED', JSON.stringify(result));
  assert.deepEqual(phases, PHASES, 'a boundary was added or removed: the crash loop below must follow it');
});

for (const boundary of PHASES) {
  test(`crash after ${boundary}: the next init recovers, activates, and ran no candidate byte before the smoke`, t => {
    const machine = newMachine(t); seedHost(machine);
    const pkg = buildPackage(machine, { version: '3.72.0' });
    const crashed = crashAt(machine, pkg, boundary);
    assert.equal(crashed.status, 9, `the child must die at ${boundary}: ${crashed.stderr}`);

    // What a crash leaves behind: a lock whose owner is dead, an unfinished transaction, a journal that stops there.
    const left = stateRecords(machine);
    assert.equal(alive(left.owner.pid), false, 'the lock owner is dead');
    assert.equal(left.pointer.state, 'IN_FLIGHT');
    assert.deepEqual(journals(machine).map(j => j.phases.at(-1)), [boundary]);
    // The only candidate code that runs is the smoke, which comes after ACTIVE is journalled.
    assert.deepEqual(ranFiles(pkg), boundary === 'SMOKE_PASSED' ? SMOKE_FILES : [], 'candidate bytes ran before the smoke');

    const run = runInit(machine, pkg);
    assert.equal(run.status, 0, tail(run.output));
    assert.match(run.output, boundary === 'SMOKE_PASSED' ? /already active at/ : /published to/);

    const host = readHost(machine);
    assert.deepEqual([host.registry.plugins[PLUGIN_KEY][0].version, host.registry.plugins[PLUGIN_KEY][0].localContentSha256], ['3.72.0', pkg.set.inventoryDigest]);
    assert.equal(host.settings.enabledPlugins[PLUGIN_KEY], true);
    assert.deepEqual(host.marketplace.plugins.map(e => [e.name, e.source]), [['other', '/y'], ['great_cto', versionDir(machine, '3.72.0')]]);
    assert.deepEqual(host.registry.plugins['other@market'], [{ scope: 'user', installPath: '/x', version: '1.0.0' }], 'the other plugin survived the crash and the recovery');
    assert.deepEqual([host.settings.theme, host.settings.enabledPlugins['other@market']], ['dark', true]);
    assert.deepEqual(inventoryOf(versionDir(machine, '3.72.0')), pkg.set.inventory.files);
    assert.equal(stateRecords(machine).pointer.state, 'COMPLETE');
    assert.deepEqual(ranFiles(pkg), SUCCESSFUL_INIT_RUNS, 'the candidate ran once in total: one smoke, then the discovery script init runs when activation is done');

    // The journals show what recovery did: the interrupted transaction was rolled back (or, when its
    // smoke had already passed, kept), and one more finished the job.
    const interrupted = [...PHASES.slice(0, PHASES.indexOf(boundary) + 1), ...(ROLLS_BACK.includes(boundary) ? ['ROLLED_BACK'] : [])];
    const expected = boundary === 'SMOKE_PASSED' ? [PHASES] : [interrupted, PHASES];
    assert.deepEqual(journals(machine).map(j => j.phases.join(',')).sort(), expected.map(list => list.join(',')).sort());
  });
}

// `init` recovers and retries in one go, so its end state cannot tell "restored, then redone" from "left
// as the crash found it, then completed". Looking at the host between the two can.
for (const boundary of PHASES) {
  test(`crash after ${boundary}: recovery alone puts every host file back exactly as it was`, t => {
    const machine = newMachine(t); seedHost(machine);
    const pkg = buildPackage(machine, { version: '3.72.0' });
    const before = hostFiles(machine);
    assert.equal(crashAt(machine, pkg, boundary).status, 9);
    const crashedState = hostFiles(machine);
    // From ACTIVATING on, the crash left the host different from where it started; before that it is untouched.
    const touched = ['REGISTRY_WRITTEN', 'SETTINGS_WRITTEN', 'MARKETPLACE_WRITTEN', 'ACTIVE', 'SMOKE_PASSED'].includes(boundary);
    assert.equal(JSON.stringify(crashedState) !== JSON.stringify(before), touched, `the crash at ${boundary} ${touched ? 'should have' : 'should not have'} changed a host file`);

    const outcome = recoverCrashed(machine, pkg);
    if (boundary === 'SMOKE_PASSED') {
      assert.equal(outcome.state, 'RECOVERED_ACTIVE', JSON.stringify(outcome));
      assert.deepEqual(hostFiles(machine), crashedState, 'a passed smoke is kept, not undone');
    } else {
      assert.equal(outcome.state, 'ROLLED_BACK', JSON.stringify(outcome));
      assert.deepEqual(hostFiles(machine), before, 'every host file is byte-for-byte what it was before the transaction');
    }
    assert.equal(stateRecords(machine).pointer.state, 'COMPLETE');
    assert.deepEqual(ranFiles(pkg), boundary === 'SMOKE_PASSED' ? SMOKE_FILES : [], 'recovery ran no candidate byte');
  });
}

test('a host edit made after a crash is never overwritten: init stops with RECOVERY_REQUIRED and activates nothing', t => {
  const machine = newMachine(t); seedHost(machine);
  const pkg = buildPackage(machine, { version: '3.72.0' }), p = paths(machine);
  assert.equal(crashAt(machine, pkg, 'SETTINGS_WRITTEN').status, 9);
  const edit = JSON.stringify({ theme: 'light', note: 'edited by the user while init was dead' }) + '\n';
  fs.writeFileSync(p.settings, edit);

  const run = runInit(machine, pkg);
  assert.equal(run.status, 1, tail(run.output));
  assert.match(run.output, /needs recovery: host-file-changed-since-write/);
  assert.equal(fs.readFileSync(p.settings, 'utf8'), edit, 'the user\'s edit is exactly as they left it');
  assert.equal(fs.existsSync(path.join(run.project, '.great_cto')), false, 'init did not carry on to bootstrap the project');
  assert.equal(stateRecords(machine).pointer.state, 'IN_FLIGHT', 'the transaction stays open for a person to look at');

  const again = runInit(machine, pkg);
  assert.equal(again.status, 1, tail(again.output));
  assert.match(again.output, /needs recovery/);
  assert.equal(fs.readFileSync(p.settings, 'utf8'), edit);
  assert.equal(executions(pkg).length, 0, 'no candidate byte ran while recovery was pending');
});
