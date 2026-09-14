// Docs are part of done.
//
// A change that alters what a user or operator relies on — a command, a flag, an
// environment variable, a config key, an output format, a default — and leaves the
// document that describes the old behaviour in place has shipped two contradicting
// sources, and the reader cannot tell which one is current. Neither senior-dev
// (which closes the task) nor code-reviewer (which reads the diff) had a rule for
// it: searched 2026-09-14, no instruction in either prompt names documentation.
//
// Three states, not two. "No doc describes it" and "nobody looked" read the same in
// a close message that says nothing, so the message has to say which.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('senior-dev checks the docs before it closes the task, not after', () => {
  const t = read('agents/senior-dev.md');
  const docs = t.indexOf('**Docs follow the behaviour.**');
  const close = t.indexOf('11. **Close**');
  assert.ok(docs > 0, 'senior-dev has no docs step');
  assert.ok(close > 0, 'the Close step moved — update this test to follow it');
  assert.ok(docs < close, 'the docs step must come before Close; after it, the task is already reported done');
});

test('senior-dev records which of three docs states it found, and not-looked is one of them', () => {
  const t = read('agents/senior-dev.md');
  const step = t.slice(t.indexOf('**Docs follow the behaviour.**'), t.indexOf('11. **Close**'));
  assert.match(step, /docs: updated/, 'the updated state');
  assert.match(step, /docs: none describe it/, 'the searched-and-found-nothing state');
  assert.match(step, /docs: not checked/, 'without this, a skipped search reads as a clean one');
  assert.match(t.slice(t.indexOf('11. **Close**')), /docs: /, 'the close message must carry the docs state');
});

test('code-reviewer treats a doc that still describes the old behaviour as a finding with evidence', () => {
  const t = read('agents/code-reviewer.md');
  const start = t.indexOf('## Docs follow the behaviour');
  assert.ok(start > 0, 'code-reviewer has no docs section');
  const section = t.slice(start, t.indexOf('\n## ', start + 5));
  assert.match(section, /\*\*Finding\*\*/, 'a stale doc is a Finding, not a nit');
  assert.match(section, /file:line/, 'a Finding cites the stale line');
  assert.match(section, /docs not checked/, 'a review that did not search says so');
});
