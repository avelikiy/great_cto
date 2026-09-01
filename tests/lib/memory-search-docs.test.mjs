// Ranked full-text over `docs/` was the one thing a documentation site gives
// that this board did not have. It needed no dependency — only pointing the BM25
// already in this file at a corpus it was not looking at.
//
// What is asserted is mostly about the boundaries, because the search itself is
// covered by memory-search.test.mjs and because every defect this addition could
// introduce is a wrong answer that looks like a right one: `all` quietly growing
// by a hundred and sixty documents, a mistyped source searching nothing, or an
// absent corpus reporting "no matches".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gatherCorpus, searchMemory, SOURCES } from '../../scripts/lib/memory-search.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CLI = path.join(ROOT, 'scripts/lib/memory-search.mjs');

function run(args, opts = {}) {
  try {
    return { out: execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...opts }), code: 0 };
  } catch (e) {
    return { out: (e.stdout ?? '') + (e.stderr ?? ''), code: e.status };
  }
}

test('docs is a source, and it finds the document that answers the query', () => {
  const hits = searchMemory({ query: 'gate reversibility expensive to undo', cwd: ROOT, source: 'docs', limit: 3 });
  assert.ok(hits.length > 0, 'the docs corpus produced results');
  assert.equal(hits[0].kind, 'doc');
  assert.match(hits[0].file, /ADR-009/,
    'the ADR that IS this subject ranks first — if it does not, the corpus or the ranking is wrong');
});

test('a result names a path you can open, not a basename that could be anything', () => {
  const hits = searchMemory({ query: 'plans index orphaned', cwd: ROOT, source: 'docs', limit: 5 });
  assert.ok(hits.every((h) => h.file.startsWith('docs/')),
    'every doc result is identified by its path under docs/');
});

test('`all` did not silently grow by the documentation corpus', () => {
  // The reason `docs` is opt-in. /resume and architect-pattern-lookup run against
  // `all` and were tuned against a corpus of tens of short memory documents;
  // folding 160 design documents in would change what they surface with nothing
  // said and no test failing.
  const all = gatherCorpus({ cwd: ROOT, source: 'all' });
  const docs = gatherCorpus({ cwd: ROOT, source: 'docs' });
  assert.ok(docs.length > 50, 'there is a real docs corpus to have swamped it with');
  assert.equal(all.filter((d) => d.kind === 'doc').length, 0,
    '`all` is the memory corpus; docs must be asked for by name');
});

test('the two global memory files stay distinguishable from the project\'s own', () => {
  // `basename` collapsed ~/.great_cto/decisions.md and .great_cto/decisions.md
  // into one label, so a result could not be traced to the file it came from.
  const corpus = gatherCorpus({ cwd: ROOT, source: 'memory' });
  const ids = corpus.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'no two documents share an id');
});

test('an empty corpus says so — it never reports "no matches"', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-ms-'));
  const r = run(['anything', '--source', 'docs', '--cwd', dir]);
  assert.equal(r.code, 0);
  assert.match(r.out, /nothing to search/,
    'a corpus that does not exist must not read as a corpus that was consulted');
  assert.doesNotMatch(r.out, /no matches/);
  rmSync(dir, { recursive: true, force: true });
});

test('a real corpus with no hit says how much it looked through', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-ms-'));
  mkdirSync(path.join(dir, 'docs'));
  writeFileSync(path.join(dir, 'docs/a.md'), '# Caching\n\nAbout the cache.\n');
  const r = run(['zzqqxxnothing', '--source', 'docs', '--cwd', dir]);
  assert.match(r.out, /no matches in 1 docs document/);
  rmSync(dir, { recursive: true, force: true });
});

test('a mistyped source is refused, not silently searched as nothing', () => {
  const r = run(['gate', '--source', 'dosc']);
  assert.equal(r.code, 2, 'exit 2, the invocation error');
  assert.match(r.out, /unknown --source 'dosc'/);
  assert.ok(SOURCES.has('docs') && SOURCES.has('all'), 'the valid set is exported and current');
});

test('summaries and translations are excluded, because doc-links defines the corpus', () => {
  const corpus = gatherCorpus({ cwd: ROOT, source: 'docs' });
  assert.equal(corpus.filter((d) => d.id.endsWith('.summary.md')).length, 0);
  assert.equal(corpus.filter((d) => /^docs\/[a-z]{2}(-[A-Z]{2})?\//.test(d.id)).length, 0);
});
