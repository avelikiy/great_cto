// "Nothing is waiting on you" was true of the project and false of the person.
// This is the reader that lets the headline be about the person, tested with
// stub projects so no beads store is needed behind each one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inboxElsewhere } from './lib/data-readers.mjs';

// Real directories, because the current-project check resolves real paths.
function dirs(n) {
  return Array.from({ length: n }, (_, i) => mkdtempSync(join(tmpdir(), `gcto-elsewhere-${i}-`)));
}

test('counts P0s and gates in every project but this one', () => {
  const [cur, a, b] = dirs(3);
  try {
    const inboxes = {
      [cur]: { summary: { p0: 9, gates: 9 } },   // must be ignored — this is "here"
      [a]: { summary: { p0: 2, gates: 0 } },
      [b]: { summary: { p0: 0, gates: 1 } },
    };
    const out = inboxElsewhere(
      [{ slug: 'cur', path: cur }, { slug: 'a', path: a }, { slug: 'b', path: b }],
      cur,
      { readInbox: (p) => inboxes[p] },
    );
    assert.equal(out.p0, 2);
    assert.equal(out.gates, 1);
    assert.deepEqual(out.projects.map((p) => p.slug).sort(), ['a', 'b']);
    assert.deepEqual(out.unreadable, []);
  } finally { for (const d of [cur, a, b]) rmSync(d, { recursive: true, force: true }); }
});

test('a project whose inbox cannot be read is named, not counted as zero', () => {
  const [cur, a, broken] = dirs(3);
  try {
    const out = inboxElsewhere(
      [{ slug: 'cur', path: cur }, { slug: 'a', path: a }, { slug: 'broken', path: broken }],
      cur,
      { readInbox: (p) => { if (p === broken) throw new Error('dolt lock'); return { summary: { p0: 1, gates: 0 } }; } },
    );
    assert.equal(out.p0, 1, 'the readable project still counts');
    assert.deepEqual(out.unreadable, ['broken'], 'the unreadable one is listed by name');
    assert.equal(out.projects.length, 1);
  } finally { for (const d of [cur, a, broken]) rmSync(d, { recursive: true, force: true }); }
});

test('nothing elsewhere is an honest zero, and a quiet project is not listed', () => {
  const [cur, a] = dirs(2);
  try {
    const out = inboxElsewhere([{ slug: 'cur', path: cur }, { slug: 'a', path: a }], cur,
      { readInbox: () => ({ summary: { p0: 0, gates: 0 } }) });
    assert.deepEqual(out, { p0: 0, gates: 0, projects: [], unreadable: [] });
  } finally { for (const d of [cur, a]) rmSync(d, { recursive: true, force: true }); }
});

test('the current project is matched by resolved path, not by string', () => {
  const [cur, a] = dirs(2);
  try {
    // A trailing slash and a `..` hop must still mean "here".
    const out = inboxElsewhere([{ slug: 'cur', path: `${cur}/` }, { slug: 'a', path: a }], join(cur, 'x', '..'),
      { readInbox: (p) => ({ summary: { p0: 5, gates: 0 } }) });
    assert.equal(out.p0, 5, 'only the other project was counted');
    assert.deepEqual(out.projects.map((p) => p.slug), ['a']);
  } finally { for (const d of [cur, a]) rmSync(d, { recursive: true, force: true }); }
});
