// 01.11.2026, from a review of public agent repositories: the architect walks the
// error paths (gstack's error and rescue map), QA checks the Test? column and runs a
// verification-gap pass when mutation testing is not configured (BMAD-METHOD), and
// senior-dev says what a green test does not prove (gstack's test value card).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(p), 'utf8');
const both = (name) => ['agents', 'agents-full'].map((d) => [`${d}/${name}.md`, read(`${d}/${name}.md`)]);

test('architect writes an Error paths table, and the unhandled untested row says CRITICAL', () => {
  for (const [f, t] of both('architect')) {
    assert.match(t, /\*\*Walk the error paths\*\* into `## Error paths`/, f);
    assert.match(t, /\| Path \| Failure \| Handled\? \| Test\? \| User sees \| Logged\? \|/, `${f}: the columns artifact-lint reads`);
    assert.match(t, /unhandled \*\*and\*\* untested is written `CRITICAL`/, f);
    assert.match(t, /must never be\s+handled as "empty"/, `${f}: a failed read is not an empty one`);
  }
});

test('qa-engineer checks the Test? column and blocks on a CRITICAL row still unhandled', () => {
  for (const [f, t] of both('qa-engineer')) {
    assert.match(t, /### Step 3c-2: Error paths/, f);
    assert.match(t, /`CRITICAL` row still unhandled in the code → a blocking defect/, f);
    assert.ok(t.indexOf('### Step 3c-2: Error paths') > t.indexOf('### Step 3c: Requirements Traceability'), `${f}: after traceability`);
  }
});

test('qa-engineer runs a verification-gap pass where mutation testing is not configured', () => {
  for (const [f, t] of both('qa-engineer')) {
    assert.match(t, /"Not configured" ends the mutation run, not the question/, f);
    assert.match(t, /\*\*Verification-gap pass\*\*/, f);
    for (const gap of [/regression no test would catch/, /call site left on the old behaviour/, /skipped, flaky or too weak/, /now wrong or pointless/]) assert.match(t, gap, `${f}: ${gap}`);
    assert.match(t, /do \*\*not\*\* count as verification: a snapshot alone, a check that a mock was\s+called/, `${f}: what is not proof`);
  }
});

test('senior-dev says, per new test, what green does not prove', () => {
  for (const [f, t] of both('senior-dev')) {
    assert.match(t, /`no_claim: <what passing does NOT show>`/, f);
    const at = t.indexOf('Say what green does not prove'); 
    assert.ok(at > t.indexOf('**Stub check') && at < t.indexOf('**GREEN**'), `${f}: between the stub check and GREEN`);
  }
});
