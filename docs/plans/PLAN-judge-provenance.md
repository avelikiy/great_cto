# PLAN — judge provenance on eval result rows

Source: `docs/architecture/ARCH-judge-provenance.md` (architect, DONE).
Scope as sized by the architect: ~40 lines across four files. This plan does
not re-decide anything the ARCH doc settled — it only decomposes it into
independently claimable work.

## The gap, in the data

The most recent row in `tests/eval/results-history.jsonl` (`EVAL-security-officer-finding-gate`,
run `2026-07-29T09:58:42.697Z`) already carries `caseResults[].judge: "dag"` on every case —
that field shipped today — but the row has no top-level `judge` and no `dagHash`. `eval-status.mjs`
reads `rate`/`threshold` off that row; `eval-gate.mjs` compares `rate` against a baseline row by
eval name. Neither looks inside `caseResults`, so at the level either consumer operates on, this
row is indistinguishable from a rubric row. That is the concrete instance of the problem this
plan closes.

## Task breakdown

| ID | Task | Owns (files) | Must not touch | Depends on | Parallel-safe with | Est. |
|----|------|---------------|-----------------|------------|---------------------|------|
| JP-1 | `dagFingerprint(dag)` — sha256 over `root`/nodes' `question`+`edges`/leaves' `score`, sorted keys, 12 hex chars | `scripts/lib/dag-metric.mjs`, `tests/lib/dag-metric.test.mjs` | any other file | — | JP-3, JP-4 | 3 min |
| JP-2 | Carry `judge` (`'rubric'`\|`'dag'`) and, on graph rows, `dagHash` from `runEvalFileOnce` up through `runEvalFile` into the `jsonlEntry` object at row assembly | `tests/eval/runner.mjs`, `tests/eval/runner.test.mjs` | `HISTORY_PATH`/`RESULTS_PATH` read or rewrite logic, anything outside the row-assembly path | JP-1 (imports `dagFingerprint`) | JP-3, JP-4 | 5 min |
| JP-3 | `judgeOf(row) = row.judge ?? 'rubric'`; add a `mismatched` bucket to `evaluateGate` (judge differs, or both `'dag'` with differing `dagHash`); `mismatched` sets `pass=false`; print it in the CLI | `scripts/eval-gate.mjs`, `tests/eval/eval-gate.test.mjs` | `runner.mjs`, `dag-metric.mjs`, `eval-status.mjs` | — | JP-1, JP-2, JP-4 | 5 min |
| JP-4 | Carry `judge` onto the object `statusFor` returns; add `judgeSwapped` (true when the newest row's `judge` differs from the prior row's `judge` for the same eval) | `scripts/lib/eval-status.mjs`, `tests/lib/eval-status.test.mjs` | `eval-gate.mjs`, `runner.mjs`, `dag-metric.mjs` | — | JP-1, JP-2, JP-3 | 4 min |
| JP-5 | Full-suite verification + close-out: `node --test`, confirm history file untouched, confirm diff is scoped to the four files above | none (read-only; no source edits) | any source file | JP-1, JP-2, JP-3, JP-4 | — (runs last) | 3 min |

Five tasks against a ~40-line, four-file change — at the edge of the "don't split finer than
the architecture" bound, kept because JP-5 is verification, not implementation, and the four
implementation tasks are genuinely independent claims.

Overlap check (`scripts/lib/check-lane-overlap.mjs`, JP-1..JP-4 file sets): **disjoint** — safe
to dispatch as four parallel worktrees.

## Dependency graph

```
gate:arch (approved)
  ├─ JP-1  dag-metric.mjs: dagFingerprint()              [no deps]
  ├─ JP-3  eval-gate.mjs: judgeOf() + mismatched bucket   [no deps]
  ├─ JP-4  eval-status.mjs: judge + judgeSwapped          [no deps]
  └─ JP-1 → JP-2  runner.mjs: carry judge/dagHash into the row
                  (imports dagFingerprint — the only real edge in this graph)

{JP-1, JP-2, JP-3, JP-4} → JP-5  full-suite verification
JP-5 → gate:ship
```

**Parallel-safe:** JP-1, JP-3, JP-4 start immediately and run concurrently — no shared files, no
data dependency. JP-2 can start immediately too (the ARCH doc already gives the 12-line
`dagFingerprint` sketch verbatim, so its shape is known before JP-1 lands) but **cannot merge**
until JP-1's export exists, since it imports `dagFingerprint` by name. JP-5 is sequential after
all four — it verifies the merged result, not a partial one.

**Sequential, not parallel:** nothing else. The four implementation files (`dag-metric.mjs`,
`runner.mjs`, `eval-gate.mjs`, `eval-status.mjs`) and their four test files are eight distinct
paths, each owned by exactly one task.

## Test obligation per task

The floor is 1047 green. Each row below states which existing test was checked by hand and
found safe, and which new test the task must add before it is done.

**JP-1 — `dag-metric.mjs`**
- Checked: `tests/lib/dag-metric.test.mjs` has no reference to `dagFingerprint` today — a pure
  addition, nothing currently asserts against its absence.
- New: `dagFingerprint` returns 12 hex chars; two DAGs equal except for key order hash equal;
  changing a `question` or an `edges` target changes the hash; changing only a leaf's `reason`
  or the DAG's `note` does **not** change the hash — this last case is the one the whole design
  leans on (§1 of the ARCH doc excludes `note`/`reason` on purpose) and must be pinned, not
  assumed.

