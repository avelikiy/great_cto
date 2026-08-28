// Tests for packages/board/lib/docs.mjs — what the Documents screen says about a
// document before you open it: which group it belongs to, and whether anything
// is wrong with it.
//
// Both were measured wrong on the live board at localhost:3141 before this
// suite existed:
//
//   · `unknown` sat on 198 of 217 documents in one project and 148 of 187 here.
//     A mark on nine rows in ten distinguishes nothing — and it was standing for
//     "declares no stale_after", which is the NORM: zero of 1634 md files in one
//     project declare one, five of 2541 here.
//   · 165 of 217 documents fell into "Other" — a classifier recognising 24% of
//     the corpus, because it read only paths (`docs/adr`, `docs/plans`) that are
//     this repository's conventions and not anyone else's.
//
// So these tests lock PROPERTIES, not the numbers of the day: absence of a
// declared date is never a finding about the document; the three freshness
// states stay three; nothing is ever dropped from the listing; and "Other" is
// not the largest group on a real tree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DOC_GROUPS, groupFor, listDocs } from '../../packages/board/lib/docs.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GROUP_KEYS = new Set(DOC_GROUPS.map((g) => g.key));

/** A throwaway project tree: `{ 'docs/x.md': '# X' }` → a root to hand listDocs. */
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-docs-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return root;
}

/** Every listed document, flattened out of its group. */
function allDocs(root) {
  return listDocs(root).groups.flatMap((g) => g.docs);
}

function byPath(root, rel) {
  const d = allDocs(root).find((x) => x.path === rel);
  assert.ok(d, `expected ${rel} to be listed`);
  return d;
}

// ─── Freshness: declaring nothing is the norm, not a defect ──────────────────

test('a document that declares no review date carries no verdict at all', () => {
  const root = tree({ 'docs/notes.md': '# Notes\n\nProse, no frontmatter, no date.\n' });
  const d = byPath(root, 'docs/notes.md');

  // The property: nothing about this document is being reported. Not "unknown",
  // not "stale" — a caller can skip the badge with `if (!doc.freshness)`.
  assert.equal(d.freshness, null);
  assert.equal(d.freshnessBasis, 'undeclared');
  assert.notEqual(d.freshness, 'unknown');
  assert.notEqual(d.freshness, 'stale');
});

test('the three states stay three and stay distinct', () => {
  const root = tree({
    'docs/expired.md': '---\nstale_after: 2000-01-01\n---\n# Expired\n',
    'docs/current.md': '---\nstale_after: 2099-01-01\n---\n# Current\n',
    'docs/silent.md': '# Silent\n',
  });
  const verdicts = ['expired', 'current', 'silent'].map((n) => byPath(root, `docs/${n}.md`).freshness);

  assert.deepEqual(verdicts, ['stale', 'fresh', null]);
  assert.equal(new Set(verdicts).size, 3, 'the third state must not collapse into either of the other two');
});

test('an undeclared document still explains itself — the payload lost nothing', () => {
  const root = tree({ 'docs/notes.md': '# Notes\n' });
  const d = byPath(root, 'docs/notes.md');
  assert.equal(typeof d.freshnessWhy, 'string');
  assert.ok(d.freshnessWhy.length > 0);
  assert.ok('staleAfter' in d);
});

test('a file that could not be read is NOT filed with the ordinary majority', (t) => {
  const root = tree({ 'docs/locked.md': '# Locked\n' });
  const abs = path.join(root, 'docs/locked.md');
  fs.chmodSync(abs, 0o000);
  try { fs.readFileSync(abs, 'utf8'); t.skip('this user can read a 000 file — nothing to assert'); return; }
  catch { /* genuinely unreadable, which is the case under test */ }

  const d = byPath(root, 'docs/locked.md');
  // Unreadable is the one absence that IS a defect: we cannot say the document
  // is fine, so it must not look like the 148 documents that simply said nothing.
  assert.equal(d.freshnessBasis, 'unreadable');
  assert.notEqual(d.freshness, null);
  assert.notEqual(d.freshness, 'fresh');
  fs.chmodSync(abs, 0o600);
});

