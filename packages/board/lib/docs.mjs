// The project's own documentation, as something you can browse.
//
// A great_cto project accumulates a lot of it — this repository has twenty
// documents at the root of `docs/`, thirty-one plans, twenty architecture
// documents, ten ADRs — and the board showed none of it. Agents write ARCH docs,
// ADRs, QA and security reports, and the only way to read one was to know its
// filename and open an editor.
//
// `/api/doc` could already fetch a document by path. What was missing is the
// question before that one: which documents exist, and which of them is about
// the thing I am looking at now.
//
// Zero dependencies, like the rest of the board.

import fs from 'node:fs';
import { judgeFreshness } from '../../../scripts/lib/freshness.mjs';
import path from 'node:path';

/**
 * Where a project keeps documentation, and what each place answers.
 *
 * Grouped by the QUESTION rather than by directory: `docs/architecture` and
 * `docs/adr` sit next to each other on disk and answer different things — one
 * says how the system is built, the other why it was decided that way. A reader
 * arrives with one of those questions, not with a directory in mind.
 */
export const DOC_GROUPS = Object.freeze([
  // Named files rather than the whole of `.great_cto`: that directory also holds
  // session logs, verdict logs and lesson captures — a hundred and fourteen of
  // them here. They are state the pipeline writes, not documentation someone
  // would read, and burying four useful files under them is how a browser
  // becomes something nobody opens.
  // The .great_cto context files are listed by the "Agent context" group in the
  // board, which knows the canonical set — including layers that are not written
  // yet, which a directory walk cannot report because there is no file to find.
  // Listing them here as well was the duplication between Docs and Memory.
  {
    key: 'state', label: 'This project',
    files: ['README.md', 'CLAUDE.md'],
    why: 'what it is, for a person arriving',
  },
  { key: 'architecture', label: 'Architecture', dirs: ['docs/architecture'], why: 'how the system is built' },
  { key: 'decisions', label: 'Decisions', dirs: ['docs/adr', 'docs/decisions'], why: 'why it was built that way' },
  { key: 'plans', label: 'Plans', dirs: ['docs/plans'], why: 'what was going to be done' },
  { key: 'reviews', label: 'Reviews', dirs: ['docs/qa', 'docs/security', 'docs/quality'], why: 'what was checked, and what it found' },
  { key: 'design', label: 'Design', dirs: ['docs/design', 'docs/product'], why: 'what it should look like and for whom' },
  // Added because it was carrying real weight in `other`, not for symmetry: one
  // project keeps 17 runbooks under `docs/runbooks`, and this repository has
  // `docs/reference`, `docs/tutorials`, `docs/operations` and a FAQ. "How do I
  // run this" is a question a reader arrives with, and it is not answered by any
  // of the six groups above.
  { key: 'guides', label: 'How to run it', dirs: ['docs/runbooks', 'docs/reference', 'docs/tutorials', 'docs/operations'], why: 'how to operate it and how to use it' },
  { key: 'other', label: 'Other', dirs: ['docs'], why: 'everything else the project wrote down' },
]);

/**
 * The word a document uses to say what KIND of document it is, and the group
 * that word belongs to.
 *
 * Path alone recognised 24% of one project's corpus — 165 of 217 documents fell
 * into `other`, which is a classifier that has stopped classifying. The reason
 * is that `docs/architecture`, `docs/adr`, `docs/plans` are this repository's
 * own conventions and real projects do not share them: they write
 * `docs/impl-briefs/IMPL-BRIEF-*.md`, `docs/research/2026-04-06-max-backtest.md`,
 * `docs/agent_quality_hardening_plan.md`.
 *
 * So the type token is looked for wherever an author might have put it — a
 * directory name, the filename, or the first heading — and each of those is
 * split into words rather than matched as a prefix, because `IMPL-BRIEF-x`,
 * `sec-threats/` and `agent_quality_hardening_plan` all announce their type in
 * a word that is not at position zero.
 *
 * Words that are a document's SUBJECT more often than its type are deliberately
 * absent, and each omission was bought by a wrong answer: `quality` put
 * `agent_quality_hardening_plan.md` in Reviews, `ux` put a plan named
 * `…-flow-compiler-ux.md` in Design, `product` pulled `PRODUCT-BUILDER-DIRECTION.md`
 * out of the strategy directory it was filed in. `deploy`, `live` and `prod`
 * never made it in for the same reason. A confident wrong group is worse for a
 * reader than `other` — `docs/quality`, `docs/product` and `docs/design` are
 * still canonical directories below, so a project that files by that word keeps
 * the grouping; what is gone is guessing from the word appearing anywhere.
 */
