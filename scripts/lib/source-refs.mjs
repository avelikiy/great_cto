#!/usr/bin/env node
/**
 * source-refs — find references to source files that no longer exist.
 *
 * Why this exists
 * ---------------
 * Artifact freshness is measured by AGE: `artifact-lint --stale-days 180`. Age is
 * not the same as accuracy, and the difference is not academic.
 * `docs/AI-FIREWALL.md` was written on 13 June; on 19 June the commit that split
 * the operate surface out deleted every file it cited. It survived another six
 * weeks — because at 47 days against a 180-day threshold it was FRESH. By age it
 * was current; by content it described code that was gone.
 *
 * A document written yesterday about code deleted this morning is stale. One
 * written a year ago about code nobody touched is current. Age cannot tell those
 * apart; a dead path can.
 *
 * This is the cheap half of the idea. The expensive half — pinning a doc to the
 * SHA it was verified against and diffing the covered paths since — catches
 * silent DRIFT as well as deletion. Deletion is the case that actually bit us.
 *
 * Three kinds of reference are not defects, and conflating them with real ones is
 * how a check earns a reputation for crying wolf:
 *
 *   - placeholders    `tests/feature/foo.test.ts` in a template means "yours goes
 *                     here", not "ours is here"
 *   - prospective     "add `packages/board/lib.smoke.test.mjs` (deferred)" is a
 *                     plan, and a plan naming a file that does not exist yet is
 *                     the plan working correctly
 *   - historical      a plan or changelog entry from May describing files that
 *                     were later removed is an accurate record of May, and a
 *                     decision record that says where something USED to live is
 *                     preserving exactly the fact it exists to preserve
 *
 * The caller decides which files to scan; this module decides which references
 * inside them are claims. The CLI skips plans, benchmarks, the changelog, and
 * templates by default (`--all` includes them).
 */

import { existsSync } from 'node:fs';

/** Directories whose contents are OUR source — a path here is a claim about this repo. */
export const SOURCE_DIRS = ['scripts', 'packages', 'agents', 'commands', 'tests', 'skills', 'hooks'];

const EXT = 'mjs|cjs|js|ts|tsx|json|sh|md|yml|yaml|toml';

const REF = new RegExp(
  '`((?:' + SOURCE_DIRS.join('|') + ')\\/[\\w./@-]+\\.(?:' + EXT + '))`',
  'g',
);

// A name nobody expects to resolve. `foo/bar/baz` and `your-thing` are how docs
// say "substitute your own" without a placeholder syntax.
const PLACEHOLDER = /(^|[/-])(foo|bar|baz|qux|quux|example|sample|myapp|my-\w+|your-\w+|todo)([./-]|$)/i;

// The line says the file is expected NOT to exist yet.
const PROSPECTIVE = /\b(deferred|planned|proposed|future|not yet|to be (added|created|written)|will (be )?(add|creat|writ)|phase\s*\d|todo|roadmap|v\d+\.\d+)/i;

// The line says the file USED to exist and says so on purpose. A decision record
// that cites where something lived is doing its job; deleting the pointer to
// satisfy a linter would destroy the fact the record exists to preserve. A commit
// SHA on the line counts too — it is a deliberate anchor to history, not a claim
// about the present tree.
const RETROSPECTIVE = /\b(lived in|used to|formerly|previously|once (lived|was)|no longer|since (removed|deleted|moved)|was (removed|deleted|moved|renamed|split)|moved (out|to|into)|\b[0-9a-f]{7,40}\b)/i;

/**
 * Every backticked source path in `text`, with the line it sits on.
 * @returns {Array<{path: string, line: number, text: string}>}
 */
export function sourceRefs(text) {
  const out = [];
  const lines = String(text ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    REF.lastIndex = 0;
    let m;
    while ((m = REF.exec(lines[i])) !== null) out.push({ path: m[1], line: i + 1, text: lines[i] });
  }
  return out;
}

/**
 * References that claim a file exists when it does not.
 *
 * @param {string} text
 * @param {{exists?: (p:string)=>boolean}} [opts] — `exists` is injectable so the
 *   rule is testable without a filesystem.
 * @returns {Array<{path: string, line: number, why: string}>}
 */
export function deadSourceRefs(text, { exists = existsSync } = {}) {
  const seen = new Set();
  const dead = [];
  for (const ref of sourceRefs(text)) {
    if (seen.has(ref.path)) continue;
    // A glob or a template variable is a pattern, not a path.
    if (/[*?{}<>$]/.test(ref.path)) continue;
    if (PLACEHOLDER.test(ref.path)) continue;
    if (PROSPECTIVE.test(ref.text) || RETROSPECTIVE.test(ref.text)) continue;
    if (exists(ref.path)) continue;
    seen.add(ref.path);
    dead.push({ path: ref.path, line: ref.line, why: 'referenced as source, but no such file' });
  }
  return dead;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const { readFileSync } = await import('node:fs');
  const { execSync } = await import('node:child_process');

  // Documents whose references are not claims about the CURRENT tree: a plan or a
  // changelog entry records what was true when it was written, and a template
  // describes the repo it will be used in rather than this one. Scanning them
  // produces findings nobody should act on, which is how a check gets muted.
  const HISTORICAL = /^(docs\/plans\/|docs\/superpowers\/|docs\/benchmarks\/|CHANGELOG\.md$)/;
  const TEMPLATE = /(^|\/)templates\//;

  const files = argv.filter((a) => !a.startsWith('--'));
  const targets = (files.length
    ? files
    : execSync('git ls-files "*.md"', { encoding: 'utf8' }).split('\n').filter(Boolean)
  ).filter((f) => argv.includes('--all') || (!HISTORICAL.test(f) && !TEMPLATE.test(f)));

  let total = 0;
  for (const f of targets) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    const dead = deadSourceRefs(text);
    if (!dead.length) continue;
    total += dead.length;
    console.log(f);
    for (const d of dead) console.log(`  ${String(d.line).padStart(5)}  ✗ ${d.path}`);
  }
  console.log(total ? `\n${total} dead source reference(s)` : 'no dead source references');
  return argv.includes('--strict') && total ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
