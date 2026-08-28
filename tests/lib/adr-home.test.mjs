// One home for architecture decisions, and everything must point at it.
//
// Eleven ADRs lived in `docs/adr/`. Twenty-nine files — architect, senior-dev,
// project-auditor, decision-scorer, `/audit`, `/doctor`, `/resume` — told agents
// to read and write them in `docs/decisions/`, which held one unrelated file.
//
// Nothing failed. `/resume` printed an empty "Latest ADR" every session, and an
// agent asked what the project had decided opened an empty directory and
// concluded nothing had been. Among the invisible records was ADR-009, which
// CLAUDE.md leans on for the entire gate philosophy.
//
// That is this project's own defect class pointed at itself: an absence
// rendered as an answer. A path typo cannot be caught by review — reviewers
// read prose, not directory listings — so it is caught here instead.
//
// `docs/decisions/` is NOT wrong in general: it is where the decision LOG
// lives. Only the ADR half moved. This test polices that split rather than
// banning the directory.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const ADR_DIR = 'docs/adr';

/** Files git tracks, minus the changelog, which records history and may name old paths. */
function tracked() {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  // This file is excluded from its own scan: it has to write the forbidden
  // pattern down in order to forbid it. (Found the honest way — the test passed
  // while it was untracked and failed the moment it was committed.)
  const self = 'tests/lib/adr-home.test.mjs';
  return out.split('\n').filter((f) =>
    f && f !== 'CHANGELOG.md' && f !== self && !f.startsWith('.claude/worktrees/')
    && /\.(md|mjs|js|sh|toml|json)$/.test(f));
}

test('the ADRs are where the repository says they are', () => {
  assert.ok(existsSync(path.join(ROOT, ADR_DIR)), `${ADR_DIR} must exist`);
  const adrs = readdirSync(path.join(ROOT, ADR_DIR)).filter((f) => /^ADR-\d+.*\.md$/.test(f));
  assert.ok(adrs.length > 0, `${ADR_DIR} holds the ADRs — an empty one means they moved again`);
});

test('nothing sends an agent to look for an ADR in the decision log', () => {
  const offenders = [];
  for (const f of tracked()) {
    let text;
    try { text = readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    // The ADR half only. `docs/decisions/DECISION-LOG.md` is a different artefact
    // and stays exactly where it is.
    const m = text.match(/docs\/decisions\/ADR[^\s)`"']*/g);
    if (m) offenders.push(`${f} → ${[...new Set(m)].join(', ')}`);
  }
  assert.deepEqual(offenders, [],
    'ADRs live in docs/adr/ — a reference to docs/decisions/ADR-* reads an empty directory ' +
    'and reports "no decision" for a decision that was made');
});

test('every ADR the prose cites by number exists on disk', () => {
  // The second half of the same failure: a path can be right and still name a
  // record nobody wrote. CLAUDE.md builds its gate rule on ADR-009; a reader
  // sent to a file that is not there learns nothing and cannot tell whether the
  // rule was ever decided or merely asserted.
  const have = new Set(
    readdirSync(path.join(ROOT, ADR_DIR))
      .map((f) => (f.match(/^ADR-(\d+)/) || [])[1])
      .filter(Boolean)
      .map((n) => String(Number(n))));

  const cited = new Map();
  for (const f of tracked()) {
    let text;
    try { text = readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/\bADR-(\d{3})\b/g)) {
      const n = String(Number(m[1]));
      // Illustrative material cites numbers that were never meant to resolve:
      // skill references show what a deprecations table looks like using
      // `framework X` and `@alex`, templates carry `ADR-{NN}` placeholders, and
      // test fixtures need an id that is deliberately absent. Measured against
      // this repository, every citation outside these three places resolves.
      if (/^tests\//.test(f)) continue;
      if (/\/(templates|references)\//.test(f)) continue;
      if (/template/i.test(path.basename(f))) continue;
      if (!have.has(n)) cited.set(`ADR-${m[1]}`, (cited.get(`ADR-${m[1]}`) || new Set()).add(f));
    }
  }
  const missing = [...cited.entries()].map(([adr, files]) =>
    `${adr} cited in ${[...files].slice(0, 3).join(', ')}`);
  assert.deepEqual(missing, [], 'a cited ADR that does not exist is an argument with no record behind it');
});
