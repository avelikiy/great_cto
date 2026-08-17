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
 *   node scripts/hooks/artifact-lint.mjs --now 2026-08-17 # inject `now` (tests, replay)
 *   node scripts/hooks/artifact-lint.mjs --json
 *
 * Env:
 *   GREAT_CTO_ENFORCE_ARTIFACTS=1   → structural ERRORs block (same as --enforce)
 *   GREAT_CTO_STALE_DAYS=<n>        → override staleness threshold
 *   GREAT_CTO_NOW=<YYYY-MM-DD>      → override `now` (--now takes precedence)
 *
 * Exit: 0 = ok / warn-only, 1 = structural ERROR under enforcement, 2 = bad args.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { deadSourceRefs } from '../lib/source-refs.mjs';
import { judgeFreshness } from '../lib/freshness.mjs';

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
  const src = readFileSync(new URL(import.meta.url), 'utf8').split('\n');
  const end = src.findIndex((l) => l.trim() === '*/');
  console.log(src.slice(1, end === -1 ? 34 : end).join('\n').replace(/^ \* ?/gm, ''));
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

// `now` is resolved ONCE here — nothing downstream (freshness.mjs, ageDays)
// calls Date.now() itself, so every freshness state is reproducible from a
// fixed clock. Precedence: --now > GREAT_CTO_NOW > real clock (default).
const nowIdx = args.indexOf('--now');
let nowArg;
if (nowIdx !== -1) {
  nowArg = args[nowIdx + 1];
  // `--now` with nothing after it must fail, not fall back to the real clock.
  // A garbage GREAT_CTO_NOW already errors; a flag that silently ignores
  // itself would make a CI typo indistinguishable from a deliberate run at
  // today's date — the reading that hides a wrong answer behind a right-looking
  // one.
  if (nowArg === undefined || nowArg.startsWith('--')) {
    console.error('--now requires a YYYY-MM-DD value');
    process.exit(2);
  }
} else {
  nowArg = process.env.GREAT_CTO_NOW;
}
let NOW_MS = Date.now();
if (nowArg) {
  const m = String(nowArg).match(/^(\d{4}-\d{2}-\d{2})$/);
  const parsed = m ? Date.parse(`${m[1]}T00:00:00Z`) : NaN;
  if (Number.isNaN(parsed)) {
    console.error(`bad --now / GREAT_CTO_NOW (expected YYYY-MM-DD): ${nowArg}`);
    process.exit(2);
  }
  NOW_MS = parsed;
}
const nowIso = new Date(NOW_MS).toISOString().slice(0, 10);

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

/**
 * Remove fenced code blocks (``` / ~~~) so their content can't masquerade as
 * markdown structure — a bash comment `# gate` inside a fence must NOT satisfy
 * an H1 check or a required-section regex. Unclosed fence swallows to EOF
 * (same as how renderers treat it).
 */