const TYPE_TOKENS = Object.freeze({
  adr: 'decisions', adrs: 'decisions', dec: 'decisions', decision: 'decisions',
  decisions: 'decisions', rfc: 'decisions',

  arch: 'architecture', architecture: 'architecture', spec: 'architecture',
  specs: 'architecture', schema: 'architecture',

  plan: 'plans', plans: 'plans', roadmap: 'plans', backlog: 'plans',
  impl: 'plans', strategy: 'plans', proposal: 'plans',

  qa: 'reviews', uat: 'reviews', audit: 'reviews', audits: 'reviews',
  review: 'reviews', reviews: 'reviews', test: 'reviews', tests: 'reviews',
  testing: 'reviews', security: 'reviews', sec: 'reviews', tm: 'reviews',
  threat: 'reviews', risk: 'reviews', risks: 'reviews', incident: 'reviews',
  incidents: 'reviews', postmortem: 'reviews', research: 'reviews',
  analysis: 'reviews', benchmark: 'reviews', benchmarks: 'reviews',
  bench: 'reviews', report: 'reviews', reports: 'reviews', eval: 'reviews',
  evaluation: 'reviews', measurement: 'reviews', validation: 'reviews',
  checklist: 'reviews', backtest: 'reviews',

  design: 'design', designs: 'design', brief: 'design', briefs: 'design',
  prd: 'design',

  runbook: 'guides', runbooks: 'guides', guide: 'guides', guides: 'guides',
  tutorial: 'guides', tutorials: 'guides', howto: 'guides',
  reference: 'guides', operations: 'guides', faq: 'guides', help: 'guides',
  setup: 'guides', onboarding: 'guides',
});

/** Words of a name, so `IMPL-BRIEF-x`, `sec-threats` and `a_b_plan` all yield tokens. */
function words(s) {
  return String(s).toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
}

/** The first word that names a kind of document, left to right — a type is announced early. */
function tokenGroup(name, { limit = Infinity } = {}) {
  const w = words(name);
  for (let i = 0; i < w.length && i < limit; i++) {
    const g = TYPE_TOKENS[w[i]];
    if (g) return g;
  }
  return null;
}

/** Never walked: large, generated, or not this project's writing. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'screenshots', 'vendor']);

/** A cap, so a repository with thousands of markdown files cannot stall the board. */
export const MAX_DOCS = 500;

/**
 * The title an author gave a document.
 *
 * From the first `# ` heading, because `ADR-010-pipeline-position-pull-view.md`
 * is a filename and not what anyone called it. Read from a bounded head: a title
 * is in the first few lines or it is not a title.
 */
export function titleOf(absPath, { read = fs.readFileSync } = {}) {
  try { return titleFromText(String(read(absPath, 'utf8'))); }
  catch { return null; }
}

/** The same heading, from text already in hand — the classifier reads it too. */
export function titleFromText(text) {
  const m = String(text || '').slice(0, 2000).match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].replace(/\.md$/i, '').trim() : null;
}

function walk(dir, root, out, depth = 0) {
  if (depth > 3 || out.length >= MAX_DOCS) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (out.length >= MAX_DOCS) return;
    if (SKIP.has(e.name) || e.name.startsWith('.') && e.name !== '.great_cto') continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { walk(abs, root, out, depth + 1); continue; }
    if (!e.name.toLowerCase().endsWith('.md')) continue;
    let st;
    try { st = fs.statSync(abs); } catch { continue; }
    out.push({ abs, rel: path.relative(root, abs), size: st.size, modified: st.mtime.toISOString() });
  }
}

