// The owner's release-key ceremony (scripts/enroll-release-key.mjs). Every key here is ephemeral and
// lives under os.tmpdir(); the repository's own release-trust.mjs is read, never written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  PIN_FILE, fingerprintOfPublicPem, pinnedFingerprint, withPin, generateReleaseKey,
} from '../../scripts/enroll-release-key.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'enroll-release-key.mjs');
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-enrol-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const spki = key => createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');

test('the shipped source pins the sentinel or exactly one fingerprint, in the line the tool knows', () => {
  const pin = pinnedFingerprint(fs.readFileSync(PIN_FILE, 'utf8'));
  assert.ok(pin === null || /^[a-f0-9]{64}$/.test(pin));
});

test('fingerprint is the SPKI sha256 the signer and the CLI compute', () => {
  const { publicKey } = generateKeyPairSync('ed25519');
  assert.equal(fingerprintOfPublicPem(publicKey.export({ type: 'spki', format: 'pem' })), spki(publicKey));
});

test('a private key, a non-Ed25519 key and a non-canonical PEM are refused', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  assert.throws(() => fingerprintOfPublicPem(privateKey.export({ type: 'pkcs8', format: 'pem' })), /private key/);
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
  assert.throws(() => fingerprintOfPublicPem(rsa), /Ed25519/);
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  assert.throws(() => fingerprintOfPublicPem(pem.replace(/\n/g, '\r\n')), /canonical/);
  assert.throws(() => fingerprintOfPublicPem(pem + pem), /canonical/);
  assert.throws(() => fingerprintOfPublicPem('hello'), /not a PEM/);
});

test('withPin replaces the sentinel once, is idempotent, and refuses rotation', () => {
  const sentinel = "x\nexport const EMBEDDED_RELEASE_KEY_FINGERPRINT = EMBEDDED_RELEASE_KEY_NOT_ENROLLED;\ny\n";
  const a = 'a'.repeat(64), b = 'b'.repeat(64);
  const pinned = withPin(sentinel, a);
  assert.equal(pinned, `x\nexport const EMBEDDED_RELEASE_KEY_FINGERPRINT = '${a}';\ny\n`);
  assert.equal(pinnedFingerprint(pinned), a);
  assert.equal(withPin(pinned, a), pinned);
  assert.throws(() => withPin(pinned, b), /already enrolled.*rotation/);
  assert.throws(() => withPin(sentinel, 'A'.repeat(64)), /64 lowercase hex/);
  assert.throws(() => pinnedFingerprint('no pin here'), /no longer has the pin line/);
});

test('the pinned line is the one the e2e harness rewrites and the CLI reads', async () => {
  const pinned = withPin(fs.readFileSync(PIN_FILE, 'utf8').replace(/^export const EMBEDDED_RELEASE_KEY_FINGERPRINT = '[a-f0-9]{64}';$/m,
    'export const EMBEDDED_RELEASE_KEY_FINGERPRINT = EMBEDDED_RELEASE_KEY_NOT_ENROLLED;'), 'c'.repeat(64));
  const harness = fs.readFileSync(path.join(ROOT, 'tests/e2e/plugin-activation/harness.mjs'), 'utf8');
  const re = new RegExp(harness.match(/^const PIN = \/(.+)\/g;$/m)[1], 'g');
  assert.equal(pinned.match(re)?.length, 1, 'harness pin regex must match an enrolled source');
});

test('generate writes a 0600 PKCS8 key the signer accepts, never overwrites, and refuses the source tree', t => {
  const dir = tmp(t), key = path.join(dir, 'release.pem');
  const r = generateReleaseKey(key, { forbiddenRoots: [ROOT] });
  assert.equal(fs.statSync(key).mode & 0o777, 0o600);
  const pem = fs.readFileSync(key, 'utf8');
  const priv = createPrivateKey({ key: pem, format: 'pem', type: 'pkcs8' });
  assert.equal(priv.asymmetricKeyType, 'ed25519');
  assert.equal(priv.export({ format: 'pem', type: 'pkcs8' }), pem, 'canonical PEM, as loadSigningKey requires');
  assert.equal(r.fingerprint, spki(createPublicKey(priv)));
  assert.equal(fingerprintOfPublicPem(fs.readFileSync(r.publicPath, 'utf8')), r.fingerprint);
  assert.ok(!JSON.stringify(r).includes('PRIVATE'), 'no key material returned');
  assert.throws(() => generateReleaseKey(key, { forbiddenRoots: [ROOT] }), /EEXIST/);
  assert.equal(fs.readFileSync(key, 'utf8'), pem);
  assert.throws(() => generateReleaseKey(path.join(ROOT, 'scripts', 'never.pem')), /outside the source tree/);
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'never.pem')), false);
  assert.throws(() => generateReleaseKey('relative.pem'), /absolute/);
});

test('CLI: --check answers against the real source without writing it; bad usage exits 2', t => {
  const dir = tmp(t);
  const { publicKey } = generateKeyPairSync('ed25519');
  const pub = path.join(dir, 'k.pub');
  fs.writeFileSync(pub, publicKey.export({ type: 'spki', format: 'pem' }));
  const before = fs.readFileSync(PIN_FILE, 'utf8');
  const show = spawnSync(process.execPath, [SCRIPT, '--public-key', pub], { encoding: 'utf8' });
  assert.equal(show.status, 0);
  assert.equal(show.stdout.trim(), spki(publicKey));
  const check = spawnSync(process.execPath, [SCRIPT, '--public-key', pub, '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 1, 'an ephemeral key is never the pinned one');
  assert.equal(fs.readFileSync(PIN_FILE, 'utf8'), before);
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--public-key', pub, '--force'], { encoding: 'utf8' }).status, 2);
});

test('the enrolment tool is not shipped in the plugin runtime set', async () => {
  const { isPluginRuntimePath } = await import('../../scripts/build-release-artifacts.mjs');
  assert.equal(isPluginRuntimePath('scripts/enroll-release-key.mjs'), false);
});
