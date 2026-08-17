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
  { key: 'other', label: 'Other', dirs: ['docs'], why: 'everything else the project wrote down' },
]);

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
  try {
    const head = String(read(absPath, 'utf8')).slice(0, 2000);
    const m = head.match(/^#\s+(.+?)\s*$/m);
    return m ? m[1].replace(/\.md$/i, '').trim() : null;
  } catch { return null; }
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

/** Which group a path belongs to — first match wins, so `other` catches the rest. */
export function groupFor(rel) {
  const p = rel.split(path.sep).join('/');
  for (const g of DOC_GROUPS) {
    if ((g.files || []).includes(p)) return g.key;
    if ((g.dirs || []).some((d) => p === d || p.startsWith(`${d}/`))) return g.key;
  }
  return 'other';
}

/**
 * Every document in the project, grouped and newest first within each group.
 *
 * Newest first because a document written today and one written in March answer
 * differently — the same reason the pipeline view labels a stale verdict rather
 * than hiding it.
 */
/**
 * One document's freshness, as three states rather than a date.
 *
 * `unknown` covers two different absences and says which: a file we could not
 * read at all, and a file that simply declares no date. Neither may render as
 * fresh — the whole reason `stale_after` exists is that a document nobody can
 * judge must not look like one that passed.
 */
function freshnessOf(abs, nowMs = Date.now(), staleDays = 180) {
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); }
  catch (e) {
    return { freshness: 'unknown', freshnessBasis: 'unreadable', staleAfter: null,
      freshnessWhy: `could not read this file: ${String(e?.message || e)}` };
  }
  try {
    const j = judgeFreshness({ text, dateType: 'any', nowMs, staleDays });
    return {
      freshness: j.verdict,
      freshnessBasis: j.basis,
      staleAfter: j.staleAfter,
      freshnessWhy: j.basis === 'declared'
        ? `the author declared it good until ${j.staleAfter}`
        : (j.date ? `judged by its own date ${j.date} (${j.ageDays}d, threshold ${staleDays}d)`
                  : 'no stale_after and no date — nothing to judge it by'),
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
    docs.push({
      path: d.rel,
      name: path.basename(d.rel),
      title: titleOf(d.abs) || path.basename(d.rel, '.md'),
      group: groupFor(d.rel),
      size: d.size,
      modified: d.modified,
      // A modification time answers "when was this file last touched", which is
      // a different question from "is this still true". A typo fix rejuvenates a
      // document that stopped being true months earlier, and the list showed
      // only the former. `judgeFreshness` gives three verdicts and names which
      // rule produced each — see scripts/lib/freshness.mjs.
      ...freshnessOf(d.abs),
    });
  }

  const groups = DOC_GROUPS.map((g) => ({
    key: g.key, label: g.label, why: g.why,
    docs: docs.filter((d) => d.group === g.key).sort((a, b) => b.modified.localeCompare(a.modified)),
  })).filter((g) => g.docs.length);

  return { total: docs.length, truncated: docs.length >= max, groups };
}
