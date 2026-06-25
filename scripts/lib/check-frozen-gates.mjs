#!/usr/bin/env node
/**
 * check-frozen-gates — gates freeze before results exist (architect-loop R2, MIT).
 *
 * Acceptance gates for a slice are written to `docs/gates/<slice>.md` and
 * committed BEFORE any builder/senior-dev starts. They live where the builder
 * can't move them: a builder edit to a gate file (caught here via `git diff`) is
 * an automatic slice FAIL, regardless of whether the tests pass. This puts the
 * pass/fail criteria out of the agent's editable blast radius — "frozen external
 * gates beat trusting the agent."
 *
 * Allowed against the dispatch base: ADD a new gate file. Forbidden: MODIFY or
 * DELETE an existing one. The verification step (qa-engineer / architect-judge)
 * runs this before grading.
 *
 * Usage:
 *   node scripts/lib/check-frozen-gates.mjs [--base <ref>] [--dir docs/gates] [--json]
 * Exit: 0 = gates intact, 1 = tampered (slice FAIL), 2 = usage error.
 */

import { execFileSync } from 'node:child_process';

const GATE_DIR_DEFAULT = 'docs/gates';

/**
 * Pure core: given parsed `git diff --name-status` entries, return violations —
 * any MODIFY (M*) or DELETE (D) of a file under the frozen gate dir.
 * @param {{status:string, path:string}[]} entries
 * @param {string} gateDir
 */
export function frozenGatesViolations(entries, gateDir = GATE_DIR_DEFAULT) {
  const prefix = gateDir.endsWith('/') ? gateDir : `${gateDir}/`;
  return entries
    .filter((e) => e.path.startsWith(prefix))
    .filter((e) => {
      const s = e.status[0]; // R100/M etc → first char
      return s === 'M' || s === 'D' || s === 'R'; // modified / deleted / renamed-away
    })
    .map((e) => ({ status: e.status, path: e.path }));
}

export function parseNameStatus(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/\t/);
      // rename lines: "R100\told\tnew" — flag the OLD path as removed-from-frozen
      const status = parts[0];
      const path = status[0] === 'R' ? parts[1] : parts[parts.length - 1];
      return { status, path };
    });
}

function gitDiffNameStatus(base, dir) {
  const range = base ? `${base}..HEAD` : 'HEAD';
  const out = execFileSync('git', ['diff', '--name-status', range, '--', dir], { encoding: 'utf8' });
  return parseNameStatus(out);
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const dir = opt('--dir') || GATE_DIR_DEFAULT;
  const base = opt('--base'); // null → working tree vs HEAD
  const json = argv.includes('--json');

  let entries;
  try { entries = gitDiffNameStatus(base, dir); }
  catch (e) { console.error('check-frozen-gates: git diff failed —', e.message); process.exit(2); }

  const violations = frozenGatesViolations(entries, dir);
  if (json) console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));

  if (violations.length) {
    if (!json) {
      console.error('SLICE FAIL — frozen gate file(s) were modified after freeze:');
      for (const v of violations) console.error(`  ${v.status}\t${v.path}`);
      console.error('Gates are read-only once committed. Revert these and re-run; do not move the goalposts.');
    }
    process.exit(1);
  }
  if (!json) console.log(`✓ frozen gates intact (${dir})`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
