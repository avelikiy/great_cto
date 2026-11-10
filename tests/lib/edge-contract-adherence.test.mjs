// scripts/edge-contract-adherence.mjs measures ADR-039 rule 2 over local verdict logs.
// A verdict log that cannot be read is not a log with no runs: it must be reported as
// NOT READ with its error code, never counted as zero, and never crash the report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve(import.meta.dirname, '../../scripts/edge-contract-adherence.mjs');

function sandbox(t) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'gcto-edge-adherence-')));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}
const verdict = (agent, meta) => JSON.stringify({ v: 1, ts: '2026-10-20T10:00:00Z', agent, verdict: 'APPROVED', cost_usd: 0, meta }) + '\n';
// product-owner declares produces = ["brief"] in shared/pipeline.toml.
function readableProject(tmp, name) {
  const dir = join(tmp, name);
  mkdirSync(join(dir, '.great_cto', 'verdicts'), { recursive: true });
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'BRIEF-a.md'), '# brief\n');
  writeFileSync(join(dir, '.great_cto', 'verdicts', 'product-owner.log'),
    verdict('product-owner', { brief: 'docs/BRIEF-a.md' }) + verdict('product-owner', {}));
  return dir;
}
// A directory where the log should be: readFileSync fails with EISDIR, a code that is not ENOENT.
function unreadableProject(tmp, name) {
  const dir = join(tmp, name);
  mkdirSync(join(dir, '.great_cto', 'verdicts', 'product-owner.log'), { recursive: true });
  return dir;
}
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('a readable log is counted per stage, exactly as before', t => {
  const tmp = sandbox(t), out = run(readableProject(tmp, 'ok'));
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /projects with matching verdicts: 1/);
  assert.match(out.stdout, /product-owner\s+1\/2 met · 1 unnamed · 0 named a path that does not exist/);
  assert.doesNotMatch(out.stdout, /NOT READ/);
});

test('a project with no verdict log is "no runs", not a read failure', t => {
  const tmp = sandbox(t), empty = join(tmp, 'empty'); mkdirSync(empty);
  const out = run(empty);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /projects with matching verdicts: 0/);
  assert.doesNotMatch(out.stdout, /NOT READ/);
});

test('an unreadable log is reported NOT READ with its error code, never a stack trace or a zero', t => {
  const tmp = sandbox(t), dir = unreadableProject(tmp, 'broken');
  const out = run(dir);
  assert.doesNotMatch(out.stderr, /node:internal|\bat .*\.mjs:\d+/, 'no stack trace');
  assert.match(out.stdout, /NOT READ/);
  assert.match(out.stdout, /product-owner\s.*EISDIR/);
  assert.doesNotMatch(out.stdout, /0\/0 met/, 'an unread source must not appear as zero runs');
  assert.notEqual(out.status, 0, 'nothing could be read, so the run must fail');
  assert(!(out.stdout + out.stderr).includes(tmp), 'output carries counts and codes, never a path');
});

test('a mixed run keeps the readable counts, lists what was not read, and still succeeds', t => {
  const tmp = sandbox(t);
  const out = run(readableProject(tmp, 'ok'), unreadableProject(tmp, 'broken'));
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /projects with matching verdicts: 1/);
  assert.match(out.stdout, /product-owner\s+1\/2 met · 1 unnamed/, 'only the readable log is counted');
  assert.match(out.stdout, /NOT READ/);
  assert.match(out.stdout, /product-owner\s.*EISDIR/);
  assert.match(out.stdout, /exclude/i, 'the report says its counts exclude the unread source');
  assert(!(out.stdout + out.stderr).includes(tmp), 'output carries counts and codes, never a path');
});

test('an unreadable verdicts directory is also NOT READ, not "no runs"', t => {
  const tmp = sandbox(t), dir = join(tmp, 'odd');
  mkdirSync(join(dir, '.great_cto'), { recursive: true });
  writeFileSync(join(dir, '.great_cto', 'verdicts'), 'a file where the directory should be');
  const out = run(dir);
  assert.match(out.stdout, /NOT READ/);
  assert.match(out.stdout, /ENOTDIR/);
  assert.notEqual(out.status, 0);
});
