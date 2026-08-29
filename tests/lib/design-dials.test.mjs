// Three declared numbers, so "make it look good" becomes something a reviewer
// can disagree with.
//
// DESIGN_VARIANCE, MOTION_INTENSITY and VISUAL_DENSITY are 1–10 dials taken from
// the taste-skill idea: they turn the part of a design that is otherwise taste
// into stated parameters. Stated, they can be argued about before implementation
// rather than after — which is the whole point of a design doc that a human
// approves.
//
// Each needs a REASON, not just a number. A bare `7/10` cannot be reviewed: there
// is nothing in it to agree or disagree with.
//
// A ratchet, not a gate. Five design documents predate this and are not going to
// be retrofitted from memory — the numbers would be invented, and an invented
// declaration is worse than none. The count may not grow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'docs', 'design');
const DIALS = ['DESIGN_VARIANCE', 'MOTION_INTENSITY', 'VISUAL_DENSITY'];

/** A dial is declared when it carries a number out of ten AND a reason after it. */
const declared = (text, dial) =>
  new RegExp(`${dial}:\\s*\\d{1,2}\\s*/\\s*10\\s*[—:-]\\s*\\S`).test(text);

function docs() {
  try { return fs.readdirSync(DIR).filter((f) => f.startsWith('DESIGN-') && f.endsWith('.md')); }
  catch { return []; }
}

/** Frozen 2026-08-29. May shrink. Growing means a new design skipped the block. */
const UNDECLARED_CAP = 5;

test('the design contract still asks for all three dials', () => {
  const agent = fs.readFileSync(path.join(ROOT, 'agents', 'design-advisor.md'), 'utf8');
  for (const d of DIALS) {
    assert.ok(agent.includes(d), `design-advisor.md must name ${d} for any design to declare it`);
  }
  // Whitespace-insensitive: the contract is prose and wraps where the line ends,
  // so a test anchored on the exact spacing fails on a reflow rather than on a
  // change of meaning.
  assert.match(agent.replace(/\s+/g, ' '), /1–10 \*\*with one line of why\*\*/,
    'the contract asks for a reason, not only a number — a bare number cannot be reviewed');
});

test('the number of designs with no declared dials does not grow', () => {
  const missing = docs().filter((f) => {
    const text = fs.readFileSync(path.join(DIR, f), 'utf8');
    return !DIALS.every((d) => declared(text, d));
  });
  assert.ok(missing.length <= UNDECLARED_CAP,
    `${missing.length} design documents declare no dials, up from a frozen ${UNDECLARED_CAP}:\n`
    + `  ${missing.join('\n  ')}\n`
    + '  A new design must declare DESIGN_VARIANCE, MOTION_INTENSITY and VISUAL_DENSITY,\n'
    + '  each n/10 with one line of why. See agents/design-advisor.md §0.');
});

test('a dial with a number but no reason does not count as declared', () => {
  assert.equal(declared('DESIGN_VARIANCE: 7/10', 'DESIGN_VARIANCE'), false,
    'a bare number is not a declaration — there is nothing in it to disagree with');
  assert.equal(declared('DESIGN_VARIANCE: 7/10 — an operator tool, so fluency beats novelty',
    'DESIGN_VARIANCE'), true);
});
