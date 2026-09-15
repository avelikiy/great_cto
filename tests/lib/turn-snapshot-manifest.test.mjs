// ADR-023 step 2: the plugin registers the turn snapshot where a turn ends, and in a
// way that cannot hold the turn up or fail it.
//
// A snapshot costs about 300 ms on a real repository (measured in the ADR), so it
// runs as an `async` hook (ADR-019) — the turn never waits on it — and its command
// cannot turn a git problem into a failed Stop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
const entries = (event) => (manifest.hooks?.[event] || []).flatMap((g) => g.hooks || []);

for (const event of ['Stop', 'SubagentStop']) {
  test(`${event} snapshots the turn, in the background, and cannot fail it`, () => {
    const found = entries(event).filter((h) => /scripts\/hooks\/turn-snapshot\.mjs/.test(String(h.command)));
    assert.equal(found.length, 1, `exactly one turn-snapshot entry on ${event}`);
    const [h] = found;
    assert.equal(h.async, true, 'async: a 300 ms snapshot must not hold the turn');
    assert.match(String(h.command), /\$\{CLAUDE_PLUGIN_ROOT\}/, 'resolved from the installed plugin');
    assert.match(String(h.command), /\|\|\s*true\s*$/, 'a failed snapshot is not a failed turn');
  });
}
