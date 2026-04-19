---
description: "Audit an existing codebase. Detects stack, finds gaps, creates tasks, generates PROJECT.md."
argument-hint: "[optional: focus area, e.g. 'focus on security' or 'check auth layer']"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the Great CTO audit command for **existing projects**.

Fast by default (v1.0.43+): phases 1-4 run in parallel via sub-agents + CVE scan cached 24h. Typical runtime ~1-1.5 min on medium projects. No separate refresh mode — just re-run `/audit`.

## Action: `eval` — run eval harness

If argument is `eval` (i.e. `/audit eval`):

```bash
EVAL_DIR="docs/eval"
ls "$EVAL_DIR"/EVAL-*.md 2>/dev/null | sort || echo "NO_EVALS"
```

If no eval files found:
```
No eval cases in docs/eval/.
Run /audit to create initial eval cases, or see docs/eval/ for the format.
```

If eval files exist — for each `EVAL-*.md`:
1. Read the file — extract `## Assertions` bash block
2. Run each assertion
3. Collect PASS / FAIL / WARN per assertion
4. Report summary:

```
/audit eval — Eval Harness Results

EVAL-001 CRUD endpoint:       PASS (3/3)
EVAL-002 Auth service:        PASS (4/4)
EVAL-003 Discovery guard:     WARN (manual verification needed)
EVAL-004 Hotfix nano:         PASS (2/2)
EVAL-005 Security block:      FAIL (1/3) — CSO report missing

Score: 4/5 passing | 1 failing | 1 manual

FAILURES:
  EVAL-005: docs/security/CSO-*.md not found
  → Run the auth-service eval scenario first to generate the artifact

MANUAL CHECKS:
  EVAL-003: discovery guard behavior requires live /start run
```

Exit after eval report. Do NOT proceed with normal audit.

---

## Guard: no code to audit

```bash
ls package.json Cargo.toml go.mod requirements.txt pyproject.toml pom.xml build.gradle 2>/dev/null | head -1
```

If no recognizable project file found AND no src/ or app/ directory:
```
Nothing to audit — no project detected in this directory.
Run /start to set up a new project instead.
```

## Guard: PROJECT.md already exists

```bash
cat .great_cto/PROJECT.md 2>/dev/null | head -5
```

If PROJECT.md exists → tell CTO:
```
This project is already configured (type: <type>).
Running audit anyway to find gaps and update config.
```
Continue — audit is always safe to re-run.

## Run audit

Spawn `great_cto-project-auditor` with this context (vary by MODE):

> "Run a full audit of this repository.
>
> Tasks (in order):
> 1. **Stack detection** — identify language, framework, runtime version, major dependencies
> 2. **Type classification** — map to one or more of the 73 types in TYPE_MAP.md → resolve to archetype. Primary + secondary.
> 3. **Gap analysis** — what's missing vs. the pipeline requirements for detected type:
>    - Tests (coverage estimate, test framework present?)
>    - CI/CD (pipeline file present?)
>    - Docs (README, ARCH docs, ADRs?)
>    - Security (dependency audit, secrets scan)
>    - Observability (logging, error tracking)
> 4. **Create Beads tasks** for each gap found:
>    `bd create "<gap description>" --type task --priority <0-3>`
>    Priority 0 = blocks deploy. Priority 1 = important. Priority 2 = nice to have.
> 5. **Write .great_cto/PROJECT.md** (overwrite if exists):
>    Use detected stack, type, and team size (estimate from git log authors).
>    Set review_mode: auto unless security-critical type (then: strict).
> 6. **Report** in this format:
>    ```
>    Audit complete — <project name>
>    Type: <primary>[+ <secondary>]
>    Stack: <summary>
>    Gaps found: <N> tasks created
>    Top priority: <highest priority gap>
>    Config: .great_cto/PROJECT.md
>    Run /inbox to see all tasks.
>    ```
>
> Focus area (if CTO specified): <argument or 'full audit'>
> Keep report concise — no section-by-section breakdown unless CTO asks."

## After agent completes

Tell CTO what was found in 2-3 lines. Do NOT repeat the agent's full output.
