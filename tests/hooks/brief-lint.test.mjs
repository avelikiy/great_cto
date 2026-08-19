// The product brief was read by nobody.
//
// `docs/product/BRIEF-*.md` matched no entry in artifact-lint's type registry,
// so `if (!type) continue` skipped the file whole — not its headings, not its
// freshness, not its dead source refs. A 153-line document called a brief sat in
// docs/product/ with no Problem, no Recommendation, no Debate digest and no
// Scope, and CI was green the entire time. It turned out not to be a brief at
// all; nothing had ever asked.
//
// The agent that writes these is the FIRST stage of the pipeline and its
// approval activates every stage after it — the most expensive thing here to get
// wrong, with the least checking on it.
//
// Headings alone were never going to be enough: a heading with nothing under it
// passes every structural check ever written. These rules read the section body.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LINTER = resolve(__dirname, '../../scripts/hooks/artifact-lint.mjs');

function lint(files) {
  const dir = mkdtempSync(join(tmpdir(), 'brieflint-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
    const r = spawnSync('node', [LINTER, '--json'], { cwd: dir, encoding: 'utf8' });
    return JSON.parse(r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const kinds = (r) => r.errors.map((e) => e.kind);
const today = new Date().toISOString().slice(0, 10);

/** A brief that satisfies every rule — each test breaks exactly one thing. */
const GOOD = `# Product Brief — thing
date: ${today}

## Problem
Operators lose 40% of a shift to re-entry [source: 2026-07 time study, n=12].
Rework costs about $8,000 a month [assumption].

## Recommendation
BUILD — the pain is measured and nobody serves it.

## The bet
One screen that removes re-entry.

## Differentiated wedge
[vs: Linear] optimises for notification volume; this optimises for what is owed.

## Debate digest

| Persona | Model | R1 | R2 | Status |
|---|---|---|---|---|
| Visionary | opus | y | y | ok |
| Skeptic | sonnet | y | y | ok |
| User-Advocate | haiku | y | y | ok |
| Pragmatist | kimi | y | y | ok |

Strongest FOR: measured pain. Strongest AGAINST: small market.

## Scope

**In (v1):**
- **THING-R1** — the one screen

**Out (v1):**
- everything else

## Risks & kill-criteria
- KILL: under 15% adoption at 60 days [owner: PM, source: analytics]

## Open questions for architect
- storage shape
`;

const brief = (body) => ({ 'docs/product/BRIEF-thing.md': body });

test('a brief with every section and every rule satisfied is clean', () => {
  assert.deepEqual(kinds(lint(brief(GOOD))), []);
});

test('a BRIEF is linted at all — the registry knows the type', () => {
  // The whole defect: an unmatched path was skipped silently.
  const r = lint(brief('# Product Brief — thing\n\nnothing here.\n'));
  assert.ok(r.errors.length >= 5, `expected the missing sections to be reported, got ${r.errors.length}`);
  assert.ok(kinds(r).includes('missing-section'));
});

// ── Rules that read the body, not the heading ───────────────────────────────

test('a kill criterion with no number is not a kill criterion', () => {
  const r = lint(brief(GOOD.replace('KILL: under 15% adoption at 60 days [owner: PM, source: analytics]',
    'KILL: adoption disappoints us')));
  assert.ok(kinds(r).includes('kill-without-threshold'));
});

test('an IN-scope item with no R-number is reported', () => {
  const r = lint(brief(GOOD.replace('- **THING-R1** — the one screen', '- the one screen')));
  assert.ok(kinds(r).includes('scope-without-r-number'));
});

test('the anti-scope half is exempt — a rule that fires on the deliberate half gets deleted', () => {
  // First cut required the literal phrase "out of scope" and flagged every
  // out-of-scope bullet for lacking an R-number.
  assert.deepEqual(kinds(lint(brief(GOOD))), [], 'the `**Out (v1):**` bullets must not be flagged');
});

test('R-numbers are checked with the grammar their only consumer parses', () => {
  // `board-R1` linted clean and parsed as nothing: requirement-coverage.mjs
  // requires an uppercase prefix. A looser check agrees with itself instead of
  // with the thing it exists to feed.
  const r = lint(brief(GOOD.replace('**THING-R1**', '**thing-R1**')));
  assert.ok(kinds(r).includes('scope-without-r-number'),
    'lowercase prefix must fail here, because it fails downstream');
});

test('a wedge that names no incumbent is reported', () => {
  const r = lint(brief(GOOD.replace('[vs: Linear] optimises for notification volume;',
    'A normal dashboard optimises for showing numbers;')));
  assert.ok(kinds(r).includes('wedge-without-named-rival'));
});

test('a debate digest with no per-persona status is reported', () => {
  // A panel that ran short reads exactly like one that ran: the four digest
  // slots are all fillable by two personas.
  const stripped = GOOD.replace(/\n\| Persona[\s\S]*?\n\n/, '\n\n');
  const r = lint(brief(stripped));
  assert.ok(kinds(r).includes('panel-status-undeclared'));
});

test('a figure with no source and no assumption label is reported', () => {
  const r = lint(brief(GOOD.replace(' [source: 2026-07 time study, n=12]', '')));
  assert.ok(kinds(r).includes('number-without-provenance'));
});

test('[assumption] satisfies the rule — labelling is the point, not sourcing', () => {
  // A brief that says what it made up is the goal. Requiring a source for every
  // figure would push authors to invent one.
  const r = lint(brief(GOOD.replace('[source: 2026-07 time study, n=12]', '[assumption]')));
  assert.ok(!kinds(r).includes('number-without-provenance'));
});

test('a missing section reports once, not once per body rule it would have failed', () => {
  // sectionBody returns null for an absent heading and the rule loop skips it —
  // an empty section and a missing one must not read the same.
  const noScope = GOOD.replace(/## Scope[\s\S]*?(?=## Risks)/, '');
  const k = kinds(lint(brief(noScope)));
  assert.ok(k.includes('missing-section'));
  assert.ok(!k.includes('scope-without-r-number'), 'the absence is one finding, not two');
});
