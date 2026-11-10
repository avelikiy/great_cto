// scripts/lib/ctrf-reporter.mjs, run as a real node:test reporter over a fixture
// suite with one test of every kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORTER = path.join(ROOT, 'scripts', 'lib', 'ctrf-reporter.mjs');

// Inside `node --test` the child would inherit NODE_TEST_CONTEXT, run as a subtest
// worker and ignore --test-reporter; it must start as a top-level run.
const childEnv = (extra) => { const e = { ...process.env, ...extra }; delete e.NODE_TEST_CONTEXT; return e; };

function run(source, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctrf-'));
  try {
    const file = path.join(dir, 'fixture.test.mjs');
    fs.writeFileSync(file, source);
    const out = path.join(dir, 'out.ctrf.json');
    const r = spawnSync(process.execPath, ['--test', `--test-reporter=${REPORTER}`, `--test-reporter-destination=${out}`, file],
      { encoding: 'utf8', env: childEnv(env), timeout: 60000 });
    return { status: r.status, doc: JSON.parse(fs.readFileSync(out, 'utf8')) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('one entry per test, each kind with its own status, suites are not entries', () => {
  const { status, doc } = run(`
    import { test, describe } from 'node:test';
    import assert from 'node:assert/strict';
    test('passes', () => {});
    test('fails', () => { assert.equal(1, 2, 'one is not two'); });
    test('skipped with a reason', { skip: 'no browser here' }, () => {});
    test('todo', { todo: 'later' }, () => {});
    describe('group', () => { test('inner', () => {}); });
  `, { GATE_SUITE: 'board tests' });
  assert.equal(status, 1, 'a failing suite still exits non-zero with the reporter attached');
  const r = doc.results;
  assert.equal(doc.reportFormat, 'CTRF');
  assert.equal(r.tool.name, 'board tests');
  const by = Object.fromEntries(r.tests.map((t) => [t.name, t]));
  assert.deepEqual(Object.keys(by).sort(), ['fails', 'inner', 'passes', 'skipped with a reason', 'todo']);
  assert.equal(by.passes.status, 'passed');
  assert.equal(by.fails.status, 'failed');
  assert.match(by.fails.message, /one is not two/);
  assert.ok(by.fails.trace, 'a failure carries a trace');
  assert.match(by.fails.filePath, /fixture\.test\.mjs$/);
  assert.equal(by['skipped with a reason'].status, 'skipped', 'a skip is never reported as passed');
  assert.equal(by['skipped with a reason'].message, 'no browser here');
  assert.equal(by.todo.status, 'pending');
  assert.equal(by.inner.suite, 'group');
  assert.deepEqual({ ...r.summary, start: 0, stop: 0 }, { tests: 5, passed: 2, failed: 1, pending: 1, skipped: 1, other: 0, start: 0, stop: 0 });
});

test('a file that cannot load is a failed entry, not an empty report', () => {
  const { doc } = run('this is not javascript (');
  assert.equal(doc.results.summary.failed, 1);
  assert.equal(doc.results.tests[0].status, 'failed');
});
