// Tests for scripts/lib/flow-overrides.mjs — per-tenant parametric flow customization.
//
// Covers the "настройка, не сборка" contract:
//   - role renames apply to the matching gate step
//   - gates and irreversible writes can NOT be disabled
//   - extra human checkpoints insert at the requested position with unique gate ids
//   - the EFFECTIVE flow always re-passes the safety invariants (irreversible ⟹ gated, owner named)
//   - storage roundtrip is tenant-isolated; a stale/invalid override falls back to the base flow
//
// Zero LLM cost — pure lib tests on the shipped rcm flow + synthetic flows.
//
// Run: node --test tests/flow-overrides.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The lib resolves its storage dir at import time — pin it to a throwaway tmp dir BEFORE importing.
const TMP = mkdtempSync(join(tmpdir(), 'gcto-flow-ov-'));
process.env.GREAT_CTO_OVERRIDES_DIR = TMP;

const { validateOverride, applyOverrides, saveOverride, loadOverride, clearOverride, getEffectiveFlow } =
  await import('../scripts/lib/flow-overrides.mjs');
const { loadFlow, validateFlow: validateInvariants } = await import('../scripts/lib/flow-runner.mjs');

const base = loadFlow('rcm');
const gateStep = base.steps.find((s) => s.gate);
const gateIdx = base.steps.findIndex((s) => s.gate);
const irrevIdx = base.steps.findIndex((s) => s.reversible === false);

describe('validateOverride', () => {
  test('accepts a signer rename on an existing gate', () => {
    const v = validateOverride(base, { roles: { [gateStep.gate]: 'Senior in-house CPC coder' } });
    assert.equal(v.ok, true, v.errors.join('; '));
    const renamed = v.effective.steps.find((s) => s.gate === gateStep.gate);
    assert.equal(renamed.human, 'Senior in-house CPC coder');
  });

  test('rejects a rename on a gate that does not exist in this flow', () => {
    const v = validateOverride(base, { roles: { 'gate:nope': 'Someone' } });
    assert.equal(v.ok, false);
    assert.match(v.errors[0], /unknown gate/);
  });

  test('refuses to disable a human checkpoint', () => {
    const v = validateOverride(base, { disabledSteps: [gateIdx] });
    assert.equal(v.ok, false);
    assert.match(v.errors[0], /human checkpoint/);
  });

  test('refuses to disable the irreversible write', () => {
    assert.ok(irrevIdx >= 0, 'rcm has an irreversible step');
    const v = validateOverride(base, { disabledSteps: [irrevIdx] });
    assert.equal(v.ok, false);
    assert.match(v.errors[0], /irreversible write/);
  });

  test('inserts an extra checkpoint and the effective flow still passes the invariants', () => {
    const v = validateOverride(base, {
      extraGates: [{ after: 0, does: 'Tenant compliance pre-check', human: 'Compliance lead', gate: 'gate:tenant-precheck' }],
    });
    assert.equal(v.ok, true, v.errors.join('; '));
    assert.equal(v.effective.steps.length, base.steps.length + 1);
    assert.equal(v.effective.steps[1].gate, 'gate:tenant-precheck');
    assert.equal(validateInvariants(v.effective).ok, true);
  });

  test('rejects an extra gate whose id collides with a base gate', () => {
    const v = validateOverride(base, { extraGates: [{ after: 0, does: 'x', human: 'y', gate: gateStep.gate }] });
    assert.equal(v.ok, false);
    assert.match(v.errors[0], /already exists/);
  });

  test('rejects a malformed gate id', () => {
    const v = validateOverride(base, { extraGates: [{ after: 0, does: 'x', human: 'y', gate: 'not-a-gate' }] });
    assert.equal(v.ok, false);
    assert.match(v.errors[0], /must match/);
  });
});

describe('applyOverrides', () => {
  test('disabled steps are dropped and the rest keep their baseIndex', () => {
    // pick a safe-to-disable step: reversible agent step
    const skippable = base.steps.findIndex((s) => !s.gate && !s.human && s.reversible !== false);
    const eff = applyOverrides(base, { disabledSteps: [skippable] });
    assert.equal(eff.steps.length, base.steps.length - 1);
    assert.ok(!eff.steps.some((s) => s.baseIndex === skippable));
    assert.equal(eff.customized, true);
  });

  test('no overrides → effectively the base flow, not marked customized', () => {
    const eff = applyOverrides(base, {});
    assert.equal(eff.steps.length, base.steps.length);
    assert.equal(eff.customized, undefined);
  });
});

describe('storage roundtrip + tenant isolation', () => {
  before(() => { clearOverride('rcm', 'acme'); clearOverride('rcm', 'other'); });

  test('saveOverride persists, getEffectiveFlow applies, other tenants stay on base', () => {
    saveOverride('rcm', 'acme', { roles: { [gateStep.gate]: 'Acme coder' } }, 'test-suite');
    const acme = getEffectiveFlow('rcm', 'acme');
    assert.equal(acme.steps.find((s) => s.gate === gateStep.gate).human, 'Acme coder');
    assert.equal(acme.customized, true);
    const other = getEffectiveFlow('rcm', 'other');
    assert.equal(other.customized, undefined);
    const stored = loadOverride('rcm', 'acme');
    assert.equal(stored.history.length >= 1, true);
    assert.equal(stored.updatedBy, 'test-suite');
  });

  test('saveOverride throws (and writes nothing) on an unsafe patch', () => {
    assert.throws(() => saveOverride('rcm', 'acme2', { disabledSteps: [gateIdx] }, 'test-suite'),
      /override rejected/);
    assert.equal(loadOverride('rcm', 'acme2'), null);
  });

  test('clearOverride returns the tenant to the base flow', () => {
    assert.equal(clearOverride('rcm', 'acme'), true);
    assert.equal(getEffectiveFlow('rcm', 'acme').customized, undefined);
  });
});

describe('safety fallback', () => {
  test('a stored override that no longer validates falls back to the base flow', () => {
    // Simulate drift: save a valid override, then corrupt it on disk to reference a missing step.
    saveOverride('rcm', 'drift', { roles: { [gateStep.gate]: 'Drift coder' } }, 'test-suite');
    const file = join(TMP, 'drift--rcm.json');
    const ov = JSON.parse(readFileSync(file, 'utf8'));
    ov.disabledSteps = [999];                      // base flow has no step 999
    writeFileSync(file, JSON.stringify(ov));
    const eff = getEffectiveFlow('rcm', 'drift');
    assert.equal(eff.customized, undefined, 'invalid override must not apply');
  });
});

process.on('exit', () => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });
