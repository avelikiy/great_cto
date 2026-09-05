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

  // Hooks remain false, and this is a different KIND of claim: not "measured
  // absent" but "not yet measurable". The config key parses, no shipped plugin
  // declares one, and whether `exit 2` blocks a tool call is unknown —
  // secret-scan, a blocking guard, rides on that signal. False until measured.
  assert.equal(capabilities('codex').hooks, false);
});

test('capabilities: unknown harness → null', () => {
  assert.equal(capabilities('unknown'), null);
});

test('hasCapability: degrade-safe — unknown harness/cap → false', () => {
  assert.equal(hasCapability('claude-code', 'mcp'), true);
  assert.equal(hasCapability('codex', 'hooks'), false);
  assert.equal(hasCapability('unknown', 'hooks'), false);
  assert.equal(hasCapability('claude-code', 'nonexistent'), false);
});

test('HARNESSES registry is frozen + every entry has caps', () => {
  assert.ok(Object.isFrozen(HARNESSES));
  for (const h of Object.values(HARNESSES)) {
    assert.ok(h.name && h.cli && Array.isArray(h.envSignals) && h.capabilities);
  }
});
