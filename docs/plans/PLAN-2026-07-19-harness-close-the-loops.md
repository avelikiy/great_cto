# PLAN — Close the loops (harness self-correction)

> **Feature slug:** `harness-close-the-loops` · **Mode:** `full` (project_size: medium)
> **Source brief:** approved product-owner findings F1–F5 (2026-07-19)
> **Status:** awaiting `gate:plan`
> Goal ancestry: `[archetype:devtools] [compliance:openssf,api-stability,soc2-type-2] [feature:harness-close-the-loops] [phase:implementation]`

## Why

Five loops in the harness are open — each one produces an output nobody checks:

| ID | Loop | Failure mode |
|----|------|--------------|
| F1 | Quality oracle | Scores filenames, not behaviour. A tree with a broken suite scores 93 (A). |
| F2 | Board readers | ~26 readers return `[]` on failure; UI renders emptiness as truth. |
| F3 | Pipeline stage state | Interruption loses which stages ran. `booking` silently skipped QA+security. |
| F4 | Learning loop | `/crystallize approve` commits to `skills/**` with no eval; GP schema broken. |
| F5 | Decisions log | Gate-approve writes private client names to a **global** cross-project file. |

Outcome statement: *Enable the harness to detect its own regressions before a human does, so that a published benchmark number means something.*

---

## Verification notes (grounded before planning)

Two details in the brief were corrected against the code — they change file ownership:

1. **`appendDecisionLog` lives in `packages/board/lib/fleet.mjs:308`**, not `routes.mjs`. `routes.mjs:20` imports it; `routes.mjs:~368` calls it inside the gate-approve lock window. So F5's write-path fix owns **fleet.mjs**, and `routes.mjs` is a one-line caller change.
2. **`scripts/lib/quality.mjs:assess()` already composes the full score** — `floor` (product-score) + `ceiling` (product-eval `runEval`, which does execute `npm test`) + `contracts`. F1 is therefore a **wiring** task, not new scoring logic. `evaluateGate()` (quality.mjs:55) is also already written and unit-tested.

Also confirmed:
- All 10 benchmark product trees exist at `~/bench/{ats,booking,classes,coaching,dashboard,dispatch,leadcrm,portal,quoting,...}` and `~/bench/results.jsonl` has 10 rows → **T1 is feasible today at $0**.
- `scripts/bench-collect.mjs` already calls `runTests(dir)` independently (line 373) and stores `tests.ran` — the null-score rule has a source of truth already in the row.
- Existing unit tests to extend: `tests/lib/product-score.test.mjs`, `tests/lib/product-eval.test.mjs`, `tests/lib/quality.test.mjs`, `tests/bench-collect.test.mjs`.

---

## Task breakdown

Sizes: **XS** ≤10 min · **S** ≤25 min · **M** ≤45 min (LLM agent wall-clock, not human hours).