test('a declared date still decides, in both directions', () => {
  const root = tree({
    // An old `**Date:**` next to a live `stale_after` — declared wins, as ADR-011 says.
    'docs/a.md': '---\nstale_after: 2099-01-01\n---\n# A\n**Date:** 2000-01-01\n',
    'docs/b.md': '# B\n**Date:** 2000-01-01\n',
  });
  assert.equal(byPath(root, 'docs/a.md').freshness, 'fresh');
  assert.equal(byPath(root, 'docs/b.md').freshness, 'stale');
});

// ─── Classification: signals, in the order they earn ─────────────────────────

test('the leading filename token outranks the directory it sits in', () => {
  // The 14 documents that bought this ordering: docs/adr/ADR-0NN-*.md
  // were being filed as Architecture, when an ADR is a decision.
  assert.equal(groupFor('docs/adr/ADR-019-hook-execution-modes.md'), 'decisions');
  assert.equal(groupFor('docs/design/PLAN-visual-redesign.md'), 'plans');
  assert.equal(groupFor('docs/audit/AUDIT-2026-08-25.md'), 'reviews');
});

test('a token buried mid-name does NOT outrank the directory', () => {
  // There the word is the subject, not the type: this is a plan about a UX flow,
  // filed in a plans directory, and it must stay a plan.
  assert.equal(groupFor('docs/superpowers/plans/2026-05-23-flow-compiler-ux.md'), 'plans');
  assert.equal(groupFor('docs/superpowers/plans/2026-04-16-blog-quality-improvement.md'), 'plans');
});

test('a leading date is skipped, not read as a type', () => {
  assert.equal(groupFor('docs/uat/UAT-2026-08-21-0824.md'), 'reviews');
  assert.equal(groupFor('docs/00_Backlog.md'), 'plans');
});

test('a directory nobody hard-coded still classifies, deepest segment first', () => {
  // None of these paths existed in the hard-coded list, and all of them were
  // `other` before: 29 impl-briefs, 50 research reports, 17 runbooks.
  assert.equal(groupFor('docs/impl-briefs/IMPL-BRIEF-x-3y7.1.md'), 'plans');
  assert.equal(groupFor('docs/research/2026-04-06-max-backtest.md'), 'reviews');
  assert.equal(groupFor('docs/runbooks/key_rotation.md'), 'guides');
  assert.equal(groupFor('docs/sec-threats/TM-web-wallet.md'), 'reviews');
  assert.equal(groupFor('docs/design-brief/01-APP-FUNCTIONALITY.md'), 'design');
});

test('front-matter the author wrote outranks every guess made from a name', () => {
  const text = '---\ntype: ADR\n---\n# Something\n';
  assert.equal(groupFor('docs/misc/whatever.md', { text }), 'decisions');
  assert.equal(groupFor('docs/misc/whatever.md'), 'other', 'without the declaration there is nothing to go on');
});

test('the first heading is consulted only when the path and the name say nothing', () => {
  assert.equal(groupFor('docs/misc/whatever.md', { text: '# QA report — the board\n' }), 'reviews');
  // …and only its opening words. Four words in, a page ABOUT the readme was
  // being filed as the project's front page.
  assert.equal(groupFor('docs/DETAILS.md', { text: '# The details the README used to carry\n' }), 'other');
});

test('a bare README does not outrank a directory that names a type', () => {
  assert.equal(groupFor('docs/uat/README.md'), 'reviews');
  assert.equal(groupFor('docs/benchmarks/briefs/README.md'), 'design');
  assert.equal(groupFor('docs/ru/README.md'), 'state');
});

// ─── Nothing is ever dropped ─────────────────────────────────────────────────

test('a document that classifies nowhere is still listed', () => {
  const root = tree({ 'docs/zzz-unguessable.md': '# Zzz\n' });
  const d = byPath(root, 'docs/zzz-unguessable.md');
  assert.equal(d.group, 'other');
});

test('every listed document lands in a group that exists, and every file is listed', () => {
  const files = {
    'README.md': '# R\n',
    'docs/adr/ADR-001-x.md': '# ADR-001\n',
    'docs/marketing/launch-post.md': '# Launch\n',
    'docs/runbooks/rotate.md': '# Rotate\n',
    'docs/deep/deeper/still/PLAN-x.md': '# Plan\n',
  };
  const root = tree(files);
  const listed = allDocs(root);

  assert.equal(listed.length, Object.keys(files).length, 'classification must not lose a file');
  for (const d of listed) assert.ok(GROUP_KEYS.has(d.group), `${d.path} → unknown group ${d.group}`);
});

