#!/usr/bin/env node
/**
 * memory-search.mjs — zero-dep BM25 ranked recall over great_cto memory.
 *
 * great_cto has rich memory (session logs, brain/lessons/decisions, global
 * patterns) but naive recall: /resume reads the *most recent* logs, and
 * architect-pattern-lookup greps global patterns by exact `applies_to` frontmatter.
 * Recent ≠ relevant, and an exact-substring grep misses semantically-related
 * patterns. This adds ranked search so the *relevant* memory surfaces, not just
 * the newest or the exactly-tagged.
 *
 * Pure Node — no deps, no index files, no network. Builds an in-memory BM25
 * index over the corpus on each call (memory corpora are small — tens to low
 * hundreds of short docs — so this is milliseconds).
 *
 * Library:
 *   import { tokenize, buildIndex, search, searchMemory } from './memory-search.mjs';
 * CLI:
 *   node memory-search.mjs "<query>" [--source logs|patterns|memory|all|docs]
 *                                     [--limit N] [--json] [--cwd DIR]
 *
 * `docs` searches the project's `docs/` tree. It is deliberately NOT part of
 * `all`: `all` is the MEMORY corpus — tens of short documents about what happened
 * in this project — and folding a hundred and sixty design documents into it would
 * silently change what /resume and architect-pattern-lookup surface, by drowning
 * the corpus they were tuned against. The two answer different questions: what
 * happened here, and what is written down here. Ask one or the other.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { homedir } from 'node:os';
// The documentation corpus is defined ONCE, in doc-links, and borrowed here.
// Its two exclusions are decisions, not filters: `.summary.md` files are machine
// summaries of documents that are already in the corpus, and `docs/<lang>/` holds
// translations. Re-implementing that rule here is how the board's Docs screen and
// this search would come to disagree about what a document is.
import { listDocs } from './doc-links.mjs';

// A small English stopword set — memory is technical, so keep it minimal so
// domain terms (auth, cache, gate, archetype) are never dropped.
const STOP = new Set(('a an and are as at be but by for if in into is it no not of on or such that the their then ' +
  'there these they this to was will with we you your our it its from has have had do does did can could should would ' +
  'i me my so than too very just about over under out up down more most some any all each also').split(' '));

const K1 = 1.5;
const B = 0.75;

/** Lowercase, split on non-[a-z0-9_], drop stopwords + 1-char tokens. */
export function tokenize(text) {
  const out = [];
  for (const m of String(text).toLowerCase().matchAll(/[a-z0-9_]{2,}/g)) {
    const t = m[0];
    if (!STOP.has(t)) out.push(t);
  }
  return out;
}

/**
 * Build a BM25 index from docs.
 * @param {Array<{id:string, text:string, [meta:string]:any}>} docs
 */
export function buildIndex(docs) {
  const df = new Map();            // term -> # docs containing it
  const postings = [];             // per-doc: { tf: Map, len, doc }
  let totalLen = 0;
  for (const doc of docs) {
    const tokens = tokenize(doc.text);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    postings.push({ tf, len: tokens.length, doc });
    totalLen += tokens.length;
  }
  const N = docs.length || 1;
  return { df, postings, N, avgdl: totalLen / N };
}

/** Extract a snippet window around the densest cluster of query terms. */
function snippet(text, qterms, width = 220) {
  const lower = text.toLowerCase();
  let best = 0, bestHits = -1;
  for (let i = 0; i < lower.length; i += 40) {
    const win = lower.slice(i, i + width);
    let hits = 0;
    for (const q of qterms) if (win.includes(q)) hits++;
    if (hits > bestHits) { bestHits = hits; best = i; }
  }
  return text.slice(best, best + width).replace(/\s+/g, ' ').trim();
}

/**
 * BM25 search. Returns docs ranked by score (desc), score > 0 only.
 * @returns {Array<{id, score, snippet, doc}>}
 */
export function search(index, query, { limit = 8, k1 = K1, b = B } = {}) {
  const qterms = [...new Set(tokenize(query))];
  if (qterms.length === 0) return [];
  const { df, postings, N, avgdl } = index;
  const idf = new Map();
  for (const t of qterms) {
    const n = df.get(t) || 0;
    // BM25+ idf (always positive)
    idf.set(t, Math.log(1 + (N - n + 0.5) / (n + 0.5)));
  }
  const results = [];
  for (const p of postings) {
    let score = 0;
    for (const t of qterms) {
      const f = p.tf.get(t);
      if (!f) continue;
      const denom = f + k1 * (1 - b + b * (p.len / (avgdl || 1)));
      score += idf.get(t) * (f * (k1 + 1)) / denom;
    }
    if (score > 0) results.push({ id: p.doc.id, score, doc: p.doc, snippet: snippet(p.doc.text, qterms) });
  }
  results.sort((a, b2) => b2.score - a.score);
  return results.slice(0, limit);
}

