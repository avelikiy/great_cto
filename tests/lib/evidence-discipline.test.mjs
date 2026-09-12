// What an agent may state about something it did not see.
//
// An empty tool result is evidence about the query as much as about the target.
// The OpenSRE write-up (habr 1080524) records an agent answering "the backend
// pods do not exist" from a selector that matched nothing, and a remediation
// that pinned the host that happened to be primary. Both are the same mistake:
// a reading treated as a fact about the world.
//
// The rules live in ONE fragment and are referenced, never copied. A
// hand-copied subset of `prose-deny.txt` inside qa-engineer.md was what actually
// ran for months while the source file drifted; the same shape is banned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promptProfile } from '../../scripts/lib/prompt-size.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FRAGMENT = 'agents/_shared/evidence-discipline.md';
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CONSUMERS = ['l3-support', 'devops'];

test('the fragment exists', () => {
  assert.ok(existsSync(join(ROOT, FRAGMENT)), `${FRAGMENT} is missing — the rules have nowhere to live`);
});

test('it separates a verified emptiness from an unrun check', () => {
  const t = read(FRAGMENT);
  for (const state of ['found', 'empty-and-verified', 'unknown']) {
    assert.match(t, new RegExp(`\\b${state}\\b`), `the fragment does not name the state \`${state}\``);
  }
  // "did not run" alone also appears in the table above, so removing the rule
  // left this green: assert the sentence the rule exists to make.
  assert.match(t, /produces no finding/i,
    'the fragment must say that a check which did not run produces no finding in either direction');
  assert.match(t, /no problem found/i,
    'and that "no problem found" may not be said for a class nothing examined');
});

test('it forbids a number no tool produced', () => {
  const t = read(FRAGMENT);
  assert.match(t, /every number/i, 'the rule about where numbers come from is missing');
  assert.match(t, /not measured/i, 'a figure that cannot be produced needs a name, not an estimate');
});

test('the nine non-success results are named, and none of them is success', () => {
  const t = read(FRAGMENT);
  for (const r of ['unknown', 'partial', 'stale', 'mismatched', 'conflicting',
    'unauthorized', 'unreviewed', 'blocked', 'error']) {
    assert.match(t, new RegExp(`\`${r}\``), `the result vocabulary is missing \`${r}\``);
  }
  assert.match(t, /`ok`/, 'the vocabulary must say what ok means before saying what it is not');
});

test('it credits the source it takes the vocabulary from', () => {
  assert.match(read(FRAGMENT), /Agent-Ops/, 'the result vocabulary is CC BY 4.0 — it is cited, not adopted silently');
});

for (const agent of CONSUMERS) {
  test(`${agent} references the fragment, so prompt-size counts it`, () => {
    assert.match(read(`agents/${agent}.md`), new RegExp(FRAGMENT.replace(/[.]/g, '\\.')),
      `${agent} does not point at ${FRAGMENT}`);
    assert.ok(promptProfile(agent).shared.includes('evidence-discipline.md'),
      `${agent}'s profile does not expand the fragment — the pointer is not in the form prompt-size reads`);
  });

  test(`${agent} does not copy the rules inline`, () => {
    const body = read(`agents/${agent}.md`);
    assert.ok(!/empty-and-verified/.test(body),
      `${agent} restates the rule instead of referencing it — a copy is what drifts`);
  });
}
