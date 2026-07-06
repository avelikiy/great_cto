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
 *   node memory-search.mjs "<query>" [--source logs|patterns|memory|all]
 *                                     [--limit N] [--json] [--cwd DIR]
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

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

/** Gather the memory corpus for a project. source ∈ logs|patterns|memory|all. */
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

/** Convenience: gather corpus + BM25 search in one call. */
export function searchMemory({ query, cwd = process.cwd(), source = 'all', limit = 8 } = {}) {
  const docs = gatherCorpus({ cwd, source });
  if (docs.length === 0) return [];
  return search(buildIndex(docs), query, { limit }).map(r => ({
    file: basename(r.doc.path), path: r.doc.path, kind: r.doc.kind,
    score: Math.round(r.score * 1000) / 1000, snippet: r.snippet,
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
  if (!query) { console.error('usage: memory-search.mjs "<query>" [--source logs|patterns|memory|all] [--limit N] [--json] [--cwd DIR]'); process.exit(2); }
  const results = searchMemory({ query, cwd, source, limit });
  if (json) { console.log(JSON.stringify(results, null, 2)); }
  else if (results.length === 0) { console.log(`no memory matches for: ${query}`); }
  else {
    for (const r of results) console.log(`${r.score.toFixed(2)}  [${r.kind}] ${r.file}\n    ${r.snippet.slice(0, 160)}`);
  }
}
