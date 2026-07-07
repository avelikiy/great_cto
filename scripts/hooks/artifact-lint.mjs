#!/usr/bin/env node
/**
 * artifact-lint.mjs — zero-dep structural + freshness linter for great_cto's
 * agent-produced artifacts (ADRs, threat models, design contracts).
 *
 * Inspired by AWSBestPracticesSkill/scripts/check.py — adapts three of its
 * maintenance mechanics to great_cto's own docs:
 *   1. STRUCTURE  — each typed artifact must carry its canonical sections
 *                   (an ADR without ## Decision, a TM without findings/gates
 *                   is a half-written doc). Missing section / missing H1 = ERROR.
 *   2. FRESHNESS  — every artifact should carry a date; flag anything older than
 *                   --stale-days (default 180). Missing/stale date = WARN.
 *   3. SOURCED    — an artifact that makes claims should reference something
 *                   (a URL, a [[memory]] link, or a markdown link). Zero refs
 *                   in a doc that should cite = WARN.
 *
 * Philosophy (mirrors pre-push.sh's summary block): WARN-ONLY by default so it
 * never surprises a push. Only structural ERRORs can block, and only when
 * enforcement is explicitly on.
 *
 * Usage:
 *   node scripts/hooks/artifact-lint.mjs                 # report, exit 0 (warn-only)
 *   node scripts/hooks/artifact-lint.mjs --enforce       # exit 1 if any ERROR
 *   node scripts/hooks/artifact-lint.mjs --stale-days 90
 *   node scripts/hooks/artifact-lint.mjs --json
 *   node scripts/hooks/artifact-lint.mjs --check         # pre-push mode (= --enforce via env)
 *
 * Env:
 *   GREAT_CTO_ENFORCE_ARTIFACTS=1   → structural ERRORs block (same as --enforce)
 *   GREAT_CTO_STALE_DAYS=<n>        → override staleness threshold
 *
 * Exit: 0 = ok / warn-only, 1 = structural ERROR under enforcement, 2 = bad args.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

// ---------------------------------------------------------------------------
// Artifact type registry — extend here as new agent outputs get canonicalized.
//   match:   (repoRelPath) => boolean
//   require: array of regexes; each must match at least one heading in the file
//   date:    'any' (warn if absent) | 'optional' (never warn on absence)
//   cites:   true → warn if the doc contains no reference at all
// ---------------------------------------------------------------------------
const TYPES = [
  {
    name: 'ADR',
    match: (p) => /(^|\/)docs\/adr\/ADR-[^/]*\.md$/.test(p),
    require: [/context/i, /decision/i, /consequence/i],
    date: 'any',
    cites: true,
  },
  {
    name: 'DESIGN',
    match: (p) => /(^|\/)docs\/design\/DESIGN-[^/]*\.md$/.test(p),
    require: [/design system/i, /component inventory/i, /(a11y|accessib)/i, /responsive/i],
    date: 'any',
    cites: false,
  },
  {
    name: 'TM',
    match: (p) => /(^|\/)TM-[^/]*\.md$/.test(p),
    // "Surface" (attack surface) is legitimate threat-model wording for the
    // scoping section — accept it alongside the more common "Scope".
    require: [/scope|surface/i, /finding/i, /gate/i],
    date: 'optional',
    cites: true,
  },
  {
    name: 'ARCH',
    match: (p) => /(^|\/)docs\/arch(itecture)?\/ARCH-[^/]*\.md$/.test(p),
    // ARCH docs reference code paths, not always external URLs → cites off.
    // Every ARCH must bound its scope (non-goals) and name its risks.
    require: [/non-goal|scope|context/i, /risk/i],
    date: 'any',
    cites: false,
  },
  {
    name: 'PLAN',
    match: (p) => /(^|\/)docs\/plans?\/PLAN-[^/]*\.md$/.test(p),
    // Plans use wildly varied section names (Why / Phases / TAKE / Principle /
    // Sequence …) — a keyword requirement is whack-a-mole and false-positives on
    // valid plans. Instead require structure-agnostically: ≥2 H2 sections, which
    // catches a structureless stub without dictating vocabulary.
    require: [],
    minH2: 2,
    // Plans are dated by filename convention (PLAN-YYYY-MM-DD-*), not frontmatter
    // — don't nag for a date; only flag if a date is present and stale.
    date: 'optional',
    cites: false,
  },
];

// Auto-generated digests (scripts/generate-summary.mjs) are not authored
// artifacts — never lint their structure/freshness.
const isGenerated = (p) => /\.summary\.md$/.test(p);

const PRUNE_DIRS = new Set(['node_modules', '.git', 'site', 'dist', 'coverage', '.great_cto']);

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 34).join('\n').replace(/^ \*/gm, ''));
  process.exit(0);
}
const asJson = args.includes('--json');
const enforce = args.includes('--enforce') || process.env.GREAT_CTO_ENFORCE_ARTIFACTS === '1';
const staleIdx = args.indexOf('--stale-days');
const staleDays = Number(
  staleIdx !== -1 ? args[staleIdx + 1] : process.env.GREAT_CTO_STALE_DAYS || 180,
);
if (!Number.isFinite(staleDays) || staleDays <= 0) {
  console.error(`bad --stale-days: ${args[staleIdx + 1]}`);
  process.exit(2);
}