function stripFences(text) {
  const out = [];
  let fence = null; // current fence marker (``` or ~~~) or null
  for (const l of text.split('\n')) {
    const m = l.match(/^\s*(```|~~~)/);
    if (m) {
      fence = fence === m[1] ? null : (fence ?? m[1]);
      continue;
    }
    if (!fence) out.push(l);
  }
  return out.join('\n');
}

function headings(text) {
  return text.split('\n').filter((l) => /^#{1,6}\s/.test(l)).map((l) => l.replace(/^#+\s*/, '').trim());
}

// A "source" is any concrete reference: markdown link, bare URL, [[memory]]
// link, OR an inline-code span naming a file/path (e.g. `scripts/foo.mjs`,
// `archetypes.ts`) — ADRs cite their implementation as code paths, and that
// counts as sourcing just as much as a URL does.
const SOURCE_RE = /(https?:\/\/|\]\(|\[\[|`[^`\n]*(?:\/|\.\w{2,4})[^`\n]*`)/;

// extractDate() and ageDays() live in ../lib/freshness.mjs alongside
// parseStaleAfter()/judgeFreshness() — one date parser, not two that can
// drift apart (ARCH-stale-after.md Risk R3).

// ---------------------------------------------------------------------------
// Lint
// ---------------------------------------------------------------------------
const errors = [];
const warns = [];
// The audit trail for "which rule judged this doc's freshness", recorded even
// when the verdict is 'fresh' and produces no warn line (see freshness.mjs).
//
// `freshness.length` is deliberately SMALLER than `checked`: templates are
// counted as checked (they get structural validation) but are skipped before
// this point, because a template's dates are placeholders and judging them
// would report the template's staleness rather than any real document's. On
// this repository today that is 48 entries against 58 checked. The two numbers
// answering different questions is the intent, not a gap.
const freshness = [];
let checked = 0;

for (const abs of walk(REPO)) {
  const rel = relative(REPO, abs);
  if (isGenerated(rel)) continue;
  const type = TYPES.find((t) => t.match(rel));
  if (!type) continue;
  checked++;

  let text;
  try { text = readFileSync(abs, 'utf8'); } catch { continue; }
  // Structure is judged on prose only — fenced code can't fake a heading.
  // Freshness + sourcing still read the full text (a URL in a code example
  // is a real reference).
  const prose = stripFences(text);
  const hs = headings(prose);

  // Templates are skeletons to be filled per-project — validate their SHAPE
  // (structure) but never their freshness or sourcing (both are placeholders).
  const isTemplate = /(^|\/)templates\//.test(rel);

  // 1. STRUCTURE
  if (!/^#\s/m.test(prose)) errors.push({ file: rel, type: type.name, kind: 'no-h1', msg: 'missing H1 title' });
  for (const re of type.require) {
    if (!hs.some((h) => re.test(h))) {
      errors.push({ file: rel, type: type.name, kind: 'missing-section', msg: `no section matching ${re}` });
    }
  }
  if (type.minH2) {
    const h2count = prose.split('\n').filter((l) => /^##\s/.test(l)).length;
    if (h2count < type.minH2) {
      errors.push({ file: rel, type: type.name, kind: 'thin', msg: `only ${h2count} H2 section(s) (min ${type.minH2}) — looks like a stub` });
    }
  }
  if (isTemplate) continue; // structure-only for templates

  // 1b. ACCURACY — does what it cites still exist?
  //
  // Freshness below is measured by AGE, and age is not accuracy. AI-FIREWALL.md
  // was 47 days old against a 180-day threshold — fresh by that measure — while
  // every one of the six source files it invited a reviewer to check had been
  // deleted six days after it was written. A dead path catches what a date cannot.
  //
  // PLANs are exempt: a plan describes files it intends to create, and the ones
  // that were never built are the plan's own record of what it dropped. Holding a
  // plan to the current tree would make every completed plan a source of errors.
  if (type.name !== 'PLAN') for (const d of deadSourceRefs(text)) {
    errors.push({
      file: rel, type: type.name, kind: 'dead-source-ref',
      msg: `line ${d.line}: cites \`${d.path}\`, which does not exist`,
    });
  }

  // 2. FRESHNESS
  const judged = judgeFreshness({ text, dateType: type.date, nowMs: NOW_MS, staleDays });
  freshness.push({ file: rel, type: type.name, ...judged });

  if (judged.verdict === 'unknown') {
    // Unchanged gate: only date:'any' types (ADR/ARCH/DESIGN) warn on a doc
    // with neither stale_after nor a date. date:'optional' types (PLAN, TM)
    // stay silent on absence, exactly as before this feature existed — a doc
    // predating stale_after must never start failing.
    if (type.date === 'any') {
      warns.push({
        file: rel, type: type.name, kind: 'no-date',
        msg: 'no stale_after, no date — judged by mtime, freshness unknown',
      });
    }
  } else if (judged.verdict === 'stale') {
    if (judged.basis === 'declared') {
      warns.push({
        file: rel, type: type.name, kind: 'stale-declared',
        msg: `stale_after ${judged.staleAfter} has passed (now ${nowIso}) — due for review`,
      });
    } else {
      warns.push({
        file: rel, type: type.name, kind: 'stale',
        msg: `last dated ${judged.date} (${judged.ageDays}d ago > ${staleDays}d) — due for review`,
      });
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
  // freshness[] is additive — existing { checked, staleDays, errors, warns }
  // consumers are unaffected by its presence.
  console.log(JSON.stringify({ checked, staleDays, errors, warns, freshness }, null, 2));
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
