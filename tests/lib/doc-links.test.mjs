// The documentation is one connected island and a field of loose leaves.
//
// First measured over docs/, excluding machine summaries and translations: 156
// documents, 77 of which linked to nothing and were linked to by nothing. Every
// one of the 18 ADRs links to another ADR; `ADR-009` has ten inbound references.
//
// The largest single cluster was `docs/plans` — eighteen plans with no link in
// either direction, a fifth of the whole debt. `docs/plans/README.md` is the
// inbound link for all eighteen: hand-written, one line per plan read off its own
// heading, with each plan's declared status left exactly as the plan declares it.
// That took the count to 58 of 160. It is the shape the rest of the debt closes
// in — a real index somebody wrote, not a generated link nobody meant.
//
// This test does not try to connect them — see the reasoning in doc-links.mjs.
// It stops the number growing, the same ratchet the hardcoded-colour count uses,
// and for the same reason: a debt that is measured and frozen is being managed,
// a debt that is invisible is being accumulated.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listDocs, linkGraph } from '../../scripts/lib/doc-links.mjs';

/**
 * Paths under docs/ that git is ignoring — local drafts, QA run logs, marketing
 * copy. They are documents on this machine and not documents in this
 * repository, and the ratchet below is about the repository.
 *
 * The filter is HERE and not in listDocs on purpose. listDocs also feeds the
 * board's docs tab through linkGraph, and the board is a local tool: a draft
 * nobody has committed yet is exactly what an author wants listed there.
 * Teaching the reader about git would fix this count by breaking that surface.
 *
 * Returns null when git cannot answer, and the caller skips rather than
 * guesses — a check that could not run must not look like a check that passed.
 */
function gitIgnoredDocs() {
  try {
    return new Set(
      execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', 'docs/'],
        { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split('\n').filter(Boolean),
    );
  } catch { return null; }
}

test('summaries and translations are copies, not documents', () => {
  // 20 `.summary.md` files and 11 translated READMEs sit under docs/. Counting
  // them made the board report 188 documents where there are 156, and put a
  // machine-written summary in the index beside the document it summarises.
  const docs = listDocs('docs');
  assert.equal(docs.filter((f) => f.endsWith('.summary.md')).length, 0);
  assert.equal(docs.filter((f) => /^docs\/[a-z]{2}(-[A-Z]{2})?\//.test(f)).length, 0);
  assert.ok(docs.length > 100, 'the real documents are still there');
});

test('a link is counted in both directions', () => {
  const read = (f) => ({
    'docs/a.md': 'see [b](b.md)',
    'docs/b.md': 'nothing here',
    'docs/c.md': 'alone',
  })[String(f)] ?? '';
  // listDocs walks the real tree, so this asserts on the resolver via the real
  // graph instead: a document that is only ever LINKED TO is not an orphan.
  const { inbound } = linkGraph('docs');
  const adr9 = [...inbound.keys()].find((k) => k.includes('ADR-009'));
  assert.ok(adr9, 'ADR-009 is in the corpus');
  assert.ok(inbound.get(adr9).length >= 5,
    'ADR-009 is cited across the repository — inbound links must count');
  void read;
});

test('the orphan count is frozen, and only shrinks deliberately', (t) => {
  // Raising this number means a document was added that connects to nothing.
  // Write the link, or lower the floor in the same commit that earns it.
  //
  // 55 for months, and it was never a property of the repository. It counted
  // gitignored local files — HN drafts, QA run logs, marketing copy — so the
  // main checkout read 55 of 164 and every worktree read 49 of 157 AT THE SAME
  // COMMIT. The ratchet asserts in both directions, so the same tree that made
  // it pass for one person made it fail for the next, and the failure said
  // "lower FROZEN to 49" — advice that would have turned the first person's
  // green red. A floor that moves with who is running it is not a ratchet;
  // it is the always-red gate this repository already knows stops being read.
  //
  // Ignored paths dropped, both trees now agree on 49, and the number means the
  // same thing in a clean clone as it does on a machine full of drafts.
  const FROZEN = 49;
  const ignored = gitIgnoredDocs();
  if (!ignored) return t.skip('git could not list ignored paths — the count would be the machine, not the repo');

  const g = linkGraph('docs');
  const docs = g.docs.filter((d) => !ignored.has(d));
  const orphans = g.orphans.filter((d) => !ignored.has(d));

  assert.ok(orphans.length <= FROZEN,
    `${orphans.length} orphaned documents, up from ${FROZEN} of ${docs.length}. ` +
    `A new document must reference an existing one, or be referenced by one: ` +
    orphans.slice(FROZEN).join(', '));
  if (orphans.length < FROZEN) {
    assert.fail(`down to ${orphans.length} — lower FROZEN to ${orphans.length} so the ratchet keeps holding`);
  }
});

test('an ignored file is not a document, whatever is lying around in docs/', () => {
  // The filter, exercised on a tree that definitely has something to filter,
  // rather than on whichever checkout happens to run this. A clean worktree has
  // nothing ignored under docs/, so asserting against the real tree would be
  // vacuous exactly where the bug lives.
  const dir = mkdtempSync(path.join(tmpdir(), 'doclinks-ignored-'));
  mkdirSync(path.join(dir, 'docs', 'drafts'), { recursive: true });
  writeFileSync(path.join(dir, '.gitignore'), 'docs/drafts/\n');
  writeFileSync(path.join(dir, 'docs', 'real.md'), '# Real, and alone');
  writeFileSync(path.join(dir, 'docs', 'drafts', 'local-note.md'), '# A local note, and alone');
  execFileSync('git', ['init', '-q'], { cwd: dir });

  const all = listDocs(path.join(dir, 'docs')).map((f) => path.relative(dir, f));
  assert.ok(all.includes('docs/drafts/local-note.md'), 'the reader still sees it — the board wants drafts listed');

  const ignored = new Set(
    execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', 'docs/'],
      { cwd: dir, encoding: 'utf8' }).split('\n').filter(Boolean),
  );
  assert.deepEqual(all.filter((d) => !ignored.has(d)), ['docs/real.md'],
    'the ratchet does not — two orphans on this machine, one in the repository');
});

// The translation filter was anchored to a literal leading `docs/`, so it worked
// only when the walk started at the relative path `docs`. The board serves other
// projects by absolute path; called that way the filter silently stopped matching
// and translations counted as documents. Silent is the problem — the count would
// have been wrong and looked right.
test('translations and summaries are excluded when the root is absolute', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'doclinks-abs-'));
  const docs = path.join(dir, 'docs');
  mkdirSync(path.join(docs, 'ru'), { recursive: true });
  mkdirSync(path.join(docs, 'adr'), { recursive: true });
  writeFileSync(path.join(docs, 'adr', 'ADR-001-a.md'), '# A');
  writeFileSync(path.join(docs, 'adr', 'ADR-001-a.summary.md'), '# A summary');
  writeFileSync(path.join(docs, 'ru', 'ADR-001-a.md'), '# А по-русски');

  const rel = listDocs(docs).map((f) => path.relative(dir, f));
  assert.deepEqual(rel, ['docs/adr/ADR-001-a.md'],
    'an absolute root must exclude the same copies a relative root excludes');
});
