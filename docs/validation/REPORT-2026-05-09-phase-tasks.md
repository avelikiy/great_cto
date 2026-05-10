# Validation report: per-stage Beads tasks (v2.5.7+)

**Date:** 2026-05-09
**Mode:** automated helper-level simulation (Tests 1, 2, 3 from
[`PHASE-TASKS-CHECKLIST.md`](PHASE-TASKS-CHECKLIST.md))
**Result:** ✅ all three tests pass — phase-task lifecycle verified at
helper level.

---

## What was validated

The checklist's three test paths:

| Test | What it covers | How automated |
|---|---|---|
| **Test 1** — happy path | 8-stage pipeline opens + closes phase tasks | Direct `phase-task.sh` invocation per agent (no chat session) |
| **Test 2** — fail/remediate | QA `--verdict fail` marks blocked, retest creates new ID | Direct invocation with two QA cycles |
| **Test 3** — multi-tool fallback | bd absent → tasks.md fallback; bd present → real bd task | Stub `bd` in PATH, then restore |

The remaining gap (whether agent **prompts** actually instruct the agent
to call the helper) is covered statically by lint rules **PHASE-001**,
**PHASE-002**, **PHASE-003** in `scripts/agent-prompt-lint.mjs` — these
verified clean in v2.7.0 release.

---

## Test 1 — Happy path (8-stage pipeline)

**Setup:** Fresh `/tmp/phase-validate-auto` with `bd init`. Created one
parent `gate:arch` task, then opened+started+closed phase tasks for
all 8 pipeline agents.

**Agents:** architect, pm, senior-dev, qa-engineer, security-officer,
performance-engineer, devops, l3-support.

**Result:**

```
Open / start (8 phase tasks created):
  open+start architect           → phase-validate-auto-e6q
  open+start pm                  → phase-validate-auto-klr
  open+start senior-dev          → phase-validate-auto-2vp
  open+start qa-engineer         → phase-validate-auto-03o
  open+start security-officer    → phase-validate-auto-pac
  open+start performance-engineer → phase-validate-auto-v8d
  open+start devops              → phase-validate-auto-e33
  open+start l3-support          → phase-validate-auto-qeg

Close (all 8):
  ✓ closed phase-validate-auto-03o
  ✓ closed phase-validate-auto-e6q
  ✓ closed phase-validate-auto-pac
  ✓ closed phase-validate-auto-2vp
  ✓ closed phase-validate-auto-e33
  ✓ closed phase-validate-auto-klr
  ✓ closed phase-validate-auto-qeg
  ✓ closed phase-validate-auto-v8d

Final count:
  closed phase tasks: 8
  open: 1 (parent gate:arch — correct, gate aggregates phases)
```

**Verifies:**
- ✅ `bd close --force` (v2.5.10 fix) handles the dependency-blocked
  case correctly — phase tasks close while parent gate stays open
- ✅ Each agent gets a distinct task ID
- ✅ All 8 transition `open → in_progress → closed`

---

## Test 2 — QA fail/remediate cycle

**Setup:** Same project, new feature slug `2fa-magic-links`.

**Sequence:**

```
1. QA round 1 (failing path):
   QA1 opened    → phase-validate-auto-a50  (in_progress)
   QA1 closed    → verdict=fail, note="no rate-limiting on /verify"
   Result: ● blocked (correct — fail marks blocked, not closed)

2. senior-dev remediation:
   DEV2 opened+closed → phase-validate-auto-zf1  (✓ ok)

3. QA round 2 (passing path):
   QA2 opened+closed  → phase-validate-auto-h9x  (✓ ok)
```

**Verifies:**
- ✅ `--verdict fail` marks task as `blocked` (●) — preserves the
  failure trail rather than silently closing
- ✅ Second QA cycle creates a **new** task ID (a50 ≠ h9x), not
  reusing the blocked one — supports re-test as discrete event
- ✅ Failure note attached to the blocked task for audit trail

---

## Test 3 — Multi-tool fallback (bd absent)

**Setup:** Fresh `/tmp/phase-validate-fallback` with NO `.beads` and
a stub `bd` in PATH that exits 1.

**Subtest 3a (bd masked):**
```
$ PATH=./bin:$PATH bash phase-task.sh open architect test-feat
phase-architect-1778346935       # epoch-based fallback ID

$ cat .great_cto/tasks.md
- [ ] [phase-architect-1778346935] architect: test-feat
```

No bd error leaked to stdout/stderr. Markdown fallback is the
documented path for non-Beads environments (Cursor without bd, plain
Codex CLI).

**Subtest 3b (bd restored):**
```
$ bd init -q
$ bash phase-task.sh open architect test-feat
phase-validate-fallback-fjz      # real bd task

$ bd list
○ phase-validate-fallback-fjz  ● P1  architect: test-feat
```

**Verifies:**
- ✅ Helper detects bd absence cleanly (no stderr noise from failed
  `bd list`)
- ✅ Markdown fallback creates a parseable line in `.great_cto/tasks.md`
- ✅ When bd becomes available, helper switches to bd (no manual
  migration of fallback entries — they coexist)

---

## What this report does NOT cover

The checklist's "real chat session" parts that require interactive
agent invocation cannot be auto-validated:

1. **Whether the agent prompt actually triggers the helper at runtime**
   — covered statically by linter rules PHASE-001/002/003 (clean in
   v2.7.0).

2. **Whether agents close tasks correctly when context is compacted**
   — needs a real long session to surface; the helper's idempotent
   open/close is the only mitigation we ship.

3. **Board UI rendering** — manual visual check via
   `great-cto board` against a real project. Auto-tested via
   `tests/board/test_api_regressions.py` (12 cases including v2.7.0
   logs parser fix).

For these, run the manual chat-session walkthrough in
`PHASE-TASKS-CHECKLIST.md` against a real project at least once per
quarter or after agent-prompt edits to phase-task sections.

---

## Conclusion

**v2.5.7 phase-task lifecycle is validated** at all reachable
automation layers:

| Layer | Mechanism | Status |
|---|---|---|
| Helper script | This report (Tests 1–3) | ✅ green |
| Pipeline regression | `scripts/test-pipeline.sh` L4b (5 tests) | ✅ green (62/62) |
| Agent prompt structure | `agent-prompt-lint.mjs` PHASE-001/002/003 | ✅ green (0 errors) |
| Board UI | `tests/board/test_api_regressions.py` | ✅ green (12 cases) |
| Real chat session | Manual checklist (`PHASE-TASKS-CHECKLIST.md`) | ⏳ deferred — owner action |

The remaining "real chat session" verification is a quarterly hygiene
task, not a release blocker.
