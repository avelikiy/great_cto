// A secret sitting in a file that every session reads.
//
// `~/.great_cto/preferences.md` is a global L4 memory layer, and a SessionStart
// hook `cat`s it into context unconditionally, in every project. That is the
// file's purpose. A token placed in it therefore reaches every session, every
// project, and every transcript — measured on this machine at 29 transcripts and
// 102 occurrences from one line.
//
// Neither half was broken. `secret-scan` guards Edit | Write | MultiEdit and
// works; the global layer is global by design. What was missing sat between
// them: nothing asked whether a secret was ALREADY in the file about to be
// poured into context. A secret arriving by any other path — a Bash redirect, a
// hand edit, another editor — travelled silently and permanently.
//
// This checks at rest, before the read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanMemoryFile } from '../../scripts/lib/memory-secret-scan.mjs';

const AWS = 'AKIA' + 'ABCDEFGHIJKLMNOP';

test('a clean file is emitted, and says it was checked', () => {
  const r = scanMemoryFile('p.md', () => '# prefs\n\nRussian, tables, no fluff.\n');
  assert.equal(r.state, 'clean');
  assert.match(r.content, /no fluff/);
});

test('a file holding a secret is NOT emitted', () => {
  const r = scanMemoryFile('p.md', () => `# prefs\n\nkey: ${AWS}\n`);
  assert.equal(r.state, 'withheld');
  assert.equal(r.content, '', 'the point is that the content does not reach the context');
});

test('the warning names the file and the pattern, never the value', () => {
  const r = scanMemoryFile('/home/u/.great_cto/preferences.md', () => `token ${AWS}\n`);
  assert.match(r.message, /preferences\.md/);
  assert.match(r.message, /AWS Access Key/);
  assert.ok(!r.message.includes(AWS),
    'printing the secret in the warning would put it in the context this exists to protect');
});

test('it names the line so the operator can find it without a search', () => {
  const r = scanMemoryFile('p.md', () => `line one\nline two\nkey: ${AWS}\n`);
  assert.match(r.message, /line 3/);
});

test('a missing file is absent, not clean and not a finding', () => {
  const r = scanMemoryFile('p.md', () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; });
  assert.equal(r.state, 'absent');
  assert.equal(r.content, '');
  assert.equal(r.message, '', 'a file that is not there is not news');
});

test('a file that cannot be READ is withheld, not treated as clean', () => {
  // Fail closed. Emitting an unscanned file would be "I could not check" arriving
  // as "checked and clean" — in the one place where being wrong is permanent,
  // because a context is copied into a transcript that cannot be edited later.
  const r = scanMemoryFile('p.md', () => { throw new Error('EACCES'); });
  assert.equal(r.state, 'unreadable');
  assert.equal(r.content, '');
  assert.match(r.message, /could not be read/i);
});