/** Read a file safely; '' on any error. */
function slurp(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }

/** The sources gatherCorpus knows. A typo in --source used to search nothing and
 *  print "no matches", which is a wrong answer that looks like a right one. */
export const SOURCES = new Set(['logs', 'patterns', 'memory', 'all', 'docs']);

/** Gather the corpus for a project. source ∈ logs|patterns|memory|all|docs. */
export function gatherCorpus({ cwd = process.cwd(), source = 'all' } = {}) {
  const docs = [];
  const gc = join(cwd, '.great_cto');
  const gcHome = join(homedir(), '.great_cto');
  const add = (id, path, kind) => { const text = slurp(path); if (text.trim()) docs.push({ id, path, kind, text }); };

  if (source === 'logs' || source === 'all' || source === 'memory') {
    const logDir = join(gc, 'logs');
    if (existsSync(logDir)) {
      try {
        for (const f of readdirSync(logDir)) {
          if (/^session-.*\.md$/.test(f)) add(f, join(logDir, f), 'log');
        }
      } catch { /* ignore */ }
    }
  }
  if (source === 'memory' || source === 'all') {
    for (const f of ['brain.md', 'lessons.md', 'CODEBASE.md', 'HANDOFF.md', 'PROJECT.md', 'decisions.md']) {
      add(f, join(gc, f), 'memory');
    }
    add('global-decisions.md', join(gcHome, 'decisions.md'), 'memory');
    add('global-lessons.md', join(gcHome, 'lessons.md'), 'memory');
  }
  // The one corpus that is not memory. Ranked full-text over the documentation
  // was the single thing a docs browser gives that this board did not have — and
  // it needed no new dependency, only pointing the BM25 already here at `docs/`.
  if (source === 'docs') {
    const root = join(cwd, 'docs');
    if (existsSync(root)) {
      // Relative path as the id, not the basename: `docs/plans/README.md` and any
      // other README.md would otherwise arrive as the same name, and a result you
      // cannot locate is not a result.
      for (const full of listDocs(root)) add(relative(cwd, full), full, 'doc');
    }
  }
  if (source === 'patterns' || source === 'all') {
    const gpDir = join(gcHome, 'global-patterns');
    if (existsSync(gpDir)) {
      try {
        for (const f of readdirSync(gpDir)) {
          if (/^GP-.*\.md$/.test(f)) add(f, join(gpDir, f), 'pattern');
        }
      } catch { /* ignore */ }
    }
  }
  return docs;
}

/**
 * Query terms no document in the corpus contains.
 *
 * BM25 ranks any document matching any term, so a five-word query can return a
 * confident-looking list while its most specific word appears nowhere. That word
 * is the gap: what the written record does not say. Naming it is the difference
 * between "here is the answer" and "here is what is close, and this part is not
 * written down anywhere". (The honest-gap step in agentic-rag-for-dummies, MIT.)
 */
export function missingTerms(corpus, query) {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0 || !corpus?.length) return terms;
  const seen = new Set();
  for (const d of corpus) for (const t of tokenize(d.text)) seen.add(t);
  return terms.filter((t) => !seen.has(t));
}

/** Which of the query's terms a document contains. */
function matchedTerms(text, query) {
  const have = new Set(tokenize(text));
  return [...new Set(tokenize(query))].filter((t) => have.has(t));
}

/**
 * A markdown document as its heading sections (#, ##, ###).
 *
 * A hundred-and-sixty-line ADR ranked as one bag of words answers "which file",
 * and then the reader scrolls. Ranked by section it answers "which part", and the
 * result can say where to open it. Headings inside a code fence are not headings.
 * Text before the first heading is its own section, so nothing is dropped.
 * (Small chunks searched, the surrounding context returned — the hierarchical
 * indexing in agentic-rag-for-dummies, MIT.)
 *
 * @returns {Array<{heading:string, level:number, line:number, text:string}>}
 */
export function splitSections(text) {
  const lines = String(text ?? '').split('\n');
  const out = [];
  let cur = { heading: '', level: 0, line: 1, lines: [] };
  let fence = false;
  const flush = () => { if (cur.heading || cur.lines.join('').trim()) out.push(cur); };
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const m = fence ? null : l.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (m) {
      flush();
      cur = { heading: m[2], level: m[1].length, line: i + 1, lines: [l] };
    } else {
      cur.lines.push(l);
    }
  });
  flush();
  return out.map((s) => ({ heading: s.heading, level: s.level, line: s.line, text: s.lines.join('\n') }));
}

