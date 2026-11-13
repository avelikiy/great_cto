// tests/lib/distribution-trust-v4.test.mjs — the frozen acceptance contract, revision 4 (ADR-050 decision 10).
//
// Revision 4 EXTENDS revision 3: every v3 row is retained verbatim, nothing is relaxed, and fifteen
// rows are added for managed plugin activation. These tests hold three things in place:
//   1. the v3 rows (and the sections that carry the scorer clocks and the PID/SIGKILL/cleanup checks)
//      are still in the file, byte for byte;
//   2. the new rows are the ARCH table's rows, with the ARCH wording;
//   3. a row that claims a test names a test that exists, and a row no test covers says so. A
//      coverage claim nobody checks is worse than no claim: it reads as a guarantee.
//
// Run: node --test tests/lib/distribution-trust-v4.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V3 = 'tests/acceptance/distribution-trust-v3.json';
const V4 = 'tests/acceptance/distribution-trust-v4.json';
const ARCH = 'docs/architecture/ARCH-plugin-activation.md';
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The fifteen ids ADR-050 decision 10 adds, in the ARCH table's order. The count is the ADR's. */
const NEW_IDS = [
  'embedded_plugin_set', 'verifier_resolution', 'bootstrap_trust_statement', 'plugin_cache_publication',
  'registry_cas', 'settings_cas', 'managed_file_journal', 'plugin_transaction_recovery', 'concurrent_init',
  'offline_init', 'no_pre_admission_exec', 'marketplace_divergence', 'external_runtime_scope',
  'companion_absence_degrade', 'plugin_byte_equality',
];
const COVERAGE = ['COVERED', 'PARTIAL', 'UNCOVERED'];

const v3 = () => JSON.parse(read(V3));
const v4 = () => JSON.parse(read(V4));
const newRows = () => v4().requiredScenarios.slice(v3().requiredScenarios.length);

/** A row as it appears in a file whose rows sit at four spaces of indent (both revisions do). */
const rowBlock = row => JSON.stringify(row, null, 2).split('\n').map(line => '    ' + line).join('\n');
/** Ids of the rows that are not present in `text` exactly as `rows` serialise them. */
const missingVerbatim = (rows, text) => rows.filter(row => !text.includes(rowBlock(row))).map(row => row.id);

/** The ARCH acceptance table: `| \`id\` | behaviour |` lines under its header. */
function archRows() {
  const lines = read(ARCH).split('\n');
  const start = lines.findIndex(line => /^\| id \| Required behaviour \|$/.test(line));
  assert.ok(start >= 0, 'the ARCH acceptance table header was not found');
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    const match = /^\| `([a-z_]+)` \| (.+) \|$/.exec(line);
    if (!match) break;
    rows.push({ id: match[1], requirement: match[2] });
  }
  return rows;
}

test('v4 supersedes v3, carries no release authority and cites ADR-050', () => {
  const doc = v4();
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.contract, 'distribution-trust');
  assert.equal(doc.revision, 4);
  assert.equal(doc.supersedes, 'distribution-trust-v3.json');
  assert.equal(doc.authority, 'NONE');
  assert.equal(doc.syntheticEvidenceCanAuthorizeRelease, false);
  assert.equal(doc.releaseEligibility, 'NOT_CHECKED');
  assert.equal(doc.sourceDecision, 'docs/adr/ADR-050-managed-plugin-activation.md');
  assert.equal(doc.status, 'ACCEPTED_DESIGN');
  assert.equal(doc.approvedAt, '2026-11-10', 'the date ADR-050 records for the owner\'s acceptance');
  assert.ok(fs.existsSync(path.join(ROOT, doc.sourceDecision)));
  assert.equal(fs.existsSync(path.join(ROOT, 'tests/acceptance', doc.supersedes)), true);
});

test('every v3 row is retained in v4 byte for byte, first and in order', () => {
  const rows = v3().requiredScenarios, text = read(V4);
  assert.equal(rows.length, 20, 'v3 has twenty rows; a different count means this test no longer pins v3');
  assert.deepEqual(missingVerbatim(rows, text), []);
  assert.deepEqual(v4().requiredScenarios.slice(0, rows.length), rows);
  let from = 0;
  for (const row of rows) {
    const at = text.indexOf(rowBlock(row), from);
    assert.ok(at >= from, `${row.id} is out of order`);
    from = at;
  }
  for (const id of ['claude_registration', 'native_capability', 'scorer_fixture_phase_clock']) {
    assert.ok(rows.some(row => row.id === id), `${id} is a v3 row the ARCH names explicitly`);
  }
});