**JP-2 — `runner.mjs`**
- Checked by hand, as the ARCH doc asked: `tests/eval/runner.test.mjs` lines 249–278
  (`parseEvalFile: result has all required fields for JSONL`) builds its **own** literal
  `jsonlEntry` object and asserts field types on that literal — it never calls the runner's real
  row-assembly code, never does `deepEqual` against a full row, and never asserts on
  `Object.keys(...).length` for a result object (the file's two `deepEqual` calls, lines 466–467,
  are on `parseActorStep` and are unrelated). Adding `judge`/`dagHash` keys to the real assembled
  row does not touch this test. Confirmed safe — no code change needed to keep it green.
- New: a rubric-only run's row carries `judge:'rubric'` and no `dagHash`; a DAG-scored run's row
  carries `judge:'dag'` and `dagHash` equal to `dagFingerprint(dag)` on the loaded graph.

**JP-3 — `eval-gate.mjs`**
- Checked: `tests/eval/eval-gate.test.mjs`'s `r()` fixture helper (line 18) omits `judge` on
  every row it builds, so `judgeOf(row)` resolves every existing fixture to `'rubric'`;
  base-vs-candidate stays rubric-vs-rubric for every current test, `mismatched` stays empty, and
  every existing regression/below-threshold/improvement assertion is unaffected.
- New: rubric baseline vs `dag` candidate → `mismatched`, `pass=false`; both `dag` with equal
  `dagHash` → compares normally (no false block); both `dag` with differing `dagHash` →
  `mismatched`, `pass=false`; a legacy row with **no** `judge` field vs a `dag` candidate → still
  `mismatched` (absent resolves to `'rubric'`, which differs from `'dag'` — the case the ARCH
  doc reasons about by name in §2 and the one most likely to be gotten backward).

**JP-4 — `eval-status.mjs`**
- Checked: `tests/lib/eval-status.test.mjs`'s `row()` fixture helper (line 16) also omits
  `judge`; `statusFor` today reads only `rate`/`threshold`/`ts` off the row, so passing `judge`
  through and adding `judgeSwapped` does not touch any `.state`/`.rate` assertion.
- New: the object `statusFor` returns surfaces `judge` from the newest row; `judgeSwapped` is
  `true` when the newest row's `judge` differs from the prior row's `judge` for the same eval,
  `false` when they match, and `false` (not `true`) when there is only one run — a swap needs
  two runs to compare.

**JP-5 — verification**
- Run `node --test` (or the project's test command) and confirm the count only grows: every
  pre-existing green test stays green, JP-1 through JP-4's new tests are green, none removed.
- Confirm `git diff --stat` touches exactly the eight files in the task table — nothing else.
- Does **not** invoke `tests/eval/runner.mjs` live. A live run needs an API key, costs money, and
  appends a real row to `results-history.jsonl` — verification is a code-correctness check, not
  a reason to touch the append-only file.

## Risk — the append-only file

`results-history.jsonl` must never be rewritten; no task may migrate old rows. **JP-2 is the one
task that comes closest to that line** — it is the only task that touches the file that owns
`HISTORY_PATH` and the `appendFileSync(HISTORY_PATH, ...)` call site (`tests/eval/runner.mjs`,
line 925 as of this plan).

What stops it from crossing:
- The change is scoped to the object literal serialized into that existing `appendFileSync`
  call — two new keys on the object, same call, same file, same line.
- JP-2's "must not touch" list explicitly bars any new `readFileSync(HISTORY_PATH...)`, any
  loop over the file's lines, and any second write path to it.
- Acceptance check for JP-2: `grep -n "HISTORY_PATH" tests/eval/runner.mjs` before and after the
  change must show the same two occurrences (the `const HISTORY_PATH = ...` declaration and the
  one `appendFileSync` call) — a third occurrence is the signal something started reading or
  rewriting the file and the task fails review on sight.
- No task backfills the 26 existing rows. `judgeOf(row) ?? 'rubric'` is a read-time inference
  (JP-3, JP-4), not a write. This matches ARCH §5 ("No backfill of old rows") directly.

## Beads tasks

Created with `bd create`, `--type task`, dependency edges via `--deps blocks:<id>`.

| ID | Beads issue | Depends on | Ready now? |
|----|-------------|------------|------------|
| JP-1 | `great_cto-kfys` — dag-metric.mjs: dagFingerprint() | — | yes |
| JP-2 | `great_cto-3stv` — runner.mjs: carry judge/dagHash into the row | `great_cto-kfys` | no — waits on JP-1 |
| JP-3 | `great_cto-tsgk` — eval-gate.mjs: judgeOf() + mismatched bucket | — | yes |
| JP-4 | `great_cto-060i` — eval-status.mjs: judge + judgeSwapped | — | yes |
| JP-5 | `great_cto-vzwd` — full-suite verification + close-out | `great_cto-kfys`, `great_cto-3stv`, `great_cto-tsgk`, `great_cto-060i` | no — waits on all four |

Verified with `bd dep tree great_cto-vzwd`: JP-1/JP-3/JP-4 show 0 active blockers (`bd ready`
lists all three today); JP-2 is blocked solely on JP-1; JP-5 is blocked on all four.

## Gate

`gate:plan` — this plan, at `docs/plans/PLAN-judge-provenance.md`. Approve to unblock JP-1,
JP-3, JP-4 (immediate) and JP-2 (on JP-1 merge). `gate:ship` follows JP-5.

## Revision history

- 2026-07-29 — initial plan from ARCH-judge-provenance.md (pm).
