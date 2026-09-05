// The Codex hooks.json, and the one line in it that mattered.
//
// Phase 0 established that Codex implements our hook contract exactly: same
// events, same wire format, and `permissionDecision` takes `allow | deny | ask`
// — the same words we write. No shim is needed.
// (docs/analysis/2026-09-05-codex-phase0-findings.md)
//
// What DID need fixing was our own generator. Every hook command was written as
//
//     node ".../secret-scan.mjs" 2>/dev/null || true
//
// `|| true` swallows the exit code, and `2>/dev/null` swallows the reason. So on
// Codex the blocking guard could not block and could not say why — a guard that
// cannot fail, which is the thing this repository keeps deleting.
//
// Advisory hooks may keep `|| true`: a formatter that dies must not stop a write.
// Blocking ones may not. The split is the point.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCodexHooksJson } from '../dist/adapt.js';

const HOOKS = JSON.parse(getCodexHooksJson('/skill'));
const commandsFor = (event) =>
  (HOOKS[event] ?? []).flatMap((g) => (g.hooks ?? []).map((h) => h.command));
const all = () => Object.keys(HOOKS).flatMap(commandsFor);

test('the blocking guard is not swallowed', () => {
  const blocking = all().filter((c) => /secret-scan/.test(c));
  assert.ok(blocking.length, 'secret-scan must be wired');
  for (const c of blocking) {
    assert.doesNotMatch(c, /\|\|\s*true/, `secret-scan must be able to fail: ${c}`);
    assert.doesNotMatch(c, /2>\/dev\/null/, `its reason must reach the user: ${c}`);
  }
});

test('advisory hooks may still be swallowed — that is deliberate', () => {
  // A formatter or a logger failing must not stop the user's write. Asserting
  // this keeps a later "tidy-up" from removing `|| true` everywhere and turning
  // every advisory hook into a blocker.
  const advisory = all().filter((c) => /format-check|tool-failure/.test(c));
  assert.ok(advisory.length, 'advisory hooks must be wired');
  assert.ok(advisory.every((c) => /\|\|\s*true|;\s*true/.test(c)),
    'advisory hooks keep their fail-open wrapper');
});

test('every command points inside the given skill dir', () => {
  for (const c of all()) assert.match(c, /\/skill\//, `command escapes the skill dir: ${c}`);
});

test('the events used are ones Codex actually has', () => {
  // Codex ships: PreToolUse, PermissionRequest, PostToolUse, PreCompact,
  // PostCompact, SessionStart, SessionEnd, UserPromptSubmit, SubagentStart,
  // SubagentStop, Stop. Emitting an event it does not know is a hook that never
  // runs — and nothing would say so.
  const CODEX_EVENTS = new Set([
    'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PreCompact', 'PostCompact',
    'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'SubagentStart', 'SubagentStop', 'Stop',
  ]);
  for (const e of Object.keys(HOOKS)) {
    assert.ok(CODEX_EVENTS.has(e), `${e} is not a Codex hook event`);
  }
});