test('the verbatim check is not vacuous: a relaxed v3 row is reported missing (known-bad sample)', () => {
  const rows = v3().requiredScenarios, text = read(V4);
  assert.deepEqual(missingVerbatim(rows, text.replace('Reject downgrade and changed bytes', 'Allow downgrade and changed bytes')), ['version_replay']);
  assert.deepEqual(missingVerbatim(rows, text.replace('"id": "regression"', '"id": "regressions"')), ['regression']);
  assert.deepEqual(missingVerbatim(rows, text.replace('1000ms scorer window', '3000ms scorer window')).length, 1);
});

test('the sections that carry the scorer clocks and the PID/SIGKILL/cleanup checks are retained verbatim', () => {
  const before = v3(), after = v4(), text = read(V4);
  for (const key of ['productionIdentity', 'existingGateChangeScope', 'fixtureClockRevision']) {
    assert.deepEqual(after[key], before[key], `${key} must be carried over unchanged`);
  }
  const clocks = after.fixtureClockRevision;
  assert.deepEqual([clocks.scorerTimeoutMs, clocks.watchdogMs, clocks.overallTestTimeoutMs], [1000, 2000, 10000]);
  for (const check of ['live PID/PPID ownership', 'SIGKILL', 'direct scorer no longer live', 'all owned watcher/timer/process cleanup']) {
    assert.ok(clocks.retainedChecks.includes(check), `retained check missing: ${check}`);
  }
  assert.equal(clocks.productionCodeChanged, false);
  assert.ok(text.includes(JSON.stringify(before.fixtureClockRevision, null, 2).split('\n').map((l, i) => (i ? '  ' : '') + l).join('\n')));
  assert.equal(after.existingGateChanges, false, 'v4 itself changes no existing gate');
  assert.deepEqual(after.gateAdditions.map(g => g.weakensExisting), [false]);
});

test('v4 adds exactly the fifteen ARCH rows, in the ARCH order, with the ARCH wording', () => {
  const added = newRows(), arch = archRows();
  assert.deepEqual(added.map(row => row.id), NEW_IDS);
  assert.deepEqual(arch.map(row => row.id), NEW_IDS, 'the ARCH table and ADR-050 decision 10 disagree');
  for (const [i, row] of added.entries()) assert.equal(row.requirement, arch[i].requirement, `${row.id}: wording differs from ${ARCH}`);
  const ids = v4().requiredScenarios.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate row ids');
  assert.equal(ids.length, 35);
});

test('state keeps its v3 meaning: no new row claims to have been checked against a real release', () => {
  for (const row of newRows()) assert.equal(row.state, 'NOT_RUN', row.id);
  assert.match(v4().coverageMeaning, /synthetic/i);
  assert.match(v4().coverageMeaning, /never authori[sz]e/i);
});

test('every new row says what covers it, or says that nothing does', () => {
  for (const row of newRows()) {
    assert.deepEqual(Object.keys(row), ['id', 'requirement', 'state', 'coverage', 'coveredBy', 'uncovered'], row.id);
    assert.ok(COVERAGE.includes(row.coverage), `${row.id}: coverage is ${row.coverage}`);
    assert.ok(Array.isArray(row.coveredBy) && Array.isArray(row.uncovered), row.id);
    if (row.coverage === 'COVERED') assert.deepEqual([row.coveredBy.length > 0, row.uncovered.length], [true, 0], `${row.id}: COVERED needs tests and no unmet clause`);
    if (row.coverage === 'PARTIAL') assert.deepEqual([row.coveredBy.length > 0, row.uncovered.length > 0], [true, true], `${row.id}: PARTIAL names what is tested and what is not`);
    if (row.coverage === 'UNCOVERED') assert.deepEqual([row.coveredBy.length, row.uncovered.length > 0], [0, true], `${row.id}: UNCOVERED cites nothing and says why`);
    for (const clause of row.uncovered) assert.ok(typeof clause === 'string' && clause.length >= 30, `${row.id}: an unmet clause must be written out`);
  }
});

/**
 * What is wrong with the tests a list of rows cites, as sentences; empty when every citation is sound.
 * A citation is sound when its file is inside the repository and exists, and the test it names is
 * DECLARED there (the name sits in a string literal on a line that is not a comment) and not skipped.
 * `read` and `exists` are parameters so the check can be shown to fail on a fabricated repository.
 */
