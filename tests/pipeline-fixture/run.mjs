#!/usr/bin/env node
/**
 * tests/pipeline-fixture/run.mjs — the pipeline, run against a written-down answer.
 *
 * Until now the only way to find out what the pipeline would DO — advance, hold at
 * a gate, refuse an unverified stage — was to run it on a real project with real
 * agents and real money. So the deterministic spine of this product, the part that
 * decides whether an irreversible operation gets a human, was exercised by hand,
 * occasionally, at a cost per look.
 *
 * Borrowed from anthropics/oncall-kit, whose fixture is a fictional team's
 * 48-incident history with an answer key: "change a skill, re-run it, diff against
 * the key." The same shape this repository already uses for archetype detection
 * (an expected.json beside each of 28 fixtures) — extended from "what is this project"
 * to "what would the pipeline decide next".
 *
 * Every scenario calls the REAL `decideNext`. Nothing is stubbed but the clock.
 *
 * Usage:
 *   node tests/pipeline-fixture/run.mjs          # all scenarios
 *   node tests/pipeline-fixture/run.mjs --json
 *   node tests/pipeline-fixture/run.mjs 02       # scenarios whose name contains "02"
 *
 * Exit 0 = every scenario matched its key. Non-zero = the number that did not.
 */
import { readdirSync, readFileSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideNext } from '../../scripts/hooks/pipeline-dispatcher.mjs';
import { writeScore } from '../../scripts/lib/scores.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'scenarios');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const filter = args.find((a) => !a.startsWith('--'));

const C = process.stdout.isTTY
  ? { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[2m', hd: '\x1b[1m', off: '\x1b[0m' }
  : { ok: '', bad: '', dim: '', hd: '', off: '' };

/** What the fixture compares. Only the fields a key names are checked, so a key
 *  stays a statement about ONE property rather than a snapshot of every field —
 *  a snapshot breaks on every unrelated change and gets regenerated without being
 *  read, which turns the key back into a mirror of the code. */
function compare(expect, got) {
  const diffs = [];
  const text = String(got?.text ?? '');
  for (const [k, want] of Object.entries(expect)) {
    if (k === 'textIncludes') {
      // Substrings of the DIRECTIVE, because the directive is the product's
      // output — it is what the model reads and what the operator is shown.
      for (const frag of want) if (!text.includes(frag)) diffs.push(`directive is missing: ${JSON.stringify(frag)}`);
      continue;
    }
    if (k === 'textExcludes') {
      // The half a key usually forgets. A directive that gains a second, wrong
      // explanation still contains the right one.
      for (const frag of want) if (text.includes(frag)) diffs.push(`directive must NOT say: ${JSON.stringify(frag)}`);
      continue;
    }
    const have = got?.[k];
    if (JSON.stringify(have ?? null) !== JSON.stringify(want ?? null)) {
      diffs.push(`${k}: expected ${JSON.stringify(want)}, got ${JSON.stringify(have ?? null)}`);
    }
  }
  return diffs;
}

/**
 * Some scenarios need a project on disk: the verify gate looks for a score, and
 * with no directory it cannot look. Built per scenario from `givenProject` and
 * removed after, so a run leaves nothing behind and two runs cannot interfere.
 */
function materialise(spec) {
  if (!spec) return { cwd: null, cleanup: () => {} };
  const root = mkdtempSync(join(tmpdir(), 'gcto-fixture-'));
  mkdirSync(join(root, '.great_cto', 'verdicts'), { recursive: true });
  mkdirSync(join(root, 'docs', 'architecture'), { recursive: true });
  writeFileSync(join(root, 'docs/architecture/ARCH-x.md'), '# ARCH\n' + 'x'.repeat(400));
  for (const a of spec.verdicts ?? []) {
    writeFileSync(join(root, '.great_cto', 'verdicts', `${a}.log`), '');
  }
  if (spec.score) {
    writeScore(root, {
      agent: 'architect', runTs: '2026-08-26T20:00:00Z',
      name: 'independent-verify', state: spec.score, scorer: 'mechanical',
    });
  }
  return { cwd: root, cleanup: () => { try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } } };
}

const names = readdirSync(DIR)
  .filter((n) => !n.startsWith('.') && !n.startsWith('_'))
  .filter((n) => statSync(join(DIR, n)).isDirectory())
  .filter((n) => !filter || n.includes(filter))
  .sort();

let pass = 0; const failures = [];
const results = [];

for (const name of names) {
  const path = join(DIR, name, 'scenario.json');
  let s;
  try { s = JSON.parse(readFileSync(path, 'utf8')); }
  catch (err) {
    // A scenario that cannot be read is not a scenario that passed.
    failures.push({ name, diffs: [`scenario.json unreadable (${err.code ?? err.message})`] });
    results.push({ name, ok: false, unreadable: true });
    continue;
  }
  const project = materialise(s.givenProject);
  let got, threw = null;
  try { got = decideNext({ ...s.given, cwd: project.cwd ?? s.given.cwd ?? null }); }
  catch (err) { threw = err; }
  finally { project.cleanup(); }
  const diffs = threw ? [`decideNext threw: ${threw.message}`] : compare(s.expect, got);
  const ok = diffs.length === 0;
  if (ok) pass++; else failures.push({ name, diffs, what: s.what, got });
  results.push({ name, ok, what: s.what, diffs });

  if (!asJson) {
    console.log(`${ok ? C.ok + '  ✓' : C.bad + '  ✗'}${C.off} ${name}`);
    console.log(`${C.dim}      ${s.what}${C.off}`);
    for (const d of diffs) console.log(`${C.bad}      ${d}${C.off}`);
  }
}

if (asJson) {
  console.log(JSON.stringify({ total: names.length, pass, fail: failures.length, results }, null, 2));
} else {
  console.log();
  if (names.length === 0) {
    // "No scenarios" is not "everything passed".
    console.log(`${C.bad}no scenarios found${filter ? ` matching "${filter}"` : ''} in ${DIR}${C.off}`);
    process.exit(2);
  }
  console.log(failures.length === 0
    ? `${C.ok}${C.hd}  ${pass}/${names.length} scenarios match the key${C.off}`
    : `${C.bad}${C.hd}  ${failures.length} of ${names.length} scenarios diverged from the key${C.off}`);
}
process.exit(failures.length);
