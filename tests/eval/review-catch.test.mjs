// tests/eval/review-catch.test.mjs — the seeded-defect set and its scorer, with canned
// reviewer outputs only. No model is called here: the live run is an operator action.
// Run: node --test tests/eval/review-catch.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadSet, validateSet, casesFor, parsePatch, scoreRun, scoreCase, extractFindings, reviewPrompt,
  normalizeClass, normalizeSeverity, CLASSES, REVIEW_ROLES,
} from '../../scripts/lib/review-catch.mjs';
import { rotate, seedForPrompt } from '../../scripts/lib/holdout-rotation.mjs';
import { PROOF } from '../../scripts/lib/proof-status.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SET_DIR = join(__dirname, 'review-catch');
const RUN = join(SET_DIR, 'run.mjs');
const loaded = loadSet(SET_DIR);
const all = casesFor(loaded, 'all');
const thresholds = loaded.set.thresholds;

/** A reviewer that finds every seeded defect, at its floor, and nothing else. */
function perfect(cases = all) {
  return Object.fromEntries(cases.map((c) => [c.id, c.known_defects.map((d) => ({
    file: d.file, line: d.lines[0], class: d.class, severity: d.severity_floor, title: d.id,
  }))]));
}
const empty = (cases = all) => Object.fromEntries(cases.map((c) => [c.id, []]));
/** Confident, specific and wrong: P0 injection on line 1 of every file it was shown. */
function hallucinating(cases = all) {
  return Object.fromEntries(cases.map((c) => [c.id, [...parsePatch(c.patch).keys()].map((file) => ({
    file, line: 1, class: 'sql-injection', severity: 'P0', title: 'injection',
  }))]));
}

test('the set loads: 16 cases, 4 decoys, every defect line shown by its diff', () => {
  assert.equal(all.length, 16);
  assert.equal(all.filter((c) => c.decoy).length, 4);
  assert.equal(all.reduce((n, c) => n + c.known_defects.length, 0), 13);
  assert.deepEqual(validateSet(loaded.set, loaded.cases), []);
});

test('each split carries both defects and decoys, and every class is seeded for code-reviewer', () => {
  for (const split of ['tuning', 'holdout']) {
    const cs = casesFor(loaded, split);
    assert.ok(cs.some((c) => c.decoy), `${split} has a decoy`);
    assert.ok(cs.some((c) => !c.decoy), `${split} has a defect`);
  }
  const seeded = new Set(all.flatMap((c) => c.known_defects.filter((d) => d.roles.includes('code-reviewer')).map((d) => d.class)));
  assert.deepEqual([...seeded].sort(), Object.keys(CLASSES).sort());
  assert.ok(all.some((c) => c.known_defects.some((d) => d.roles.includes('security-officer'))));
});

test('the split rotates with holdout-rotation and stays valid', () => {
  const r = rotate({ tuning: loaded.set.tuning, holdout: loaded.set.holdout, seed: seedForPrompt('approved prompt') });
  assert.ok(r.moved.toTuning.length >= 1, r.why);
  assert.deepEqual(validateSet({ ...loaded.set, tuning: r.tuning, holdout: r.holdout }, loaded.cases), []);
});

test('validateSet names a defect whose lines the diff does not show, and a case in no split', () => {
  const c = structuredClone(all.find((x) => x.id === 'fee-float'));
  c.known_defects[0].lines = [200, 201];
  const set = { ...loaded.set, tuning: loaded.set.tuning.filter((id) => id !== 'payout-retry') };
  const problems = validateSet(set, [...loaded.cases.filter((x) => x.id !== 'fee-float'), c]);
  assert.ok(problems.some((p) => /fee-float\.a: lines 200-201 are not shown/.test(p)), problems.join('\n'));
  assert.ok(problems.some((p) => /payout-retry: in neither/.test(p)), problems.join('\n'));
});

test('parsePatch refuses a hunk whose counts do not match its body', () => {
  const bad = '--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,3 @@\n a\n+b\n';
  assert.throws(() => parsePatch(bad), /hunk/);
  const ok = parsePatch('--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,3 @@\n a\n+b\n c\n');
  assert.deepEqual([...ok.get('x.ts').added], [2]);
  assert.deepEqual([...ok.get('x.ts').visible], [1, 2, 3]);
});

test('a perfect code-reviewer passes on the whole set', () => {
  const r = scoreRun({ cases: all, outputs: perfect(), role: 'code-reviewer', thresholds });
  assert.equal(r.recall.caught, 13);
  assert.equal(r.severityRecall.caught, 13);
  assert.equal(r.decoyClean.clean, 4);
  assert.equal(r.precision.falseAlarms, 0);
  assert.equal(r.status, PROOF.PASSED, r.recall.why);
});

