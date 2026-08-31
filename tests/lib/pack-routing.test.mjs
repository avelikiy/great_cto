// A pack no signal can select is a file, not a capability.
//
// Measured on 2026-08-31: twenty-six knowledge packs shipped, and ten of them
// were named by nothing — not by ARCHETYPES.md, which names packs thirty-seven
// times, not by an agent, not by a command. accounting, adtech-privacy, edtech,
// gov, legaltech, msp, procurement, rcm, tax, us-ai: written, complete, and
// unreachable, in every install.
//
// This is the fourth instance of one shape in a single week — `ask_kimi`
// declared by nineteen agents and invoked by none; `acceptance-verify` whose
// only caller was its own test; `decision-scorer` with zero verdicts since May;
// now ten packs. The pattern is not bad luck, it is a missing class of check:
// nothing asked whether a declared capability was reachable. This asks, for
// packs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKS = path.join(ROOT, 'skills', 'great_cto', 'packs');

/** Everything that could name a pack in order to load it. */
function selectors() {
  const files = [];
  const walk = (dir, depth = 0) => {
    if (depth > 3) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (full !== PACKS) walk(full, depth + 1); continue; }
      if (/\.(md|toml|mjs)$/.test(e.name)) {
        try { files.push(fs.readFileSync(full, 'utf8')); } catch { /* unreadable */ }
      }
    }
  };
  for (const d of ['agents', 'commands', 'shared', 'skills']) walk(path.join(ROOT, d));
  return files.join('\n');
}

/** Frozen 2026-08-31 at zero. It may not grow. */
const ORPHAN_CAP = 0;

test('every knowledge pack can be selected by something', () => {
  const packs = fs.readdirSync(PACKS).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
  assert.ok(packs.length > 20, 'the packs directory is being read');

  const text = selectors();
  const orphans = packs.filter((p) => !text.includes(p));

  assert.ok(orphans.length <= ORPHAN_CAP,
    `${orphans.length} packs are named by nothing that could load them, up from a frozen `
    + `${ORPHAN_CAP}:\n  ${orphans.join('\n  ')}\n`
    + '  Add the signal to skills/great_cto/ARCHETYPES.md, or delete the pack. A pack\n'
    + '  shipped to every user and selectable by none costs everyone and helps nobody.');
});

test('the local copy of ARCHETYPES.md has not drifted from the shipped one', () => {
  // The project-local copy is what a running session reads. A routing table that
  // exists only in the source is a table the operator's own project does not have.
  const shipped = fs.readFileSync(path.join(ROOT, 'skills', 'great_cto', 'ARCHETYPES.md'), 'utf8');
  const local = fs.readFileSync(path.join(ROOT, '.great_cto', 'ARCHETYPES.md'), 'utf8');
  assert.equal(local, shipped,
    'run: cp skills/great_cto/ARCHETYPES.md .great_cto/ARCHETYPES.md');
});

test('each routed pack names a reviewer that exists', () => {
  // A pack that pairs with an agent nobody ships routes into nothing.
  const agents = new Set(fs.readdirSync(path.join(ROOT, 'agents'))
    .filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')));
  const table = fs.readFileSync(path.join(ROOT, 'skills', 'great_cto', 'ARCHETYPES.md'), 'utf8');
  const named = [...table.matchAll(/`([a-z-]+-reviewer)`/g)].map((m) => m[1]);
  const missing = [...new Set(named)].filter((r) => !agents.has(r));
  assert.deepEqual(missing, [], `the routing table pairs packs with agents that do not exist: ${missing.join(', ')}`);
});
