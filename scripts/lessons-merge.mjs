#!/usr/bin/env node
/**
 * lessons-merge.mjs — consolidate per-project lessons into global decisions.
 *
 * Reads ~/.great_cto/projects/*\/lessons.md (symlinks to project lessons.md files
 * registered via /start), counts pattern occurrences across projects, and
 * promotes any pattern that appears in ≥3 distinct projects to
 * ~/.great_cto/decisions.md.
 *
 * Usage:
 *   node scripts/lessons-merge.mjs            # incremental merge
 *   node scripts/lessons-merge.mjs --dry-run  # preview only, no writes
 *   node scripts/lessons-merge.mjs --force    # re-promote even if already in decisions.md
 *
 * Run automatically by:
 *   - continuous-learner agent (after writing a new lesson)
 *   - /save command (optional, end-of-session)
 *   - manual cron / GitHub Action (weekly)
 *
 * @see docs/LEARNING.md
 * @see ADR-015
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

const HOME           = homedir();
const PROJECTS_DIR   = join(HOME, '.great_cto', 'projects');
const DECISIONS_PATH = join(HOME, '.great_cto', 'decisions.md');
const PROMOTE_THRESHOLD = 3;   // # of distinct projects required

// --- args --------------------------------------------------------------------

const argv     = process.argv.slice(2);
const DRY_RUN  = argv.includes('--dry-run');
const FORCE    = argv.includes('--force');

// --- collect lessons from all projects ---------------------------------------

function* findLessonsFiles() {
  if (!existsSync(PROJECTS_DIR)) return;
  for (const entry of readdirSync(PROJECTS_DIR)) {
    const candidate = join(PROJECTS_DIR, entry, 'lessons.md');
    try {
      const st = statSync(candidate);
      if (st.isFile() || st.isSymbolicLink()) yield { project: entry, path: candidate };
    } catch { /* skip */ }
  }
}

/**
 * Parse a lessons.md file into entries.
 * Each entry starts with a `---` frontmatter block followed by a `## pattern:` line.
 */
function parseLessons(text) {
  const entries = [];
  const blocks = text.split(/\n(?=---\s*\n[a-z]+:)/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const fmMatch = block.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    const slugMatch = block.match(/^##\s+pattern:\s*(.+?)\s*$/m);
    if (!slugMatch) continue;
    const slug = slugMatch[1].trim();
    const fm = {};
    if (fmMatch) {
      for (const line of fmMatch[1].split('\n')) {
        const m = line.match(/^([a-z-]+):\s*(.+)$/);
        if (m) fm[m[1]] = m[2].trim();
      }
    }
    entries.push({ slug, fm, raw: block.trim() });
  }
  return entries;
}

// --- aggregate by pattern slug -----------------------------------------------

const patternMap = new Map();   // slug → { count, projects: Set, archetypes: Set, samples: [entry] }

for (const { project, path } of findLessonsFiles()) {
  const text = readFileSync(path, 'utf8');
  const entries = parseLessons(text);
  for (const e of entries) {
    if (!patternMap.has(e.slug)) {
      patternMap.set(e.slug, { count: 0, projects: new Set(), archetypes: new Set(), samples: [] });
    }
    const agg = patternMap.get(e.slug);
    agg.projects.add(e.fm.project || project);
    if (e.fm.archetype) agg.archetypes.add(e.fm.archetype);
    agg.count = agg.projects.size;
    agg.samples.push(e);
  }
}

// --- read existing decisions.md (for de-dupe) --------------------------------

let existingDecisions = '';
let promotedSlugs = new Set();
if (existsSync(DECISIONS_PATH)) {
  existingDecisions = readFileSync(DECISIONS_PATH, 'utf8');
  for (const m of existingDecisions.matchAll(/^##\s+pattern:\s*(.+?)\s*$/gm)) {
    promotedSlugs.add(m[1].trim());
  }
}

// --- promote eligible patterns -----------------------------------------------

const toPromote = [];
for (const [slug, agg] of patternMap) {
  if (agg.count < PROMOTE_THRESHOLD) continue;
  if (promotedSlugs.has(slug) && !FORCE) continue;
  toPromote.push({ slug, agg });
}

// --- generate consolidated entries -------------------------------------------

function consolidate(slug, agg) {
  const sample = agg.samples[0];   // first sighting; later we could merge contexts
  const today = new Date().toISOString().slice(0, 10);
  const projects = [...agg.projects].slice(0, 10);
  const archetypes = [...agg.archetypes];

  const priority = archetypes.length >= 3 ? 'high' : 'medium';

  return [
    '---',
    `promoted: ${today}`,
    `occurrences: ${agg.count}`,
    `projects: [${projects.map((p) => `"${p}"`).join(', ')}]`,
    `archetypes: [${archetypes.map((a) => `"${a}"`).join(', ')}]`,
    `skill-candidate-priority: ${priority}`,
    '---',
    '',
    `## pattern: ${slug}`,
    '',
    `**Cross-project lesson** — observed in ${agg.count} project(s), ${archetypes.length} archetype(s).`,
    '',
    sample.raw.replace(/^---[\s\S]*?---\s*\n/, '').replace(/^##\s+pattern:[^\n]*\n/m, '').trim(),
    '',
  ].join('\n');
}

// --- write -------------------------------------------------------------------

if (toPromote.length === 0) {
  console.log(`[lessons-merge] no patterns met threshold (≥${PROMOTE_THRESHOLD} distinct projects)`);
  console.log(`  scanned: ${patternMap.size} pattern slug(s) across all projects`);
  process.exit(0);
}

console.log(`[lessons-merge] promoting ${toPromote.length} pattern(s):`);
for (const { slug, agg } of toPromote) {
  console.log(`  - ${slug} (${agg.count} project(s), archetypes=${[...agg.archetypes].join(',') || 'unspecified'})`);
}

if (DRY_RUN) {
  console.log('[lessons-merge] --dry-run: not writing');
  process.exit(0);
}

mkdirSync(join(HOME, '.great_cto'), { recursive: true });

let header = '';
if (!existsSync(DECISIONS_PATH)) {
  header = `# Cross-project decisions\n\n` +
    `Auto-generated by \`lessons-merge.mjs\`. Each entry is a pattern that has\n` +
    `been observed in ≥${PROMOTE_THRESHOLD} distinct great_cto projects.\n\n` +
    `Patterns promoted here become **skill candidates** — read by architect, pm,\n` +
    `senior-dev, and code-reviewer agents at session start.\n\n`;
}

const block = toPromote.map(({ slug, agg }) => consolidate(slug, agg)).join('\n');

if (header) {
  writeFileSync(DECISIONS_PATH, header + block);
} else {
  appendFileSync(DECISIONS_PATH, '\n' + block);
}

console.log(`[lessons-merge] wrote ${toPromote.length} entries → ${DECISIONS_PATH}`);
