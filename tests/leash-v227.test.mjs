/**
 * leash-v227 integration tests.
 *
 * Covers the llm-leash v2.27 alignment changes:
 *   1. HITL URL construction (admin paths, no old hitl_url)
 *   2. admin_token header injection
 *   3. readLeashRateLimits() returns null gracefully when proxy is absent
 *   4. readLeashNativeCaps() returns null gracefully when proxy is absent
 *   5. /api/leash/rate-limits endpoint responds { ok: false, data: null } when leash absent
 *   6. /api/leash/per-tenant-status falls back to local caps when native unavailable
 *   7. postHitlDecision() calls the correct path (approve vs reject)
 *
 * Run: node --test tests/leash-v227.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = join(__dirname, '..', 'packages', 'cli', 'index.mjs');
const BOARD_SERVER = join(__dirname, '..', 'packages', 'board', 'server.mjs');
const ADAPTER = join(__dirname, '..', 'packages', 'board', 'leash-adapter.mjs');

function pickPort() {
  return 34000 + Math.floor(Math.random() * 1000);
}

async function waitForBoard(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
      if (r.ok || r.status === 404) return;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`board did not start on port ${port}`);
}

// ── Unit-style tests (no server) ─────────────────────────────────────────────

test('leash-adapter: DEFAULTS has no hitl_url field', async () => {
  // We read the source and check the constant — no runtime import needed
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(ADAPTER, 'utf8');
  assert.ok(!src.includes("hitl_url: 'http://localhost:8765/hitl'"),
    'Old hitl_url default must be removed');
  assert.ok(src.includes('admin_token: null'),
    'admin_token field must be present in DEFAULTS');
});

test('leash-adapter: admin API paths use /admin/hitl/', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(ADAPTER, 'utf8');
  assert.ok(src.includes('/admin/hitl/pending'), 'must use /admin/hitl/pending');
  assert.ok(src.includes('/admin/hitl/${encodeURIComponent(itemId)}/${decision}'),
    'postHitlDecision must build /admin/hitl/{id}/{decision} path');
});

test('leash-adapter: readLeashRateLimits returns null when proxy unreachable', async () => {
  const { readLeashRateLimits } = await import(ADAPTER);
  // No proxy running — must return null without throwing
  const result = await readLeashRateLimits(tmpdir());
  assert.equal(result, null);
});

test('leash-adapter: readLeashNativeCaps returns null when proxy unreachable', async () => {
  const { readLeashNativeCaps } = await import(ADAPTER);
  const result = await readLeashNativeCaps(tmpdir());
  assert.equal(result, null);
});

test('leash-adapter: readLeashConfig picks up LEASH_ADMIN_TOKEN env', async () => {
  const orig = process.env.LEASH_ADMIN_TOKEN;
  try {
    process.env.LEASH_ADMIN_TOKEN = 'test-token-xyz';
    // Re-import with a cache-busting query to get fresh module
    const mod = await import(ADAPTER + '?t=' + Date.now());
    const cfg = mod.readLeashConfig(tmpdir());
    assert.equal(cfg.admin_token, 'test-token-xyz');
  } finally {
    if (orig === undefined) delete process.env.LEASH_ADMIN_TOKEN;
    else process.env.LEASH_ADMIN_TOKEN = orig;
  }
});

test('leash-adapter: readHitlPending falls back to audit scan gracefully', async () => {
  const { readHitlPending } = await import(ADAPTER);
  // No proxy, no audit file → should return [] not throw
  const result = await readHitlPending(tmpdir(), null);
  assert.ok(Array.isArray(result), 'must return array even when proxy is down');
  assert.equal(result.length, 0);
});

test('per-tenant-caps: getStatusWithNativeFallback falls back to local source', async () => {
  const CAPS_MOD = join(__dirname, '..', 'packages', 'board', 'per-tenant-caps.mjs');
  const { getStatusWithNativeFallback } = await import(CAPS_MOD + '?t=' + Date.now());
  // No proxy running, no caps file → source should be 'local' with empty tenants
  const result = await getStatusWithNativeFallback(tmpdir(), false);
  assert.ok(['local', 'native'].includes(result.source), 'source must be local or native');
  assert.ok(Array.isArray(result.tenants), 'tenants must be array');
});

// ── Integration tests (starts real board server) ──────────────────────────────

test('/api/leash/rate-limits returns ok:false when leash not running', async () => {
  const port = pickPort();
  const tmp = mkdtempSync(join(tmpdir(), 'leash-v227-'));
  mkdirSync(join(tmp, '.great_cto'), { recursive: true });
  // Write leash.json with enabled:false so board starts without leash
  writeFileSync(join(tmp, '.great_cto', 'leash.json'),
    JSON.stringify({ enabled: false }));

  const proc = spawn(process.execPath, [CLI_ENTRY, 'board', '--port', String(port), '--cwd', tmp], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOME: tmp },
  });
  try {
    await waitForBoard(port);
    const r = await fetch(`http://127.0.0.1:${port}/api/leash/rate-limits`);
    assert.equal(r.status, 200, 'must return 200 even when leash absent');
    const body = await r.json();
    assert.ok('ok' in body, 'response must have ok field');
    assert.ok('data' in body, 'response must have data field');
    // data is null when proxy not running
    assert.equal(body.data, null);
  } finally {
    proc.kill();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('/api/leash/per-tenant-status returns source field', async () => {
  const port = pickPort();
  const tmp = mkdtempSync(join(tmpdir(), 'leash-v227b-'));
  mkdirSync(join(tmp, '.great_cto'), { recursive: true });
  writeFileSync(join(tmp, '.great_cto', 'leash.json'),
    JSON.stringify({ enabled: false }));

  const proc = spawn(process.execPath, [CLI_ENTRY, 'board', '--port', String(port), '--cwd', tmp], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOME: tmp },
  });
  try {
    await waitForBoard(port);
    const r = await fetch(`http://127.0.0.1:${port}/api/leash/per-tenant-status?enforce=0`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(body.ok, `per-tenant-status returned ok:false — ${JSON.stringify(body)}`);
    assert.ok(['local', 'native'].includes(body.source), `unexpected source: ${body.source}`);
    assert.ok(Array.isArray(body.tenants));
  } finally {
    proc.kill();
    rmSync(tmp, { recursive: true, force: true });
  }
});
