// The one screen that replaces the `product` gate at ship-only.
//
// A gate stops you and waits. This does not: it prints what is about to be built,
// once, and the pipeline continues. Staying silent is consent; speaking
// interrupts. That trade is only honest while the screen actually appears, so the
// reader returns null when it cannot produce one — and approval-level re-gates
// `product` on null rather than proceeding.
//
// It is deliberately SHORT. A briefing nobody finishes reading is a gate that
// takes time and gives nothing: the recommendation, the bet, the kill-criteria,
// the open questions, and where to read the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefScreen } from '../../scripts/lib/brief-screen.mjs';

const BRIEF = `# Product Brief — a storefront that survives a bad network

## Recommendation
Build the offline-first checkout. Ship the queue before the UI.

## Problem
Field users lose orders when signal drops.

## The bet
Reliability wins this segment, not features.

## Risks & kill-criteria
Kill if fewer than 20% of orders are created offline after four weeks.

## Open questions for the architect / implementer (the HOW, left open)
- Which conflict rule for a re-submitted order?
`;

test('the screen carries the decision, not the whole document', () => {
  const s = briefScreen(BRIEF, { path: 'docs/product/BRIEF-x.md' });
  assert.match(s, /Build the offline-first checkout/, 'the recommendation is the point');
  assert.match(s, /Reliability wins this segment/, 'the bet says why');
  assert.match(s, /fewer than 20% of orders/, 'the kill-criteria say when to stop');
  assert.doesNotMatch(s, /Debate digest/, 'sections that are not a decision stay in the file');
  assert.match(s, /docs\/product\/BRIEF-x\.md/, 'and it says where to read the rest');
});

test('it says silence is consent, because that is the trade', () => {
  const s = briefScreen(BRIEF, { path: 'p.md' });
  assert.match(s, /say nothing|silent|continues|proceeds/i,
    'the operator must know that not answering is answering');
});

test('it fits a screen', () => {
  const s = briefScreen(BRIEF, { path: 'p.md' });
  const lines = s.split('\n').length;
  assert.ok(lines <= 24, `a briefing nobody finishes is a gate that costs time and gives nothing; got ${lines} lines`);
});

test('a brief with no recommendation produces no screen', () => {
  // Not a screen saying "no recommendation found" — null, so the caller re-gates.
  // A briefing that briefs nothing is worse than the gate it replaced.
  assert.equal(briefScreen('# Product Brief\n\n## Problem\nsomething\n', { path: 'p.md' }), null);
  assert.equal(briefScreen('', { path: 'p.md' }), null);
  assert.equal(briefScreen(null, { path: 'p.md' }), null);
});

test('a long recommendation is trimmed, not dropped', () => {
  const long = '# B\n\n## Recommendation\n' + 'word '.repeat(400) + '\n';
  const s = briefScreen(long, { path: 'p.md' });
  assert.ok(s, 'a verbose brief still briefs');
  assert.ok(s.split('\n').length <= 24, 'and still fits');
});

test('a section whose body spans lines is read whole', () => {
  // The first version used /im, where `$` matches end-of-LINE, so the lazy capture
  // stopped at the first newline and every real brief produced an empty section —
  // and no test caught it, because the fixture's recommendation was one line. A
  // fixture simpler than the data is a test that passes on broken code.
  const s = briefScreen([
    '# B', '', '## Recommendation', '',
    '**BUILD — one merged work stream:** make the data layer honest, and on top of',
    'it build the one screen the board is missing. These are not two bets.',
    'The decisive reason: it can allocate attention only if it can see the fleet.',
    '', '## Problem', 'x', '',
  ].join('\n'), { path: 'p.md' });
  assert.ok(s, 'a real brief produces a screen');
  // Flattened: the screen WRAPS, so a phrase may legitimately straddle two lines.
  // Asserting on the unwrapped text would fail on correct rendering.
  const flat = s.replace(/\s+/g, ' ');
  assert.match(flat, /make the data layer honest/, 'the second line of the section is not lost');
  assert.match(flat, /not two bets/, 'nor the third');
  assert.doesNotMatch(flat, /\*/, 'and no stray asterisk survives the emphasis stripping');
});

test('markdown does not leak into a screen a person reads', () => {
  const s = briefScreen([
    '# B', '', '## Recommendation', '',
    '**BUILD — one stream:** make it honest. See `readVerdicts()`.', '',
    '## Risks & kill-criteria', '',
    '| Risk | Threshold |', '|---|---|', '| Nobody opens it | under 3 opens a week |', '',
  ].join('\n'), { path: 'p.md' });
  assert.doesNotMatch(s, /\*\*|\|---|`/, 'asterisks, backticks and table rules are not prose');
  assert.match(s, /BUILD — one stream/, 'the words survive the stripping');
  assert.match(s, /under 3 opens a week/, 'a table becomes readable rather than disappearing');
});

test('the label column does not collide with the text', () => {
  const s = briefScreen('# B\n\n## Recommendation\nShip the queue first.\n', { path: 'p.md' });
  const row = s.split('\n').find((l) => l.includes('Ship the queue'));
  assert.match(row, /:\s{2,}Ship/, 'a label as long as the column needs at least one space after it');
});
