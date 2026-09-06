# IMPL-BRIEF-great_cto-ki1x.1.md — BRD-R1 diff-identity field in the review log

## Task

- **bd task:** `great_cto-ki1x.1` — BRD-R1: add diff-identity field (git head + dirty flag) to reviewLogLine
- **Feature:** `board-redesign-2026-09` · PLAN: `docs/plans/PLAN-board-redesign-2026-09.md`
- **Source docs:** `docs/product/BRIEF-board-redesign-2026-09.md` (BRD-R1, BRD-R2, K5) + `docs/design/DESIGN-board-redesign-2026-09.md` §0.6 L-nothing (no design lock touches this file — it is data, not UI)
- **Implements REQ:** BRD-R1

> **This is the one expensive-to-undo item in the whole feature.** It appends a field to
> `.great_cto/cross-review.log`, an evidence file. Additive-only. Gated separately at
> `gate:evidence-schema` before merge — do not skip that gate to save time.

## Files to modify

| File / glob | Why it changes |
|---|---|
| `scripts/lib/cross-model-review.mjs` | `reviewLogLine()` gains a `sha` (git head) + `dirty` (boolean) field, matching the receipt shape the Claude reviewer already writes elsewhere |
| `scripts/lib/cross-model-review.test.mjs` | RED tests: new field present, additive, existing 3-line log format still parses |
| any call site of `reviewLogLine(...)` (grep the repo — it is called from the CLI path in this same file and possibly `codex-exec.mjs`) | must pass the new fields through |

## Files NOT to modify

| File / glob | Why it's off-limits | Who owns it |
|---|---|---|
| `packages/board/public/index.html` | Lane A's file — this task is data-layer only, no UI change | senior-dev (Lane A, T-A01..T-A13) |
| `packages/board/lib/routes.mjs` | The READER side is a separate task (BRD-R2, `great_cto-ki1x.3`) — do not pre-empt it here | senior-dev (T-R1-02) |
| `.great_cto/cross-review.log` (the log FILE itself) | Evidence file — the code writes to it; this brief does not hand-edit or truncate it | n/a — evidence |

## Step-by-step

1. Read `scripts/lib/cross-model-review.mjs:57-64` (`reviewLogLine`) and the Claude reviewer's receipt writer (grep `git rev-parse HEAD` / `--porcelain` in the repo) to confirm dirty-flag precedent exists.
2. Write a failing test asserting `reviewLogLine({...})` output JSON includes `sha` and `dirty` keys.
3. Implement: compute `sha` via `git rev-parse HEAD`, `dirty` via `git status --porcelain` non-empty, both injectable (pure function takes them as params — no direct `execSync` inside the pure function, per the file's own "pure/CLI split" pattern at the top of the file).
4. Update call site(s) to pass the new params.
5. Write a test proving an OLD-shape log line (no `sha` key) still parses as valid JSON — i.e. the change is additive, not a rewrite of the schema.
6. Run `node --test scripts/lib/cross-model-review.test.mjs` (or the closest existing test file) green.

## API-CONTRACT

- **Surface:** `reviewLogLine({ provider, model, state, verdict, findings, cost, source, error_kind, resets_at, sha, dirty })` — pure function, returns a JSON string (one log line).
- **Input:** `sha: string | null` (git HEAD at review time), `dirty: boolean | null` (working tree had uncommitted changes at review time). Both optional at the call site for backward compatibility during rollout, but the CLI path always supplies them going forward.
- **Output (success):** JSON string with all existing fields UNCHANGED in name/shape, plus `sha` and `dirty` appended.
- **Errors:** none new — this is a pure serializer, no I/O, no throw paths added.
- **Invariants:** **additive only.** No existing key is renamed, removed, or re-typed. A line written before this change must remain parseable by any reader (BRD-R2 reader treats absence of `sha` as `unreadable`, not as a parse error).

## TEST-SPEC

| # | Case | Expected |
|---|---|---|
| 1 | `reviewLogLine({..., sha: 'abc123', dirty: false})` | output JSON has `"sha":"abc123","dirty":false` |
| 2 | `reviewLogLine({...})` with no `sha`/`dirty` passed | output JSON has `"sha":null,"dirty":null` — never `undefined`, never omitted (so a reader can distinguish "not supplied" from "key doesn't exist") |
| 3 | an existing (pre-change) line from `.great_cto/cross-review.log` (fixture, copied verbatim) | still parses as valid JSON; all its original keys unchanged |
| 4 | K5 regression guard: run the full existing test suite for this file | 0 lines lost, 0 non-additive diffs to the log format |

- Coverage target: 100% of the new branch (this is the evidence-file change; PROJECT.md's ≥80% floor is the minimum, not the target here).
- Run: `node --test scripts/lib/cross-model-review.test.mjs` (create if it doesn't exist yet — check first).

## ACCEPTANCE

- [ ] Every row in **TEST-SPEC** has a passing test
- [ ] `sha`/`dirty` are additive — no existing key renamed/removed/re-typed
- [ ] A fixture of the CURRENT 3-line `.great_cto/cross-review.log` still parses unchanged
- [ ] No file outside **Files to modify** was changed
- [ ] No file in **Files NOT to modify** was touched
- [ ] `gate:evidence-schema` requested and approved BEFORE this merges to main

## Out of scope / deferred

- The READER that classifies a line lacking `sha` as `unreadable` — that is `great_cto-ki1x.3` (BRD-R2), a separate task, separate file (`routes.mjs`).
- Option (b)/(c) from BRIEF Q1 (gate-id join, content-hash join) — (a) git-head+dirty is the accepted default; if the "two reviewers, different staged states" collision risk is later confirmed real, that is a follow-up task, not a scope expansion here.

## Revision history

| Date | Author | Change |
|---|---|---|
| 2026-09-06 | pm | Initial brief |
