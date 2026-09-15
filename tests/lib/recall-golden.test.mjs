// Does /recall's document search still find the answer, and point at the right
// part of it?
//
// tests/fixtures/recall-golden.json holds questions worded the way an operator
// half-remembers a decision, each with the document that answers it and, for a
// detail inside a long document, the section. hit@3 is "the answer is among the
// first three documents". Ranking by section was measured here and scored lower,
// so it did not ship: documents are ranked as before and the section is only a
// pointer. These tests pin that the pointer never reorders results, that ranking
// holds its measured floor, and that the pointer lands in the right section — and
// print the numbers, so a change reads as a number, not just a pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { gatherCorpus, searchMemory } from '../../scripts/lib/memory-search.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const GOLDEN = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/recall-golden.json'), 'utf8')).questions;
const corpus = gatherCorpus({ cwd: ROOT, source: 'docs' });

function hitAt3(granularity) {
  const misses = [];
  let hits = 0;
  for (const { q, doc } of GOLDEN) {
    const top = searchMemory({ query: q, cwd: ROOT, source: 'docs', limit: 3, corpus, granularity }).map((r) => r.file);
    if (top.includes(doc)) hits++; else misses.push(`${q} → wanted ${doc}, got ${top.join(', ') || 'nothing'}`);
  }
  return { hits, total: GOLDEN.length, rate: hits / GOLDEN.length, misses };
}

test('every golden answer is a document the corpus actually holds', () => {
  // A typo in the golden set would read as a ranking failure forever.
  const ids = new Set(corpus.map((d) => d.id));
  for (const { doc } of GOLDEN) {
    assert.ok(existsSync(path.join(ROOT, doc)), `${doc} does not exist`);
    assert.ok(ids.has(doc), `${doc} exists but is not in the docs corpus`);
  }
  assert.ok(GOLDEN.length >= 10, 'a golden set this small measures noise');
});

// Floors are measurements, not targets. Raise one when ranking improves; never
// lower one, and never reword a question, to make a change pass.
//
// 2026-09-15, first set (14 questions): whole-document ranking 12, ranking by
// section 10 — which is why the section is only a pointer inside a document
// ranked the old way. The set was then revised after an ai-eval-engineer review:
// four questions copied words from their document's title (measuring string
// matching, not recall) and none reached past a document's first section.
// On the revised set (16 questions) document ranking finds the answer 11 times,
// and the pointer lands in the right section 5 times out of 5.
const HIT_AT_3_FLOOR = 11;
const SECTION_POINTER_FLOOR = 5;

test('section pointers do not change which documents are returned, or their order', () => {
  // The section is where to open a result, not a second ranking. If this starts
  // failing, someone changed the ranking itself and hit@3 has to be re-measured.
  for (const { q } of GOLDEN) {
    const doc = searchMemory({ query: q, cwd: ROOT, source: 'docs', limit: 3, corpus, granularity: 'document' }).map((r) => r.file);
    const sec = searchMemory({ query: q, cwd: ROOT, source: 'docs', limit: 3, corpus, granularity: 'section' }).map((r) => r.file);
    assert.deepEqual(sec, doc, `order differs for: ${q}`);
  }
});

test('the section pointer lands in the section that answers the question', (t) => {
  // Only questions about a detail inside a long document name a section. For
  // those, finding the document is half the answer; the pointer is the other half.
  const withSection = GOLDEN.filter((g) => g.section);
  assert.ok(withSection.length >= SECTION_POINTER_FLOOR, 'the set still carries section questions');
  let right = 0;
  const wrong = [];
  for (const { q, doc, section } of withSection) {
    const hit = searchMemory({ query: q, cwd: ROOT, source: 'docs', limit: 3, corpus }).find((r) => r.file === doc);
    if (hit && String(hit.section ?? '').startsWith(section)) right++;
    else wrong.push(`${q} → wanted § ${section}, got ${hit ? `§ ${hit.section} (line ${hit.line})` : 'document not in top 3'}`);
  }
  t.diagnostic(`section pointer: ${right}/${withSection.length} (floor ${SECTION_POINTER_FLOOR})`);
  assert.ok(right >= SECTION_POINTER_FLOOR, `section pointer dropped to ${right}:\n  ${wrong.join('\n  ')}`);
});

test('recall holds its measured hit@3 on the golden set', (t) => {
  const r = hitAt3('section');
  t.diagnostic(`hit@3: ${r.hits}/${r.total} (floor ${HIT_AT_3_FLOOR})`);
  for (const m of r.misses) t.diagnostic(`miss: ${m}`);
  assert.ok(r.hits >= HIT_AT_3_FLOOR,
    `hit@3 dropped to ${r.hits} of ${r.total} (floor ${HIT_AT_3_FLOOR}):\n  ${r.misses.join('\n  ')}`);
});
