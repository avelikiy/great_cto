/**
 * A test whose verdict depends on today's date is a time bomb.
 *
 * On 2026-09-05 three tests in gate-state and one in pipeline-position began
 * failing on their own — green the previous morning, red the next, with no
 * commit in between. Their fixtures were frozen at 2026-08-06 and
 * `MAX_VERDICT_AGE_MS` is thirty days, so the clock crossed the threshold while
 * nobody was looking.
 *
 * The cost is not the failure, it is the diagnosis: a red gate with no cause
 * sends someone hunting a regression that does not exist. It cost exactly that
 * here — a bisect across four commits, all of them innocent.
 *
 * So: any fixture date that is COMPARED AGAINST AN AGE LIMIT must be relative to
 * now. Absolute dates are fine everywhere else — in a changelog assertion, a
 * parser fixture, a filename — and this guard deliberately only looks at the
 * files where an age threshold is in play.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TESTS = join(REPO, 'tests');

/** Modules whose behaviour turns on how old something is. */
const AGE_SENSITIVE = /MAX_VERDICT_AGE_MS|STALE_AFTER|maxAgeMs|ageMs|stale_after|freshness/i;

function testFiles() {
  const out = [];
  (function walk(d) {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) { if (e !== '__pycache__' && e !== 'baselines') walk(p); continue; }
      if (e.endsWith('.test.mjs')) out.push(p);
    }
  })(TESTS);
  return out;
}

// Files whose frozen dates are DATA, not comparands. A ratchet: it may shrink.
//
// Deciding statically whether a date is compared against a threshold is not
// possible — the heuristic can only see that a file mentions both. So a file
// that has been read and judged safe is listed here with the reason, which is
// honest, and a new entry is a decision someone has to write down.
const CHECKED_AND_SAFE = {
  'tests/lib/eval-status.test.mjs':
    'declares a file-level `const NOW = Date.parse(...)` and passes `{ now: NOW }` into every case, so its ' +
    'fixtures are dated against that frozen clock and never against the wall clock',
  'tests/hooks/pipeline-dispatcher.test.mjs':
    'dates live inside verdict-line fixtures (format data); freshness there is judged from file mtime, ' +
    'which the test backdates explicitly',
};

test('no age-sensitive test compares against a frozen date', () => {
  const offenders = [];
  for (const p of testFiles()) {
    if (p.endsWith('no-calendar-bombs.test.mjs')) continue;
    const src = readFileSync(p, 'utf8');
    if (!AGE_SENSITIVE.test(src)) continue;

    // A full ISO date sitting in a file that also reasons about age.
    const frozen = [...src.matchAll(/'(\d{4}-\d{2}-\d{2}T[\d:.]+Z)'/g)].map((m) => m[1]);
    if (!frozen.length) continue;

    // A frozen date is safe when the SAME test supplies its own `now` — that is
    // the correct way to freeze time deliberately. Checked per test block, not
    // per file: the first version excused the whole file if any test anywhere in
    // it passed a `now`, and mutation caught that immediately — re-freezing a
    // date elsewhere in the file went unnoticed.
    const blocks = src.split(/\ntest\(/);
    const unanchored = [];
    for (const [idx, b] of blocks.entries()) {
      // A date wrapped in Date.parse() is a clock being DECLARED, not a fixture
      // being compared — that is how a test freezes time on purpose.
      const b2 = b.replace(/Date\.parse\('[^']*'\)/g, 'CLOCK');
      const dates = [...b2.matchAll(/'(\d{4}-\d{2}-\d{2}T[\d:.]+Z)'/g)].map((m) => m[1]);
      if (!dates.length) continue;
      // The header is NOT exempt. The bomb that started this was a header
      // constant — `const RAISED = '2026-08-06T10:00:00Z'` — shared by every
      // test below it. Skipping index 0 made the guard blind to its own
      // motivating case, which mutation caught.
      void idx;
      // Any explicitly supplied clock counts, whatever it is called: `now:`,
      // `nowMs:`, `nowIso:`. Matching only `now:` flagged freshness.test.mjs,
      // which passes `nowMs` and is perfectly safe — a guard's first job is not
      // to cry wolf.
      if (/\bnow[A-Za-z]*\s*:/.test(b)) continue;
      unanchored.push(...dates);
    }
    if (!unanchored.length) continue;

    const rel = relative(REPO, p);
    if (rel in CHECKED_AND_SAFE) continue;
    offenders.push(`${rel} (${unanchored.length} frozen date(s) with no explicit now)`);
  }

  assert.deepEqual(offenders, [],
    'these compare frozen dates against an age limit — they will fail on a future date, ' +
    'with no commit to blame. Anchor the fixtures to Date.now(), or pass an explicit `now`.');
});

test('every exemption names a file that still exists', () => {
  // An exemption for a deleted file is a hole nobody can see: the name stays,
  // and a NEW file at that path inherits a pass it never earned.
  for (const f of Object.keys(CHECKED_AND_SAFE)) {
    assert.ok(existsSync(join(REPO, f)), `exempted file is gone — drop the entry: ${f}`);
  }
});
