/**
 * The Codex plugin manifests, held to the shape Codex actually validates.
 *
 * These were written against a live codex-cli 0.153.4 and verified by installing:
 * `codex plugin marketplace add .` then `codex plugin add great-cto@great-cto`
 * reports `installed, enabled 3.23.0` with all 40 skills present.
 *
 * Codex's validator is strict in ways a hand-written manifest will not survive.
 * The first attempt was rejected with:
 *
 *     unknown variant `NONE`, expected `ON_INSTALL` or `ON_USE`
 *
 * so the allowed values are pinned here. A manifest that stops loading is silent
 * on our side — nothing in this repository breaks — and only shows up as a plugin
 * that will not install for a user.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));

test('the plugin manifest exists and is valid JSON', () => {
  const m = read('.codex-plugin/plugin.json');
  for (const k of ['name', 'version', 'description', 'license', 'skills']) {
    assert.ok(m[k], `plugin.json must carry ${k}`);
  }
});

test('skills and mcpServers are PATHS, the shape Codex ships', () => {
  // Every shipped Codex plugin points at files: `"skills": "./skills/"`,
  // `"mcpServers": "./.mcp.json"`. An inline object is the Claude Code shape and
  // is not what this host reads.
  const m = read('.codex-plugin/plugin.json');
  assert.equal(typeof m.skills, 'string', 'skills must be a path');
  assert.equal(typeof m.mcpServers, 'string', 'mcpServers must be a path');
  assert.ok(existsSync(join(REPO, m.skills)), `skills path does not exist: ${m.skills}`);
  assert.ok(existsSync(join(REPO, m.mcpServers)), `mcpServers path does not exist: ${m.mcpServers}`);
});

test('the version matches the Claude Code manifest — one product, one number', () => {
  // Two manifests for two hosts, and a user comparing them should not find two
  // different products. This is also what the plugin cache is keyed on.
  assert.equal(read('.codex-plugin/plugin.json').version, read('.claude-plugin/plugin.json').version);
});

test('the MCP server is reachable the way a Codex user gets it', () => {
  // NOT `${CLAUDE_PLUGIN_ROOT}/...` — that variable is expanded by Claude Code
  // and is a literal string anywhere else. From npm is what a Codex user has.
  const mcp = read('.codex-plugin/mcp.json');
  const s = mcp.mcpServers?.great_cto;
  assert.ok(s, 'a great_cto server must be declared');
  assert.doesNotMatch(JSON.stringify(s), /CLAUDE_PLUGIN_ROOT/,
    'a Claude Code variable would not expand on Codex');
  assert.match(JSON.stringify(s.args), /great-cto/, 'it must resolve to the published package');
});

test('the marketplace manifest uses only values Codex accepts', () => {
  const mk = read('.agents/plugins/marketplace.json');
  assert.ok(Array.isArray(mk.plugins) && mk.plugins.length, 'plugins must be a non-empty array');
  for (const p of mk.plugins) {
    assert.ok(p.source?.source, 'each plugin needs a source');
    // Pinned from the validator's own error message, not from a guess.
    assert.ok(['ON_INSTALL', 'ON_USE'].includes(p.policy?.authentication),
      `authentication must be ON_INSTALL or ON_USE, got ${p.policy?.authentication}`);
    assert.ok(['AVAILABLE', 'BLOCKED'].includes(p.policy?.installation),
      `installation must be a value Codex knows, got ${p.policy?.installation}`);
  }
});

test('the marketplace points at the repo root, not a vendored copy', () => {
  // A copy under ./plugins/great-cto would drift from the tree the Claude Code
  // manifest reads. One tree, two manifests.
  const mk = read('.agents/plugins/marketplace.json');
  assert.equal(mk.plugins[0].source.path, '.');
});

test('the Codex hooks file is in the schema Codex accepts, and every guard it names exists', () => {
  // Five passes on this capability. The fourth found Codex READS plugin hooks and
  // rejected ours (`unknown field SessionStart, expected description or hooks`) —
  // a Claude-format event map at the top level, which surfaced as an error on every
  // Codex turn. The fifth (2026-09-28, codex-cli 0.153.4) ran a probe plugin:
  //   - the file is `{ description?, hooks: { <Event>: [ { matcher, hooks: [ { type,
  //     command } ] } ] } }` — Claude's event map, one level down;
  //   - a path declared as `hooks` in .codex-plugin/plugin.json is honoured, so the
  //     file need not sit at hooks/hooks.json, where Claude Code would load it too;
  //   - PreToolUse fires for `Bash` and `apply_patch`, and a deny stops the call.
  // Codex runs a plugin hook only after the user approves it once in its TUI.
  const m = read('.codex-plugin/plugin.json');
  assert.equal(m.hooks, './.codex-plugin/hooks.json');
  assert.ok(!existsSync(join(REPO, 'hooks', 'hooks.json')),
    'a root hooks/hooks.json would be loaded by Claude Code as well — every guard twice');

  const h = read('.codex-plugin/hooks.json');
  assert.deepEqual(Object.keys(h).sort(), ['description', 'hooks'], 'top level: description and hooks only');
  const events = Object.keys(h.hooks);
  assert.ok(events.length > 0);
  for (const ev of events) {
    assert.match(ev, /^(SessionStart|PreToolUse|PostToolUse|UserPromptSubmit|Stop)$/, `event ${ev}`);
    for (const entry of h.hooks[ev]) {
      for (const hook of entry.hooks) {
        assert.equal(hook.type, 'command');
        assert.match(hook.command, /codex-adapter\.mjs/, 'every call goes through the adapter');
        assert.match(hook.command, /EXIT -eq 2 \]; then exit 2; fi; exit 0$/, 'a crash lets the call through; only a deny blocks');
        const guards = hook.command.split('codex-adapter.mjs"')[1].split(';')[0].trim().split(/\s+/);
        assert.ok(guards.length > 0);
        for (const g of guards) assert.ok(existsSync(join(REPO, 'scripts', 'hooks', `${g}.mjs`)), `guard ${g} exists`);
      }
    }
  }
  const matchers = h.hooks.PreToolUse.map((e) => e.matcher).sort();
  assert.deepEqual(matchers, ['Bash', 'apply_patch'], 'Codex names its shell and edit tools this way');
});
