// The docs corpus is ranked by heading section, and a result says where to open
// the document — not only which document it is.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { splitSections, searchMemory, gatherCorpus } from '../../scripts/lib/memory-search.mjs';

const TMP = [];
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true }); });

test('a document splits at #, ## and ### headings, with line numbers', () => {
  const s = splitSections('# Title\nintro\n\n## Why\nbecause\n### Detail\nmore\n#### Not a split\nstill detail\n');
  assert.deepEqual(s.map((x) => [x.heading, x.level, x.line]), [['Title', 1, 1], ['Why', 2, 4], ['Detail', 3, 6]]);
  assert.match(s[2].text, /Not a split/, 'a level-4 heading stays inside its section');
});

test('a heading inside a code fence is not a heading', () => {
  const s = splitSections('# Doc\n```bash\n# a shell comment\n```\n## Real\nx\n');
  assert.deepEqual(s.map((x) => x.heading), ['Doc', 'Real']);
  assert.match(s[0].text, /a shell comment/);
});

test('text before the first heading is kept, not dropped', () => {
  const s = splitSections('preamble line\n\n# First\nbody\n');
  assert.equal(s[0].heading, '');
  assert.match(s[0].text, /preamble/);
  assert.equal(s[1].line, 3);
});

function docsTree() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-sections-'));
  TMP.push(dir);
  mkdirSync(path.join(dir, 'docs'));
  writeFileSync(path.join(dir, 'docs/cache.md'),
    '# Caching decisions\n\n## Background\nWe looked at several stores.\n\n## Eviction\nEntries expire after ten minutes; eviction is least-recently-used.\n');
  writeFileSync(path.join(dir, 'docs/auth.md'), '# Auth\n\n## Tokens\nRefresh tokens rotate on use.\n');
  return dir;
}

test('a docs result names the section and the line to open', () => {
  const cwd = docsTree();
  const [hit] = searchMemory({ query: 'eviction expire', cwd, source: 'docs', limit: 3 });
  assert.equal(hit.file, 'docs/cache.md');
  assert.equal(hit.section, 'Eviction');
  assert.equal(hit.line, 6);
  assert.match(hit.snippet, /least-recently-used/);
});

test('one result per document, however many of its sections match', () => {
  const cwd = docsTree();
  const hits = searchMemory({ query: 'caching stores eviction', cwd, source: 'docs', limit: 5 });
  const files = hits.map((h) => h.file);
  assert.equal(new Set(files).size, files.length);
});

test('a section inherits its document title, so a generic heading still ranks', () => {
  const cwd = docsTree();
  // "caching" appears only in the title, "several" only in the Background section.
  const [hit] = searchMemory({ query: 'caching several', cwd, source: 'docs', limit: 1 });
  assert.equal(hit.file, 'docs/cache.md');
  assert.equal(hit.section, 'Background');
});

test('a section pointer never reorders the documents', () => {
  const cwd = docsTree();
  const corpus = gatherCorpus({ cwd, source: 'docs' });
  for (const q of ['eviction', 'tokens rotate', 'caching stores', 'auth refresh expire']) {
    const doc = searchMemory({ query: q, cwd, source: 'docs', corpus, granularity: 'document' }).map((h) => h.file);
    const sec = searchMemory({ query: q, cwd, source: 'docs', corpus, granularity: 'section' }).map((h) => h.file);
    assert.deepEqual(sec, doc, q);
  }
});

test('the memory corpus keeps document ranking — no section fields', () => {
  const cwd = docsTree();
  const corpus = gatherCorpus({ cwd, source: 'docs' });
  const [hit] = searchMemory({ query: 'eviction', cwd, source: 'docs', corpus, granularity: 'document' });
  assert.equal(hit.file, 'docs/cache.md');
  assert.equal(hit.section, undefined);
  assert.equal(hit.line, undefined);
});
