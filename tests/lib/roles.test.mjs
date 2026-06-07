// tests/lib/roles.test.mjs — RBAC role map for the autopilot console.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, getRole, roleAllows, roleVerticals } from '../../scripts/lib/roles.mjs';

test('admin can build + operate everything', () => {
  assert.equal(getRole('admin').canBuild, true);
  assert.equal(roleAllows('admin', 'rcm'), true);
  assert.equal(roleAllows('admin', 'pharma'), true);
  assert.equal(roleVerticals('admin'), '*');
});

test('an operator role only operates its own vertical(s)', () => {
  assert.equal(roleAllows('bsa-officer', 'aml'), true);
  assert.equal(roleAllows('bsa-officer', 'rcm'), false);
  assert.equal(getRole('bsa-officer').canBuild, false);
  assert.equal(getRole('bsa-officer').canStart, false);
  // underwriter covers two verticals
  assert.equal(roleAllows('underwriter', 'insurance'), true);
  assert.equal(roleAllows('underwriter', 'mortgage'), true);
  assert.equal(roleAllows('underwriter', 'aml'), false);
});

test('compliance-lead sees every queue but cannot build', () => {
  assert.equal(roleAllows('compliance-lead', 'customs'), true);
  assert.equal(getRole('compliance-lead').canBuild, false);
  assert.equal(getRole('compliance-lead').canStart, true);
});

test('every vertical has at least one operator role', () => {
  const verticals = ['rcm', 'aml', 'soc', 'insurance', 'mortgage', 'title', 'credentialing', 'collections',
    'freight', 'cro', 'prior-auth', 'legaltech', 'accounting', 'tax', 'procurement', 'msp', 'customs', 'audit', 'pharma'];
  for (const v of verticals) {
    const ok = Object.values(ROLES).some((r) => r.verticals !== '*' && r.verticals.includes(v));
    assert.ok(ok, `no operator role for ${v}`);
  }
});

test('unknown role defaults to admin', () => {
  assert.equal(getRole('nope').label, ROLES.admin.label);
});
