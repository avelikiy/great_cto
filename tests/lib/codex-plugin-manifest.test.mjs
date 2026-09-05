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

test('hooks.json is ready but NOT declared — the host does not run hooks yet', () => {
  // Three passes on this, and only the last was evidence:
  //   1. "no plugin surface" — from no shipped plugin declaring one
  //   2. "carries over" — from the binary's full schema: our wire format, our
  //      permissionDecision values, `hooks` as a manifest key
  //   3. it was RUN. codex-cli 0.153.4 fires no hook at all — not from the
  //      manifest, not from ~/.codex/hooks.json, not with
  //      --dangerously-bypass-hook-trust. A probe hook that only appends a line
  //      never ran, and the guarded write went through and put an API key on
  //      disk.
  //
  // So the file stays — it is correct, uses ${PLUGIN_ROOT}, and keeps
  // secret-scan unswallowed — and the manifest does NOT declare it. Declaring a
  // key the host ignores would read, to anyone opening the manifest, as a hook
  // chain that works.
  const m = read('.codex-plugin/plugin.json');
  assert.equal(m.hooks, undefined,
    'do not declare hooks until a run shows Codex firing them');

  const hooksPath = join(REPO, '.codex-plugin', 'hooks.json');
  assert.ok(existsSync(hooksPath), 'the file stays ready for when the host runs hooks');

  const hooks = JSON.parse(readFileSync(hooksPath, 'utf8'));
  const commands = Object.values(hooks).flat().flatMap((g) => (g.hooks ?? []).map((h) => h.command));
  assert.ok(commands.length, 'hooks.json must declare commands');

  for (const c of commands) {
    // ${PLUGIN_ROOT} is what Codex expands; a baked absolute path would work on
    // the machine that generated it and nowhere else.
    assert.match(c, /\$\{PLUGIN_ROOT\}/, `command must use \${PLUGIN_ROOT}: ${c}`);
    assert.doesNotMatch(c, /\/Users\/|\/home\//, `a machine-specific path leaked in: ${c}`);
  }

  const guard = commands.find((c) => /secret-scan/.test(c));
  assert.ok(guard, 'secret-scan must be wired for the day hooks work');
  assert.doesNotMatch(guard, /\|\|\s*true|2>\/dev\/null/,
    'a guard that cannot fail and cannot explain is not a guard');
});
