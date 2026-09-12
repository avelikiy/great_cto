// One rule, one file — where the copies are actually the same rule.
//
// Measured 2026-09-12 across the eight pipeline agents: eleven section headings
// repeat in four to eight of them, 858 lines, 14% of their combined length. Two
// of the three candidates did not survive contact with the text:
//
//   - `Interaction Checkpoints` repeats the heading and nothing else — its six
//     versions agree on 3–41% of their words, because the checkpoints differ per
//     stage.
//   - `Environment Setup` is three shell lines, and the first of them sets PATH.
//     A shared fragment is not inlined at run time; it is an instruction to go
//     read a file. Replacing a load-bearing `source` line with "read this file
//     first" trades three duplicated lines for an agent that runs its tools
//     without a PATH when it does not.
//
// What remains here is the duplication that is one rule written several times,
// plus the fragments that exist and that nobody points at.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const agentNames = () => readdirSync(join(ROOT, 'agents'))
  .filter((f) => f.endsWith('.md') && !f.startsWith('_')).map((f) => f.slice(0, -3));

test('every fragment in _shared is pointed at by at least one agent', () => {
  const fragments = readdirSync(join(ROOT, 'agents/_shared')).filter((f) => f.endsWith('.md'));
  const bodies = agentNames().map((a) => read(`agents/${a}.md`)).join('\n');
  // No exceptions. The first version of this test carried one for
  // contract-agent-altitude.md, on a count taken over the eight pipeline agents;
  // seven other agents point at it. Counting the wrong population is how a file
  // gets called dead while it is being read.
  const orphans = fragments.filter((f) => !bodies.includes(`agents/_shared/${f}`));
  assert.deepEqual(orphans, [],
    'a fragment nobody points at is a file that drifts out of date unread — adopt it or delete it');
});

test('no agent carries a model price table of its own', () => {
  // The rates the product bills against live in scripts/lib/cost-meter.mjs, which
  // is what usage-from-transcript prices a run with. pm carried a second table,
  // naming models this repository had stopped routing to.
  const carriers = agentNames().filter((a) => {
    const t = read(`agents/${a}.md`);
    return /(Opus|Sonnet|Haiku)[^\n|]{0,40}\$\s?[0-9.]+\s*\/\s*\$\s?[0-9.]+/i.test(t);
  });
  assert.deepEqual(carriers, [],
    'a per-model price table in a prompt is a copy of scripts/lib/cost-meter.mjs that nothing updates');
});
