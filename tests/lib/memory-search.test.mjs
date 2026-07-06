// Tests for the zero-dep BM25 memory recall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, buildIndex, search } from '../../scripts/lib/memory-search.mjs';

test('tokenize: lowercases, splits, drops stopwords + 1-char', () => {
  const t = tokenize('The Auth cache is a Gate, x!');
  assert.deepEqual(t, ['auth', 'cache', 'gate']); // "the/is/a" dropped, "x" too short
});

test('search: ranks the doc that actually contains the query terms first', () => {
  const docs = [
    { id: 'a', text: 'connection pool exhaustion under burst load, postgres timeout' },
    { id: 'b', text: 'frontend button color and css layout on the landing page' },
    { id: 'c', text: 'a pool of workers processing a queue' },
  ];
  const idx = buildIndex(docs);
  const res = search(idx, 'postgres connection pool exhaustion');
  assert.equal(res[0].id, 'a', 'the exhaustion doc ranks first');
  assert.ok(res.length >= 1);
  assert.ok(res.every(r => r.score > 0), 'only positive-score results returned');
});

test('search: rarer query terms (higher IDF) outrank common ones', () => {
  // "pool" appears in 2 docs (common), "iolta" in 1 (rare) — the rare-term doc wins.
  const docs = [
    { id: 'common', text: 'pool pool pool worker pool queue pool' },
    { id: 'rare', text: 'iolta trust accounting three-way reconciliation pool' },
  ];
  const idx = buildIndex(docs);
  const res = search(idx, 'iolta pool');
  assert.equal(res[0].id, 'rare', 'the doc with the rare term ranks first');
});

test('search: empty query and empty corpus are safe', () => {
  assert.deepEqual(search(buildIndex([]), 'anything'), []);
  assert.deepEqual(search(buildIndex([{ id: 'x', text: 'hello world' }]), '   '), []);
});

test('search: respects limit', () => {
  const docs = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, text: `cache eviction policy ${i}` }));
  const res = search(buildIndex(docs), 'cache eviction', { limit: 5 });
  assert.equal(res.length, 5);
});

test('search: returns a snippet around the matched terms', () => {
  const docs = [{ id: 'a', text: 'x '.repeat(200) + 'the SPECIFIC needle term here ' + 'y '.repeat(200) }];
  const res = search(buildIndex(docs), 'specific needle');
  assert.match(res[0].snippet.toLowerCase(), /needle/);
});
