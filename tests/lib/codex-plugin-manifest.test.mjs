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
import { readFileSync, existsSync } from 'node:fs';
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

test('hooks are wired through the manifest, and the file exists', () => {
  // Phase 0 first concluded hooks had no plugin surface. They do: `hooks` is a
  // manifest key, Codex implements our wire format exactly, and
  // `permissionDecision` takes the same allow|deny|ask we already write.
  const m = read('.codex-plugin/plugin.json');
  assert.equal(typeof m.hooks, 'string', 'hooks must be a path, like skills and mcpServers');
  assert.ok(existsSync(join(REPO, m.hooks)), `hooks path does not exist: ${m.hooks}`);
});

test('hook commands resolve through ${PLUGIN_ROOT}, not an absolute path', () => {
  // The installed plugin lives under ~/.codex/plugins/cache/…, a path unknown at
  // authoring time. ${PLUGIN_ROOT} is what Codex expands — the counterpart of
  // ${CLAUDE_PLUGIN_ROOT}. A baked absolute path would work on the machine that
  // generated it and nowhere else.
  const m = read('.codex-plugin/plugin.json');
  const hooks = JSON.parse(readFileSync(join(REPO, m.hooks), 'utf8'));
  const commands = Object.values(hooks).flat().flatMap((g) => (g.hooks ?? []).map((h) => h.command));
  assert.ok(commands.length, 'hooks.json must declare commands');
  for (const c of commands) {
    assert.match(c, /\$\{PLUGIN_ROOT\}/, `command must use \${PLUGIN_ROOT}: ${c}`);
    assert.doesNotMatch(c, /\/Users\/|\/home\//, `a machine-specific path leaked in: ${c}`);
  }
});

test('the blocking guard survives the trip into the manifest', () => {
  // The generator was fixed to stop swallowing secret-scan; this checks the file
  // that actually ships, not the generator's return value.
  const m = read('.codex-plugin/plugin.json');
  const hooks = JSON.parse(readFileSync(join(REPO, m.hooks), 'utf8'));
  const commands = Object.values(hooks).flat().flatMap((g) => (g.hooks ?? []).map((h) => h.command));
  const guard = commands.find((c) => /secret-scan/.test(c));
  assert.ok(guard, 'secret-scan must be wired on Codex too');
  assert.doesNotMatch(guard, /\|\|\s*true|2>\/dev\/null/,
    'a guard that cannot fail and cannot explain is not a guard');
});
