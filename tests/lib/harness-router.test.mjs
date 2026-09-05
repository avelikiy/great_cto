// tests/lib/harness-router.test.mjs — AgentSpace #1 harness detection + capabilities.
// Run: node --test tests/lib/harness-router.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HARNESSES, detectHarness, capabilities, hasCapability } from '../../scripts/lib/harness-router.mjs';

test('detectHarness: Claude Code from CLAUDECODE env', () => {
  assert.equal(detectHarness({ CLAUDECODE: '1' }), 'claude-code');
});

test('detectHarness: Codex from CODEX_HOME', () => {
  assert.equal(detectHarness({ CODEX_HOME: '/x' }), 'codex');
});

test('detectHarness: GREAT_CTO_HARNESS override wins', () => {
  assert.equal(detectHarness({ CLAUDECODE: '1', GREAT_CTO_HARNESS: 'opencode' }), 'opencode');
});

test('detectHarness: bad override ignored, falls through to signals', () => {
  assert.equal(detectHarness({ CLAUDECODE: '1', GREAT_CTO_HARNESS: 'nonsense' }), 'claude-code');
});

test('detectHarness: nothing → unknown', () => {
  assert.equal(detectHarness({}), 'unknown');
});

test('capabilities: the two harnesses differ where they actually differ', () => {
  // This test used to assert "codex does not" for BOTH hooks and subagents, and
  // it was half wrong from the day it was written — nobody had compared the
  // registry to a running Codex. codex-cli 0.153.4 reports live subagent threads
  // and ships `[features] multi_agent = true`, so `subagents: false` was us
  // degrading a capability the harness has. Corrected 2026-09-05; see
  // docs/analysis/2026-09-05-codex-phase0-findings.md.
  assert.equal(capabilities('claude-code').hooks, true);
  assert.equal(capabilities('claude-code').subagents, true);
  assert.equal(capabilities('codex').subagents, true);

  // Hooks: false, and this value has been set three times today. The binary
  // ships the whole schema — our wire format, our permissionDecision values, a
  // superset of our events — but running it fires no hook at all. The schema
  // was not evidence; the run was. See harness-registry-truth.test.mjs.
  assert.equal(capabilities('codex').hooks, false);

  // Where they still differ: slash commands and role agents have no plugin
  // surface on Codex — checked across every shipped plugin.
  assert.equal(capabilities('claude-code').slashCommands, true);
});

test('capabilities: unknown harness → null', () => {
  assert.equal(capabilities('unknown'), null);
});

test('hasCapability: degrade-safe — unknown harness/cap → false', () => {
  assert.equal(hasCapability('claude-code', 'mcp'), true);
  // Was `codex/hooks`, which is now true — the example had to change, the
  // PROPERTY did not: an unknown harness or an unknown capability degrades to
  // false rather than throwing.
  assert.equal(hasCapability('opencode', 'hooks'), false);
  assert.equal(hasCapability('unknown', 'hooks'), false);
  assert.equal(hasCapability('claude-code', 'nonexistent'), false);
});

test('HARNESSES registry is frozen + every entry has caps', () => {
  assert.ok(Object.isFrozen(HARNESSES));
  for (const h of Object.values(HARNESSES)) {
    assert.ok(h.name && h.cli && Array.isArray(h.envSignals) && h.capabilities);
  }
});
