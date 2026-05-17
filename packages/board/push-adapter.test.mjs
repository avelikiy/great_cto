/**
 * Unit tests for push-adapter.mjs
 * Run: node packages/board/push-adapter.test.mjs
 */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// --- minimal test harness ---
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${e.message}`);
    failed++;
  }
}

// Lazy import so we get a clear error if the module is missing
let adapter;
try {
  adapter = await import('./push-adapter.mjs');
} catch (e) {
  console.error('Cannot import push-adapter.mjs:', e.message);
  process.exit(1);
}

const { getVapidKeys, createVapidJwt, loadSubscriptions, saveSubscriptions,
        addSubscription, removeSubscription } = adapter;

// ── getVapidKeys ────────────────────────────────────────────────────────────
await test('getVapidKeys returns publicKey (base64url) and privateKey (JWK)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-push-'));
  const keyPath = path.join(dir, 'vapid-keys.json');
  const keys = getVapidKeys(keyPath);
  assert.equal(typeof keys.publicKey, 'string', 'publicKey must be string');
  assert.ok(keys.publicKey.length > 60, 'publicKey must be at least 60 chars (87 base64url chars for 65-byte P-256 uncompressed point)');
  assert.equal(typeof keys.privateKey, 'object', 'privateKey must be JWK object');
  assert.equal(keys.privateKey.kty, 'EC', 'JWK kty must be EC');
  assert.equal(keys.privateKey.crv, 'P-256', 'JWK crv must be P-256');
  assert.ok(keys.privateKey.d, 'JWK must have d (private scalar)');
  fs.rmSync(dir, { recursive: true });
});

await test('getVapidKeys persists to disk and returns same keys on second call', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-push-'));
  const keyPath = path.join(dir, 'vapid-keys.json');
  const keys1 = getVapidKeys(keyPath);
  const keys2 = getVapidKeys(keyPath);
  assert.equal(keys1.publicKey, keys2.publicKey, 'publicKey must be stable across calls');
  assert.equal(keys1.privateKey.d, keys2.privateKey.d, 'privateKey d must be stable across calls');
  assert.ok(fs.existsSync(keyPath), 'key file must exist after first call');
  fs.rmSync(dir, { recursive: true });
});

// ── createVapidJwt ──────────────────────────────────────────────────────────
await test('createVapidJwt returns a 3-part dot-separated JWT', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-push-'));
  const keyPath = path.join(dir, 'vapid-keys.json');
  const keys = getVapidKeys(keyPath);
  const jwt = createVapidJwt('https://fcm.googleapis.com/fcm/send/xyz', keys.privateKey, 'mailto:test@example.com');
  assert.equal(typeof jwt, 'string', 'JWT must be string');
  const parts = jwt.split('.');
  assert.equal(parts.length, 3, 'JWT must have 3 parts');
  // Verify header decodes correctly
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  assert.equal(header.alg, 'ES256');
  assert.equal(header.typ, 'JWT');
  // Verify payload contains expected fields
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  assert.equal(typeof payload.aud, 'string', 'payload must have aud');
  assert.equal(typeof payload.exp, 'number', 'payload must have exp');
  assert.equal(payload.sub, 'mailto:test@example.com', 'payload sub must match');
  // Verify signature is 64 bytes (R||S) base64url encoded (length ~86)
  const sig = Buffer.from(parts[2], 'base64url');
  assert.equal(sig.length, 64, 'raw ECDSA signature must be 64 bytes (R||S)');
  fs.rmSync(dir, { recursive: true });
});

// ── loadSubscriptions / saveSubscriptions ───────────────────────────────────
await test('loadSubscriptions returns [] for missing file', async () => {
  const subs = loadSubscriptions('/nonexistent/path/push-subs.json');
  assert.deepEqual(subs, []);
});

await test('saveSubscriptions + loadSubscriptions round-trip', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-push-'));
  const filePath = path.join(dir, 'subs.json');
  const sub = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'k1', auth: 'a1' } };
  saveSubscriptions(filePath, [sub]);
  const loaded = loadSubscriptions(filePath);
  assert.deepEqual(loaded, [sub]);
  fs.rmSync(dir, { recursive: true });
});

// ── addSubscription ─────────────────────────────────────────────────────────
await test('addSubscription deduplicates by endpoint', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-push-'));
  const filePath = path.join(dir, 'subs.json');
  const sub = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'k1', auth: 'a1' } };
  addSubscription(filePath, sub);
  addSubscription(filePath, sub); // duplicate
  const loaded = loadSubscriptions(filePath);
  assert.equal(loaded.length, 1, 'must deduplicate by endpoint');
  fs.rmSync(dir, { recursive: true });
});

await test('addSubscription adds new subscription', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-push-'));
  const filePath = path.join(dir, 'subs.json');
  const sub1 = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'k1', auth: 'a1' } };
  const sub2 = { endpoint: 'https://push.example.com/xyz', keys: { p256dh: 'k2', auth: 'a2' } };
  addSubscription(filePath, sub1);
  addSubscription(filePath, sub2);
  const loaded = loadSubscriptions(filePath);
  assert.equal(loaded.length, 2);
  fs.rmSync(dir, { recursive: true });
});

// ── removeSubscription ───────────────────────────────────────────────────────
await test('removeSubscription removes by endpoint URL', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-push-'));
  const filePath = path.join(dir, 'subs.json');
  const sub1 = { endpoint: 'https://push.example.com/abc', keys: {} };
  const sub2 = { endpoint: 'https://push.example.com/xyz', keys: {} };
  saveSubscriptions(filePath, [sub1, sub2]);
  removeSubscription(filePath, 'https://push.example.com/abc');
  const loaded = loadSubscriptions(filePath);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].endpoint, 'https://push.example.com/xyz');
  fs.rmSync(dir, { recursive: true });
});

await test('removeSubscription is no-op for unknown endpoint', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-push-'));
  const filePath = path.join(dir, 'subs.json');
  const sub = { endpoint: 'https://push.example.com/abc', keys: {} };
  saveSubscriptions(filePath, [sub]);
  removeSubscription(filePath, 'https://push.example.com/unknown');
  const loaded = loadSubscriptions(filePath);
  assert.equal(loaded.length, 1);
  fs.rmSync(dir, { recursive: true });
});

// --- results ---
console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
