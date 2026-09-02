// The headline is about the person, and the person is not scoped to a project.
//
// "Nothing is waiting on you" sat above one project's inbox while two P0s were
// open in another. `elsewhereClause` turns the server's cross-project count into
// the clause the headline appends — and, when that count could not be read, it
// must return NOTHING rather than "nothing", because those are different words.
//
// The function lives inline in the page. It is extracted here and run in a vm,
// the way BH-A5 tests fmtTime, so the wording that ships is the wording tested.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const html = readFileSync(resolve(import.meta.dirname, '../../packages/board/public/index.html'), 'utf8');
const m = html.match(/function elsewhereClause\(e\) \{[\s\S]*?\n\}/);
assert.ok(m, 'elsewhereClause must be present in index.html');
const ctx = { Number };
vm.createContext(ctx);
vm.runInContext(`${m[0]}; this.elsewhereClause = elsewhereClause;`, ctx);
// Objects born in the vm realm carry that realm's Object.prototype, and
// deepStrictEqual compares prototypes. Re-create them here so the tests read
// values, which is what they are about.
const clause = (e) => ({ ...ctx.elsewhereClause(e) });

test('no payload, or an unreadable one, claims nothing about other projects', () => {
  // These are the cases that must NOT produce "nothing elsewhere".
  assert.deepEqual(clause(undefined), { known: false, text: '' });
  assert.deepEqual(clause(null), { known: false, text: '' });
  assert.deepEqual(clause({ state: 'unreadable', why: 'registry unreadable' }), { known: false, text: '' });
});

test('a read that found nothing is an honest, known zero', () => {
  assert.deepEqual(clause({ p0: 0, gates: 0, projects: [], unreadable: [] }), { known: true, text: '' });
});

test('P0s elsewhere are named, with the number of projects they sit in', () => {
  const r = clause({ p0: 2, gates: 0, projects: [{ slug: 'x', p0: 2, gates: 0 }] });
  assert.equal(r.known, true);
  assert.equal(r.text, '2 P0 in 1 other project are waiting on you.');
});

test('gates and P0s together, across several projects, agree in number', () => {
  const r = clause({ p0: 1, gates: 3, projects: [{ slug: 'x' }, { slug: 'y' }] });
  assert.equal(r.text, '1 P0 and 3 gates in 2 other projects are waiting on you.');
  const one = clause({ p0: 0, gates: 1, projects: [{ slug: 'x' }] });
  assert.equal(one.text, '1 gate in 1 other project is waiting on you.');
});

test('the headline that ships uses "here" and appends the clause', () => {
  // The two places the page makes the claim. Both must scope it to "here" and
  // both must consult `elsewhere` — a third copy that forgot would be the old lie.
  const stalled = html.match(/nothing is waiting on you here\.\$\{tail\}/g) || [];
  assert.ok(stalled.length >= 1, 'the stalled headline appends the elsewhere tail');
  assert.ok(/Nothing is waiting on you here\.<\/b>/.test(html), 'the all-clear card is scoped to "here"');
  assert.equal((html.match(/nothing is waiting on you either\./g) || []).length, 0,
    'the unscoped sentence must not survive anywhere');
});
