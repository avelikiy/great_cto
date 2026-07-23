// `adapt` used to end by pointing at itself — "re-run after editing…", "add more
// tools…" — and nothing pointed forward. Telemetry showed the consequence: 69 of
// 100 recorded runs were `adapt`, against 2 for `board`. The command taught its
// own loop, so people looped.
//
// The forward pointer must be tool-aware: `adapt` is the one command that serves
// non-Claude-Code users, and the agent pipeline is Claude-Code-only. Sending a
// Cursor user to `/audit` would be a dead end — worse than silence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStepsAfterAdapt } from '../dist/adapt.js';

const joined = (tools) => nextStepsAfterAdapt(tools).join('\n');

test('claude-code users are pointed into the pipeline', () => {
  const s = joined(['claude-code']);
  assert.match(s, /Next:/);
  assert.match(s, /\/audit/, 'existing-codebase entry point');
  assert.match(s, /\/start/, 'greenfield entry point');
  assert.match(s, /\/inbox/, 'what-needs-me entry point');
  assert.match(s, /great-cto board/, 'the dashboard they never open');
  assert.match(s, /Restart Claude Code/, 'regenerated CLAUDE.md needs a reload');
});

test('non-Claude tools are NOT sent to commands that do not exist for them', () => {
  const s = joined(['cursor', 'copilot']);
  assert.doesNotMatch(s, /\/audit/, 'no dead-end slash command');
  assert.doesNotMatch(s, /\/inbox/);
  assert.match(s, /cursor \/ copilot/, 'names the tools it configured');
  assert.match(s, /reload the tool/i);
});

test('non-Claude users are told plainly what unlocks the pipeline', () => {
  const s = joined(['windsurf']);
  assert.match(s, /Claude Code/, 'says where the pipeline lives');
  assert.match(s, /add claude-code to ai_tools/, 'and the concrete step to get it');
  assert.match(s, /great-cto install/);
});

test('a mixed setup that includes claude-code gets the pipeline path', () => {
  const s = joined(['cursor', 'claude-code', 'aider']);
  assert.match(s, /\/audit/, 'claude-code present → pipeline is reachable');
});

test('always opens with a forward-looking header, never a re-run nudge', () => {
  for (const tools of [['claude-code'], ['cursor'], []]) {
    const lines = nextStepsAfterAdapt(tools);
    assert.equal(lines[1], 'Next:', `header for ${JSON.stringify(tools)}`);
    assert.doesNotMatch(lines.join('\n'), /Re-run/i, 'the forward block never loops back to adapt');
  }
});

test('empty tool list is safe and still points somewhere', () => {
  const lines = nextStepsAfterAdapt([]);
  assert.ok(lines.length > 2, 'produces guidance rather than an empty block');
});

test('no arguments at all does not throw', () => {
  assert.doesNotThrow(() => nextStepsAfterAdapt());
});
