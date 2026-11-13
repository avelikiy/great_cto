// Isolated-HOME E2E, part 4: one flipped byte in the signed set that ships beside the CLI.
//
// Each case flips a single bit-pair in one file of the embedded set — the archive, the inventory, a
// sidecar signature, the release index — and runs the real `init`. It must refuse by name, before the
// transaction opens, with the host files untouched, nothing published, and no byte of the candidate
// executed (the fixture's entry point leaves a marker whenever it runs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { newMachine, buildPackage, runInit, seedHost, snapshot, executions, journals, versionDir, tail } from './harness.mjs';

const flipMiddle = bytes => bytes.length >> 1;
const flipInsideSignature = bytes => bytes.indexOf('"signature":"') + '"signature":"'.length + 8;

const CASES = [
  ['archive', v => `great-cto-plugin-${v}.tgz`, /embedded-artifact-mismatch/, flipMiddle],
  ['inventory', () => 'plugin-inventory.json', /embedded-artifact-mismatch/, flipMiddle],
  ['sidecar signature', v => `great-cto-plugin-${v}.tgz.signature.json`, /embedded-signature-refused/, flipInsideSignature],
  ['release index', () => 'release-index.json', /embedded-(signature|index)-refused/, flipMiddle],
];

for (const [label, fileFor, reason, offsetOf] of CASES) {
  test(`one flipped byte in the ${label} is refused before any write and no candidate byte runs`, t => {
    const machine = newMachine(t); seedHost(machine);
    const pkg = buildPackage(machine, { version: '3.72.0' });
    const target = path.join(pkg.set.directory, fileFor(pkg.version));
    const original = fs.readFileSync(target), flipped = Buffer.from(original);
    flipped[offsetOf(original)] ^= 0x01;
    assert.equal(flipped.filter((b, i) => b !== original[i]).length, 1, 'exactly one byte differs');
    fs.writeFileSync(target, flipped);

    const before = snapshot(machine.claudeDir, { times: true });
    const run = runInit(machine, pkg);
    assert.equal(run.status, 1, tail(run.output));
    assert.match(run.output, reason);
    assert.match(run.output, /plugin activation refused/);
    assert.deepEqual(snapshot(machine.claudeDir, { times: true }), before, 'the host files and the cache root are exactly as they were');
    assert.equal(fs.existsSync(versionDir(machine, '3.72.0')), false, 'nothing was published');
    assert.equal(executions(pkg).length, 0, 'no byte of the candidate ran');
    assert.deepEqual(journals(machine), [], 'admission refused before a transaction opened');
    assert.equal(fs.existsSync(path.join(run.project, '.great_cto')), false, 'init stopped before bootstrapping the project');

    // The refusal was about that byte, not about this machine: put it back and the same init goes through.
    fs.writeFileSync(target, original);
    const repaired = runInit(machine, pkg);
    assert.equal(repaired.status, 0, tail(repaired.output));
    assert.equal(executions(pkg).length, 1);
  });
}