const REPO = process.cwd();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (PRUNE_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

function headings(text) {
  return text.split('\n').filter((l) => /^#{1,6}\s/.test(l)).map((l) => l.replace(/^#+\s*/, '').trim());
}

/** Extract the most recent date (YYYY-MM-DD) from YAML frontmatter or inline **Date:**. */
function extractDate(text) {
  const found = [];
  // YAML frontmatter block
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    for (const m of fm[1].matchAll(/^(?:date|last[_-]?reviewed|updated):\s*(\d{4}-\d{2}-\d{2})/gim)) {
      found.push(m[1]);
    }
  }
  // Inline bold markers: **Date:** 2026-05-09 / **Last reviewed:** ...
  for (const m of text.matchAll(/\*\*(?:date|last[_-]?reviewed|updated)[:\s]*\*\*\s*(\d{4}-\d{2}-\d{2})/gi)) {
    found.push(m[1]);
  }
  if (!found.length) return null;
  return found.sort().at(-1); // most recent
}

const SOURCE_RE = /(https?:\/\/|\]\(|\[\[)/; // markdown link, bare URL, or [[memory]]

function ageDays(iso) {
  const then = Date.parse(iso + 'T00:00:00Z');
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Lint
// ---------------------------------------------------------------------------
const errors = [];
const warns = [];
let checked = 0;

for (const abs of walk(REPO)) {
  const rel = relative(REPO, abs);
  if (isGenerated(rel)) continue;
  const type = TYPES.find((t) => t.match(rel));
  if (!type) continue;
  checked++;

  let text;
  try { text = readFileSync(abs, 'utf8'); } catch { continue; }
  const hs = headings(text);

  // Templates are skeletons to be filled per-project — validate their SHAPE
  // (structure) but never their freshness or sourcing (both are placeholders).
  const isTemplate = /(^|\/)templates\//.test(rel);

  // 1. STRUCTURE
  if (!/^#\s/m.test(text)) errors.push({ file: rel, type: type.name, kind: 'no-h1', msg: 'missing H1 title' });
  for (const re of type.require) {
    if (!hs.some((h) => re.test(h))) {
      errors.push({ file: rel, type: type.name, kind: 'missing-section', msg: `no section matching ${re}` });
    }
  }
  if (type.minH2) {
    const h2count = text.split('\n').filter((l) => /^##\s/.test(l)).length;
    if (h2count < type.minH2) {
      errors.push({ file: rel, type: type.name, kind: 'thin', msg: `only ${h2count} H2 section(s) (min ${type.minH2}) — looks like a stub` });
    }
  }
  if (isTemplate) continue; // structure-only for templates

  // 2. FRESHNESS
  const date = extractDate(text);
  if (!date && type.date === 'any') {
    warns.push({ file: rel, type: type.name, kind: 'no-date', msg: 'no date (frontmatter or **Date:**) — freshness unknown' });
  } else if (date) {
    const age = ageDays(date);
    if (age !== null && age > staleDays) {
      warns.push({ file: rel, type: type.name, kind: 'stale', msg: `last dated ${date} (${age}d ago > ${staleDays}d) — due for review` });
    }
  }

  // 3. SOURCED
  if (type.cites && !SOURCE_RE.test(text)) {
    warns.push({ file: rel, type: type.name, kind: 'no-source', msg: 'no references at all (no URL / markdown link / [[memory]])' });
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (asJson) {
  console.log(JSON.stringify({ checked, staleDays, errors, warns }, null, 2));
  process.exit(enforce && errors.length ? 1 : 0);
}

const R = '\x1b[0;31m', Y = '\x1b[0;33m', G = '\x1b[0;32m', DIM = '\x1b[2m', NC = '\x1b[0m';
const line = (o) => `  ${o.file} ${DIM}[${o.type}]${NC} — ${o.msg}`;

if (!errors.length && !warns.length) {
  console.log(`${G}[artifact-lint]${NC} ${checked} artifact(s) checked — all structurally sound & fresh.`);
  process.exit(0);
}

console.log(`${G}[artifact-lint]${NC} ${checked} artifact(s) checked (stale threshold: ${staleDays}d)\n`);
if (errors.length) {
  console.log(`${R}ERRORS (${errors.length}) — missing required structure:${NC}`);
  for (const e of errors) console.log(line(e));
  console.log('');
}
if (warns.length) {
  console.log(`${Y}WARNINGS (${warns.length}) — freshness / sourcing:${NC}`);
  for (const w of warns) console.log(line(w));
  console.log('');
}

if (enforce && errors.length) {
  console.log(`${R}Blocked:${NC} ${errors.length} structural error(s). Fix or run without --enforce.`);
  process.exit(1);
}
console.log(`${DIM}(warn-only — no push blocked. Set GREAT_CTO_ENFORCE_ARTIFACTS=1 to block on structural errors.)${NC}`);
process.exit(0);
