import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { allowedDownloadURL, readBoundedURL, discoverReleaseVersion, stageRelease, configureTrustedToolchain, readTrustedToolchain, runDistributionCommand } from '../src/release-update.mjs';

const BASE = 'https://github.com/avelikiy/great_cto/releases/download/v3.71.0/release-index.json';
const sha = b => createHash('sha256').update(b).digest('hex');
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-release-download-')));
  fs.chmodSync(root, 0o700); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}

test('release URLs reject private/arbitrary initial origins, userinfo, ports and cross-origin redirects', () => {
  assert.equal(allowedDownloadURL(BASE, BASE), BASE);
  assert.match(allowedDownloadURL('https://release-assets.githubusercontent.com/a?signature=fixture', BASE), /^https:/);
  for (const bad of ['http://127.0.0.1/a', 'https://127.0.0.1/a', 'https://attacker.invalid/a', 'https://github.com:8443/a', 'https://user@github.com/a', 'https://api.github.com/repos/other/project/releases/latest']) {
    assert.throws(() => allowedDownloadURL(bad, bad));
    assert.throws(() => allowedDownloadURL(bad, BASE));
  }
  assert.throws(() => allowedDownloadURL('https://objects.githubusercontent.com.evil.invalid/a', BASE));
});

test('redirect validation happens before contacting a substituted origin and forwards no credentials', async () => {
  const calls = [];
  await assert.rejects(readBoundedURL(BASE, 100, { fetchFn: async (url, opts) => {
    calls.push({ url, opts }); return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/metadata' } });
  } }), /refused/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.redirect, 'manual');
  assert.equal(Object.keys(calls[0].opts.headers).some(k => /authorization|cookie/i.test(k)), false);
});

test('stream size, declared length and redirect budgets are enforced without writing installations', async () => {
  await assert.rejects(readBoundedURL(BASE, 2, { fetchFn: async () => new Response('abc') }), /oversized/);
  await assert.rejects(readBoundedURL(BASE, 8, { fetchFn: async () => new Response('abc', { headers: { 'content-length': '7' } }) }), /truncated/);
  await assert.rejects(readBoundedURL(BASE, 8, { fetchFn: async () => new Response('abc', { headers: { 'content-length': '99' } }) }), /oversized/);
  let calls = 0;
  await assert.rejects(readBoundedURL(BASE, 8, { fetchFn: async () => { calls++; return new Response('', { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/repeated' } }); } }), /redirect limit/);
  assert.equal(calls, 5);
});

test('release discovery refuses prerelease, draft, missing flags and mutable selectors', async () => {
  for (const value of [{ tag_name: 'main', draft: false, prerelease: false }, { tag_name: 'v3.71.0', draft: true, prerelease: false }, { tag_name: 'v3.71.0-rc.1', draft: false, prerelease: true }, { tag_name: 'v3.71.0' }]) {
    await assert.rejects(discoverReleaseVersion({ fetchFn: async () => Response.json(value) }));
  }
  assert.equal(await discoverReleaseVersion({ fetchFn: async () => Response.json({ tag_name: 'v3.71.0', draft: false, prerelease: false }) }), '3.71.0');
});

test('GitHub metadata uses JSON Accept and bounds fetch-decoded compressed bytes', async () => {
  const body = JSON.stringify({ tag_name: 'v3.71.0', draft: false, prerelease: false });
  assert.equal(await discoverReleaseVersion({ fetchFn: async (_url, opts) => {
    if (opts.headers.accept !== 'application/vnd.github+json') return new Response('unsupported', { status: 415 });
    assert.equal(opts.headers['accept-encoding'], 'identity');
    // Model a server ignoring identity: native fetch exposes decoded bytes,
    // while Content-Length continues to describe the compressed wire body.
    return new Response(body, { headers: { 'content-encoding': 'gzip', 'content-length': '23' } });
  } }), '3.71.0');
  await assert.rejects(readBoundedURL(BASE, 8, { fetchFn: async (_url, opts) => {
    assert.equal(opts.headers.accept, 'application/octet-stream');
    return new Response('decoded expansion exceeds cap', { headers: { 'content-encoding': 'gzip', 'content-length': '7' } });
  } }), /oversized/);
  await assert.rejects(readBoundedURL(BASE, 100, { fetchFn: async () => new Response('body', { headers: { 'content-encoding': 'unknown' } }) }), /unsupported.*encoding/);
  await assert.rejects(readBoundedURL(BASE, 100, { fetchFn: async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('truncated compressed stream')); } }), { headers: { 'content-encoding': 'gzip' } }) }), /truncated compressed stream/);
});

test('bad staged index retains refusal evidence without requesting archive or invoking a helper', async t => {
  const root = fixture(t), calls = [];
  await assert.rejects(stageRelease('3.71.0', { stateRoot: root, fetchFn: async url => {
    calls.push(url); return Response.json({ version: 'other', command: 'must never run' });
  } }));
  assert.equal(calls.length, 1);
  const directories = fs.readdirSync(path.join(root, 'staging'));
  assert.equal(directories.length, 1);
  const dir = path.join(root, 'staging', directories[0]);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  const marker = path.join(dir, 'DOWNLOAD_REFUSED.json');
  assert.equal(fs.statSync(marker).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(marker)).authority, 'NONE');
});

test('operator toolchain registration requires explicit acknowledgement, exact hashes and private stable config', t => {
  const root = fixture(t), tools = path.join(root, 'tools'); fs.mkdirSync(tools, { mode: 0o700 });
  const executable = path.join(tools, 'verified-tool'), trustRoot = path.join(tools, 'root.json');
  fs.writeFileSync(executable, 'trusted fixture bytes; never executed', { mode: 0o700 });
  fs.writeFileSync(trustRoot, '{}', { mode: 0o600 });
  const config = { schema: 1, cosign: { path: executable, sha256: sha(fs.readFileSync(executable)) }, trustedRoot: { path: trustRoot, sha256: sha('{}') }, npm: { path: executable, sha256: sha(fs.readFileSync(executable)) } };
  const stateRoot = path.join(root, 'state');
  assert.throws(() => configureTrustedToolchain(config, { stateRoot }), /acknowledgement/);
  assert.equal(fs.existsSync(stateRoot), false);
  assert.throws(() => configureTrustedToolchain({ ...config, cosign: { ...config.cosign, sha256: 'a'.repeat(64) } }, { stateRoot, acknowledged: true }), /digest/);
  assert.equal(configureTrustedToolchain(config, { stateRoot, acknowledged: true }).releaseEligibility, 'NOT_CHECKED');
  assert.deepEqual(readTrustedToolchain({ stateRoot }), config);
  assert.throws(() => configureTrustedToolchain(config, { stateRoot, acknowledged: true }), /already configured/);
  fs.writeFileSync(executable, 'tampered');
  assert.throws(() => readTrustedToolchain({ stateRoot }), /digest/);
});

test('toolchain CLI rejects missing, duplicate and release-controlled policy options', () => {
  for (const args of [[], ['configure'], ['configure', '--issuer', 'https://attacker.invalid'], ['configure', '--cosign', '/a', '--cosign', '/b'], ['configure', '--cosign']]) {
    assert.equal(runDistributionCommand(args).state, 'REFUSED');
  }
});