| ID | Task | Type | Owns (write-zone) | Deps | Size | Est | Gate |
|----|------|------|-------------------|------|------|-----|------|
| T1 | Re-score 10 bench products through the executing oracle | MEASURE | `docs/benchmarks/RESCORE-2026-07-19.md` (new) | — | M | 45m* | **gate:measure** |
| T2 | F5: scope decisions log per project | SEC | `packages/board/lib/fleet.mjs`, `packages/board/lib/routes.mjs`, `packages/board/decisions-scope.test.mjs` (new) | — | S | 20m | — |
| T3 | F5: point agent readers at project-local log | SEC | `agents/senior-dev.md`, `agents/pm.md`, `agents/architect.md` | T2 | XS | 10m | — |
| T4 | ADR-008: decisions-log isolation | DOC | `docs/adr/ADR-008-decisions-log-isolation.md` (new) | T2 | XS | 15m | — |
| T5 | F1: `tests.ran === false` → `score: null` | LLM | `scripts/lib/product-eval.mjs`, `scripts/lib/quality.mjs`, `tests/lib/quality.test.mjs` | gate:measure | XS | 15m | — |
| T6 | F1: wire `quality.assess()` into bench-collect | LLM | `scripts/bench-collect.mjs`, `tests/bench-collect.test.mjs` | T5 | S | 25m | — |
| T7 | F1: make devops quality gate executable | INFRA | `agents/devops.md` | T6 | XS | 10m | — |
| T8 | F2: shared `readSafe` helper that surfaces errors | SVC | `packages/board/lib/util.mjs`, `packages/board/read-safe.test.mjs` (new) | — | S | 20m | — |
| T9 | F2: migrate the 5 known-bad readers | SVC | `packages/board/lib/beads.mjs`, `packages/board/lib/routes.mjs`, `packages/board/lib/projects.mjs` | T8, **T2** | M | 35m | — |
| T10 | F3: persist + reconstruct pipeline stage state | SVC | `scripts/log-verdict.sh`, `commands/resume.md`, `tests/resume-e2e.test.mjs` | — | M | 30m | — |
| T11 | F4: fix GP frontmatter schema (`fix:` key) | LLM | `commands/crystallize.md` | — | XS | 10m | — |
| T12 | F4: dedupe continuous-learner merge logic | LLM | `agents/continuous-learner.md` | — | S | 20m | — |
| T13 | F4: gate `/crystallize approve` behind an eval | LLM | `commands/crystallize.md`, `tests/crystallize.test.mjs` | **T11** | S | 25m | **gate:learn** |
| T14 | F4: mark demo-seeded data as demo provenance | LLM | `scripts/seed-demo.mjs` | — | XS | 10m | — |
| QA | Full suite + regression check | TEST | — | all | S | 20m | — |
| CSO | Security review (F5 focus) | CSO | — | QA | XS | 15m | **gate:ship** |

\* T1's 45m is dominated by **machine wall-clock** (10 × `npm test`), not tokens. See Risk R1 — realistic span is 45m–2h.

---

## Dependency graph

```
gate:plan
 ├─ T1 re-score ──────────► gate:measure ──► T5 null-score ──► T6 bench-collect ──► T7 devops gate
 │
 ├─ T2 fleet.mjs scope ──┬─► T3 agent readers
 │                       ├─► T4 ADR-008
 │                       └─► (unblocks T9's routes.mjs write-zone)
 │
 ├─ T8 readSafe helper ───► T9 migrate readers   [waits on T2 for routes.mjs]
 │
 ├─ T10 stage state
 │
 ├─ T11 GP schema ────────► T13 crystallize gate ──► gate:learn
 ├─ T12 continuous-learner
 └─ T14 seed provenance
                                   ▼
                            QA ──► CSO ──► gate:ship
```

---

## Parallelism analysis — write-zones

Every task declares its file set. Two tasks sharing a file are **forced sequential**.

### Conflicts detected (forced sequential)

| Shared file | Tasks | Resolution |
|-------------|-------|------------|
| `packages/board/lib/routes.mjs` | **T2**, **T9** | T2 → T9. T2's change is one line (pass `cwd` to `appendDecisionLog`); T9 rewrites three readers. Running them concurrently loses one edit. |
| `commands/crystallize.md` | **T11**, **T13** | T11 → T13. T13's gate logic sits in the same approve block T11 touches. |

### Parallel-safe pools

| Pool | Tasks | Write-zone | Agent |
|------|-------|-----------|-------|
| **A — oracle** | T1 → T5 → T6 → T7 | `docs/benchmarks/`, `scripts/lib/product-eval.mjs`, `scripts/lib/quality.mjs`, `scripts/bench-collect.mjs`, `agents/devops.md` | senior-dev #1 |
| **B — privacy** | T2 → T3 → T4 | `packages/board/lib/fleet.mjs`, `agents/{senior-dev,pm,architect}.md`, `docs/adr/` | senior-dev #2 |
| **C — board** | T8 → T9 | `packages/board/lib/{util,beads,projects}.mjs` | senior-dev #3 (T9 blocked on T2) |
| **D — state** | T10 | `scripts/log-verdict.sh`, `commands/resume.md` | senior-dev #4 |
| **E — learning** | T11 → T13, T12, T14 | `commands/crystallize.md`, `agents/continuous-learner.md`, `scripts/seed-demo.mjs` | senior-dev #5 |

**Peak concurrency: 5 pools.** Pools A–E have pairwise-disjoint write-zones except the two conflicts above, both contained inside a single pool ordering plus the one cross-pool B→C edge on `routes.mjs`.

