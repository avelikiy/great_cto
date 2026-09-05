/**
 * The scanner judged against a TABLE, not against assertions in code.
 *
 * `secret-scan` already has 17 tests, and they test the code: this function
 * returns that shape, this branch is taken. What they do not answer is the
 * question a reviewer actually asks — "does this exact string get blocked?" —
 * for each rule, in one readable place.
 *
 * Shape borrowed from OpenFirma's `firma policy test fixture.toml`, which keeps
 * rules and expected verdicts as separate data. The idea only: that project is
 * GPL-3.0 and this one is MIT, so none of its code is here.
 *
 * What the table buys:
 *
 *   - a new pattern is covered by writing a row, so covering costs less than
 *     skipping — the opposite of the usual gradient
 *   - coverage becomes checkable: a rule with no `deny` row has never been seen
 *     to fire, and the last test here fails on one
 *   - the `allow` rows are load-bearing. A scanner that blocks a placeholder in
 *     a README teaches people to bypass it, and a bypassed guard is an off guard
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATTERNS, scan } from '../../scripts/lib/secret-patterns.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = JSON.parse(
  readFileSync(join(REPO, 'tests', 'fixtures', 'secret-scan-verdicts.json'), 'utf8'),
);

/**
 * Assemble a row into the string under test.
 *
 * Rows are templates because the first version stored finished key-shaped
 * strings and GitHub Push Protection refused the push, naming two of them. It
 * was right to: a fixture indistinguishable from a credential is a credential to
 * every scanner, and a repo that trains people to click "allow this secret" has
 * taught the wrong reflex. Assembled here, nothing in the tree matches a scanner
 * while the scanner under test still sees the real shape.
 */
function build(row) {
  if (row.content) return row.content;
  const fill = row.fill ?? (row.fill_char ?? 'a').repeat(row.fill_len ?? 0);
  return `${row.literal ?? ''}${row.prefix ?? ''}${row.join ?? ''}${fill}`;
}

test('every deny row is actually denied, by the rule it names', () => {
  const wrong = [];
  for (const row of FIXTURES.deny) {
    const findings = scan(build(row));
    if (!findings.length) { wrong.push(`${row.rule}: NOT flagged at all`); continue; }
    // The rule that fires matters, not just that something did: a key reported
    // under the wrong name sends someone to revoke the wrong credential — which
    // has already happened here once, with OpenRouter reported as OpenAI.
    const names = findings.map((f) => f.name ?? f.rule ?? String(f));
    if (!names.includes(row.rule)) wrong.push(`${row.rule}: flagged as ${names.join(', ')}`);
  }
  assert.deepEqual(wrong, []);
});

test('every allow row passes — a guard that cries wolf gets switched off', () => {
  const wrong = [];
  for (const row of FIXTURES.allow) {
    const findings = scan(build(row));
    if (findings.length) {
      wrong.push(`${row.why}: flagged as ${findings.map((f) => f.name ?? f.rule).join(', ')} — ${build(row).slice(0, 50)}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('every shipped pattern has at least one deny row', () => {
  // A rule nobody has a fixture for is a rule nobody has watched fire. This is
  // the coverage question the 17 code-tests could not answer, and it is the
  // reason the table exists.
  const covered = new Set(FIXTURES.deny.map((r) => r.rule));
  const uncovered = PATTERNS.map((p) => p.name).filter((n) => !covered.has(n));
  assert.deepEqual(uncovered, [],
    'add a deny row for each — an unexercised rule is indistinguishable from a broken one');
});

test('the table names only rules that exist', () => {
  // The mirror image: a fixture for a deleted rule passes forever without
  // testing anything, and reads as coverage.
  const real = new Set(PATTERNS.map((p) => p.name));
  const ghosts = [...new Set(FIXTURES.deny.map((r) => r.rule))].filter((n) => !real.has(n));
  assert.deepEqual(ghosts, [], 'these rules are gone — drop the rows');
});