test('a perfect review of the tuning split alone is inconclusive: two decoys cannot settle the bar', () => {
  const cs = casesFor(loaded, 'tuning');
  const r = scoreRun({ cases: cs, outputs: perfect(cs), role: 'code-reviewer', thresholds });
  assert.equal(r.recall.status, PROOF.PASSED);
  assert.equal(r.decoyClean.status, PROOF.INCONCLUSIVE);
  assert.equal(r.status, PROOF.INCONCLUSIVE);
});

test('an empty review fails recall and keeps every decoy clean', () => {
  const r = scoreRun({ cases: all, outputs: empty(), role: 'code-reviewer', thresholds });
  assert.equal(r.recall.caught, 0);
  assert.equal(r.recall.status, PROOF.FAILED);
  assert.equal(r.decoyClean.clean, 4);
  assert.equal(r.status, PROOF.FAILED);
});

test('a hallucinating review catches nothing, raises false alarms, and dirties every decoy', () => {
  const r = scoreRun({ cases: all, outputs: hallucinating(), role: 'security-officer', thresholds });
  assert.equal(r.recall.caught, 0);
  assert.ok(r.precision.falseAlarms > 16);
  assert.equal(r.precision.point, 0);
  assert.equal(r.decoyClean.clean, 0);
  assert.equal(r.status, PROOF.FAILED);
});

test('a run that lost cases is inconclusive even when what answered is perfect', () => {
  const outputs = perfect();
  for (const id of ['sort-allowlist', 'redacted-logging', 'withdraw-toctou', 'export-command']) outputs[id] = null;
  const r = scoreRun({ cases: all, outputs, role: 'code-reviewer', thresholds });
  assert.equal(r.missing.length, 4);
  assert.ok(r.dropout.severe);
  assert.equal(r.status, PROOF.INCONCLUSIVE);
});

test('security-officer is scored on its own defects; a money bug it also finds is a bonus, not recall', () => {
  const r = scoreRun({ cases: all, outputs: perfect(), role: 'security-officer', thresholds });
  assert.equal(r.recall.expected, 7);
  assert.equal(r.recall.caught, 7);
  const fee = r.perCase.find((c) => c.id === 'fee-float');
  assert.deepEqual(fee.expected, []);
  assert.deepEqual(fee.bonus, ['fee-float.a']);
  assert.equal(r.precision.falseAlarms, 0);
});

test('matching: reviewer vocabulary, the race/toctou pair, misclassification and duplicates', () => {
  const c = all.find((x) => x.id === 'withdraw-toctou');
  const d = c.known_defects[0];
  const race = scoreCase(c, [{ file: `b/${d.file}`, line: d.lines[1] + 2, class: 'Race condition', severity: 'high' }], { role: 'security-officer' });
  assert.deepEqual(race.caught, ['withdraw-toctou.a']);
  const wrong = scoreCase(c, [{ file: d.file, line: d.lines[0], class: 'injection', severity: 'P0' }], { role: 'security-officer' });
  assert.deepEqual(wrong.caught, []);
  assert.equal(wrong.misclassified.length, 1);
  assert.equal(wrong.falseAlarms.length, 0);
  const twice = scoreCase(c, [
    { file: d.file, line: d.lines[0], class: 'double spend', severity: 'P0' },
    { file: d.file, line: d.lines[0] + 1, class: 'toctou', severity: 'P1' },
  ], { role: 'security-officer' });
  assert.deepEqual(twice.caught, ['withdraw-toctou.a']);
  assert.equal(twice.duplicate.length, 1);
  assert.equal(twice.falseAlarms.length, 0);
  const far = scoreCase(c, [{ file: d.file, line: d.lines[1] + 10, class: 'toctou', severity: 'P0' }], { role: 'security-officer' });
  assert.deepEqual(far.caught, []);
  assert.equal(far.falseAlarms.length, 1);
});

test('severity: under the floor still catches, but not at severity; P3 on a decoy is not a false alarm', () => {
  const c = all.find((x) => x.id === 'statement-sort-sql');
  const d = c.known_defects[0];
  const low = scoreCase(c, [{ file: d.file, line: d.lines[0], class: 'sqli', severity: 'P2' }], { role: 'code-reviewer' });
  assert.deepEqual(low.caught, [d.id]);
  assert.deepEqual(low.caughtAtSeverity, []);
  const decoy = all.find((x) => x.id === 'sort-allowlist');
  const file = [...parsePatch(decoy.patch).keys()][0];
  assert.equal(scoreCase(decoy, [{ file, line: 15, class: 'injection', severity: 'observation' }], { role: 'code-reviewer' }).falseAlarms.length, 0);
  assert.equal(scoreCase(decoy, [{ file, line: 15, class: 'injection', severity: 'P1' }], { role: 'code-reviewer' }).falseAlarms.length, 1);
});