function citationProblems(rows, { read: readSource = read, exists = rel => fs.existsSync(path.join(ROOT, rel)) } = {}) {
  const problems = [];
  for (const row of rows) {
    for (const { file, test: name } of row.coveredBy) {
      if (path.isAbsolute(file) || file.includes('..') || file.startsWith('docs/gates/')) { problems.push(`${row.id}: ${file} is outside the repository or is a frozen gate`); continue; }
      if (!exists(file)) { problems.push(`${row.id}: ${file} does not exist`); continue; }
      const source = readSource(file);
      const at = source.indexOf(name);
      if (at < 0) { problems.push(`${row.id}: no test named ${JSON.stringify(name)} in ${file}`); continue; }
      const line = source.slice(source.lastIndexOf('\n', at) + 1, source.indexOf('\n', at));
      if (/\b(skip|todo)\b/i.test(line)) problems.push(`${row.id}: ${name} is skipped: a skipped test covers nothing`);
    }
  }
  return problems;
}

test('every cited test exists in its file, is not skipped, and the file is inside the repository', () => {
  const rows = newRows();
  assert.deepEqual(citationProblems(rows), []);
  const cited = new Set(rows.flatMap(row => row.coveredBy.map(c => `${c.file}::${c.test}`)));
  assert.ok(cited.size >= 15, 'a contract with almost no citations is a contract nobody checked');
});

test('the citation check is not vacuous: it is run on fabricated citations and reports each of them (known-bad sample)', () => {
  const files = {
    'fake/real.test.mjs': [
      "test('a test that is declared', () => {});",
      "// test('a test that exists only in a comment', () => {});",
      " * test('a test inside a block comment', () => {});",
      "// the row cites 'a name that appears in prose, once, after a comment' here",
      "test.skip('a test that is skipped', () => {});",
      "const cases = [['a table-driven case', 1]];",
      "// test('named in a comment and declared below', () => {});",
      "test('named in a comment and declared below', () => {});",
    ].join('\n'),
  };
  const options = { read: file => files[file], exists: file => file in files };
  const cite = (id, file, name) => ({ id, coveredBy: [{ file, test: name }] });
  const problems = citationProblems([
    cite('sound', 'fake/real.test.mjs', 'a test that is declared'),
    cite('table', 'fake/real.test.mjs', 'a table-driven case'),
    cite('both', 'fake/real.test.mjs', 'named in a comment and declared below'),
    cite('missing_name', 'fake/real.test.mjs', 'a test that was never written'),
    cite('comment_only', 'fake/real.test.mjs', 'a test that exists only in a comment'),
    cite('block_comment', 'fake/real.test.mjs', 'a test inside a block comment'),
    cite('prose', 'fake/real.test.mjs', 'a name that appears in prose, once, after a comment'),
    cite('skipped', 'fake/real.test.mjs', 'a test that is skipped'),
    cite('missing_file', 'fake/absent.test.mjs', 'anything'),
    cite('absolute', '/etc/passwd', 'anything'),
    cite('climbs', '../outside.test.mjs', 'anything'),
    cite('frozen_gate', 'docs/gates/some-gate.test.mjs', 'anything'),
  ], options);
  const byRow = id => problems.filter(problem => problem.startsWith(id + ':'));
  for (const id of ['sound', 'table', 'both']) assert.deepEqual(byRow(id), [], `${id} is a sound citation and must not be reported`);
  assert.match(byRow('missing_name')[0], /no test named/);
  assert.match(byRow('comment_only')[0], /no test named/);
  assert.match(byRow('block_comment')[0], /no test named/);
  assert.match(byRow('prose')[0], /no test named/);
  assert.match(byRow('skipped')[0], /skipped/);
  assert.match(byRow('missing_file')[0], /does not exist/);
  for (const id of ['absolute', 'climbs', 'frozen_gate']) assert.match(byRow(id)[0], /outside the repository|frozen gate/);
  assert.equal(problems.length, 9, problems.join('\n'));
});

test('a row nothing covers is listed, not hidden: the uncovered rows are exactly these', () => {
  const uncovered = newRows().filter(row => row.coverage === 'UNCOVERED').map(row => row.id);
  // external_runtime_scope was the one, until stream S8 landed with its tests. This list changes only
  // together with a test that earns a row COVERED or PARTIAL, and it must never grow without a reason in the row.
  assert.deepEqual(uncovered, []);
});

test('external_runtime_scope is PARTIAL, cites the boundary tests, and still names what is not covered', () => {
  const row = newRows().find(r => r.id === 'external_runtime_scope');
  assert.equal(row.coverage, 'PARTIAL');
  assert.ok(row.coveredBy.some(c => c.file === 'packages/cli/tests/plugin-runtime-boundary.test.mjs'));
  assert.ok(row.coveredBy.length >= 10, 'the row cites the per-host, argv, fail-closed and shipped-manifest tests, not one of them');
  assert.ok(row.uncovered.some(clause => /does not print/.test(clause)), 'the report that init does not print is written down');
  assert.ok(row.uncovered.some(clause => /not a parser/.test(clause)), 'the limit of a lint is written down');
});
