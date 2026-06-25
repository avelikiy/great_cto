// Tests for frozen-gates-guard PreToolUse hook (architect-loop R2, mechanical):
// editing an existing docs/gates/ file is denied; creating a new one is allowed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFrozenGateEdit } from '../../scripts/hooks/frozen-gates-guard.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('frozen-gates-guard: editing an EXISTING gate is denied', () => {
  assert.equal(isFrozenGateEdit('docs/gates/slice-1.md', true), true);
  assert.equal(isFrozenGateEdit('/abs/repo/docs/gates/x.md', true), true);
});

test('frozen-gates-guard: CREATING a new gate is allowed', () => {
  assert.equal(isFrozenGateEdit('docs/gates/slice-2.md', false), false);
});

test('frozen-gates-guard: non-gate files are never the guard concern', () => {
  assert.equal(isFrozenGateEdit('src/foo.ts', true), false);
  assert.equal(isFrozenGateEdit('docs/plans/PLAN-x.md', true), false);
  assert.equal(isFrozenGateEdit(null, true), false);
});

test('frozen-gates-guard: is WIRED as a PreToolUse Edit|Write|MultiEdit hook (not just present)', () => {
  const plugin = JSON.parse(readFileSync(join(REPO, '.claude-plugin', 'plugin.json'), 'utf8'));
  const pre = plugin.hooks.PreToolUse.find((e) => e.matcher === 'Edit|Write|MultiEdit');
  assert.ok(pre, 'PreToolUse Edit|Write|MultiEdit matcher exists');
  const wired = pre.hooks.some((h) => h.command.includes('frozen-gates-guard.mjs'));
  assert.ok(wired, 'frozen-gates-guard.mjs must be wired into the PreToolUse hook chain');
});
