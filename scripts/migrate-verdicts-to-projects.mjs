#!/usr/bin/env node
/**
 * Migrate historical global verdicts to per-project directories.
 *
 * Strategy:
 *   1. Read ~/.great_cto/projects.json → list of (slug, path)
 *   2. For each global verdict line in ~/.great_cto/verdicts/<agent>.log:
 *      - If line has `project=<slug>` tag → attribute to that project
 *      - Else if line has `task=<id>`:
 *        - Match <id> prefix against project task ID prefixes
 *        - If exactly one project matches → attribute
 *      - Else → leave in global (unattributable)
 *   3. Write attributed lines to <project_cwd>/.great_cto/verdicts/<agent>.log
 *      Append `project=<slug>` tag if missing (so future re-runs are idempotent)
 *
 * Safe to re-run: each line is deduplicated by (ts, agent, project, cost) before append.
 *
 * Usage:
 *   node scripts/migrate-verdicts-to-projects.mjs            # dry-run
 *   node scripts/migrate-verdicts-to-projects.mjs --apply    # actually write
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const HOME = homedir();
const GREAT_CTO = join(HOME, '.great_cto');
const GLOBAL_VERDICTS = join(GREAT_CTO, 'verdicts');
const PROJECTS_FILE = join(GREAT_CTO, 'projects.json');
const APPLY = process.argv.includes('--apply');

if (!existsSync(GLOBAL_VERDICTS)) {
  console.log('No global verdicts directory — nothing to migrate.');
  process.exit(0);
}
if (!existsSync(PROJECTS_FILE)) {
  console.error(`Missing ${PROJECTS_FILE}. Run from a machine with great_cto board initialised.`);
  process.exit(1);
}

const projects = JSON.parse(readFileSync(PROJECTS_FILE, 'utf8')).projects || [];
console.log(`Discovered ${projects.length} projects:\n`);
projects.forEach(p => console.log(`  - ${p.slug.padEnd(20)} ${p.path}`));
console.log();

// Build prefix → project mapping by sampling each project's bd tasks
const taskPrefixes = new Map(); // prefix → [slug]
for (const proj of projects) {
  try {
    const r = spawnSync('bd', ['list', '--json'], { cwd: proj.path, encoding: 'utf8', timeout: 8000 });
    if (r.status !== 0) continue;
    const items = JSON.parse(r.stdout || '[]');
    for (const t of items.slice(0, 50)) {
      const id = t.id || '';
      const m = id.match(/^([A-Za-z_-]+)-/);  // e.g. "Temp-xxx" → "Temp"
      if (!m) continue;
      const prefix = m[1];
      const arr = taskPrefixes.get(prefix) || [];
      if (!arr.includes(proj.slug)) arr.push(proj.slug);
      taskPrefixes.set(prefix, arr);
    }
  } catch {}
}
console.log('Task ID prefixes → projects:\n');
for (const [pref, slugs] of taskPrefixes) {
  console.log(`  ${pref.padEnd(20)} → ${slugs.join(', ')}`);
}
console.log();

// Migrate each global verdict file
const stats = { totalLines: 0, byProject: {}, untagged: 0, ambiguous: 0, written: 0 };
const projectAppends = new Map(); // slug → { agent → [lines] }

function recordAppend(slug, agent, line) {
  if (!projectAppends.has(slug)) projectAppends.set(slug, new Map());
  const byAgent = projectAppends.get(slug);
  if (!byAgent.has(agent)) byAgent.set(agent, []);
  byAgent.get(agent).push(line);
  stats.byProject[slug] = (stats.byProject[slug] || 0) + 1;
}

for (const file of readdirSync(GLOBAL_VERDICTS).filter(f => f.endsWith('.log'))) {
  const agent = file.replace('.log', '');
  const lines = readFileSync(join(GLOBAL_VERDICTS, file), 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    stats.totalLines++;
    // Check project= tag
    const projectTag = line.match(/\bproject=([^\s|]+)/);
    if (projectTag) {
      const slug = projectTag[1];
      if (projects.find(p => p.slug === slug)) {
        recordAppend(slug, agent, line);
        continue;
      }
    }
    // Check task= tag → prefix lookup
    const taskTag = line.match(/\btask=([^\s|]+)/);
    if (taskTag) {
      const taskId = taskTag[1];
      const prefMatch = taskId.match(/^([A-Za-z_-]+)-/);
      if (prefMatch) {
        const candidates = taskPrefixes.get(prefMatch[1]) || [];
        if (candidates.length === 1) {
          const slug = candidates[0];
          // Append project tag for future
          const tagged = line.includes('project=') ? line : line.replace(/\| cost=/, `| project=${slug} | cost=`);
          recordAppend(slug, agent, tagged);
          continue;
        }
        if (candidates.length > 1) {
          stats.ambiguous++;
          continue;
        }
      }
    }
    stats.untagged++;
  }
}

console.log('Migration plan:\n');
console.log(`  Total lines scanned:  ${stats.totalLines}`);
console.log(`  Untagged (skipped):   ${stats.untagged}`);
console.log(`  Ambiguous (skipped):  ${stats.ambiguous}`);
console.log(`  Attributable:         ${Object.values(stats.byProject).reduce((a,b)=>a+b, 0)}\n`);
for (const [slug, n] of Object.entries(stats.byProject)) {
  console.log(`    → ${slug.padEnd(20)} ${n} line${n === 1 ? '' : 's'}`);
}

if (!APPLY) {
  console.log('\nDry-run mode. Re-run with --apply to actually write files.');
  process.exit(0);
}

// Apply: write to per-project dirs
for (const [slug, byAgent] of projectAppends) {
  const proj = projects.find(p => p.slug === slug);
  if (!proj) continue;
  const dir = join(proj.path, '.great_cto', 'verdicts');
  mkdirSync(dir, { recursive: true });
  for (const [agent, lines] of byAgent) {
    const target = join(dir, `${agent}.log`);
    // Dedupe against existing content (rerun-safe)
    const existing = existsSync(target) ? new Set(readFileSync(target, 'utf8').split('\n')) : new Set();
    const newLines = lines.filter(l => !existing.has(l));
    if (newLines.length === 0) continue;
    writeFileSync(target, (existsSync(target) ? readFileSync(target, 'utf8').trimEnd() + '\n' : '') + newLines.join('\n') + '\n');
    stats.written += newLines.length;
    console.log(`  wrote ${newLines.length} line${newLines.length === 1 ? '' : 's'} → ${slug}/${agent}.log`);
  }
}
console.log(`\n✓ Migrated ${stats.written} verdict line${stats.written === 1 ? '' : 's'} to per-project directories.`);