/**
 * Which group a document belongs to.
 *
 * Signals in order of how much they actually know, which is not the order they
 * look convincing in:
 *
 *   1. an exact named file          README.md / CLAUDE.md — not a guess at all
 *   2. front-matter `type:`         the author said it outright
 *   3. the LEADING filename token   `ADR-019-…`, `PLAN-…`, `IMPL-BRIEF-…`,
 *                                   `2026-08-21-…` after the date is skipped
 *   4. a canonical directory        docs/adr, docs/plans, docs/product, …
 *   5. any other directory segment  deepest first: `superpowers/plans` is a
 *                                   plans directory, `superpowers` is not
 *   6. a token elsewhere in the name `agent_quality_hardening_plan.md`
 *   7. the first `# ` heading       opening words only
 *   8. a bare README              a name that describes nothing else
 *
 * The leading filename token outranks the directory, and that ordering was
 * bought: 14 `docs/adr/ADR-0NN-*.md` files were being filed as
 * Architecture, and `docs/design/PLAN-*.md` as Design. A directory is where a
 * project dumps a category; the front of a filename is what the author called
 * THIS document. Mid-name tokens rank below the directory instead, because
 * there the word is usually the subject — which is why
 * `…-flow-compiler-ux.md`, a plan, must not leave `docs/superpowers/plans`.
 *
 * `other` stays the answer when nothing above speaks. A document that will not
 * classify is still listed — never dropped, never hidden.
 *
 * @param {string} rel  path relative to the project root
 * @param {{text?: string}} hints  the document's text, when it has been read
 */
export function groupFor(rel, { text = '' } = {}) {
  const p = rel.split(path.sep).join('/');
  const base = path.basename(p, '.md');

  for (const g of DOC_GROUPS) {
    if ((g.files || []).includes(p)) return g.key;
  }

  const declared = declaredType(text);
  if (declared && TYPE_TOKENS[declared]) return TYPE_TOKENS[declared];

  const lead = leadingTypeToken(base);
  if (lead) return lead;

  // `other` owns `docs/`, which would swallow every path — it is the fallback,
  // not a directory rule, so it is skipped here and returned at the end.
  for (const g of DOC_GROUPS) {
    if (g.key === 'other') continue;
    if ((g.dirs || []).some((d) => p === d || p.startsWith(`${d}/`))) return g.key;
  }

  const segments = p.split('/').slice(0, -1);
  for (let i = segments.length - 1; i >= 0; i--) {
    const g = tokenGroup(segments[i]);
    if (g) return g;
  }

  const fromName = tokenGroup(base);
  if (fromName) return fromName;

  // Only the heading's opening words. A title announces its type at the front
  // ("QA report — …", "ADR-011: …"); four words in, "The details the README used
  // to carry" filed a page about the README under "This project", and
  // "Positioning vocabulary — product-builder language" landed in Design.
  const heading = text ? titleFromText(text) : null;
  if (heading) {
    const g = tokenGroup(heading, { limit: 2 });
    if (g) return g;
  }

  // Last, not in TYPE_TOKENS: `README` names no type, so it must not outrank a
  // directory that does — `docs/uat/README.md` is a review and
  // `docs/benchmarks/briefs/README.md` is a brief. Reaching here means nothing
  // else spoke, and then it is the project's own front page (including
  // `docs/ru/README.md` and the nine other translations).
  if (base.toLowerCase() === 'readme') return 'state';

  return 'other';
}

/**
 * The type token at the FRONT of a filename, past any leading date or number.
 *
 * `ADR-019-…`, `TM-…`, `UAT-2026-08-21-0824`, `00_Backlog` all announce their
 * type first; `2026-04-16-blog-quality-improvement` announces a date first and
 * then a subject, and must not be read as a type at all.
 */
function leadingTypeToken(base) {
  for (const w of words(base)) {
    if (/^\d+$/.test(w)) continue;  // a leading date or ordinal, not a type
    return TYPE_TOKENS[w] || null;  // the first real word decides, or nothing does
  }
  return null;
}