test('a finding with no line is a false alarm, never a catch', () => {
  const c = all.find((x) => x.id === 'invoice-tenant');
  const r = scoreCase(c, [{ file: c.known_defects[0].file, class: 'idor', severity: 'P0' }], { role: 'code-reviewer' });
  assert.deepEqual(r.caught, []);
  assert.equal(r.falseAlarms.length, 1);
});

test('normalizers', () => {
  assert.equal(normalizeClass('SQL Injection'), 'injection');
  assert.equal(normalizeClass('IDOR'), 'authz');
  assert.equal(normalizeClass('missing_await'), 'race');
  assert.equal(normalizeClass('vibes'), 'other');
  assert.equal(normalizeSeverity('critical'), 'P0');
  assert.equal(normalizeSeverity('p1'), 'P1');
  assert.equal(normalizeSeverity(undefined), 'P3');
});

test('extractFindings: the last json fence wins, an empty review is [], no block is null', () => {
  const reply = 'Draft:\n```json\n{"findings":[{"file":"a","line":1}]}\n```\nFinal:\n```json\n{"findings":[]}\n```\n';
  assert.deepEqual(extractFindings(reply), []);
  assert.deepEqual(extractFindings('[{"file":"a","line":2}]'), [{ file: 'a', line: 2 }]);
  assert.equal(extractFindings('LGTM, ship it'), null);
  assert.equal(extractFindings(null), null);
});

test('the live prompt carries the diff and never the answer key', () => {
  for (const c of all) {
    for (const role of REVIEW_ROLES) {
      const p = reviewPrompt(c, role);
      assert.ok(p.includes(c.patch.trimEnd()));
      assert.ok(!/known_defects|decoy|severity_floor/.test(p));
      for (const d of c.known_defects) {
        assert.ok(!p.includes(d.id), `${d.id} leaks`);
        assert.ok(!p.includes(d.note), `${d.id} note leaks`);
      }
    }
  }
});

// ── CLI, offline only ────────────────────────────────────────────────────────

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [RUN, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

test('CLI: scores a findings file of replies; exit 0 on a pass', () => {
  const dir = mkdtempSync(join(tmpdir(), 'review-catch-'));
  try {
    const file = join(dir, 'replies.jsonl');
    const rows = Object.entries(perfect()).map(([id, findings]) => JSON.stringify({ case: id, reply: `Review.\n\`\`\`json\n${JSON.stringify({ findings })}\n\`\`\`` }));
    writeFileSync(file, rows.join('\n') + '\n');
    const r = runCli(['--role', 'code-reviewer', '--split', 'all', '--findings', file]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /recall \(file:line \+ class\)\s+13\/13/);
    const empty = runCli(['--role', 'code-reviewer', '--split', 'all', '--findings', join(dir, 'none.jsonl')]);
    assert.equal(empty.status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: holdout per-case lines stay hidden unless asked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'review-catch-'));
  try {
    const file = join(dir, 'f.jsonl');
    const hold = casesFor(loaded, 'holdout');
    writeFileSync(file, hold.map((c) => JSON.stringify({ case: c.id, findings: [] })).join('\n') + '\n');
    const hidden = runCli(['--role', 'security-officer', '--split', 'holdout', '--findings', file]);
    assert.equal(hidden.status, 1, hidden.stderr);
    for (const c of hold) assert.ok(!hidden.stdout.includes(`${c.id}:`), `${c.id} shown`);
    const shown = runCli(['--role', 'security-officer', '--split', 'holdout', '--findings', file, '--show-holdout']);
    assert.ok(shown.stdout.includes('withdraw-toctou:'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: bad input is exit 2, and a live run refuses under CI without calling anything', () => {
  assert.equal(runCli(['--role', 'architect', '--live']).status, 2);
  assert.equal(runCli(['--role', 'code-reviewer']).status, 2);
  const ci = runCli(['--role', 'code-reviewer', '--live'], { CI: 'true', GREAT_CTO_EVAL_LIVE_IN_CI: '', ANTHROPIC_API_KEY: '', OPENROUTER_API_KEY: '' });
  assert.equal(ci.status, 2);
  assert.match(ci.stderr, /refusing a live run under CI/);
});