> ⚠️ Cross-pool edge: **C cannot start T9 until B finishes T2.** Pool C should start with T8 (independent) to absorb the wait.

---

## Gantt

```mermaid
gantt
    title Close the loops — full plan
    dateFormat  YYYY-MM-DD
    axisFormat  %d/%m

    section Gates
    gate:plan            :crit, milestone, gp, 2026-07-19, 0d
    gate:measure         :crit, milestone, gm, after t1, 0d
    gate:learn           :crit, milestone, gl, after t13, 0d
    gate:ship            :crit, milestone, gs, after cso, 0d

    section A — oracle
    T1 re-score 10 products   :t1, after gp, 45m
    T5 null score             :t5, after gm, 15m
    T6 wire bench-collect     :t6, after t5, 25m
    T7 devops gate            :t7, after t6, 10m

    section B — privacy
    T2 scope decisions log    :t2, after gp, 20m
    T3 agent readers          :t3, after t2, 10m
    T4 ADR-008                :t4, after t2, 15m

    section C — board
    T8 readSafe helper        :t8, after gp, 20m
    T9 migrate readers        :t9, after t8 t2, 35m

    section D — state
    T10 stage state           :t10, after gp, 30m

    section E — learning
    T11 GP schema             :t11, after gp, 10m
    T13 crystallize gate      :t13, after t11, 25m
    T12 continuous-learner    :t12, after gp, 20m
    T14 seed provenance       :t14, after gp, 10m

    section QA + Security
    QA full suite             :qa, after t7 t9 t10 t13 t3 t4 t12 t14, 20m
    CSO review                :cso, after qa, 15m
```

### ASCII fallback

```
gate:plan
│
├─A─ T1 [====45m====] gate:measure  T5 [15m] T6 [==25m==] T7 [10m]
├─B─ T2 [==20m==] T3 [10m] T4 [15m]
├─C─ T8 [==20m==] ......wait T2...... T9 [===35m===]
├─D─ T10 [===30m===]
└─E─ T11 [10m] T13 [==25m==] gate:learn
     T12 [==20m==]
     T14 [10m]
                                         QA [==20m==] CSO [15m] gate:ship
```

---

## Estimates

**Critical path:** `gate:plan → T1 (45m) → gate:measure → T5 (15m) → T6 (25m) → T7 (10m) → QA (20m) → CSO (15m) → gate:ship`

| Metric | Value |
|--------|-------|
| Critical path (LLM wall-clock) | **2h 10m** (130 min) |
| All tasks serialized | 5h 25m (325 min) |
| Parallel saving | ~3h 15m |
| Gate wait (human async, 4 gates) | ~2–6h |
| Buffer applied | +40% (full mode) → **critical path 3h 02m with buffer** |
| Min concurrent agents | **5** |

### Cost

| | Time | Cost |
|---|------|------|
| **LLM agents** | ~5h 25m task-time | **$12 – $26** |
| pm (Sonnet) | ~8m | $0.50 |
| senior-dev × 14 (Sonnet) | ~4h 50m | $9 – $20 |
| qa-engineer (Haiku) | ~20m | $0.15 |
| security-officer (Sonnet) | ~15m | $0.60 |
| **Human equivalent** | ~38–56h | **$5,900 – $8,700** |

Human basis: 14 tasks at mid-senior US rates ($150/h dev, $200/h security/architecture, $80/h QA) + 30% coordination overhead.

**Savings: ~$6–8k and ~40h → ~$20 and ~2h critical path.** Ratio ≈ **250–400×** on cost, measured against **full-pipeline LLM spend** (this pm phase + all senior-dev + qa + security). Caveat: excludes the owner's own review time at 4 gates, which does not shrink.

💰 **Out-of-pocket: $0.** No new paid services. T1 runs entirely on local compute.

---

## Acceptance criteria (per task, verifiable)

Every criterion is a command that exits 0 or an assertion that must hold.

