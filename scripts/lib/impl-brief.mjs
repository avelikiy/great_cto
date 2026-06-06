// scripts/lib/impl-brief.mjs — implementation-brief parser + scope check (governance Phase 3).
//
// An IMPL-BRIEF (skills/great_cto/templates/IMPL-BRIEF-template.md) pins, per task, the
// files an implementer MAY touch (allowlist) and MUST NOT touch (denylist), plus an
// API-CONTRACT / TEST-SPEC / ACCEPTANCE. This module makes the boundary machine-checkable
// so scope creep is caught mechanically instead of in review prose:
//
//   - parseBrief(md)            → { filesToModify, filesNotToModify, hasApiContract,
//                                   hasTestSpec, acceptance, taskId }
//   - validateBrief(brief)      → { valid, errors }  (the brief is well-formed)
//   - checkScope(changed, brief)→ { ok, violations, warnings }  (a diff respects the brief)
//
// CLI:
//   node scripts/lib/impl-brief.mjs validate <brief.md>
//   node scripts/lib/impl-brief.mjs check    <brief.md> <changed-file…>
//       exit 0 = clean · 1 = denylist hit (hard) · 2 = malformed brief
//   (allowlist misses are warnings, not failures — they print but keep exit 0.)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Headings we recognise (matched case-insensitively, ignoring a trailing "(explicit)" etc).
const SECTION = {
  modify: /^#{1,4}\s+files\s+to\s+modify\b/i,
  notModify: /^#{1,4}\s+files\s+not\s+to\s+modify\b/i,
  api: /^#{1,4}\s+api[-\s]?contract\b/i,
  test: /^#{1,4}\s+test[-\s]?spec\b/i,
  acceptance: /^#{1,4}\s+acceptance\b/i,
};

const ANY_HEADING = /^#{1,4}\s+/;
// A backtick-wrapped path, ignoring template placeholders like `{src/foo.ts}`.
const PATH_IN_BACKTICKS = /`([^`]+)`/g;

function isPlaceholder(s) {
  // Template stubs are wrapped in {curly braces} or contain a spaceless {…}. Skip them.
  return /[{}]/.test(s) || s.includes('…') || s.includes('...');
}

/** Split markdown into { headingKey → [lines] } buckets for the sections we care about. */
function bucketSections(md) {
  const lines = String(md).split(/\r?\n/);
  const buckets = {};
  let current = null;
  for (const line of lines) {
    if (ANY_HEADING.test(line)) {
      current = null;
      for (const [key, re] of Object.entries(SECTION)) {
        if (re.test(line)) { current = key; buckets[key] = buckets[key] || []; break; }
      }
      continue;
    }
    if (current) buckets[current].push(line);
  }
  return buckets;
}

/** Extract real (non-placeholder) backtick paths from a block of lines. */
function pathsFrom(lines) {
  const out = [];
  for (const line of lines || []) {
    let m;
    PATH_IN_BACKTICKS.lastIndex = 0;
    while ((m = PATH_IN_BACKTICKS.exec(line)) !== null) {
      const raw = m[1].trim();
      if (!raw || isPlaceholder(raw)) continue;
      // Skip inline-code that's plainly a command, not a path (heuristic: contains a space
      // and no slash/dot — e.g. `npm test`). Keep things that look pathish or glob-ish.
      if (/\s/.test(raw) && !/[\/.]/.test(raw)) continue;
      out.push(raw);
    }
  }
  // De-dupe, preserve order.
  return [...new Set(out)];
}

/** Count checklist items (`- [ ]` / `- [x]`) in a block. */
function checklistItems(lines) {
  return (lines || []).filter((l) => /^\s*[-*]\s+\[[ xX]\]/.test(l)).map((l) => l.trim());
}

/** True if a section bucket has any non-placeholder, non-blank prose. */
function hasContent(lines) {
  return (lines || []).some((l) => {
    const t = l.trim();
    if (!t || t.startsWith('>')) return false;          // skip blockquote guidance
    if (/^[-|]/.test(t) && /\{.*\}/.test(t)) return false; // skip placeholder table rows
    return /[A-Za-z0-9`]/.test(t) && !isPlaceholder(t);
  });
}

/**
 * Parse an IMPL-BRIEF markdown string into a structured brief.
 */