/** An author's own `type:` / `group:` / `kind:` / `category:` in YAML front-matter. */
function declaredType(text) {
  const fm = String(text || '').replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^(?:doc_?type|type|group|kind|category):\s*["']?([A-Za-z][\w-]*)/im);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Every document in the project, grouped and newest first within each group.
 *
 * Newest first because a document written today and one written in March answer
 * differently — the same reason the pipeline view labels a stale verdict rather
 * than hiding it.
 */
/**
 * One document's freshness — three states, and an absence that is not a state.
 *
 *   'stale'    a review date was declared and it has passed, or the doc's own
 *              date is older than the threshold. The actionable one.
 *   'fresh'    a date was declared and the doc is inside it.
 *   null       the doc declares no review date. This is the NORM, not a finding:
 *              of 1634 md files in one project, zero declare `stale_after`; of
 *              2541 here, five do. Measured on the live board, the old code put
 *              `unknown` on 198 of 217 documents in one project and 148 of 187
 *              in another — a mark on nine rows in ten distinguishes nothing,
 *              and it hid the 19 documents that had actually been judged.
 *              `null` rather than a word so a caller can skip the badge with
 *              `if (!doc.freshness)` and never has to know a vocabulary.
 *
 *   'unknown'  reserved for the one case that IS a defect: the file could not be
 *              read. That must not render as fresh and must not be filed with
 *              the ordinary majority — `freshnessBasis: 'unreadable'` says which.
 *
 * `freshnessBasis` and `freshnessWhy` are kept in every case, so nothing that
 * was in the payload has been removed: 'declared' | 'mtime' | 'undeclared' |
 * 'unreadable' still names the rule that produced (or did not produce) a verdict.
 */
function freshnessOf(text, nowMs = Date.now(), staleDays = 180) {
  if (text === null) {
    return { freshness: 'unknown', freshnessBasis: 'unreadable', staleAfter: null,
      freshnessWhy: 'could not read this file' };
  }
  try {
    const j = judgeFreshness({ text, dateType: 'any', nowMs, staleDays });
    if (!j.declared) {
      return { freshness: null, freshnessBasis: 'undeclared', staleAfter: null,
        freshnessWhy: 'declares no review date — most documents do not, so there is nothing to judge and nothing wrong' };
    }
    return {
      freshness: j.verdict,
      freshnessBasis: j.basis,
      staleAfter: j.staleAfter,
      freshnessWhy: j.basis === 'declared'
        ? `the author declared it good until ${j.staleAfter}`
        : `judged by its own date ${j.date} (${j.ageDays}d, threshold ${staleDays}d)`,
    };
  } catch (e) {
    return { freshness: 'unknown', freshnessBasis: 'unreadable', staleAfter: null,
      freshnessWhy: String(e?.message || e) };
  }
}

export function listDocs(root, { max = MAX_DOCS } = {}) {
  const found = [];
  for (const g of DOC_GROUPS) {
    for (const d of g.dirs || []) walk(path.join(root, d), root, found);
    for (const f of g.files || []) {
      const abs = path.join(root, f);
      try {
        const st = fs.statSync(abs);
        if (st.isFile()) found.push({ abs, rel: f, size: st.size, modified: st.mtime.toISOString() });
      } catch { /* absent */ }
    }
  }

  const seen = new Set();
  const docs = [];
  for (const d of found) {
    if (seen.has(d.rel) || docs.length >= max) continue;
    seen.add(d.rel);
    // Read once. The title, the group and the freshness verdict are three
    // questions about the same bytes, and this used to open every file twice.
    // `null` distinguishes "could not be read" from "read and said nothing" —
    // the distinction the freshness badge now rests on.
    let text = null;
    try { text = fs.readFileSync(d.abs, 'utf8'); } catch { /* unreadable */ }
    docs.push({
      path: d.rel,
      name: path.basename(d.rel),
      title: (text !== null && titleFromText(text)) || path.basename(d.rel, '.md'),
      group: groupFor(d.rel, { text: text ?? '' }),
      size: d.size,
      modified: d.modified,
      // A modification time answers "when was this file last touched", which is
      // a different question from "is this still true". A typo fix rejuvenates a
      // document that stopped being true months earlier, and the list showed
      // only the former. `judgeFreshness` gives three verdicts and names which
      // rule produced each — see scripts/lib/freshness.mjs.
      ...freshnessOf(text),
    });
  }

  const groups = DOC_GROUPS.map((g) => ({
    key: g.key, label: g.label, why: g.why,
    docs: docs.filter((d) => d.group === g.key).sort((a, b) => b.modified.localeCompare(a.modified)),
  })).filter((g) => g.docs.length);

  return { total: docs.length, truncated: docs.length >= max, groups };
}
