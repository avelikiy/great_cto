// `--host codex` wrote hook scripts into ~/.codex/skills/great_cto/, wrote a
// TOML fragment the user had to merge by hand, and set `[features] hooks = true`
// plus `[hooks_files]`.
//
// Phase 0 (docs/analysis/2026-09-05-codex-phase0-findings.md) checked all of that
// against codex-cli 0.153.4:
//
//   ~/.codex/skills/       does not exist on a working install
//   [hooks_files]          used by no shipped plugin
//   hooks on Codex         unverified — the config key parses, nothing more
//
// Meanwhile Codex ships `codex plugin marketplace add` taking a local or Git
// source, and installing that way was VERIFIED end to end: the plugin reports
// `installed, enabled 3.23.0` with all 40 skills.
//
// So the install now emits the supported path. This tests the decision — which
// commands, and what it refuses to claim — separately from running them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codexInstallPlan } from '../dist/codex.js';

test('the plan uses the marketplace, not hand-written config', () => {
  const p = codexInstallPlan({ repoDir: '/repo', codexOnPath: true });
  const cmds = p.commands.join(' ');
  assert.match(cmds, /plugin marketplace add/, 'the supported entry point');
  assert.match(cmds, /plugin add/, 'and the install itself');
  assert.doesNotMatch(cmds, /\.codex\/skills/, 'nothing may write to a directory Codex does not read');
});

test('a missing codex CLI is a blocked plan, not a half-done install', () => {
  // Writing files for a CLI that is not there leaves the user with config and no
  // way to use it — the failure mode the old path had by construction.
  const p = codexInstallPlan({ repoDir: '/repo', codexOnPath: false });
  assert.equal(p.ok, false);
  assert.match(p.why, /codex/i);
  assert.deepEqual(p.commands, [], 'nothing runs when the host is absent');
});

test('it states what does NOT carry over, rather than implying everything does', () => {
  // The honest half. Checked across every shipped Codex plugin: no manifest
  // declares hooks, commands or prompts. Claiming "installed" without saying this
  // would promise a pipeline the host cannot run.
  const p = codexInstallPlan({ repoDir: '/repo', codexOnPath: true });
  const text = p.notSupported.join(' ').toLowerCase();
  for (const missing of ['hook', 'command', 'agent']) {
    assert.match(text, new RegExp(missing), `must name ${missing} as not carried over`);
  }
});

test('and it names what DOES carry over, so the result is not read as nothing', () => {
  const p = codexInstallPlan({ repoDir: '/repo', codexOnPath: true });
  const text = p.supported.join(' ').toLowerCase();
  assert.match(text, /skill/, 'skills carry over');
  assert.match(text, /mcp/, 'so does the MCP server');
});

test('the repo directory is what gets registered', () => {
  const p = codexInstallPlan({ repoDir: '/some/where', codexOnPath: true });
  assert.match(p.commands.join(' '), /\/some\/where/);
});