export function parseBrief(md) {
  const text = String(md);
  const buckets = bucketSections(text);
  const taskMatch = text.match(/\*\*bd task:\*\*\s*`([^`]+)`/i)
    || text.match(/IMPL-BRIEF-([A-Za-z0-9_-]+)\.md/);
  const taskId = taskMatch ? taskMatch[1].replace(/[{}]/g, '').trim() : null;
  return {
    taskId: taskId && !isPlaceholder(taskId) ? taskId : null,
    filesToModify: pathsFrom(buckets.modify),
    filesNotToModify: pathsFrom(buckets.notModify),
    hasApiContract: hasContent(buckets.api),
    hasTestSpec: hasContent(buckets.test),
    acceptance: checklistItems(buckets.acceptance),
    _sections: Object.keys(buckets),
  };
}

/**
 * Is the brief well-formed enough for an implementer to act on?
 * Requires: ≥1 file to modify, a (possibly-empty but present) NOT-to-modify section,
 * an API-CONTRACT, a TEST-SPEC, and ≥1 acceptance criterion.
 */
export function validateBrief(brief) {
  const errors = [];
  if (!brief.filesToModify.length) errors.push('no concrete `## Files to modify` entries');
  if (!brief._sections.includes('notModify')) errors.push('missing `## Files NOT to modify` section');
  if (!brief.hasApiContract) errors.push('empty or missing `## API-CONTRACT`');
  if (!brief.hasTestSpec) errors.push('empty or missing `## TEST-SPEC`');
  if (!brief.acceptance.length) errors.push('no `## ACCEPTANCE` checklist items');
  return { valid: errors.length === 0, errors };
}

/**
 * Convert a path/glob entry to a RegExp. Supports `**` (any depth, incl. slashes),
 * `*` (anything but a slash), and `?`. A bare directory like `src/shared/` matches
 * everything under it. Anchored at both ends.
 */
export function globToRegExp(glob) {
  let g = String(glob).trim().replace(/\/+$/, (m) => m); // keep trailing slash for dir test
  const dir = g.endsWith('/');
  if (dir) g += '**';
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { re += '.*'; i++; if (g[i + 1] === '/') i++; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('\\^$+.()|[]{}'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}

function matchesAny(file, globs) {
  const f = String(file).replace(/^\.\//, '');
  return globs.find((g) => globToRegExp(g).test(f) || globToRegExp(g).test('./' + f));
}

/**
 * Check a list of changed files against a brief.
 * @returns {{ ok: boolean, violations: string[], warnings: string[] }}
 *   violations = files matching the denylist (hard fail).
 *   warnings   = files matching neither list (possible scope creep, soft).
 */
export function checkScope(changedFiles, brief) {
  const violations = [];
  const warnings = [];
  for (const file of changedFiles || []) {
    if (!file) continue;
    const denied = matchesAny(file, brief.filesNotToModify);
    if (denied) { violations.push(`${file} → matches NOT-to-modify \`${denied}\``); continue; }
    const allowed = matchesAny(file, brief.filesToModify);
    if (!allowed) warnings.push(`${file} → not in \`## Files to modify\` allowlist`);
  }
  return { ok: violations.length === 0, violations, warnings };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main(argv) {
  const [cmd, briefPath, ...rest] = argv;
  if (!cmd || !briefPath) {
    console.error('usage: impl-brief.mjs validate <brief.md>');
    console.error('       impl-brief.mjs check    <brief.md> <changed-file…>');
    process.exit(2);
  }
  let brief;
  try {
    brief = parseBrief(readFileSync(briefPath, 'utf8'));
  } catch (e) {
    console.error(`cannot read brief: ${e.message}`);
    process.exit(2);
  }

  if (cmd === 'validate') {
    const { valid, errors } = validateBrief(brief);
    if (valid) { console.log(`IMPL-BRIEF OK — ${brief.filesToModify.length} file(s) in scope, ${brief.acceptance.length} acceptance item(s)`); process.exit(0); }
    console.error('IMPL-BRIEF malformed:');
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(2);
  }

  if (cmd === 'check') {
    const v = validateBrief(brief);
    if (!v.valid) { console.error('IMPL-BRIEF malformed (run `validate`):'); for (const e of v.errors) console.error(`  ✗ ${e}`); process.exit(2); }
    const { ok, violations, warnings } = checkScope(rest, brief);
    for (const w of warnings) console.error(`  ⚠ ${w}`);
    for (const v2 of violations) console.error(`  ✗ ${v2}`);
    if (ok) {
      console.log(`scope clean — ${rest.length} changed file(s) within brief${warnings.length ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : ''}`);
      process.exit(0);
    }
    console.error(`SCOPE VIOLATION — ${violations.length} file(s) hit the NOT-to-modify denylist. Stop; return to pm/architect or open a signed exception.`);
    process.exit(1);
  }

  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
