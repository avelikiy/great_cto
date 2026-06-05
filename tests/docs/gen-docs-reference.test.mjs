// tests/docs/gen-docs-reference.test.mjs — Unit tests for scripts/gen-docs-reference.mjs
//
// Run: node --test tests/docs/gen-docs-reference.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter, generate } from '../../scripts/gen-docs-reference.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', '..', 'scripts', 'gen-docs-reference.mjs');

// ── parseFrontmatter ──────────────────────────────────────────────────────────

test('parseFrontmatter: extracts scalar keys', () => {
  const fm = parseFrontmatter('---\nname: architect\nmodel: opus\neffort: HIGH\n---\nbody');
  assert.equal(fm.name, 'architect');
  assert.equal(fm.model, 'opus');
  assert.equal(fm.effort, 'HIGH');
});

test('parseFrontmatter: strips surrounding quotes', () => {
  const fm = parseFrontmatter('---\ndescription: "Audit a codebase."\n---');
  assert.equal(fm.description, 'Audit a codebase.');
});

test('parseFrontmatter: first occurrence wins, skips list items', () => {
  const fm = parseFrontmatter('---\nname: x\nskills:\n  - a\n  - b\nname: y\n---');
  assert.equal(fm.name, 'x');
  assert.equal(fm.skills, ''); // "skills:" has empty value; list items skipped
});

test('parseFrontmatter: no frontmatter → empty object', () => {
  assert.deepEqual(parseFrontmatter('# just a heading\n'), {});
});

// ── generate (against the real repo) ──────────────────────────────────────────

test('generate: produces agents.md and commands.md', () => {
  const out = generate();
  assert.ok(out['agents.md'].includes('# Reference — Agents'));
  assert.ok(out['commands.md'].includes('# Reference — Commands'));
});

test('generate: agents table has known agents and escapes pipes', () => {
  const out = generate();
  assert.ok(out['agents.md'].includes('`architect`'));
  assert.ok(out['agents.md'].includes('`senior-dev`'));
  // every table content row must keep the 4-column shape (no raw pipes leaked)
  for (const line of out['agents.md'].split('\n')) {
    if (line.startsWith('| `')) {
      assert.equal(line.match(/(?<!\\)\|/g).length, 5, `row must have 5 unescaped delimiters: ${line}`);
    }
  }
});

test('generate: commands rendered with leading slash', () => {
  const out = generate();
  assert.ok(out['commands.md'].includes('| `/audit`'));
});

// ── --check mode ──────────────────────────────────────────────────────────────

test('--check: exits 0 when reference is in sync (run after generate)', () => {
  // First (re)generate to ensure sync, then check.
  const gen = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(gen.status, 0, gen.stderr);
  const chk = spawnSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8' });
  assert.equal(chk.status, 0, `expected in-sync, got stale:\n${chk.stderr}`);
});
