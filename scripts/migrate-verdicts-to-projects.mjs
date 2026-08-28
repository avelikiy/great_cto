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
 * Safe to re-run: each line is deduplicated by (ts, agent, project, cost) before
 * append — and, since the safety of that claim could not be checked after a
 * crash, the run now records its progress per project and writes a completion
 * marker only once every project verifies. Absence of the marker means "not
 * known to have finished", never "not started". See scripts/lib/migration.mjs.
 *
 * Usage:
 *   node scripts/migrate-verdicts-to-projects.mjs            # dry-run
 *   node scripts/migrate-verdicts-to-projects.mjs --apply    # actually write
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { runMigration, backupOnce, atomicWrite, migrationState } from './lib/migration.mjs';
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

// Say where this stands before doing anything. The three answers are different
// and an operator acts differently on each: `done` needs no run, `partial` needs
// this one to finish what stopped, `never` is a first pass.
const STATE = migrationState(GREAT_CTO, 'verdicts-to-projects');
if (STATE === 'done') {
  console.log('Already migrated — a completion marker is present, so every project verified.');
  console.log(`  ${GREAT_CTO}/.verdicts-to-projects.migrated`);
  process.exit(0);
}
if (STATE === 'partial') {
  console.log('An earlier run did NOT finish. Projects it verified will be skipped.\n');
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

// Apply: one project at a time, each backed up, written atomically, and verified
// before it counts. A project that cannot be written stops the marker; the rest
// still migrate, and the next run picks up exactly where this one stopped.
const result = runMigration({
  root: GREAT_CTO,
  name: 'verdicts-to-projects',
  apply: true,
  log: (m) => console.log(m),
  units: [...projectAppends.keys()],
  id: (slug) => slug,

  migrate(slug) {
    const proj = projects.find(p => p.slug === slug);
    // Not `continue` in silence: a slug with no project is a fact the operator
    // needs, because those lines stay in the global log and nothing says so.
    if (!proj) throw new Error(`no project registered for slug "${slug}" — its lines were left in the global log`);

    const dir = join(proj.path, '.great_cto', 'verdicts');
    mkdirSync(dir, { recursive: true });
    const wrote = [];
    for (const [agent, lines] of projectAppends.get(slug)) {
      const target = join(dir, `${agent}.log`);
      const before = existsSync(target) ? readFileSync(target, 'utf8') : '';
      const existing = new Set(before.split('\n'));
      const newLines = lines.filter(l => !existing.has(l));
      if (newLines.length === 0) continue;

      // The original content is copied aside ONCE, before the first change, so a
      // re-run cannot overwrite the only copy of what was there to begin with.
      backupOnce(target);
      atomicWrite(target, (before ? before.trimEnd() + '\n' : '') + newLines.join('\n') + '\n');
      stats.written += newLines.length;
      wrote.push({ agent, target, added: newLines });
      console.log(`  wrote ${newLines.length} line${newLines.length === 1 ? '' : 's'} → ${slug}/${agent}.log`);
    }
    return wrote;
  },

  // Read the file back. `migrate` returning without throwing says the write was
  // attempted; this says the lines are there.
  verify(slug, wrote) {
    for (const { target, added } of wrote || []) {
      if (!existsSync(target)) return false;
      const text = readFileSync(target, 'utf8');
      if (!added.every(l => text.includes(l))) return false;
    }
    return true;
  },
});

console.log(`\n✓ Migrated ${stats.written} verdict line${stats.written === 1 ? '' : 's'} to per-project directories.`);
if (result.skipped.length) console.log(`  ${result.skipped.length} project(s) already done in an earlier run.`);
if (result.failed.length) {
  console.log(`\n⚠ ${result.failed.length} project(s) did NOT complete — no completion marker written:`);
  for (const f of result.failed) console.log(`    ${f.unit}: ${f.why}`);
  console.log(`  Re-run to continue; verified projects are skipped.`);
  process.exit(1);
}
console.log(`  marker: ${result.marker}`);
