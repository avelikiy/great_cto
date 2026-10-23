import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusRegistry, focusDirection, coreRoleIds } from '../../scripts/lib/focus-registry.mjs';
import { listDomainPacks } from '../../scripts/lib/domain-evidence.mjs';

test('four directions preserve five separate explicit-only candidate packs', () => {
  const registry = focusRegistry();
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.registryVersion, 1);
  assert.deepEqual(registry.directions.map(d => [d.id, d.label, d.packIds]), [
    ['fintech-crypto', 'Fintech + crypto', ['money', 'crypto-execution']],
    ['telemedicine', 'Telemedicine', ['telemedicine-workflow']],
    ['venture-pipeline', 'Venture Pipeline', ['venture-evidence']],
    ['mental-care', 'Mental Care', ['mental-wellbeing-safety']],
  ]);
  for (const direction of registry.directions) {
    assert.deepEqual(focusDirection(direction.id), direction);
    assert.deepEqual(direction.packs.map(p => p.packId), direction.packIds);
    for (const pack of direction.packs) {
      const source = listDomainPacks().find(p => p.packId === pack.packId);
      assert.equal(pack.digest, source.digest);
      assert.equal(pack.version, source.version);
      assert.equal(pack.maturity, 'candidate');
      assert.equal(pack.activation, 'explicit-only');
      assert.equal(pack.invariants.length, 3);
      assert.deepEqual(pack.invariants, source.invariants);
      assert.deepEqual(Object.keys(pack).sort(), ['activation', 'digest', 'invariants', 'maturity', 'packId', 'version']);
    }
  }
});

test('eight stable core IDs are separate from direction selection', () => {
  assert.deepEqual(coreRoleIds(), ['product-owner', 'architect', 'pm', 'senior-dev', 'code-reviewer', 'qa-engineer', 'security-officer', 'devops']);
  assert.deepEqual(focusRegistry().coreRoles, coreRoleIds());
});

test('registry values are independent and unknown focus never guesses aliases', () => {
  const value = focusRegistry();
  value.directions[0].packs[0].invariants[0].rule = 'mutated';
  value.coreRoles.pop();
  assert.notEqual(focusRegistry().directions[0].packs[0].invariants[0].rule, 'mutated');
  assert.equal(coreRoleIds().length, 8);
  for (const id of [undefined, null, 'finance', 'Fintech + crypto', '/private/secret', {}, ['mental-care']]) {
    assert.deepEqual(focusDirection(id), { state: 'unavailable', reason: 'unsupported-focus' });
  }
});
