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

## Pre-audit: surface active risks

Before the agent runs, prepend the active-risks summary so both CTO and auditor see the current risk landscape — new gaps found by `/audit` can then be cross-referenced.

```bash
if [ -f "docs/risks/RISK-REGISTER.md" ]; then
  echo "=== ACTIVE RISKS (top 5) ==="
  awk '/## Active risks/,/^## /' docs/risks/RISK-REGISTER.md 2>/dev/null | \
    grep -E "^\| R-[0-9]+" | head -5
fi
```

## Deprecation auto-suggestions

As part of dependency scanning, detect stale packages (no releases > 24 months) and framework majors diverging from upstream. For each detected candidate, output an auto-suggest line the auditor reviews — do **not** auto-append to DEPRECATION-CALENDAR without CTO confirmation.

```bash
# Node: scan package.json vs npm latest, flag "last release > 2 years ago"
# Python: pip-audit metadata → date of last release
# Suggestions go to /tmp/deprecation-suggestions.txt for the auditor to review.
echo "See skills/great_cto/references/deprecations.md for what to flag and how."
```

## Vendor coverage scan

Detect calls to known third-party services (paid SaaS / critical free-tier) and flag any without a matching `docs/vendors/VENDOR-*.md`. See `skills/great_cto/references/vendors.md` for criticality thresholds.

```bash
# Known-vendor SDK patterns — extend as new integrations land.
VENDOR_PATTERNS="stripe auth0 openai anthropic twilio sendgrid datadog segment mixpanel firebase supabase vercel cloudflare"
MISSING=""
for VP in $VENDOR_PATTERNS; do
  FOUND_IN_DEPS=""
  for DEP in package.json requirements.txt pyproject.toml go.mod Cargo.toml Gemfile composer.json; do
    [ -f "$DEP" ] && grep -qi "\"$VP\\|$VP-\\|$VP_\\|/$VP/" "$DEP" 2>/dev/null && FOUND_IN_DEPS=1 && break
  done
  if [ -n "$FOUND_IN_DEPS" ]; then
    [ ! -f "docs/vendors/VENDOR-${VP}.md" ] && MISSING="$MISSING $VP"
  fi
done
[ -n "$MISSING" ] && echo "=== VENDOR DOCS MISSING (advisory) ===$MISSING" > /tmp/vendor-suggestions.txt
# Suggestions are advisory — auditor reviews, CTO confirms criticality before creating VENDOR-*.md.
```

## Cost-model coverage scan

For services deployed via IaC without a matching ARCH Cost Model section, emit an advisory finding. See `skills/great_cto/references/cost-model.md`.

```bash
IAC_FILES=$(ls *.tf terraform/*.tf helm/values.yaml k8s/*.yaml 2>/dev/null | head -20)
if [ -n "$IAC_FILES" ]; then
  # For each aws_instance / aws_db_instance / k8s Deployment resource name,
  # grep docs/architecture/ARCH-*.md for a "## Cost Model" section referencing the resource.
  NO_COST=0
  for ARCH in docs/architecture/ARCH-*.md; do
    [ -f "$ARCH" ] || continue
    grep -q "^## Cost Model" "$ARCH" || NO_COST=$((NO_COST+1))
  done
  [ "$NO_COST" -gt 0 ] && echo "=== COST MODEL GAP (advisory) === $NO_COST ARCH doc(s) missing Cost Model section"
fi
```

## Onboarding generation (first-run)

If `team-size ≥ 2` and `docs/onboarding/README.md` does not yet exist, invoke project-auditor for synthesis. See `skills/great_cto/references/onboarding.md`.

```bash
TEAM_SIZE=$(grep "^team-size:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr -d '[:alpha:]')
if [ "${TEAM_SIZE:-1}" -ge 2 ] && [ ! -f "docs/onboarding/README.md" ]; then
  echo "Onboarding not yet generated — project-auditor will synthesize (see skills/great_cto/references/onboarding.md)"
fi
```

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
