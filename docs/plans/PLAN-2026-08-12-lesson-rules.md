# PLAN — Lessons become rules, and exclusions get audited

Source: the AiSee fifteen-months writeup (Habr 1068920), checked against what
this repository already knows. Its useful claim is one we have proved three
times ourselves — a rule that fires mechanically beats a paragraph asking the
model to remember, roughly 18% adherence against 92% — and then it takes the
step we never took: every incident becomes a deterministic check that runs
BEFORE review, so the agent corrects itself instead of being corrected.

Our learning loop stops at prose. `lessons.md` → `/crystallize` → a skill is a
paragraph pipeline end to end; the incident that bought the lesson never becomes
a check. This closes that gap, plus the writeup's second observation, which we
re-created this very week: exclusion lists are bug reserves nobody re-reads.

## 1. `scripts/lib/lesson-rules.mjs` — the rule pack

Deterministic checks over a file's text. Every rule cites the incident that
bought it — a rule without a story gets deleted by the next person who finds it
inconvenient, and would deserve it.

Seed rules, all from THIS repository's incidents:

| Rule | Incident |
|---|---|
| `fabricated-cause` — a catch that reports a reason it did not observe (assigns a quoted why/error/message but never touches the caught error) | 2026-08-10: the wake-record catch printed "pipeline-wake unavailable in this board build"; the real error was a ReferenceError three lines up, and the guess sent the reader to packaging |
| `silent-catch` — a catch that neither uses the error nor carries a comment saying why swallowing is right | the repository's oldest defect: a read that failed must not look like an absence; every intentional catch here carries `/* reason */` |
| `exclusion-without-why` — an entry in a SKIP/EXCLUDE/IGNORE list with no justification | this week's own EXCLUDE_PATHS edits; the writeup's "excluded directories became bug reserves" |

Not a general linter. Three precise rules that have each cost us a real
debugging session, tuned against this codebase until the false-positive rate is
boring. Growth path: a lesson that recurs (shape-F in continuous-learner)
becomes a rule CANDIDATE — a human writes and lands the rule through normal
review, same polarity as gate:prompt.

## 2. `scripts/hooks/lesson-rules-check.mjs` — the self-correction loop

PostToolUse on Edit|Write|MultiEdit, same convention as reviewer-nudge:
findings return as `additionalContext`, so the agent that just wrote the file
fixes it in the next turn — before any reviewer, which is where the writeup's
value lived (203 self-corrections in two weeks, pre-commit). Never blocks;
opt-out `GREAT_CTO_DISABLE_LESSON_RULES=1`. Each firing is logged to
`.great_cto/lesson-rules.log`, so "how often does this save us" is a number we
can read rather than an impression.

## 3. The bug-reserve check — merged into the sweep

Planned as a separate `exclusion-audit.mjs`; implemented as the third rule of
the pack plus its `--sweep` mode, which covers the whole repository in one pass.
A second tool walking the same tree for the same question would have been the
duplication the Docs/Memory merge just removed. The sweep runs in ci-local with
`--strict`: it holds at zero findings today, so any finding is a regression
against a rule a real incident bought.

## What implementation taught the rules (recorded, because it is the method)

The first sweep flagged 341 sites; 338 were false. Each false class narrowed a
rule, and each narrowing is now a named test case: the one-line probe idiom
(323 sites), a catch that responds with a 400, a catch that writes the failure
to a stream, `missing.push(c)` recording the failure into the result,
cleanup-then-honest-null, a config map that happened to be named DENY, and a
walk that sailed past `]);` into a neighbouring keywords map. Three findings
survived — all genuine, all fixed in the same change. 341 → 0 in four
iterations is the writeup's loop, executed once.

## Not doing

- No quality-trend metric per 1000 lines — eval-drift already trends the thing
  we actually steer by (agent behaviour), and a second dashboard nobody reads is
  the artifact-lint warnings pile again.
- No porting of glint — Go-specific; the method transfers, the tool does not.
- No auto-generated rules. An optimiser writing its own ruler is the thing
  §3.3 of the improvement plan exists to prevent.
