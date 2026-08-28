// The documentation is one connected island and a field of loose leaves.
//
// Measured over docs/, excluding machine summaries and translations: 156
// documents, 77 of which link to nothing and are linked to by nothing. Every one
// of the 18 ADRs links to another ADR; `ADR-009` has ten inbound references.
// Eighteen plans have none in either direction.
//
// This test does not try to connect them — see the reasoning in doc-links.mjs.
// It stops the number growing, the same ratchet the hardcoded-colour count uses,
// and for the same reason: a debt that is measured and frozen is being managed,
// a debt that is invisible is being accumulated.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listDocs, linkGraph } from '../../scripts/lib/doc-links.mjs';

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

test('the orphan count is frozen, and only shrinks deliberately', () => {
  // Raising this number means a document was added that connects to nothing.
  // Write the link, or lower the floor in the same commit that earns it.
  const FROZEN = 77;
  const { docs, orphans } = linkGraph('docs');
  assert.ok(orphans.length <= FROZEN,
    `${orphans.length} orphaned documents, up from ${FROZEN} of ${docs.length}. ` +
    `A new document must reference an existing one, or be referenced by one: ` +
    orphans.slice(FROZEN).join(', '));
  if (orphans.length < FROZEN) {
    assert.fail(`down to ${orphans.length} — lower FROZEN to ${orphans.length} so the ratchet keeps holding`);
  }
});
