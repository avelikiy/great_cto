#!/usr/bin/env node
/**
 * pattern-lookup — what this project already learned, before the agent starts.
 *
 * Six agents carried their own copy of this as inline shell: 209 lines agreeing
 * on 7–64% of their text. The head was identical in all six — read
 * `~/.great_cto/global-patterns`, keep the active ones, match on archetype or
 * stack — and the tail differed because the roles need different fields. An
 * incident wants the first detection step and the recorded MTTR, an
 * implementation wants the fix, a deploy wants it as a pre-deploy check.
 *
 * Six copies were also six untested shell loops. Their own comments named the
 * case that worried them: a pattern that records how to diagnose and no remedy
 * must not print an empty instruction, because an empty instruction reads as
 * knowledge. That case is a test here.
 *
 * Three states, and the middle one is not the first: `found`, `empty` (the
 * library exists and nothing matched) and `unavailable` (there is no library —
 * which has an action attached, `/crystallize`).
 *
 * CLI: node pattern-lookup.mjs --role incident|implement|deploy|review
 *        [--dir <global-patterns>] [--project <dir>]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const field = (text, name) => {
  const m = text.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : null;
};

/**
 * The `detection_order:` list, in order.
 *
 * Read line by line rather than with one regex: the first version ended its
 * match at `(?=^\S|\Z)`, and JavaScript has no `\Z` — it read as the letter Z,
 * so a list at the end of the file matched nothing and a pattern that records
 * only how to diagnose looked like a pattern with nothing in it.
 */
function detectionOrder(text) {
  const lines = String(text).split('\n');
  const start = lines.findIndex((l) => /^detection_order:\s*$/.test(l));
  if (start < 0) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    const item = line.match(/^\s+-\s+(.*\S)\s*$/);
    if (!item) { if (line.trim() === '') continue; break; }
    out.push(item[1]);
  }
  return out;
}

/**
 * @param {{dir:string, archetype:string, stack:string}} a
 * @returns {{state:'found'|'empty'|'unavailable', matched:object[], skipped:number, dir:string,
 *            archetype:string, stack:string}}
 */
export function lookupPatterns({ dir, archetype, stack }) {
  const base = { matched: [], skipped: 0, dir, archetype, stack };
  let files;
  try {
    if (!statSync(dir).isDirectory()) return { ...base, state: 'unavailable' };
    files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch { return { ...base, state: 'unavailable' }; }

  const wanted = [archetype, stack].filter(Boolean).map((s) => String(s).toLowerCase());
  const matched = []; let skipped = 0;
  for (const f of files.sort()) {
    let text;
    try { text = readFileSync(join(dir, f), 'utf8'); } catch { skipped += 1; continue; }
    const status = field(text, 'status');
    if (!status) { skipped += 1; continue; }          // not a pattern file — counted, not ignored
    if (status !== 'active') continue;                 // retired on purpose
    const applies = `${field(text, 'applies_to') ?? ''} ${field(text, 'stack_fingerprint') ?? ''}`.toLowerCase();
    if (!wanted.some((w) => w && applies.includes(w))) continue;
    matched.push({
      slug: f.replace(/\.md$/, ''),
      symptom: field(text, 'symptom'),
      fix: field(text, 'fix'),
      detection: detectionOrder(text),
      hits: field(text, 'hits'),
      mttr: field(text, 'mttr_reduction'),
    });
  }
  return { ...base, matched, skipped, state: matched.length ? 'found' : 'empty' };
}

const ROLE_LEAD = {
  incident: 'CHECK FIRST',
  deploy: 'pre-deploy check',
  implement: 'apply',
  review: 'look for',
};

/** What one role needs to read, and nothing it cannot act on. */
export function renderPatterns(result, { role = 'implement' } = {}) {
  const lead = ROLE_LEAD[role] ?? ROLE_LEAD.implement;
  const head = `=== KNOWN PATTERNS for archetype=${result.archetype || 'unknown'} stack=${result.stack || 'unknown'} ===`;
  if (result.state === 'unavailable') {
    return `${head}\n  no pattern library yet (${result.dir}) — run /crystallize after the next incident to start one\n`;
  }
  if (result.state === 'empty') {
    return `${head}\n  no patterns match this archetype or stack yet${result.skipped ? ` (${result.skipped} file(s) unreadable)` : ''}\n`;
  }
  const lines = [head];
  for (const p of result.matched) {
    const action = p.fix
      ? `${lead}: ${p.fix}`
      : (p.detection.length
        ? `${lead}: diagnose first — ${p.detection.slice(0, 2).join('; ')}`
        : `${lead}: nothing recorded — this pattern names a symptom and no remedy`);
    const meta = [p.hits ? `hits=${p.hits}` : null, p.mttr ? `mttr=${p.mttr}` : null].filter(Boolean).join(', ');
    lines.push(`  ${p.slug}${meta ? ` (${meta})` : ''}`);
    if (p.symptom) lines.push(`  symptom: ${p.symptom}`);
    if (role === 'incident' && p.detection.length) lines.push(`  first step: ${p.detection[0]}`);
    lines.push(`  → ${action}`, '');
  }
  if (result.skipped) lines.push(`  (${result.skipped} file(s) in the library could not be read as a pattern)`);
  return `${lines.join('\n')}\n`;
}

const invokedDirectly = (() => {
  try { return Boolean(process.argv[1]) && fileURLToPath(import.meta.url).endsWith(process.argv[1].split('/').pop()); }
  catch { return false; }
})();

if (invokedDirectly) {
  const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(name);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
  };
  const projectDir = arg('--project', '.');
  let project = '';
  try { project = readFileSync(join(projectDir, '.great_cto', 'PROJECT.md'), 'utf8'); } catch { /* none */ }
  const archetype = (project.match(/^(?:primary|archetype):\s*(\S+)/m) || [])[1] ?? '';
  const stack = (project.match(/^stack:\s*(\S+)/m) || [])[1] ?? '';
  const dir = arg('--dir', join(homedir(), '.great_cto', 'global-patterns'));
  const result = lookupPatterns({ dir, archetype, stack });
  process.stdout.write(renderPatterns(result, { role: arg('--role', 'implement') }));
}
