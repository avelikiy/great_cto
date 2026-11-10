/** Real upstream cryptography, not a great_cto release-admission certificate. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { COSIGN_PLATFORM_SHA256, RELEASE_TRUST_ROOT_SHA256 } from '../src/release-trust.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const executable = process.env.GREAT_CTO_TEST_COSIGN_PATH;

test('real pinned Cosign verifies upstream fixture and refuses tampering or production publisher substitution', { skip: !executable && 'trusted Cosign not supplied: cryptographic integration NOT CHECKED' }, t => {
  const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(sha(executable), COSIGN_PLATFORM_SHA256[`${process.platform}-${process.arch}`]);
  const trustedRoot = path.join(root, 'shared/release-trust-root.json');
  assert.equal(sha(trustedRoot), RELEASE_TRUST_ROOT_SHA256);
  const blob = path.join(root, 'tests/fixtures/distribution-trust/cosign-3.1.4-checksums.txt');
  const bundle = path.join(root, 'tests/fixtures/distribution-trust/cosign-3.1.4-checksums.sigstore.json');
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-crypto-fixture-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const check = (file, identity, issuer, extra = []) => spawnSync(executable, ['verify-blob', '--trusted-root', trustedRoot,
    '--certificate-identity', identity, '--certificate-oidc-issuer', issuer, '--bundle', bundle, ...extra, file],
  { env: { HOME: home, PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  const upstream = 'keyless@projectsigstore.iam.gserviceaccount.com';
  const positive = check(blob, upstream, 'https://accounts.google.com');
  assert.equal(positive.status, 0, positive.stderr);
  const altered = path.join(home, 'altered.txt'); fs.writeFileSync(altered, Buffer.concat([fs.readFileSync(blob), Buffer.from('changed')]));
  assert.notEqual(check(altered, upstream, 'https://accounts.google.com').status, 0);
  const production = 'https://github.com/avelikiy/great_cto/.github/workflows/publish.yml@refs/tags/v3.71.0';
  assert.notEqual(check(blob, production, 'https://token.actions.githubusercontent.com').status, 0);
  assert.notEqual(check(blob, upstream, 'https://accounts.google.com', ['--certificate-github-workflow-sha', 'a'.repeat(40)]).status, 0);
  // A valid upstream vendor fixture must never be labelled a production release.
  const scope = { evidence: 'UPSTREAM_CRYPTO_FIXTURE', authority: 'NONE', releaseEligibility: 'NOT_CHECKED' };
  assert.equal(scope.authority, 'NONE');
});
