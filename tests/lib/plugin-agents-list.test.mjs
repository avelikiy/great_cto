// The plugin declares its agents one by one.
//
// Without an `agents` field Claude Code scans agents/ — including agents/_shared/,
// whose fragments it registered as fourteen agents (`great-cto:_shared:phase-task`
// and the like) listed in every session. The `agents` field replaces the scan
// (code.claude.com/docs/en/plugins-reference), so the list must be exactly the
// agents: every top-level agents/*.md, and nothing from _shared.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
const onDisk = readdirSync(join(ROOT, 'agents')).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort();

test('plugin.json lists its agents instead of letting agents/ be scanned', () => {
  assert.ok(Array.isArray(manifest.agents), 'an explicit list — a scan registers agents/_shared fragments as agents');
});

test('the list is every top-level agent file, once', () => {
  // The paths point at agents-full/ (the bundled text the plugin registers, ADR-027);
  // the file names are still the agents'.
  const listed = (manifest.agents || []).map((p) => p.replace(/^\.\/agents(?:-full)?\//, ''));
  assert.deepEqual([...listed].sort(), onDisk, 'a new agent missing here would never be registered by the plugin');
  assert.equal(new Set(listed).size, listed.length);
});

test('nothing from agents/_shared is registered', () => {
  assert.ok(!(manifest.agents || []).some((p) => p.includes('_shared')));
});

// marketplace.json shipped at 3.27.3 and nothing moved it: two releases later its
// entry still said 3.27.3 while plugin.json said 3.29.1. At install the plugin.json
// version wins, so the entry was silently wrong rather than broken.
test('the marketplace entry carries the plugin version', () => {
  const market = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const entry = (market.plugins || []).find((p) => p.name === 'great_cto');
  assert.equal(entry?.version, manifest.version);
});
