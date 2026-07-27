// The quota hook exists to warn BEFORE a heavy run exhausts the session window.
// It only ever read ~/.claude/.credentials.json — but on macOS Claude Code keeps
// OAuth in the login Keychain and writes no such file, so the hook returned at
// its first line for every macOS OAuth user: the exact population it protects.
//
// Not hypothetical: three parallel benchmark runs burned a session window on
// this machine with no warning, because the hook had already exited before its
// first API call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCredentials } from '../../scripts/hooks/quota-check.mjs';

const TOKEN = { accessToken: 'tok', refreshToken: 'ref' };
const fileCreds = JSON.stringify({ claudeAiOauth: TOKEN });

test('file store wins when present — cheapest path, and the Linux/CI shape', () => {
  const got = loadCredentials({
    platform: 'linux',
    exists: () => true,
    read: () => fileCreds,
    keychain: () => { throw new Error('keychain must not be consulted'); },
  });
  assert.equal(got.source, 'file');
  assert.equal(got.oauth.accessToken, 'tok');
});

test('macOS with NO credentials file falls back to the Keychain (the bug)', () => {
  const got = loadCredentials({
    platform: 'darwin',
    exists: () => false,
    read: () => { throw new Error('no file'); },
    keychain: () => TOKEN,
  });
  assert.ok(got, 'must not give up just because the file is absent');
  assert.equal(got.source, 'keychain');
  assert.equal(got.oauth.accessToken, 'tok');
});

test('a corrupt credentials file still falls through to the Keychain', () => {
  const got = loadCredentials({
    platform: 'darwin',
    exists: () => true,
    read: () => '{ not json',
    keychain: () => TOKEN,
  });
  assert.equal(got.source, 'keychain');
});

test('a file without an accessToken is not accepted as credentials', () => {
  const got = loadCredentials({
    platform: 'linux',
    exists: () => true,
    read: () => JSON.stringify({ claudeAiOauth: {} }),
    keychain: () => null,
  });
  assert.equal(got, null);
});

test('non-darwin never shells out to `security`', () => {
  let consulted = false;
  loadCredentials({
    platform: 'linux',
    exists: () => false,
    read: () => '',
    keychain: () => { consulted = true; return TOKEN; },
  });
  assert.equal(consulted, false, 'Keychain is a macOS-only store');
});

test('an API-key user (no file, empty Keychain) stays silent', () => {
  const got = loadCredentials({
    platform: 'darwin',
    exists: () => false,
    read: () => '',
    keychain: () => null,
  });
  assert.equal(got, null, 'no credentials → the hook must print nothing at all');
});

test('a Keychain blob without the claudeAiOauth wrapper is still usable', () => {
  const got = loadCredentials({
    platform: 'darwin',
    exists: () => false,
    read: () => '',
    keychain: () => ({ accessToken: 'bare' }),
  });
  assert.equal(got.oauth.accessToken, 'bare');
});
