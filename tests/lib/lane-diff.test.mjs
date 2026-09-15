/**
 * A builder's actual diff, checked against the write zone it claimed.
 *
 * wpl.mjs proves the plan is disjoint. These pin the other half: that the work
 * stayed inside the plan — and, when it did not, that the check says whether the
 * stray file belongs to another packet (a race) or to nobody (drift), because
 * the first one means someone else's work may already be overwritten.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkLaneDiff, changedFiles, EXIT } from '../../scripts/lib/lane-diff.mjs';
import { fileInClaim } from '../../scripts/lib/check-lane-overlap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = join(ROOT, 'scripts/lib/lane-diff.mjs');
const TMP = [];
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true }); });

const WPL = `
| # | Name | Class | Owned files | Depends on | Agent | Acceptance criterion |
|---|------|-------|------------|-----------|-------|---------------------|
| 1 | Research auth | Research | (read-only) | — | Explore | options listed |
| 2 | Implement auth | Implementation | src/auth/*.ts, tests/auth | Packet 1 | senior-dev | tests green |
| 3 | Implement schema | Implementation | migrations/*.sql, src/db/pool.ts | Packet 1 | senior-dev | migration clean |
| 4 | QA | Verification | tests/qa | Packets 2, 3 | qa-engineer | report PASS |
`;

test('a changed file is inside a claim only if the claim covers it', () => {
  assert.equal(fileInClaim('src/auth/login.ts', 'src/auth/*.ts'), true);
  assert.equal(fileInClaim('tests/auth/login.test.mjs', 'tests/auth'), true, 'an extensionless claim is a directory');
  assert.equal(fileInClaim('src/auth/sub/deep.ts', 'src/auth/*.ts'), false, 'one star is one level');
  // The reason fileInClaim exists: a changed extensionless FILE is that file,
  // not a directory that would meet any claim sharing its first segment.
  assert.equal(fileInClaim('src', 'src/auth/*.ts'), false);
  assert.equal(fileInClaim('Dockerfile', 'Dockerfile'), true);
});

test('every file inside the zone is inside', () => {
  const v = checkLaneDiff({ markdown: WPL, lane: 'Implement auth', changed: ['src/auth/login.ts', 'tests/auth/login.test.mjs'] });
  assert.equal(v.state, 'inside');
  assert.equal(v.ok, true);
  assert.deepEqual(v.inside, ['src/auth/login.ts', 'tests/auth/login.test.mjs']);
});

test('a file in another packet\'s zone is stray and names the owner — a race', () => {
  const v = checkLaneDiff({ markdown: WPL, lane: 'Implement auth', changed: ['src/auth/login.ts', 'src/db/pool.ts'] });
  assert.equal(v.state, 'stray');
  assert.equal(v.ok, false);
  assert.deepEqual(v.stray, [{ file: 'src/db/pool.ts', ownedBy: ['Implement schema'] }]);
  assert.match(v.summary, /owned by another packet/);
});

test('a file in nobody\'s zone is stray with no owner — drift', () => {
  const v = checkLaneDiff({ markdown: WPL, lane: 'Implement auth', changed: ['README.md'] });
  assert.equal(v.state, 'stray');
  assert.deepEqual(v.stray, [{ file: 'README.md', ownedBy: [] }]);
  assert.doesNotMatch(v.summary, /another packet/);
});

test('a read-only packet that wrote anything is stray, whatever its cell says', () => {
  assert.equal(checkLaneDiff({ markdown: WPL, lane: 'Research auth', changed: ['notes.md'] }).state, 'stray');
  // Verification claims tests/qa in its cell, but it is a reading packet.
  assert.equal(checkLaneDiff({ markdown: WPL, lane: 'QA', changed: ['tests/qa/x.test.mjs'] }).state, 'stray');
});

test('session side files are ignored and reported, not counted', () => {
  const v = checkLaneDiff({ markdown: WPL, lane: 'Implement auth', changed: ['.great_cto/events.jsonl', '.beads/issues.jsonl', 'src/auth/a.ts'] });
  assert.equal(v.state, 'inside');
  assert.deepEqual(v.ignored, ['.beads/issues.jsonl', '.great_cto/events.jsonl']);
  const onlySession = checkLaneDiff({ markdown: WPL, lane: 'Implement auth', changed: ['.great_cto/events.jsonl'] });
  assert.equal(onlySession.state, 'empty');
  assert.equal(onlySession.ok, true);
});

test('lane names match regardless of case and padding; an unknown lane fails and lists the real ones', () => {
  assert.equal(checkLaneDiff({ markdown: WPL, lane: '  implement AUTH ', changed: ['src/auth/a.ts'] }).state, 'inside');
  const v = checkLaneDiff({ markdown: WPL, lane: 'Implement billing', changed: ['src/auth/a.ts'] });
  assert.equal(v.state, 'unknown-lane');
  assert.equal(v.ok, false);
  assert.match(v.summary, /Implement auth/);
});

test('no matrix and an unreadable matrix are two different not-checked states', () => {
  assert.equal(checkLaneDiff({ markdown: 'just prose', lane: 'x', changed: ['a'] }).state, 'absent');
  assert.equal(checkLaneDiff({ markdown: '| a | b |\n|---|---|\n| 1 | 2 |', lane: 'x', changed: ['a'] }).state, 'malformed');
});

// ── against a real working tree ───────────────────────────────────────────────

function repo() {
  const d = mkdtempSync(join(tmpdir(), 'gcto-lanediff-'));
  TMP.push(d);
  const git = (...a) => execFileSync('git', a, { cwd: d, stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  mkdirSync(join(d, 'src/auth'), { recursive: true });
  mkdirSync(join(d, 'src/db'), { recursive: true });
  writeFileSync(join(d, 'src/auth/login.ts'), 'export const a = 1;\n');
  writeFileSync(join(d, 'src/db/pool.ts'), 'export const p = 1;\n');
  writeFileSync(join(d, 'wpl.md'), WPL);
  git('add', '.'); git('commit', '-q', '-m', 'init');
  return d;
}
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, 'wpl.md', ...args], { cwd, encoding: 'utf8' });

test('the CLI reads modified, untracked and both sides of a rename', () => {
  const d = repo();
  writeFileSync(join(d, 'src/auth/login.ts'), 'export const a = 2;\n');
  writeFileSync(join(d, 'src/auth/new.ts'), 'export const n = 1;\n');
  renameSync(join(d, 'src/db/pool.ts'), join(d, 'src/auth/pool.ts'));
  execFileSync('git', ['add', '-A'], { cwd: d });
  const files = changedFiles({ cwd: d });
  assert.ok(files.includes('src/db/pool.ts'), 'the old side of the rename is a change to its zone');
  assert.ok(files.includes('src/auth/pool.ts'));

  const r = run(d, '--lane', 'Implement auth');
  assert.equal(r.status, EXIT.STRAY, r.stdout + r.stderr);
  assert.match(r.stdout, /STRAY {2}src\/db\/pool\.ts {2}\(owned by Implement schema\)/);
});

test('the CLI exit codes: inside is 0, no matrix is 3, a bad base is 3 — never a false green', () => {
  const d = repo();
  writeFileSync(join(d, 'src/auth/login.ts'), 'export const a = 3;\n');
  assert.equal(run(d, '--lane', 'Implement auth').status, EXIT.INSIDE);

  writeFileSync(join(d, 'wpl.md'), 'no table here');
  assert.equal(run(d, '--lane', 'Implement auth').status, EXIT.NOT_CHECKED);

  writeFileSync(join(d, 'wpl.md'), WPL);
  const bad = run(d, '--lane', 'Implement auth', '--base', 'no-such-ref');
  assert.equal(bad.status, EXIT.NOT_CHECKED, 'a diff that could not be read is not a clean diff');
  assert.match(bad.stderr, /not checked/);

  assert.equal(spawnSync(process.execPath, [CLI], { cwd: d }).status, EXIT.USAGE);
});

test('a file list can be piped in instead of reading git', () => {
  const d = repo();
  const r = spawnSync(process.execPath, [CLI, 'wpl.md', '--lane', 'Implement schema', '--files', '-', '--json'],
    { cwd: d, input: 'migrations/001.sql\nsrc/auth/login.ts\n', encoding: 'utf8' });
  assert.equal(r.status, EXIT.STRAY);
  const v = JSON.parse(r.stdout);
  assert.deepEqual(v.stray, [{ file: 'src/auth/login.ts', ownedBy: ['Implement auth'] }]);
  assert.deepEqual(v.inside, ['migrations/001.sql']);
});