**T1 — re-score**
```bash
for d in ~/bench/*/; do node scripts/lib/quality.mjs "$d" --json; done
```
- ✅ `docs/benchmarks/RESCORE-2026-07-19.md` contains a 10-row table: `slug | old (filename) | new (executed) | Δ | human judgement`.
- ✅ Every row cites `tests.ran`, `floor`, `ceiling`, `contracts`.
- ✅ Explicit agreement verdict per product vs the BENCH row details (ATS "crown-jewel in 3 layers", dashboard "clean run", booking "lost QA").
- ✅ `coaching` (suite never ran, exit 143) must **not** carry a numeric grade.
- ✅ No source file modified: `git diff --stat -- scripts/ packages/` is empty.

**T2 — decisions log scope**
- ✅ `node --test packages/board/decisions-scope.test.mjs` passes.
- ✅ Test asserts: a gate approve in project X writes to `X/.great_cto/decisions.md`, and `~/.great_cto/decisions.md` gains **no** line containing the task title or reason.
- ✅ Regression test: title containing a client-like token never reaches the global file.
- ✅ `node --test packages/board/*.test.mjs` — no existing board test breaks.
- ✅ `packages/board/server.mjs` dependency count unchanged (zero).

**T3 — agent readers**
- ✅ `grep -rn "decisions.md" agents/` shows only project-local paths; zero references to `~/.great_cto/decisions.md`.
- ✅ `node --test tests/agent-prompt-integrity.test.mjs` passes.

**T4 — ADR-008**
- ✅ `docs/adr/ADR-008-decisions-log-isolation.md` exists with Context / Decision / Consequences.
- ✅ States the retention rule for the already-redacted global file.
- ✅ Contains no private client name (`<private-project>` placeholder only).

**T5 — null score**
- ✅ `node --test tests/lib/quality.test.mjs` passes.
- ✅ New assertion: `assess()` on a dir where `runEval().tests.ran === false` returns `overall === null` (strictly `null`, `typeof !== 'number'`) — **not** 0, not a grade.
- ✅ `evaluateGate(null, {min:70})` returns `{ok:false}` with a reason naming the missing suite — a null score must never silently pass a gate.

**T6 — bench-collect wiring**
- ✅ `node --test tests/bench-collect.test.mjs` passes.
- ✅ `grep -n "product-score" scripts/bench-collect.mjs` returns no `runScore` call path; the collector routes through `quality.mjs`.
- ✅ On a fixture with a broken suite, the emitted row has `score: null`.
- ✅ Row keeps back-compat keys so existing `results.jsonl` rows still parse.

**T7 — devops gate**
- ✅ The `quality.mjs` invocation in `agents/devops.md:94` sits in an executable block with a stated pass threshold and a null-score branch.
- ✅ `node --test tests/agent-prompt-integrity.test.mjs` passes.

**T8 — readSafe helper**
- ✅ `node --test packages/board/read-safe.test.mjs` passes.
- ✅ Helper returns a discriminated result (`{ok:true,data}` / `{ok:false,error}`) — never a bare `[]` on failure.
- ✅ Cases covered: missing file, malformed JSON, EACCES.
- ✅ Zero new runtime dependencies.

**T9 — migrate readers**
- ✅ All five sites migrated: `beads.mjs:330`, `routes.mjs:774/812/1030`, `projects.mjs:25`.
- ✅ `grep -cn "catch {}\|catch { return \[\] }" packages/board/lib/*.mjs` strictly lower than the pre-change count (record both numbers in the commit body).
- ✅ API responses carry a `degraded` flag when a read fails; UI shows an error state, not emptiness.
- ✅ `node --test packages/board/*.test.mjs` all pass.

**T10 — stage state**
- ✅ `node --test tests/resume-e2e.test.mjs` passes.
- ✅ Completed stages are derivable from the verdict log without hand-authored prompt text.
- ✅ Test simulates the `booking` failure: interrupt after senior-dev, resume, and assert QA + security are reported **outstanding**.

**T11 — GP schema**
- ✅ `node --test tests/crystallize.test.mjs` passes.
- ✅ The template emits a `fix:` key; `grep "^fix:" <generated-gp>` is non-empty.
- ✅ Round-trip: generate a GP, then the agent-side reader (`grep "^symptom:"` + `grep "^fix:"`, per `agents/senior-dev.md:346-347`) yields two non-empty values.
- ✅ `GP-0001-pool-exhaustion.md` gains valid frontmatter (out-of-repo fix — record in the task notes).

