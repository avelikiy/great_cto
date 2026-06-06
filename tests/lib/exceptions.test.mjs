// tests/lib/exceptions.test.mjs — unit tests for the signed-exceptions registry (governance Phase 1)
//
// Run: node --test tests/lib/exceptions.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  create, verify, computeSignature, write, list, find, isCovered,
} from '../../scripts/lib/exceptions.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', '..', 'scripts', 'lib', 'exceptions.mjs');
function tmp() { return mkdtempSync(join(tmpdir(), 'exc-')); }
const NOW = '2026-06-06T00:00:00Z';

// ── create / sign ───────────────────────────────────────────────────────────

test('create: builds a signed, active exception with expiry', () => {
  const e = create({ gate: 'gate:ship', scope: 'PR over red CI', reason: 'CI billing-locked', createdBy: 'me', now: NOW });
  assert.equal(e.gate, 'gate:ship');
  assert.equal(e.status, 'active');
  assert.equal(e.created_at, '2026-06-06T00:00:00.000Z'); // normalized ISO
  assert.equal(e.expires_at, '2026-07-06T00:00:00.000Z'); // +30d
  assert.match(e.signature, /^[0-9a-f]{64}$/);
  assert.match(e.id, /^EXC-2026-06-06-/);
});

test('create: throws without gate or reason', () => {
  assert.throws(() => create({ reason: 'x' }), /gate/);
  assert.throws(() => create({ gate: 'ci' }), /reason/);
});

// ── verify / tamper-evidence ──────────────────────────────────────────────────

test('verify: a freshly created exception is valid', () => {
  const e = create({ gate: 'ci', reason: 'r', now: NOW });
  assert.equal(verify(e, { now: NOW }).valid, true);
});

test('verify: tampering with reason after signing invalidates it', () => {
  const e = create({ gate: 'ci', reason: 'original', now: NOW });
  e.reason = 'tampered';
  const v = verify(e, { now: NOW });
  assert.equal(v.valid, false);
  assert.ok(v.reasons.some((r) => r.includes('signature')));
});

test('verify: expired exception is invalid', () => {
  const e = create({ gate: 'ci', reason: 'r', expiresInDays: 1, now: NOW });
  const v = verify(e, { now: '2026-06-10T00:00:00Z' });
  assert.equal(v.valid, false);
  assert.ok(v.reasons.includes('expired'));
});

test('verify: revoked status is invalid even with good signature', () => {
  const e = create({ gate: 'ci', reason: 'r', now: NOW });
  e.status = 'revoked';
  const v = verify(e, { now: NOW });
  assert.equal(v.valid, false);
  assert.ok(v.reasons.some((r) => r.includes('revoked')));
});

test('computeSignature: deterministic + sensitive to gate', () => {
  const base = { id: 'X', created_at: NOW, created_by: 'me', gate: 'ci', scope: '', reason: 'r', expires_at: NOW, risk: 'low' };
  assert.equal(computeSignature(base), computeSignature({ ...base }));
  assert.notEqual(computeSignature(base), computeSignature({ ...base, gate: 'gate:ship' }));
});

// ── registry: write / list / find / isCovered ─────────────────────────────────

test('write + list round-trip', () => {
  const root = tmp();
  write(create({ gate: 'gate:ship', reason: 'a', now: NOW }), { root });
  write(create({ gate: 'ci', reason: 'b', now: NOW }), { root });
  assert.equal(list({ root }).length, 2);
});

test('find: matches exact gate when valid + unexpired', () => {
  const root = tmp();
  write(create({ gate: 'gate:ship', reason: 'r', now: NOW }), { root });
  assert.ok(find('gate:ship', { root, now: NOW }));
  assert.equal(find('gate:qa', { root, now: NOW }), null);
});

test('find: wildcard "*" gate covers any gate', () => {
  const root = tmp();
  write(create({ gate: '*', reason: 'blanket emergency', now: NOW }), { root });
  assert.ok(find('gate:ship', { root, now: NOW }));
  assert.ok(find('pre-push', { root, now: NOW }));
});

test('find: expired exception does not cover', () => {
  const root = tmp();
  write(create({ gate: 'ci', reason: 'r', expiresInDays: 1, now: NOW }), { root });
  assert.equal(find('ci', { root, now: '2026-07-01T00:00:00Z' }), null);
});

test('isCovered: boolean wrapper', () => {
  const root = tmp();
  write(create({ gate: 'pre-push', reason: 'r', now: NOW }), { root });
  assert.equal(isCovered('pre-push', { root, now: NOW }), true);
  assert.equal(isCovered('gate:ship', { root, now: NOW }), false);
});

// ── CLI ────────────────────────────────────────────────────────────────────────

test('CLI: create → check covers the gate; unknown gate not covered', () => {
  const root = tmp();
  const env = { ...process.env, GREAT_CTO_EXCEPTIONS_ROOT: root };
  const c = spawnSync(process.execPath, [SCRIPT, 'create', '--gate', 'gate:ship', '--reason', 'CI billing-locked', '--scope', 'merge'], { env, encoding: 'utf8' });
  assert.equal(c.status, 0, c.stderr);
  assert.match(c.stdout, /signed exception created: EXC-/);

  const ok = spawnSync(process.execPath, [SCRIPT, 'check', 'gate:ship'], { env, encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /covered by EXC-/);

  const no = spawnSync(process.execPath, [SCRIPT, 'check', 'gate:qa'], { env, encoding: 'utf8' });
  assert.equal(no.status, 1);
  assert.match(no.stdout, /NOT covered/);
});

test('CLI: create requires gate + reason (exit 2)', () => {
  const res = spawnSync(process.execPath, [SCRIPT, 'create', '--gate', 'ci'], {
    env: { ...process.env, GREAT_CTO_EXCEPTIONS_ROOT: tmp() }, encoding: 'utf8',
  });
  assert.equal(res.status, 2);
});
