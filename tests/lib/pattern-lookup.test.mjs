// The known-patterns lookup, as a tool instead of six copies of a shell script.
//
// Six agents carried their own version of it — 209 lines in total, agreeing on
// 7–64% of their text. The head was the same in all six (read the global-pattern
// directory, match on archetype or stack, print what matched); the tail differed
// because each agent needs different fields: an incident wants the first
// detection step and the recorded MTTR, an implementation wants the fix, a
// deploy wants the pre-deploy check.
//
// Six copies of a shell loop are also six untested shell loops. This is the
// same behaviour with a name, a role flag, and cases — including the one the
// comments in those copies were already worried about: a pattern that records
// how to diagnose and no remedy at all must not print an empty instruction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lookupPatterns, renderPatterns } from '../../scripts/lib/pattern-lookup.mjs';

function library(patterns) {
  const dir = mkdtempSync(join(tmpdir(), 'gp-'));
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(patterns)) writeFileSync(join(dir, `${name}.md`), body);
  return dir;
}
const GP = (extra) => [
  'status: active',
  'applies_to: web-app, fintech',
  'symptom: the board shows no data',
  'hits: 3',
  ...extra,
].join('\n');

test('a pattern matches on archetype or on stack, and nothing else does', () => {
  const dir = library({
    'GP-0001': GP(['fix: restart the collector']),
    'GP-0002': ['status: active', 'applies_to: mobile', 'symptom: other', 'fix: x'].join('\n'),
    'GP-0003': ['status: retired', 'applies_to: web-app', 'symptom: old', 'fix: y'].join('\n'),
  });
  const r = lookupPatterns({ dir, archetype: 'web-app', stack: 'node' });
  assert.deepEqual(r.matched.map((p) => p.slug), ['GP-0001']);
  assert.equal(r.state, 'found');
});

test('an empty library is said out loud, not left blank', () => {
  const r = lookupPatterns({ dir: library({}), archetype: 'web-app', stack: 'node' });
  assert.equal(r.state, 'empty');
  assert.match(renderPatterns(r, { role: 'incident' }), /no patterns/i);
});

test('a directory that is not there is unknown, not empty', () => {
  // "No patterns match" and "the library was never created" are different facts,
  // and the second one has an action attached to it.
  const r = lookupPatterns({ dir: '/nonexistent/global-patterns', archetype: 'web-app', stack: 'node' });
  assert.equal(r.state, 'unavailable');
  assert.match(renderPatterns(r, { role: 'implement' }), /crystallize/i);
});

test('a pattern with no fix falls back to its detection steps', () => {
  const dir = library({ 'GP-0004': GP(['detection_order:', '  - open the browser console', '  - check the collector']) });
  const r = lookupPatterns({ dir, archetype: 'web-app', stack: 'node' });
  const p = r.matched[0];
  assert.equal(p.fix, null);
  assert.deepEqual(p.detection, ['open the browser console', 'check the collector']);
  const out = renderPatterns(r, { role: 'implement' });
  assert.match(out, /diagnose first/i, 'a pattern with no remedy must say so');
  assert.doesNotMatch(out, /apply:\s*$/m, 'an empty instruction reads as knowledge');
});

test('each role is told what that role needs', () => {
  const dir = library({ 'GP-0005': GP(['fix: warm the cache before cutover', 'mttr_reduction: 40m',
    'detection_order:', '  - read the hit rate']) });
  const r = lookupPatterns({ dir, archetype: 'fintech', stack: 'node' });
  const incident = renderPatterns(r, { role: 'incident' });
  const deploy = renderPatterns(r, { role: 'deploy' });
  const implement = renderPatterns(r, { role: 'implement' });
  assert.match(incident, /check first/i, 'an incident needs the first detection step');
  assert.match(incident, /40m/, 'an incident needs the recorded MTTR');
  assert.match(deploy, /pre-deploy/i, 'a deploy needs it as a pre-deploy check');
  assert.match(implement, /apply/i, 'an implementation needs the fix');
  for (const out of [incident, deploy, implement]) assert.match(out, /GP-0005/);
});

test('an unreadable pattern file is skipped, and the count says so', () => {
  const dir = library({ 'GP-0006': GP(['fix: a']), 'GP-0007': 'not: a pattern at all\n' });
  const r = lookupPatterns({ dir, archetype: 'web-app', stack: 'node' });
  assert.equal(r.matched.length, 1);
  assert.equal(r.skipped, 1, 'a file that could not be read as a pattern is counted, not ignored');
});