/**
 * Rank documents as before; then point at the section inside each one.
 *
 * The first version ranked SECTIONS and reported each document's best one. On
 * the golden set (tests/fixtures/recall-golden.json) that found the answer in the top
 * three 10 times out of 14, against 12 for whole-document ranking: a short section
 * that happens to repeat the query's words outranks the long document that is
 * actually about the subject. It did not ship.
 *
 * What shipped keeps the document order exactly — the ranking the golden set was
 * measured on — and adds only where to open each result. The section is scored
 * against an index over every section (so rare words weigh what they weigh in the
 * corpus) and carries its document's title, because a section called
 * "Consequences" means nothing without the ADR it belongs to. A document none of
 * whose sections holds a query term gets no pointer, rather than an invented one.
 */
function searchSections(docs, query, limit) {
  const ranked = search(buildIndex(docs), query, { limit });
  if (ranked.length === 0) return [];

  const units = [];
  for (const d of docs) {
    const title = (d.text.match(/^#\s+(.+)$/m) || [])[1] || '';
    for (const s of splitSections(d.text)) {
      units.push({ id: `${d.id}#L${s.line}`, text: `${title}\n${s.text}`, parent: d.id, section: s });
    }
  }
  const bestByDoc = new Map();
  for (const r of search(buildIndex(units), query, { limit: units.length })) {
    if (!bestByDoc.has(r.doc.parent)) bestByDoc.set(r.doc.parent, r);
  }

  return ranked.map((r) => {
    const best = bestByDoc.get(r.doc.id);
    const out = {
      file: r.doc.id, path: r.doc.path, kind: r.doc.kind,
      score: Math.round(r.score * 1000) / 1000, snippet: best ? best.snippet : r.snippet,
      matched: matchedTerms(r.doc.text, query),
    };
    if (best) { out.section = best.doc.section.heading; out.line = best.doc.section.line; }
    return out;
  });
}

/**
 * Convenience: gather corpus + BM25 search in one call.
 *
 * `granularity` defaults to `section` for the docs corpus and `document`
 * everywhere else: session logs and memory files are short, and `all` was tuned
 * against whole documents — changing its unit would change what /resume surfaces.
 */
export function searchMemory({ query, cwd = process.cwd(), source = 'all', limit = 8, corpus, granularity } = {}) {
  const docs = corpus ?? gatherCorpus({ cwd, source });
  if (docs.length === 0) return [];
  const mode = granularity ?? (source === 'docs' ? 'section' : 'document');
  if (mode === 'section') return searchSections(docs, query, limit);
  return search(buildIndex(docs), query, { limit }).map(r => ({
    // `id`, not `basename`: for docs it is the relative path, and for the two
    // global memory files it is the label that tells them apart from the
    // project's own decisions.md — which the basename collapsed.
    file: r.doc.id, path: r.doc.path, kind: r.doc.kind,
    score: Math.round(r.score * 1000) / 1000, snippet: r.snippet,
    matched: matchedTerms(r.doc.text, query),
  }));
}

// ── CLI ──────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let source = 'all', limit = 8, json = false, cwd = process.cwd();
  const q = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--source') source = args[++i];
    else if (a === '--limit') limit = parseInt(args[++i], 10) || 8;
    else if (a === '--json') json = true;
    else if (a === '--cwd') cwd = args[++i];
    else q.push(a);
  }
  const query = q.join(' ');
  const USAGE = 'usage: memory-search.mjs "<query>" [--source logs|patterns|memory|all|docs] [--limit N] [--json] [--cwd DIR]';
  if (!query) { console.error(USAGE); process.exit(2); }
  if (!SOURCES.has(source)) { console.error(`unknown --source '${source}'\n${USAGE}`); process.exit(2); }

  // Gathered here rather than inside searchMemory so the CLI can tell the two
  // apart. "Nothing matched" and "there was nothing to search" are different
  // answers, and printing the first for the second is this repository's oldest
  // defect wearing a search result: it reads as a corpus that was consulted.
  const corpus = gatherCorpus({ cwd, source });
  const results = searchMemory({ query, cwd, source, limit, corpus });
  const missing = corpus.length ? missingTerms(corpus, query) : [];
  // Printed on every path that read a corpus: it is the part of the question the
  // written record does not answer, and a ranked list must not hide it.
  const gap = () => { if (missing.length) console.log(`not in any ${source} document: ${missing.join(', ')}`); };

  if (json) { console.log(JSON.stringify({ source, corpus: corpus.length, missing, results }, null, 2)); }
  else if (corpus.length === 0) { console.log(`nothing to search: --source ${source} found no documents under ${cwd}`); }
  else if (results.length === 0) { console.log(`no matches in ${corpus.length} ${source} document(s) for: ${query}`); gap(); }
  else {
    gap();
    for (const r of results) {
      const where = r.line ? `${r.file}:${r.line}${r.section ? `  § ${r.section}` : ''}` : r.file;
      console.log(`${r.score.toFixed(2)}  [${r.kind}] ${where}\n    ${r.snippet.slice(0, 160)}`);
    }
  }
}
