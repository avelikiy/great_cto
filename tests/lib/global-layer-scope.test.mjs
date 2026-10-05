// The global memory layer holds what is true across projects, and nothing that
// names one. On 2026-10-05 a learner run in the home directory wrote two lessons
// about a private project into ~/.great_cto/lessons.md, and read-global-memory
// put them into every session of every project. 3.49.1 stopped that writer; this
// is the read door, which holds whoever the writer is.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { privateTerms, termMatcher, STOPWORDS } from '../../scripts/lib/private-terms.mjs';
import { screenProjectScope } from '../../scripts/lib/global-layer-scope.mjs';

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

/** A workspace with two private projects, a nested one, and the noise pre-push ignores. */
function workspace() {
  const ws = tmp('gls-ws-');
  for (const d of ['Personal/Zephyrine', 'Personal/great_cto', 'Work/Quillmoor Labs', 'Work/Quillmoor Labs/Deepnested', 'Personal/src', 'tools', 'Personal/.hidden']) {
    mkdirSync(join(ws, d), { recursive: true });
  }
  return ws;
}

test('private terms are derived like pre-push: workspace names, minus great_cto, public terms and common words', () => {
  const ws = workspace();
  const home = tmp('gls-home-');
  mkdirSync(join(home, '.great_cto'));
  writeFileSync(join(home, '.great_cto', 'private-terms'), '# a comment\nNorthwind\nab\n');
  writeFileSync(join(home, '.great_cto', 'public-terms'), 'Work\n');
  const { terms, rejected } = privateTerms({ workspace: ws, home });
  for (const t of ['Zephyrine', 'Quillmoor Labs', 'Northwind']) assert.ok(terms.includes(t), `${t} is private`);
  for (const t of ['great_cto', 'Work', '.hidden', 'Deepnested']) assert.ok(!terms.includes(t), `${t} is not a term (public, hidden, or deeper than pre-push looks)`);
  for (const t of ['tools', 'src', 'Personal', 'ab']) assert.ok(rejected.includes(t) && !terms.includes(t), `${t} is too common or too short`);
});

test('the stopword list is the one pre-push uses — the two doors agree on what a private name is', () => {
  const hook = readFileSync(resolve(import.meta.dirname, '../../scripts/hooks/pre-push.sh'), 'utf8');
  const m = hook.match(/_STOPWORDS="([^"]*)"/);
  assert.ok(m, 'pre-push still declares _STOPWORDS');
  assert.deepEqual([...STOPWORDS].sort(), m[1].split(/\s+/).filter(Boolean).sort());
});

test('a term matches as a name, not as letters inside a word', () => {
  const has = termMatcher(['Zephyrine', 'Quillmoor Labs']);
  assert.ok(has('deployed for zephyrine today'));
  assert.ok(has('see Quillmoor Labs.'));
  assert.ok(!has('zephyrines'), 'part of a longer word is not the name');
  assert.ok(!has('nothing here'));
  assert.equal(termMatcher([])('anything'), false, 'no terms → nothing matches');
});

const LESSONS = `# Lessons

---
date: 2026-10-05
project: zephyrine
---

**cache-isolation**

Builds of Zephyrine stalled when a cleaner deleted the emulator images.

---
date: 2026-10-01
---

**chain-the-release**

A red gate must stop before the tag, in one script.

## Notes

- prefer one write door per fact
`;

test('an entry that names a private project, or says project:, is dropped — the rest stays', () => {
  const has = termMatcher(['Zephyrine']);
  const { content, dropped } = screenProjectScope(LESSONS, { has });
  assert.ok(!/zephyrine/i.test(content), 'the private name is gone from what is injected');
  assert.match(content, /chain-the-release/, 'a cross-project lesson is kept');
  assert.match(content, /one write door per fact/, 'a heading section is kept');
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].line, 3, 'reported at the frontmatter that opens it');
});

test('project: alone drops an entry even when the name is not in the term list', () => {
  const text = '---\ndate: 2026-10-05\nproject: somewhere-else\n---\n\nbody\n\n---\ndate: 2026-10-02\nproject: great_cto\n---\n\nkept\n';
  const { content, dropped } = screenProjectScope(text, { has: termMatcher([]) });
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].why, 'project-scoped');
  assert.match(content, /kept/, 'great_cto is the one public project and may be named');
  assert.ok(!/somewhere-else/.test(content));
});

test('a fenced block is content, not a boundary', () => {
  const text = '## Example\n\n```\n---\nproject: zephyrine\n---\n```\n';
  const { dropped } = screenProjectScope(text, { has: termMatcher([]) });
  assert.equal(dropped.length, 0, 'a quoted frontmatter inside a fence is not an entry');
});

test('the hook drops it from the injection and tells the operator, not the model', () => {
  const ws = workspace();
  const home = tmp('gls-hook-home-');
  mkdirSync(join(home, '.great_cto'));
  writeFileSync(join(home, '.great_cto', 'lessons.md'), LESSONS);
  const hook = resolve(import.meta.dirname, '../../scripts/hooks/read-global-memory.mjs');
  const r = spawnSync(process.execPath, [hook], {
    encoding: 'utf8', input: '', env: { ...process.env, HOME: home, GREAT_CTO_WORKSPACE: ws },
  });
  const { stdout, stderr } = r;
  assert.ok(!/zephyrine/i.test(stdout), 'the model never sees the private project');
  assert.match(stdout, /chain-the-release/);
  assert.match(stderr, /PROJECT SCOPE — lessons\.md: entry at line 3 dropped/);
  assert.ok(!/zephyrine/i.test(stderr), 'the warning does not repeat the name either');
});
