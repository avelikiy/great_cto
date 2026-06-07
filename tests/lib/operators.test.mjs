// tests/lib/operators.test.mjs — operator invites (admin onboards a scoped operator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
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
