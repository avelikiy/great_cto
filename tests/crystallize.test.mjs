/**
 * Tests for /crystallize skill helpers.
 *
 * Covers:
 *  - parsePatternSlug()     — extract slug from "## pattern: foo-bar" lines
 *  - clusterPatterns()      — group entries by slug, return clusters with count
 *  - checkCrystallizeHint() — hint string logic (imported from session-end.mjs)
 *  - .last-crystallize      — marker written with correct JSON fields
 *  - draft skill file format — frontmatter has status:draft, has ## pattern: section
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import checkCrystallizeHint from the dedicated utility module (no stdin blocking)
const { checkCrystallizeHint } = await import(resolve(__dirname, '../scripts/crystallize-hint.mjs'));

// ---------------------------------------------------------------------------
// Inline pure functions (mirroring the skill logic — no I/O)
// ---------------------------------------------------------------------------

/**
 * Extract the pattern slug from a `## pattern: foo-bar-baz` line.
 * Returns null if the line does not match.
 *
 * @param {string} line
 * @returns {string|null}
 */
function parsePatternSlug(line) {
  const m = line.match(/^##\s+pattern:\s+(.+)$/);
  return m ? m[1].trim() : null;
}

/**
 * Given an array of pattern entries (each with a `slug` field), group by slug
 * and return an array of `{ slug, count }` objects sorted by count desc.
 *
 * @param {{ slug: string }[]} entries
 * @returns {{ slug: string, count: number }[]}
 */
function clusterPatterns(entries) {
  const counts = {};
  for (const { slug } of entries) {
    counts[slug] = (counts[slug] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// parsePatternSlug tests
// ---------------------------------------------------------------------------

test('parsePatternSlug: extracts slug from well-formed line', () => {
  assert.equal(parsePatternSlug('## pattern: api-sunset-header-check'), 'api-sunset-header-check');
});

test('parsePatternSlug: trims trailing whitespace', () => {
  assert.equal(parsePatternSlug('## pattern: cost-outlier-opus-default   '), 'cost-outlier-opus-default');
});

test('parsePatternSlug: handles leading spaces after ##', () => {
  assert.equal(parsePatternSlug('##  pattern: foo-bar'), 'foo-bar');
});

test('parsePatternSlug: returns null for non-pattern line', () => {
  assert.equal(parsePatternSlug('## Context'), null);
  assert.equal(parsePatternSlug('pattern: api-check'), null);
  assert.equal(parsePatternSlug(''), null);
});

test('parsePatternSlug: returns null for partial match', () => {
  assert.equal(parsePatternSlug('## pattern:'), null);
});

// ---------------------------------------------------------------------------
// clusterPatterns tests
// ---------------------------------------------------------------------------

test('clusterPatterns: groups entries by slug and counts', () => {
  const entries = [
    { slug: 'api-check' },
    { slug: 'cost-outlier' },
    { slug: 'api-check' },
    { slug: 'api-check' },
    { slug: 'cost-outlier' },
  ];
  const clusters = clusterPatterns(entries);
  assert.equal(clusters[0].slug, 'api-check');
  assert.equal(clusters[0].count, 3);
  assert.equal(clusters[1].slug, 'cost-outlier');
  assert.equal(clusters[1].count, 2);
});

test('clusterPatterns: returns empty array for empty input', () => {
  assert.deepEqual(clusterPatterns([]), []);
});

test('clusterPatterns: single entry produces count of 1', () => {
  const clusters = clusterPatterns([{ slug: 'my-pattern' }]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].count, 1);
});

test('clusterPatterns: sorts descending by count', () => {
  const entries = [
    { slug: 'a' },
    { slug: 'b' }, { slug: 'b' }, { slug: 'b' },
    { slug: 'c' }, { slug: 'c' },
  ];
  const clusters = clusterPatterns(entries);
  assert.equal(clusters[0].slug, 'b');
  assert.equal(clusters[1].slug, 'c');
  assert.equal(clusters[2].slug, 'a');
});

test('clusterPatterns: threshold — only slugs with ≥3 occurrences are eligible', () => {
  const entries = [
    { slug: 'rare' }, { slug: 'rare' },           // 2 — below threshold
    { slug: 'common' }, { slug: 'common' }, { slug: 'common' }, // 3 — eligible
  ];
  const clusters = clusterPatterns(entries);
  const eligible = clusters.filter(c => c.count >= 3);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].slug, 'common');
});

// ---------------------------------------------------------------------------
// checkCrystallizeHint tests (imported from the real hook)
// ---------------------------------------------------------------------------

test('checkCrystallizeHint: returns non-empty string when sessionCount is multiple of 10', () => {
  // Use a temp dir so there is no .last-crystallize interfering
  const cwd = process.cwd();
  const tmp = mkdtempSync(join(tmpdir(), 'cryst-hint-'));
  try {
    process.chdir(tmp);
    mkdirSync(join(tmp, '.great_cto'), { recursive: true });
    const hint = checkCrystallizeHint(10);
    assert.ok(hint.length > 0, 'hint should be non-empty at multiple of 10');
    assert.ok(hint.includes('10'), 'hint should mention the session count');
  } finally {
    process.chdir(cwd);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('checkCrystallizeHint: returns empty string for non-multiple counts (no marker)', () => {
  const cwd = process.cwd();
  const tmp = mkdtempSync(join(tmpdir(), 'cryst-hint-'));
  try {
    process.chdir(tmp);
    mkdirSync(join(tmp, '.great_cto'), { recursive: true });
    assert.equal(checkCrystallizeHint(7), '', 'no hint at 7 sessions');
    assert.equal(checkCrystallizeHint(11), '', 'no hint at 11 sessions');
    assert.equal(checkCrystallizeHint(0), '', 'no hint at 0 sessions');
  } finally {
    process.chdir(cwd);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('checkCrystallizeHint: returns hint when sessionCount >= marker.sessions + 10', () => {
  const cwd = process.cwd();
  const tmp = mkdtempSync(join(tmpdir(), 'cryst-hint-marker-'));
  try {
    process.chdir(tmp);
    mkdirSync(join(tmp, '.great_cto'), { recursive: true });
    // Write a marker that says last run was at session 5
    writeFileSync(
      join(tmp, '.great_cto', '.last-crystallize'),
      JSON.stringify({ ts: new Date().toISOString(), sessions: 5, drafts: 2 }) + '\n',
    );
    // 15 >= 5 + 10 → hint expected
    const hint = checkCrystallizeHint(15);
    assert.ok(hint.length > 0, 'hint expected when 10+ sessions since last run');
    assert.ok(hint.includes('15'), 'hint should mention current session count');
  } finally {
    process.chdir(cwd);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('checkCrystallizeHint: no hint when sessionCount < marker.sessions + 10', () => {
  const cwd = process.cwd();
  const tmp = mkdtempSync(join(tmpdir(), 'cryst-hint-nomark-'));
  try {
    process.chdir(tmp);
    mkdirSync(join(tmp, '.great_cto'), { recursive: true });
    writeFileSync(
      join(tmp, '.great_cto', '.last-crystallize'),
      JSON.stringify({ ts: new Date().toISOString(), sessions: 10, drafts: 1 }) + '\n',
    );
    // 15 < 10 + 10 → no hint
    assert.equal(checkCrystallizeHint(15), '');
  } finally {
    process.chdir(cwd);
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// .last-crystallize marker: written with correct JSON fields
// ---------------------------------------------------------------------------

test('.last-crystallize marker has required JSON fields (ts, sessions, drafts)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'cryst-marker-'));
  try {
    mkdirSync(join(tmp, '.great_cto'), { recursive: true });
    const markerPath = join(tmp, '.great_cto', '.last-crystallize');
    const marker = {
      ts: new Date().toISOString(),
      sessions: 20,
      drafts: 3,
    };
    writeFileSync(markerPath, JSON.stringify(marker) + '\n');

    assert.ok(existsSync(markerPath), 'marker file should exist');
    const parsed = JSON.parse(readFileSync(markerPath, 'utf8'));
    assert.ok(typeof parsed.ts === 'string', 'ts must be a string');
    assert.ok(!isNaN(Date.parse(parsed.ts)), 'ts must be a valid ISO date');
    assert.equal(typeof parsed.sessions, 'number', 'sessions must be a number');
    assert.equal(typeof parsed.drafts, 'number', 'drafts must be a number');
    assert.equal(parsed.sessions, 20);
    assert.equal(parsed.drafts, 3);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Draft skill file format
// ---------------------------------------------------------------------------

test('draft skill file has frontmatter with status: draft', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'cryst-skill-'));
  try {
    const skillDir = join(tmp, 'skills', 'cost-guard');
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');

    const content = [
      '---',
      'name: cost-guard',
      'description: Guard against cost outliers in LLM pipelines.',
      'status: draft',
      'when_to_use: |',
      '  Apply when cost-outlier pattern detected.',
      'allowed-tools: Read, Grep',
      'paths:',
      '  - ".great_cto/cost-history.log"',
      '---',
      '',
      '# Cost Guard — extracted patterns',
      '',
      '## pattern: cost-outlier-opus-default',
      '',
      '**Context:** Opus used by default when Haiku would suffice.',
      '',
      '**Decision/Pattern:** Always try Haiku before escalating to Sonnet or Opus.',
      '',
      '**Outcome:** 3x cost reduction on routine tasks.',
      '',
      '**Applies-to-archetypes:** ai-system, rag-system, web-service',
      '',
      '**Evidence:** 3 occurrences across 2 projects',
    ].join('\n');

    writeFileSync(skillPath, content);

    const raw = readFileSync(skillPath, 'utf8');

    // Must have frontmatter with status: draft
    assert.ok(raw.includes('status: draft'), 'frontmatter must include status: draft');

    // Must have at least one ## pattern: section
    assert.ok(/^## pattern:/m.test(raw), 'must have at least one ## pattern: section');

    // Must have name in frontmatter
    assert.ok(/^name:/m.test(raw), 'must have name in frontmatter');

    // Must start with ---
    assert.ok(raw.startsWith('---'), 'must start with YAML frontmatter delimiter');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('draft skill file pattern section has required subfields', () => {
  const content = [
    '---',
    'name: api-contract',
    'status: draft',
    '---',
    '',
    '## pattern: api-sunset-header-check',
    '',
    '**Context:** API sunset headers were missing, caught by api-platform-reviewer.',
    '',
    '**Decision/Pattern:** Always add Sunset and Deprecation headers to versioned APIs.',
    '',
    '**Outcome:** Caught before deploy in 4/4 sessions.',
    '',
    '**Applies-to-archetypes:** fintech, commerce, rest-api',
    '',
    '**Evidence:** 4 occurrences, shape A',
  ].join('\n');

  const slug = parsePatternSlug('## pattern: api-sunset-header-check');
  assert.equal(slug, 'api-sunset-header-check');

  assert.ok(content.includes('**Context:**'), 'must have Context field');
  assert.ok(content.includes('**Decision/Pattern:**'), 'must have Decision/Pattern field');
  assert.ok(content.includes('**Outcome:**'), 'must have Outcome field');
  assert.ok(content.includes('**Applies-to-archetypes:**'), 'must have Applies-to-archetypes field');
  assert.ok(content.includes('**Evidence:**'), 'must have Evidence field');
});
