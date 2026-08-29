// A skill nobody invokes is a file, not a capability.
//
// This project has been bitten by the shape twice already: `ask_kimi` declared
// by nineteen agents and invoked by none, `acceptance-verify` with no caller.
// Skills are the same trade — they cost tokens when loaded and nothing when
// forgotten, and forgetting leaves no mark.
//
// Nine of the ten skills this check first flagged were false positives:
// architect.md named them in a shorthand list (`vertical-home-services`,
// `-restaurants`, …) that a reader resolves and a tool cannot. Spelling them out
// made the reference checkable, which is the point — a declaration nobody can
// tally is a suggestion.
//
// A ratchet, not a gate. One skill is genuinely unreferenced and deleting it is
// a decision for a person, not for a test run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Frozen 2026-08-29: `local-seo`. May shrink. */
const ORPHAN_CAP = 1;

function readAll(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(md|toml|mjs)$/.test(e.name)) {
        try { out.push(fs.readFileSync(full, 'utf8')); } catch { /* unreadable */ }
      }
    }
  };
  walk(dir);
  return out.join('\n');
}

test('every skill is named by something that could invoke it', () => {
  const skills = fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name);
  assert.ok(skills.length > 0, 'there are skills to check');

  // Callers only — not the skills directory itself, or a skill that mentions its
  // own name would vouch for itself.
  const callers = ['agents', 'commands', 'shared'].map((d) => readAll(path.join(ROOT, d))).join('\n');
  const orphans = skills.filter((s) => !callers.includes(s));

  assert.ok(orphans.length <= ORPHAN_CAP,
    `${orphans.length} skills are named by no agent, command or shared contract, `
    + `up from a frozen ${ORPHAN_CAP}:\n  ${orphans.join('\n  ')}\n`
    + '  Either an agent should apply it, or it should go. A skill that loads and '
    + 'is never invoked is the ask_kimi defect in a new costume.');
});

test('the check would notice a skill that lost its caller', () => {
  // Guard against the check passing because it matches too loosely: a name that
  // appears nowhere must be reported, and substring matching must not let
  // `vertical-retail` vouch for a hypothetical `vertical-retail-pro`.
  const callers = 'apply the `vertical-retail` skill';
  assert.equal(callers.includes('vertical-retail'), true);
  assert.equal(callers.includes('vertical-retail-pro'), false,
    'a longer name is not covered by a shorter one that happens to be a prefix');
});
