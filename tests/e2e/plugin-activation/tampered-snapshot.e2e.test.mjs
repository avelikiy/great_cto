// Isolated-HOME E2E, part 4: a tampered signed set shipped beside the CLI.
//
// Each case damages one file of the embedded set — a single flipped byte in the archive, the inventory,
// a sidecar signature or the release index; a valid sidecar moved onto another blob; a sidecar that names
// another index digest — and runs the real `init`. It must refuse by name, before the transaction opens,
// with the host files untouched, nothing published, and no byte of the candidate executed (the fixture's
// entry point leaves a marker whenever it runs). Putting the file back must make the same init succeed:
// the refusal was about the damage, not about the machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { newMachine, buildPackage, runInit, seedHost, snapshot, executions, journals, versionDir, tail } from './harness.mjs';

/** Damages a set with `damage(directory, version)`, expects a clean refusal, then puts the set back and expects success. */
// A copy of the undamaged set is kept beside the package so a case can restore it byte for byte.
function withPristineCopy(t, reason, damage, label) {
  const machine = newMachine(t); seedHost(machine);
  const pkg = buildPackage(machine, { version: '3.72.0' });
  const kept = path.join(machine.root, 'pristine-set');
  fs.cpSync(pkg.set.directory, kept, { recursive: true });
  const pristine = snapshot(pkg.set.directory);
  damage(pkg.set.directory, pkg.version);
  assert.notDeepEqual(snapshot(pkg.set.directory), pristine, `${label}: the set was not damaged`);

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

  for (const name of fs.readdirSync(kept)) fs.copyFileSync(path.join(kept, name), path.join(pkg.set.directory, name));
  const repaired = runInit(machine, pkg);
  assert.equal(repaired.status, 0, tail(repaired.output));
  assert.equal(executions(pkg).length, 1);
}

const flipOneByte = (file, offsetOf) => {
  const original = fs.readFileSync(file), flipped = Buffer.from(original);
  flipped[offsetOf(original)] ^= 0x01;
  assert.equal(flipped.filter((b, i) => b !== original[i]).length, 1, 'exactly one byte differs');
  fs.writeFileSync(file, flipped);
};
const middle = bytes => bytes.length >> 1;
const insideSignature = bytes => bytes.indexOf('"signature":"') + '"signature":"'.length + 8;

const FLIPS = [
  ['archive', v => `great-cto-plugin-${v}.tgz`, /embedded-artifact-mismatch/, middle],
  ['inventory', () => 'plugin-inventory.json', /embedded-artifact-mismatch/, middle],
  ['sidecar signature', v => `great-cto-plugin-${v}.tgz.signature.json`, /embedded-signature-refused/, insideSignature],
  ['release index', () => 'release-index.json', /embedded-(signature|index)-refused/, middle],
];
for (const [label, fileFor, reason, offsetOf] of FLIPS) {
  test(`one flipped byte in the ${label} is refused before any write and no candidate byte runs`, t => {
    withPristineCopy(t, reason, (dir, version) => flipOneByte(path.join(dir, fileFor(version)), offsetOf), label);
  });
}

test('a valid sidecar copied onto another blob is refused: it is bound to its own filename', t => {
  withPristineCopy(t, /embedded-signature-refused/, (dir, version) => {
    fs.copyFileSync(path.join(dir, 'sbom.cdx.json.signature.json'), path.join(dir, `great-cto-plugin-${version}.tgz.signature.json`));
  }, 'swapped sidecar');
});

test('a sidecar naming another index digest is refused: it is bound to the index it was signed with', t => {
  withPristineCopy(t, /embedded-signature-refused/, (dir) => {
    const file = path.join(dir, 'plugin-inventory.json.signature.json'), envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
    envelope.indexDigest = '0'.repeat(64);
    fs.writeFileSync(file, JSON.stringify(envelope) + '\n');
  }, 'stale index digest');
});
