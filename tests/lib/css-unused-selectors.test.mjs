// A stylesheet accumulated 281 rules for classes no page rendered — 36% of its
// bytes. The cost was not weight. A contrast audit of the same file reported 15
// rules under the WCAG floor and 11 of them were phantoms, which is how a guard
// teaches its reader to skim past the 4 real ones.
//
// The hard part is not finding unused classes. It is not deleting a live one:
// `classList.add('p-flash')` never appears in a class attribute, and p-flash was
// in the first cut of a delete list built by grepping markup.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audit, declaredClasses } from '../../scripts/lib/css-unused-selectors.mjs';

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'css-unused-'));
  for (const [rel, body] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, body);
  }
  return dir;
}

test('declaredClasses ignores comments and at-rules', () => {
  const c = declaredClasses(`
    /* .commented-out { color: red } */
    @media (min-width: 40rem) { .inside-media { color: blue } }
    .real { color: green }
  `);
  assert.ok(c.has('real'));
  assert.ok(c.has('inside-media'), 'a class inside @media is still declared');
  assert.ok(!c.has('commented-out'), 'a class named in a comment is not declared');
});

test('a class no page renders and no code names is reported', () => {
  const dir = fixture({
    'styles.css': '.live { color: #111 } .dead { color: #222 }',
    'index.html': '<div class="live">hello</div>',
  });
  try {
    const r = audit(join(dir, 'styles.css'), dir);
    assert.equal(r.state, 'findings');
    assert.deepEqual(r.unused, ['dead']);
    assert.equal(r.pages, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a class added at runtime is left alone, not reported', () => {
  // The p-flash case, exactly: styled in CSS, never written in markup, applied
  // by script. Reporting it is how a working page gets broken by a cleanup.
  const dir = fixture({
    'styles.css': '.p-flash { color: #111 } .truly-dead { color: #222 }',
    'index.html': '<div id="x">hello</div>',
    'app.js': "document.getElementById('x').classList.add('p-flash');",
  });
  try {
    const r = audit(join(dir, 'styles.css'), dir);
    assert.deepEqual(r.unused, ['truly-dead']);
    assert.deepEqual(r.mentioned, ['p-flash'], 'named in code — reported as mentioned, never as unused');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a class built by interpolation counts as mentioned', () => {
  const dir = fixture({
    'styles.css': '.tone-warn { color: #111 }',
    'index.html': '<div></div>',
    'gen.mjs': 'const cls = `tone-warn`; export default cls;',
  });
  try {
    const r = audit(join(dir, 'styles.css'), dir);
    assert.deepEqual(r.unused, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('no pages found is unreadable, never "everything is unused"', () => {
  // The failure that would do the most damage: a wrong --root reports every
  // class as dead, and the report looks exactly like a real finding.
  const dir = fixture({ 'styles.css': '.a { color: #111 } .b { color: #222 }' });
  const empty = mkdtempSync(join(tmpdir(), 'css-unused-empty-'));
  try {
    const r = audit(join(dir, 'styles.css'), empty);
    assert.equal(r.state, 'unreadable');
    assert.deepEqual(r.unused, [], 'an unreadable sweep reports nothing to act on');
    assert.match(r.reason, /no HTML found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});

test('a missing stylesheet is unreadable, not clean', () => {
  const dir = fixture({ 'index.html': '<div class="x"></div>' });
  try {
    const r = audit(join(dir, 'nope.css'), dir);
    assert.equal(r.state, 'unreadable');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the walk does not follow a symlink into another tree', () => {
  // This repository has twice had a script follow a sibling symlink and edit
  // the wrong repository. Here the damage would be quieter: classes from
  // somebody else's pages would make dead rules look live.
  const other = fixture({ 'their.html': '<div class="theirs"></div>' });
  const dir = fixture({
    'styles.css': '.theirs { color: #111 }',
    'index.html': '<div></div>',
  });
  try {
    symlinkSync(other, join(dir, 'neighbour'));
    const r = audit(join(dir, 'styles.css'), dir);
    assert.deepEqual(r.unused, ['theirs'], 'a class used only across the symlink does not count as rendered');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});

test('all classes rendered is ok', () => {
  const dir = fixture({
    'styles.css': '.a { color: #111 }',
    'index.html': '<div class="a"></div>',
  });
  try {
    assert.equal(audit(join(dir, 'styles.css'), dir).state, 'ok');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
