// A ranked list must not hide the part of the question nothing answers.
//
// BM25 returns any document matching any term, so "eviction kubernetes" comes
// back with the caching doc at the top even though no document mentions
// kubernetes. The search names that term, and each result says which terms it
// matched — so a partial match reads as partial, not as the answer.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { missingTerms, searchMemory, gatherCorpus } from '../../scripts/lib/memory-search.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CLI = path.join(ROOT, 'scripts/lib/memory-search.mjs');
const TMP = [];
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true }); });

function tree() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-gap-'));
  TMP.push(dir);
  mkdirSync(path.join(dir, 'docs'));
  writeFileSync(path.join(dir, 'docs/cache.md'), '# Caching\n\n## Eviction\nEntries expire; eviction is least-recently-used.\n');
  writeFileSync(path.join(dir, 'docs/auth.md'), '# Auth\n\nRefresh tokens rotate.\n');
  return dir;
}

const cli = (args) => execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('a term no document contains is named; a term that is present never is', () => {
  const cwd = tree();
  const corpus = gatherCorpus({ cwd, source: 'docs' });
  assert.deepEqual(missingTerms(corpus, 'eviction kubernetes'), ['kubernetes']);
  assert.deepEqual(missingTerms(corpus, 'eviction tokens'), []);
});

test('each result says which of the query terms it matched', () => {
  const cwd = tree();
  const [hit] = searchMemory({ query: 'eviction kubernetes', cwd, source: 'docs' });
  assert.equal(hit.file, 'docs/cache.md');
  assert.deepEqual(hit.matched, ['eviction']);
});

test('the CLI prints the gap next to the results', () => {
  const cwd = tree();
  const out = cli(['eviction kubernetes', '--source', 'docs', '--cwd', cwd]);
  assert.match(out, /not in any docs document: kubernetes/);
  assert.match(out, /docs\/cache\.md/);
});

test('a query matching nothing names every term, after saying how much it read', () => {
  const cwd = tree();
  const out = cli(['kubernetes helm', '--source', 'docs', '--cwd', cwd]);
  assert.match(out, /no matches in 2 docs document/);
  assert.match(out, /not in any docs document: kubernetes, helm/);
});

test('a fully answered query prints no gap line, and --json carries the gap as data', () => {
  const cwd = tree();
  assert.doesNotMatch(cli(['eviction', '--source', 'docs', '--cwd', cwd]), /not in any/);
  const j = JSON.parse(cli(['eviction kubernetes', '--source', 'docs', '--cwd', cwd, '--json']));
  assert.deepEqual(j.missing, ['kubernetes']);
  assert.deepEqual(j.results[0].matched, ['eviction']);
});

test('an empty corpus reports nothing to search, not a gap', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-gap-empty-'));
  TMP.push(dir);
  const out = cli(['kubernetes', '--source', 'docs', '--cwd', dir]);
  assert.match(out, /nothing to search/);
  assert.doesNotMatch(out, /not in any/, 'with no corpus, "not in any document" would be vacuously true and misleading');
});