// ─── The measured property, on a real tree ───────────────────────────────────
//
// A synthetic fixture proves the rules fire. Only a real corpus proves they fire
// often enough — which is the whole defect: the old classifier passed every unit
// test it had while recognising 24% of a live project.

test('on this repository, "Other" is not the largest group', () => {
  const { total, groups } = listDocs(REPO);
  assert.ok(total > 50, `expected a real corpus, got ${total} documents`);

  const sizes = groups.map((g) => [g.key, g.docs.length]).sort((a, b) => b[1] - a[1]);
  const other = groups.find((g) => g.key === 'other')?.docs.length ?? 0;

  assert.notEqual(sizes[0][0], 'other', `largest group is "other" (${JSON.stringify(sizes)})`);
  assert.ok(other / total < 0.25,
    `"other" holds ${other}/${total} = ${(100 * other / total).toFixed(1)}% — it has stopped classifying`);
});

test('on this repository, the freshness mark is on a minority of rows', () => {
  const docs = allDocs(REPO);
  const marked = docs.filter((d) => d.freshness !== null);

  // The defect in one line: a badge that appears on nearly every row carries no
  // information. It was 148/187 here and 198/217 in another project.
  assert.ok(marked.length / docs.length < 0.5,
    `${marked.length}/${docs.length} documents carry a freshness verdict — that is a badge on every row again`);

  // And the reason it shrank must be the right one: undeclared means no verdict,
  // never a quiet "fresh".
  for (const d of docs) {
    if (d.freshnessBasis === 'undeclared') assert.equal(d.freshness, null, `${d.path}`);
    if (d.freshness === null) assert.equal(d.freshnessBasis, 'undeclared', `${d.path}`);
  }
});

// ── What the screen counts, and what it can say about a row ──────────────────
//
// Two changes the CTO approved after the inbound-link distribution was measured:
// 105 of 156 documents have no inbound reference at all. A badge on two rows in
// three marks nothing, so the screen reports the citation COUNT per row instead
// and lets the reader sort by it. Zero is then visible without being shouted.

test('a machine summary and a translation are not documents', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boarddocs-'));
  fs.mkdirSync(path.join(dir, 'docs', 'adr'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'ru'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'adr', 'ADR-001-a.md'), '# A');
  fs.writeFileSync(path.join(dir, 'docs', 'adr', 'ADR-001-a.summary.md'), '# A summary');
  fs.writeFileSync(path.join(dir, 'docs', 'ru', 'ADR-001-a.md'), '# А');

  const paths = listDocs(dir).groups.flatMap((g) => g.docs.map((d) => d.path));
  assert.ok(paths.includes('docs/adr/ADR-001-a.md'), 'the document itself is listed');
  assert.equal(paths.filter((p) => p.endsWith('.summary.md')).length, 0,
    'a generated summary is a copy of a document, not another document');
  assert.equal(paths.filter((p) => p.startsWith('docs/ru/')).length, 0,
    'a translation is a copy of a document, not another document');
});

test('a row carries how many documents cite it — and null when unmeasured', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boarddocs-in-'));
  fs.mkdirSync(path.join(dir, 'docs', 'adr'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'adr', 'ADR-001-a.md'), '# A\n');
  fs.writeFileSync(path.join(dir, 'docs', 'adr', 'ADR-002-b.md'),
    '# B\n\nsee [A](./ADR-001-a.md) and again [A](ADR-001-a.md)\n');
  fs.writeFileSync(path.join(dir, 'README.md'), '# readme\n');

  const byPath = new Map(listDocs(dir).groups.flatMap((g) => g.docs).map((d) => [d.path, d]));

  assert.equal(byPath.get('docs/adr/ADR-001-a.md').inbound, 1,
    'one document cites A, twice — that is one citing document, not two');
  assert.equal(byPath.get('docs/adr/ADR-002-b.md').inbound, 0,
    'nothing cites B: measured, and the answer is zero');
  assert.equal(byPath.get('README.md').inbound, null,
    'README is outside the docs graph — "not measured" must not render as zero, '
    + 'which is the one substitution this board exists to refuse');
});
