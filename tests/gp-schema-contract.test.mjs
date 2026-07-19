// The global-pattern frontmatter is a contract between one writer and several
// readers, and it silently broke: /crystallize wrote `symptom:` but never a
// `fix:` key, while senior-dev.md and devops.md both grep `^fix:` to build the
// "→ apply:" line they inject into an agent's context. The result was a pattern
// offered to every matching build with an empty remedy — worse than no pattern,
// because it looks like knowledge.
//
// Nothing failed loudly, because a missing grep match is just an empty string.
// This test makes the two sides agree by construction: every key a consumer
// reads must be a key the generator writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

// Files that consume GP frontmatter, and the generator that produces it.
const CONSUMERS = ['agents/senior-dev.md', 'agents/devops.md', 'commands/crystallize.md'];
const GENERATOR = 'commands/crystallize.md';

/** Frontmatter keys a file reads via `grep "^key:"`. */
function keysRead(text) {
  const keys = new Set();
  for (const m of text.matchAll(/grep\s+-?q?i?E?\s*"\^([a-z_][a-z0-9_-]*):"/g)) keys.add(m[1]);
  return keys;
}

/** Frontmatter keys the GP heredoc writes (`key: ${VALUE}` inside the template). */
function keysWritten(text) {
  const block = text.match(/cat > "\$GP_FILE" <<GPEOF\n---\n([\s\S]*?)\n---/);
  if (!block) return new Set();
  const keys = new Set();
  for (const line of block[1].split('\n')) {
    const m = line.match(/^([a-z_][a-z0-9_-]*):/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

test('the GP generator writes every frontmatter key its consumers read', () => {
  const written = keysWritten(read(GENERATOR));
  assert.ok(written.size > 0, 'located the GP frontmatter template');

  const missing = [];
  for (const file of CONSUMERS) {
    for (const key of keysRead(read(file))) {
      // Only keys that belong to the GP schema — consumers also grep other files.
      if (['symptom', 'fix', 'hits', 'status', 'confidence', 'verification'].includes(key)
          && !written.has(key)) {
        missing.push(`${file} reads "${key}:" but the generator never writes it`);
      }
    }
  }
  assert.deepEqual(missing, [], missing.join('\n'));
});

test('fix: specifically is written — the key whose absence emptied "→ apply:"', () => {
  const written = keysWritten(read(GENERATOR));
  assert.ok(written.has('fix'), 'GP frontmatter must carry the remedy, not only the symptom');
  assert.ok(written.has('symptom'), 'and the symptom');
});

test('senior-dev still reads both halves of a pattern', () => {
  const text = read('agents/senior-dev.md');
  assert.match(text, /grep "\^symptom:"/, 'reads the symptom');
  assert.match(text, /grep "\^fix:"/, 'reads the remedy');
});

test('a pattern with no remedy would be injected as an empty instruction', () => {
  // Documents why the contract matters: this is the exact shape senior-dev prints.
  const rendered = (symptom, fix) => `  pitfall: ${symptom}\n  → apply: ${fix}\n`;
  assert.match(rendered('pool exhausted', ''), /→ apply: *\n/,
    'an empty fix renders as an instruction with no content');
});
