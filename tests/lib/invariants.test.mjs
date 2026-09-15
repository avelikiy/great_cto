// docs/INVARIANTS.md is a checkable list, so check it: every invariant has a
// stable id and a verify line, and every file a verify line names exists. A
// renamed test must not leave an invariant pointing at nothing — that is an
// unchecked rule that still reads as checked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const TEXT = readFileSync(path.join(ROOT, 'docs/INVARIANTS.md'), 'utf8');

/** Each `- **INV-NNN**` bullet up to the next bullet or heading. */
function invariants(text) {
  const out = [];
  const re = /^- \*\*(INV-\d{3})\*\*([\s\S]*?)(?=^- \*\*INV-|^## |(?![\s\S]))/gm;
  for (const m of text.matchAll(re)) out.push({ id: m[1], body: m[2] });
  return out;
}

const ALL = invariants(TEXT);

test('there are invariants, and the parser found every id in the file', () => {
  assert.ok(ALL.length >= 10);
  const mentioned = new Set(TEXT.match(/^- \*\*INV-\d{3}\*\*/gm).map((s) => s.slice(4, 11)));
  assert.equal(ALL.length, mentioned.size);
});

test('ids are unique and ascending', () => {
  const ids = ALL.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'an id is never reused');
  assert.deepEqual([...ids].sort(), ids, 'ids appear in order');
});

test('every live invariant has a verify line', () => {
  for (const { id, body } of ALL) {
    if (/RETIRED/.test(body)) continue;
    assert.match(body, /verify:/, `${id} has no verify: line`);
  }
});

test('every file a verify line names exists', () => {
  for (const { id, body } of ALL) {
    const verify = body.slice(body.indexOf('verify:'));
    for (const [, p] of verify.matchAll(/`([^`]+\.(?:mjs|js|ts|sh|md|json))`/g)) {
      assert.ok(existsSync(path.join(ROOT, p)), `${id}: verify names ${p}, which does not exist`);
    }
  }
});

test('an invariant with no check says why, instead of naming nothing', () => {
  for (const { id, body } of ALL) {
    const verify = body.slice(body.indexOf('verify:'));
    const namesAFile = /`[^`]+\.(?:mjs|js|ts|sh|md|json)`/.test(verify);
    if (namesAFile) continue;
    assert.match(verify, /verify:\s*none yet\s*—\s*\S/, `${id}: no file named and no stated reason`);
  }
});
