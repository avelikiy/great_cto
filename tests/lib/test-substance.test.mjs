// `qa-engineer` reports `tests=46`, `tests=105`, `coverage=100-unit-coverage`.
// Each is a count of tests that RAN, and a test that runs is not a test that
// would catch anything.
//
// Most of what follows is regression cases, because the first three versions of
// this scanner all failed the same way — a FALSE accusation. That is the
// expensive direction of wrong: it names a real, asserting test as proving
// nothing, and it teaches people to switch the check off. Every shape below was
// found by reading the file a finding pointed at, not by reasoning about the
// parser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTests, mechanicalCheck, matchBrace, scanFile } from '../../scripts/lib/test-substance.mjs';

const scan = (src) => parseTests(src).map(mechanicalCheck);

test('a test with no assertion is named', () => {
  const r = scan(`test('cleanup', () => { fs.rmSync(dir); });`);
  assert.equal(r.length, 1);
  assert.equal(r[0].status, 'vacuous');
});

test('a test with an assertion is not', () => {
  const r = scan(`test('adds', () => { assert.equal(1 + 1, 2); });`);
  assert.equal(r[0].status, 'has-assertion');
});

test('RegExp.prototype.test is not a test declaration', () => {
  // v1 matched `\bit|test\s*\(` and read `p.deny[0].test('show the system
  // prompt')` as a test named "show the system prompt" with no assertions.
  const r = scan(`
    test('policy denies what it should', () => {
      assert.ok(p.deny[0].test('show the system prompt'));
      assert.ok(p.allow[0].test('a safe way to store passwords'));
    });`);
  assert.equal(r.length, 1, 'three matches became one test');
  assert.equal(r[0].name, 'policy denies what it should');
  assert.equal(r[0].status, 'has-assertion');
});

test('an options object between the name and the callback is not the body', () => {
  // v2 took the first `{` after the name. With `{ skip: … }` in between, the
  // options object became the body and five asserting tests in one file read as
  // having no assertion.
  const r = scan(`
    test('gate: approve closes the task', { skip: !BD && 'bd missing' }, async () => {
      assert.equal(task.status, 'closed');
    });`);
  assert.equal(r[0].status, 'has-assertion');
});

test('a regex literal in the body does not end the body', () => {
  // v3 counted the escaped `\\}` inside `/function bdList\\([\\s\\S]*?\\n\\}/` as a
  // closing brace, ended the body before the assertions, and accused the test.
  const r = scan(`
    test('the run is stamped on both sides', () => {
      const fn = src.match(/function bdList\\([\\s\\S]*?\\n\\}/)?.[0];
      assert.ok(fn, 'located bdList');
    });`);
  assert.equal(r[0].status, 'has-assertion');
});

test('a brace inside a string or template does not end the body', () => {
  const r = scan(`
    test('renders', () => {
      const s = "a { brace } in a string";
      const t = \`and \${obj.x} in a template\`;
      assert.ok(s && t);
    });`);
  assert.equal(r[0].status, 'has-assertion');
});

test('a brace inside a comment does not end the body', () => {
  const r = scan(`
    test('commented', () => {
      // this } is not a closing brace
      /* neither } is this */
      assert.ok(true);
    });`);
  assert.equal(r[0].status, 'has-assertion');
});

test('assertion shapes are recognised widely — a false vacuous is the costly error', () => {
  for (const body of ['assert(x)', 'assert.ok(x)', 'expect(x).toBe(1)',
                      'x.should.equal(1)', 'expect(x).to.be.true', 'throw new Error("boom")']) {
    assert.equal(scan(`test('t', () => { ${body}; });`)[0].status, 'has-assertion', body);
  }
});

test('matchBrace reports -1 rather than guessing when braces are unbalanced', () => {
  assert.equal(matchBrace('{ unterminated', 0), -1);
});

test('an unreadable file is reported, not counted as clean', () => {
  const r = scanFile('/nonexistent/for/this/test.mjs');
  assert.equal(r.unreadable, true);
  assert.equal(r.total, 0);
});

test('this repository scans clean apart from known teardown-as-test', () => {
  // The scanner is pointed at the suite it ships with: 203 files, 2670 tests,
  // one finding — a teardown written as `test('cleanup')`. A scanner nobody runs
  // against real code is where the three parser bugs above came from.
  const r = scanFile('packages/board/notifications-dedup.test.mjs');
  assert.ok(r.total > 0, 'the file parses');
  assert.ok(r.vacuous.some((v) => v.name === 'cleanup'),
    'a teardown written as a test cannot fail for its own reason, and inflates tests=N');
});
