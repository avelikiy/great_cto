// Pack-registry integration tests.
//
// Verifies the v2.8.0 pack overlay system is internally consistent:
// every reviewer named in PACK_REVIEWERS exists as agents/<name>.md;
// every gate in PACK_GATES follows the gate:name convention; the test
// harness in openrouter-pack-overlays.mjs covers every pack in packs.ts.
//
// Without these checks, a typo (or a reviewer file rename) could
// silently break pack detection while unit tests stay green.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const AGENTS_DIR = join(REPO_ROOT, 'agents');

const packs = await import('../packages/cli/dist/packs.js');

// ── pack-reviewer integrity ────────────────────────────────────────────────

test('packs: every PACK_REVIEWERS entry references an existing agent file', () => {
  // Parse PACK_REVIEWERS straight from packs.ts (not exported) so this self-maintains
  // as packs are added/removed — no brittle hardcoded count or reviewer list.
  const src = readFileSync(join(REPO_ROOT, 'packages', 'cli', 'src', 'packs.ts'), 'utf8');
  const block = src.slice(src.indexOf('PACK_REVIEWERS'), src.indexOf('PACK_GATES'));
  const packKeys = [...block.matchAll(/"([a-z0-9-]+-pack)":/g)].map((m) => m[1]);
  const reviewers = [...new Set([...block.matchAll(/"([a-z0-9-]+-reviewer)"/g)].map((m) => m[1]))];

  // every pack in PACK_REVIEWERS is also exposed by listPacks()
  const listed = packs.listPacks();
  assert.equal(packKeys.length, listed.length, `PACK_REVIEWERS has ${packKeys.length} packs, listPacks() ${listed.length}: ${packKeys.join(',')}`);
  for (const pk of packKeys) assert.ok(listed.includes(pk), `pack '${pk}' in PACK_REVIEWERS but not listPacks()`);

  // every named reviewer resolves to a real agent file
  for (const r of reviewers) {
    assert.ok(existsSync(join(AGENTS_DIR, `${r}.md`)), `Pack reviewer agents/${r}.md must exist (referenced in packs.ts)`);
  }
});

test('packs: every test harness pack has a matching pack in packs.ts', () => {
  // Parse tests/openrouter-pack-overlays.mjs for pack keys.
  const harness = readFileSync(join(REPO_ROOT, 'tests', 'openrouter-pack-overlays.mjs'), 'utf8');
  const harnessPacks = [...harness.matchAll(/^\s*'([a-z-]+-pack)':\s*\{/gm)].map(m => m[1]);
  const declaredPacks = packs.listPacks();

  for (const harnessPack of harnessPacks) {
    assert.ok(declaredPacks.includes(harnessPack),
      `Pack '${harnessPack}' in openrouter-pack-overlays.mjs but NOT in packs.ts listPacks()`);
  }
  for (const declared of declaredPacks) {
    assert.ok(harnessPacks.includes(declared),
      `Pack '${declared}' in packs.ts but NOT covered by openrouter-pack-overlays.mjs harness`);
  }
});

test('packs: gate naming follows gate:<name> convention', () => {
  // Read packs.ts source to extract PACK_GATES entries.
  const src = readFileSync(join(REPO_ROOT, 'packages', 'cli', 'src', 'packs.ts'), 'utf8');
  // Find all "gate:..." strings inside PACK_GATES block
  const gateMatch = src.match(/const PACK_GATES[\s\S]*?\};/);
  assert.ok(gateMatch, 'PACK_GATES const block not found in packs.ts');

  const gates = [...gateMatch[0].matchAll(/"(gate:[a-z0-9-]+)"/g)].map(m => m[1]);
  assert.ok(gates.length >= 10, `Expected ≥10 pack gates, got ${gates.length}`);

  for (const gate of gates) {
    assert.match(gate, /^gate:[a-z][a-z0-9-]+$/,
      `Pack gate '${gate}' violates naming convention gate:<lowercase-hyphenated>`);
  }
});

// ── archetype × pack composition ───────────────────────────────────────────

test('packs: every fixture in tests/fixtures/ maps to a known archetype', async () => {
  // The 36 archetype-e2e fixtures should all produce a valid archetype.
  // (Already tested by run-archetype-e2e.mjs end-to-end; this is a
  // structural sanity check on the fixture set.)
  const archetypes = await import('../packages/cli/dist/archetypes.js');
  const fs = await import('node:fs');
  const fixturesDir = join(REPO_ROOT, 'tests', 'fixtures');
  const fixtures = fs.readdirSync(fixturesDir)
    .filter(n => !n.startsWith('_') && !n.startsWith('.'))
    .filter(n => fs.statSync(join(fixturesDir, n)).isDirectory());

  for (const fixture of fixtures) {
    const expectedPath = join(fixturesDir, fixture, 'expected.json');
    if (!existsSync(expectedPath)) continue;
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    if (!expected.archetype) continue;
    assert.ok(archetypes.REVIEWERS_BY_ARCHETYPE[expected.archetype] !== undefined,
      `Fixture '${fixture}' expects archetype '${expected.archetype}' but it's NOT in REVIEWERS_BY_ARCHETYPE`);
  }
});

// ── reviewer file integrity ────────────────────────────────────────────────

test('packs: every pack reviewer has frontmatter + body', () => {
  const reviewerNames = [
    'voice-ai-reviewer', 'ai-clinical-reviewer', 'fda-reviewer',
    'hr-ai-reviewer', 'api-platform-reviewer',
    'clinical-trials-reviewer', 'bio-data-reviewer',
  ];

  for (const name of reviewerNames) {
    const path = join(AGENTS_DIR, `${name}.md`);
    const content = readFileSync(path, 'utf8');
    assert.match(content, /^---\n[\s\S]+?\n---\n/,
      `Reviewer ${name} missing YAML frontmatter`);
    assert.match(content, /^name:\s*\S/m,
      `Reviewer ${name} missing 'name:' in frontmatter`);
    assert.match(content, /^description:\s*\S/m,
      `Reviewer ${name} missing 'description:' in frontmatter`);
    assert.match(content, /^tools:\s*\S/m,
      `Reviewer ${name} missing 'tools:' in frontmatter`);
    // Body must be non-trivial
    const body = content.replace(/^---\n[\s\S]+?\n---\n/, '').trim();
    assert.ok(body.length > 300,
      `Reviewer ${name} body suspiciously short (${body.length} chars) — likely stub or truncated`);
  }
});
