// /review runs ~12 angles and the pipeline runs several reviewers in parallel.
// The same bug is reported by more than one of them, and each copy used to go
// through skeptical triage (3 rounds + arbiter) on its own — the same work,
// done three times, sometimes with three different verdicts for one line of
// code. findings-dedupe merges them first so each bug is verified once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dedupeFindings, normaliseEvidence, titleJaccard, parseLocation,
} from '../../scripts/lib/findings-dedupe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(ROOT, 'scripts', 'lib', 'findings-dedupe.mjs');

// One SQL-injection bug, seen by three angles with three different titles and
// three slightly different quotes of the same line.
const sqlBug = [
  { file: 'src/users.js', line: 42, severity: 'P1', angle: 'security',
    title: 'SQL injection in user lookup',
    evidence: '42: db.query("SELECT * FROM users WHERE id = " + req.query.id)' },
  { file: './src/users.js', line: 43, severity: 'P0', angle: 'sql-safety',
    title: 'Unparameterised query built from request input',
    evidence: "db.query('SELECT * FROM users WHERE id = ' + req.query.id)" },
  { file: 'src/users.js', line: 41, severity: 'P1', angle: 'data-privacy',
    title: 'User id concatenated into SQL string',
    evidence: '  db.query(`SELECT *   FROM users WHERE id = ` + req.query.id)  ' },
];

test('same bug from 3 angles → 1 group, 3 sources, max severity', () => {
  const groups = dedupeFindings(sqlBug);
  assert.equal(groups.length, 1);
  const [g] = groups;
  assert.equal(g.file, 'src/users.js');
  assert.deepEqual(g.sources, ['data-privacy', 'security', 'sql-safety']);
  assert.equal(g.severity, 'P0');
  assert.deepEqual(g.lines, [41, 42, 43]);
  assert.equal(g.titles.length, 3);
  assert.equal(g.count, 3);
  assert.ok(g.key.startsWith('src/users.js:'));
});

test('two different bugs in one file 40 lines apart → 2 groups', () => {
  const groups = dedupeFindings([
    { file: 'src/users.js', line: 10, severity: 'P1', angle: 'security',
      title: 'Missing auth check on delete', evidence: 'router.delete("/users/:id", handler)' },
    { file: 'src/users.js', line: 50, severity: 'P1', angle: 'concurrency',
      title: 'Missing auth check on delete', evidence: 'router.delete("/users/:id", handler)' },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.lines), [[10], [50]]);
});

test('same title in two files → 2 groups (never merge across files)', () => {
  const groups = dedupeFindings([
    { file: 'src/a.js', line: 5, severity: 'P1', reviewer: 'code-reviewer', title: 'Unbounded result set' },
    { file: 'src/b.js', line: 5, severity: 'P1', reviewer: 'qa-engineer', title: 'Unbounded result set' },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.file), ['src/a.js', 'src/b.js']);
});

test('order-independence: every permutation gives the same groups', () => {
  const extra = { file: 'src/users.js', line: 90, severity: 'P2', angle: 'performance',
    title: 'N+1 query in list endpoint', evidence: 'for (const u of users) await db.query(q, [u.id])' };
  const input = [...sqlBug, extra];
  const expected = JSON.stringify(dedupeFindings(input));
  const perms = [[0, 1, 2, 3], [3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]];
  for (const p of perms) {
    assert.equal(JSON.stringify(dedupeFindings(p.map((i) => input[i]))), expected, `perm ${p}`);
  }
  assert.equal(JSON.parse(expected).length, 2);
});

test('without evidence, titles merge at Jaccard ≥ 0.6 and not below', () => {
  const near = dedupeFindings([
    { file: 'x.js', line: 7, severity: 'P1', angle: 'error-handling', title: 'Swallowed error in payment retry loop' },
    { file: 'x.js', line: 8, severity: 'P1', angle: 'side-effects', title: 'Payment retry loop swallowed error' },
  ]);
  assert.equal(near.length, 1);
  const far = dedupeFindings([
    { file: 'x.js', line: 7, severity: 'P1', angle: 'error-handling', title: 'Swallowed error in payment retry loop' },
    { file: 'x.js', line: 8, severity: 'P1', angle: 'performance', title: 'Regex compiled on every call' },
  ]);
  assert.equal(far.length, 2);
});

test('transitive: A~B and B~C put all three in one group', () => {
  const groups = dedupeFindings([
    { file: 'y.js', line: 10, severity: 'P1', angle: 'a', evidence: 'token = req.headers.auth' },
    { file: 'y.js', line: 13, severity: 'P1', angle: 'b', evidence: 'token = req.headers.auth' },
    { file: 'y.js', line: 16, severity: 'P1', angle: 'c', evidence: 'token = req.headers.auth' },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].lines, [10, 13, 16]);
});

test('reads the existing finding shapes: Location field and cross-model `issue`', () => {
  const body = [
    '- **Location**: `src/pay.js:12`',
    '- **Evidence**: failed',
    '```',
    '$ grep -n retry src/pay.js',
    '12: catch (e) {}',
    '```',
  ].join('\n');
  const groups = dedupeFindings([
    { severity: 'High', title: 'Swallowed error', body, reviewer: 'security-officer' },
    { file: 'src/pay.js', line: 12, severity: 'P0', issue: 'Swallowed error', source: 'cross-model' },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].severity, 'P0');
  assert.deepEqual(groups[0].sources, ['cross-model', 'security-officer']);
});

test('a finding with no file is never merged', () => {
  const groups = dedupeFindings([
    { severity: 'P1', angle: 'a', title: 'Dependency is two majors behind' },
    { severity: 'P1', angle: 'b', title: 'Dependency is two majors behind' },
  ]);
  assert.equal(groups.length, 2);
});

test('helpers: evidence normalisation, title Jaccard, location parse', () => {
  assert.equal(normaliseEvidence('  12: Foo("Bar")\n\tbaz  '), 'foo(bar) baz');
  assert.equal(normaliseEvidence('src/a.js:12:3 x'), 'src/a.js x');
  assert.equal(titleJaccard('Missing auth check', 'missing AUTH check'), 1);
  assert.equal(titleJaccard('', ''), 0);
  assert.deepEqual(parseLocation('`src/a.js:12-15`'), { file: 'src/a.js', line: 12, endLine: 15 });
  assert.deepEqual(parseLocation('src/a.js'), { file: 'src/a.js', line: null, endLine: null });
});

test('CLI prints groups as JSON on stdout and `N raw → M unique` on stderr', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dedupe-'));
  const f = join(dir, 'findings.json');
  writeFileSync(f, JSON.stringify(sqlBug));
  const r = spawnSync(process.execPath, [CLI, f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr.trim(), 'findings-dedupe: 3 raw → 1 unique');
  const json = JSON.parse(r.stdout);   // stdout stays pipeable into jq
  assert.equal(json.raw, 3);
  assert.equal(json.unique, 1);
  assert.equal(json.groups[0].sources.length, 3);
});

test('CLI exits 2 on unreadable input rather than reporting 0 unique', () => {
  const r = spawnSync(process.execPath, [CLI, '/nonexistent/findings.json'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
});
