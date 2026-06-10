// tests/lib/operators.test.mjs — operator invites (admin onboards a scoped operator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInvite, listInvites, resolveInvite, acceptInvite, revokeInvite } from '../../scripts/lib/operators.mjs';

function tmp() { const d = mkdtempSync(join(tmpdir(), 'ops-')); process.env.GREAT_CTO_OPERATORS_PATH = join(d, 'operators.json'); return d; }

test('createInvite mints a scoped, pending invite for an operator role', () => {
  const d = tmp();
  const inv = createInvite({ role: 'bsa-officer', tenant: 'acme', name: 'Pat' });
  assert.equal(inv.role, 'bsa-officer');
  assert.equal(inv.tenant, 'acme');
  assert.equal(inv.status, 'pending');
  assert.ok(inv.token && inv.token.length >= 16);
  assert.match(inv.roleLabel, /BSA/);
  rmSync(d, { recursive: true, force: true });
});

test('createInvite rejects an unknown role and the admin role', () => {
  const d = tmp();
  assert.throws(() => createInvite({ role: 'nope' }), /unknown role/);
  assert.throws(() => createInvite({ role: 'admin' }), /cannot invite an admin/);
  rmSync(d, { recursive: true, force: true });
});

test('resolve + accept + revoke lifecycle', () => {
  const d = tmp();
  const { token } = createInvite({ role: 'coder', name: 'Lee' });
  assert.equal(resolveInvite(token).role, 'coder');
  const acc = acceptInvite(token);
  assert.equal(acc.status, 'accepted');
  assert.ok(acc.acceptedAt);
  assert.equal(listInvites().length, 1);
  assert.equal(revokeInvite(token), true);
  assert.equal(resolveInvite(token), null);
  rmSync(d, { recursive: true, force: true });
});

test('resolveInvite(null/unknown) → null', () => {
  const d = tmp();
  assert.equal(resolveInvite(null), null);
  assert.equal(resolveInvite('deadbeef'), null);
  rmSync(d, { recursive: true, force: true });
});

test('invites carry an expiry (default 7-day TTL)', () => {
  const d = tmp();
  delete process.env.GREAT_CTO_INVITE_TTL_DAYS;
  const inv = createInvite({ role: 'coder' });
  assert.ok(inv.expiresAt, 'expiresAt is set');
  const span = Date.parse(inv.expiresAt) - Date.parse(inv.createdAt);
  assert.equal(Math.round(span / 86400000), 7);
  rmSync(d, { recursive: true, force: true });
});

test('an expired invite resolves to null and lists as expired', () => {
  const d = tmp();
  process.env.GREAT_CTO_INVITE_TTL_DAYS = '0'; // mint a never-expiring invite, then backdate it
  const { token } = createInvite({ role: 'underwriter', tenant: 'acme' });
  // Hand-edit the store to set expiresAt in the past.
  const p = process.env.GREAT_CTO_OPERATORS_PATH;
  const db = JSON.parse(readFileSync(p, 'utf8'));
  db.invites[token].expiresAt = new Date(Date.now() - 1000).toISOString();
  writeFileSync(p, JSON.stringify(db));
  assert.equal(resolveInvite(token), null, 'expired token resolves to null');
  assert.equal(acceptInvite(token), null, 'expired token cannot be accepted');
  assert.equal(listInvites()[0].status, 'expired', 'admin UI sees it as expired');
  delete process.env.GREAT_CTO_INVITE_TTL_DAYS;
  rmSync(d, { recursive: true, force: true });
});

test('GREAT_CTO_INVITE_TTL_DAYS=0 mints a non-expiring invite', () => {
  const d = tmp();
  process.env.GREAT_CTO_INVITE_TTL_DAYS = '0';
  const inv = createInvite({ role: 'coder' });
  assert.equal(inv.expiresAt, null);
  assert.equal(resolveInvite(inv.token).role, 'coder');
  delete process.env.GREAT_CTO_INVITE_TTL_DAYS;
  rmSync(d, { recursive: true, force: true });
});
