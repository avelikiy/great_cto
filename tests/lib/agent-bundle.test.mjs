// agents-full/ — the agent text the PLUGIN registers, with shared fragments inlined.
//
// Both registrations of an agent must carry the same contract. The installed copy
// (~/.claude/agents) has inlined fragments since 2026-09-21; the plugin copy pointed at
// agents/_shared/*.md, a path that does not exist where an agent runs, and 4% of
// dispatches use that copy. ADR-027 measured dropping the plugin registration instead
// and refused it: an agent installed during SessionStart is unavailable until the next
// session, so a first session would have none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle, HEADER } from '../../scripts/build-agent-bundle.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const built = bundle();

test('agents-full/ is what the generator produces right now', () => {
  const have = readdirSync(join(ROOT, 'agents-full')).filter((f) => f.endsWith('.md')).sort();
  assert.deepEqual(have, [...built.keys()], 'a new agent must be bundled: node scripts/build-agent-bundle.mjs');
  for (const [f, text] of built) {
    assert.equal(readFileSync(join(ROOT, 'agents-full', f), 'utf8'), text, `${f} is stale — run scripts/build-agent-bundle.mjs`);
  }
});

test('the bundle keeps the agent frontmatter and marks itself generated', () => {
  const text = built.get('code-reviewer.md');
  assert.match(text, /^---\nname: code-reviewer\n/);
  assert.ok(text.includes(HEADER), 'a reader who opens it must see it is build output');
});

test('a pointer to a shared fragment is inlined, and the fragment content is there', () => {
  const text = built.get('code-reviewer.md');
  assert.match(text, /BEGIN agents\/_shared\/verdict-format\.md/);
  const fragment = readFileSync(join(ROOT, 'agents/_shared/verdict-format.md'), 'utf8').replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  assert.ok(text.includes(fragment.split('\n')[0]), 'the first line of the fragment is present');
});

test('the plugin registers the bundled files, not the sources', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.deepEqual(manifest.agents, [...built.keys()].map((f) => `./agents-full/${f}`));
});

test('every agent source has a bundled twin — none is dropped by the glob', () => {
  const sources = readdirSync(join(ROOT, 'agents')).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort();
  assert.deepEqual([...built.keys()], sources);
});