**T12 — continuous-learner dedupe**
- ✅ `agents/continuous-learner.md` lines 168–197 replaced by a call to `scripts/lessons-merge.mjs`.
- ✅ `node --test tests/hooks/lessons-merge.test.mjs` passes.
- ✅ No merge algorithm remains inline in the agent prompt.

**T13 — crystallize gate**
- ✅ `node --test tests/crystallize.test.mjs` passes.
- ✅ `/crystallize approve` refuses to write to `skills/**/SKILL.md` unless an eval result is present and passing.
- ✅ `GREAT_CTO_AUTO_LEARN=1` is gated by the same check — test asserts an unevaluated pattern is **rejected** with auto-learn on.
- ✅ Default-off behaviour unchanged.

**T14 — seed provenance**
- ✅ Records written by `scripts/seed-demo.mjs` carry a demo marker.
- ✅ A command distinguishes demo from real patterns in `~/.great_cto/global-patterns/`.
- ✅ `node --test tests/packs-integration.test.mjs` passes.

**QA**
- ✅ `npm test` green.
- ✅ No test count regression vs `main`.

**CSO**
- ✅ Zero P0/P1. Explicit re-check that the F5 write path cannot reach a global file.
- ✅ `bash scripts/hooks/pre-push.sh` passes (private-term scan).

---

## Gates

| Gate | After | Decision required |
|------|-------|-------------------|
| `gate:plan` | this doc | Approve task list, sizing, parallelism |
| **`gate:measure`** | T1 | **Publish or withhold the re-scored benchmark.** Owner sees the magnitude of the drop before committing to a public number. Blocks T5. |
| `gate:learn` | T13 | Confirm the eval bar for auto-committing to `skills/**` |
| `gate:ship` | CSO | Merge |

---

## Risks

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| **R1** | T1 wall-clock blows out — 10 × `npm test`; `portal` and `dispatch` need a live Postgres, `quoting` had 187 failures | **High** | Run T1 in background. Record `tests.ran=false` + reason rather than fabricating a score. Environment-blocked ≠ product-failed — the rescore doc must distinguish these two, or it repeats F1's sin in reverse. |
| **R2** | `npm audit` in `runEval` needs network; offline runs skew `ceiling` | Medium | Treat audit as `na`, not 0. Assert in T5. |
| **R3** | Re-scored numbers land far below published 58–86, and the BENCH doc is already public | **High** | That is precisely why `gate:measure` exists — measure privately, decide publicly. Do not edit BENCH until the gate closes. |
| **R4** | F5 re-leaks between now and T2 landing | **High** | T2 has no dependencies — schedule first alongside T1. Until it lands, treat every gate approval as a leak event. |
| **R5** | T2/T9 both edit `routes.mjs`; concurrent agents lose an edit | Medium | Forced sequential (documented above). Coordinator must not fan these out together. |
| **R6** | `score: null` breaks downstream consumers expecting a number (board, trend sparklines) | Medium | T6 acceptance includes back-compat parse of existing `results.jsonl`. Grep consumers of `.score` before merging. |
| **R7** | Null scores let a product skip `gate:quality` by having no tests at all | **High** | T5 asserts `evaluateGate(null)` → **fail**. Absence of evidence must block, never pass. |
| **R8** | Much of `~/.great_cto/` is demo seed; the loop has never fired | Low | T14 marks provenance. Do not draw conclusions from seeded data. |

---

## Non-goals

- Rewriting the scoring rubric weights. F1 is wiring; weight changes need their own ADR.
- Migrating all ~26 silent readers. T9 fixes the 5 known-bad ones plus the shared helper; the rest follow once the pattern is proven.
- Publishing the re-scored benchmark. That is a `gate:measure` decision, not a task here.
- Any new telemetry.

---

## Revision history

| Date | Change |
|------|--------|
| 2026-07-19 | Initial plan from approved F1–F5 brief. Corrected F5 ownership to `fleet.mjs`; reduced F1 to wiring after confirming `quality.assess()` already composes floor+ceiling. |
