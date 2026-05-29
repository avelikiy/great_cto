---
description: "12-angle code review + skeptical triage (3-round + arbiter) for security/reliability P0/P1 findings, OR traceability tree. Default: review current branch vs main. `--deep`: triage ALL P0/P1 angles (not just security). With `trace <id>`: render REQ → IMPL → TEST tree for impact analysis. Creates or closes gate:code for approval-level: strict."
argument-hint: "[PR/branch name | --deep | trace <bd-id> | trace <feature-slug>]"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Bash, Glob, Grep, advisor_20260301
model: sonnet
advisor-model: claude-opus-4-8
advisor-max-uses: 2
beta: advisor-tool-2026-03-01
---

You are a senior engineering team conducting a 12-angle code review. Each angle is independent and focuses exclusively on its domain.

## Trace mode (early branch — exits before review runs)

If `$1 = trace` → render the traceability tree for the supplied bd task id or feature slug, then stop. Delegates tree rendering to `bd dep tree` (native).

```bash
if [ "$1" = "trace" ]; then
  bd --help >/dev/null 2>&1 || { echo "bd not installed — traceability requires Beads."; echo "Fallback: grep '^- \\[ \\] REQ-' docs/architecture/ARCH-*.md"; exit 1; }

  TARGET="${2:-}"
  if [ -z "$TARGET" ]; then
    echo "Usage: /review trace <bd-id|feature-slug>"
    echo "Examples:"
    echo "  /review trace bd-xyz              # tree rooted at this task"
    echo "  /review trace feature-checkout    # list REQs / IMPLs / TESTs for feature"
    exit 0
  fi

  # Case A: feature slug → list everything with that label, grouped by type
  if echo "$TARGET" | grep -q "^feature-"; then
    echo "=== Traceability: $TARGET ==="
    echo ""
    echo "--- Requirements (label: req) ---"
    bd list --label req --label "$TARGET" 2>/dev/null || echo "  (none — architect creates REQ tasks with --label req --label feature-<slug>)"
    echo ""
    echo "--- Implementation (feature label, excluding req/test) ---"
    bd list --label "$TARGET" --json 2>/dev/null \
      | python3 -c "import json,sys; [print('○', t['id'], '·', t.get('title','')) for t in json.load(sys.stdin) if 'req' not in t.get('labels',[]) and 'test' not in t.get('labels',[])]" 2>/dev/null \
      || echo "  (none)"
    echo ""
    echo "--- Tests (label: test) ---"
    bd list --label test --label "$TARGET" 2>/dev/null || echo "  (none)"
    echo ""
    # Coverage summary
    TOTAL_REQS=$(bd list --label req --label "$TARGET" --json 2>/dev/null | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
    CLOSED_REQS=$(bd list --label req --label "$TARGET" --status closed --json 2>/dev/null | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
    echo "Coverage: $CLOSED_REQS/$TOTAL_REQS REQs closed"
    exit 0
  fi

  # Case B: specific task id — use native bd dep tree both directions
  echo "=== Trace from $TARGET ==="
  bd show "$TARGET" --short 2>/dev/null || { echo "Task $TARGET not found in bd."; exit 1; }
  echo ""
  echo "--- Upstream (what $TARGET depends on) ---"
  bd dep tree "$TARGET" --direction=down 2>/dev/null || echo "  (none)"
  echo ""
  echo "--- Downstream (what depends on $TARGET — impact analysis) ---"
  bd dep tree "$TARGET" --direction=up 2>/dev/null || echo "  (none)"
  exit 0
fi
```

## Setup

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
REVIEW_MODE=$(grep "^approval-level:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' || echo "auto")
TYPE=$(grep "^primary:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
ARCHETYPE=$(grep "^archetype:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' || echo "web-service")

# Parse --deep flag (triage all P0/P1 angles, not just security/reliability)
DEEP_TRIAGE=false
DIFF_TARGET=""
for arg in "$@"; do
  case "$arg" in
    --deep) DEEP_TRIAGE=true ;;
    --*) ;;  # unknown flag, ignore
    *) [ -z "$DIFF_TARGET" ] && DIFF_TARGET="$arg" ;;
  esac
done

# Get diff scope
if [ -n "$DIFF_TARGET" ]; then
  git diff main..."$DIFF_TARGET" --name-only 2>/dev/null | head -30
  DIFF=$(git diff main..."$DIFF_TARGET" 2>/dev/null | head -2000)
else
  BASE=$(git merge-base HEAD main 2>/dev/null || echo "HEAD~5")
  git diff "$BASE"..HEAD --name-only 2>/dev/null | head -30
  DIFF=$(git diff "$BASE"..HEAD 2>/dev/null | head -2000)
fi
echo "Files changed: $(git diff "$BASE"..HEAD --name-only 2>/dev/null | wc -l)"
echo "Deep triage mode: $DEEP_TRIAGE  (triage ALL P0/P1 angles, not just 2/4/7/9)"

# Detect design system (for Angle 12)
DESIGN_SYSTEM="none"
grep -rl "MaterialTheme\|androidx.compose.material3" . --include="*.kt" 2>/dev/null | head -1 | grep -q . && DESIGN_SYSTEM="material3"
grep -rl "tailwind\|@apply\|className=" . --include="*.tsx" --include="*.jsx" --include="*.css" 2>/dev/null | head -1 | grep -q . && DESIGN_SYSTEM="tailwind"
grep -rl "SwiftUI\|\.foregroundStyle\|Color\.accentColor" . --include="*.swift" 2>/dev/null | head -1 | grep -q . && DESIGN_SYSTEM="swiftui"
grep -rl "StyleSheet\.create\|useTheme\|ThemeProvider" . --include="*.tsx" --include="*.ts" 2>/dev/null | head -1 | grep -q . && [ "$DESIGN_SYSTEM" = "none" ] && DESIGN_SYSTEM="rn-custom"
echo "Design system detected: $DESIGN_SYSTEM"
```

## Cache discipline

Setup above produces the **stable prefix** shared across all 12 angles: archetype, design-system detection, and the full `$DIFF`. When you run angles as separate evaluations, preserve this layout **verbatim** — same order, same values, no re-detection. The only thing that varies between invocations is the angle-specific `**Focus**` block below. Reordering Setup or re-reading the diff per angle forfeits prefix caching across the 12 angles.

## Angle 1 — Performance Reviewer

**Focus**: latency, memory, unnecessary computation, N+1 queries, missing caching, unbounded loops.

Review the diff for:
- Database queries inside loops (N+1 anti-pattern)
- Missing indexes on filtered/sorted columns
- Synchronous blocking calls where async exists
- Unbounded result sets (no pagination, no LIMIT)
- Large object allocation in hot paths
- Missing cache where repeated computation is obvious
- Regex compiled on every call instead of pre-compiled

Rate each finding: **P0** (will cause production incident) / **P1** (measurable degradation under load) / **P2** (optimization opportunity).

Output format:
```
## Reviewer 1: Performance
Findings: P0:N P1:N P2:N

[For each P0/P1:]
  FILE:LINE — <issue description>
  Impact: <what happens under load>
  Fix: <specific change>

[If no P0/P1: "No performance blockers found."]
```

## Angle 2 — Security Reviewer

**Focus**: injection, auth bypass, information disclosure, insecure defaults, secret handling.

Review the diff for:
- SQL/NoSQL injection: raw query string interpolation
- Command injection: unsanitized input in exec/spawn/system calls
- Auth bypass: missing auth check on new routes/endpoints
- IDOR: direct object reference without ownership check
- Secrets: API keys, tokens, passwords in code or logs
- XSS: unescaped user input in HTML/template output
- Insecure deserialization: user-controlled pickle/eval/JSON.parse with reviver
- SSRF: URL constructed from user input without allowlist

Rate: **P0** (exploitable in production) / **P1** (potential attack vector) / **P2** (hardening opportunity).

Output format:
```
## Reviewer 2: Security
Findings: P0:N P1:N P2:N

[For each P0/P1:]
  FILE:LINE — <vulnerability type>
  Attack vector: <how an attacker exploits this>
  Fix: <specific change>

[If no P0/P1: "No security blockers found."]
```

## Angle 3 — Readability Reviewer

**Focus**: clarity, naming, complexity, test coverage of new code, missing error handling.

Review the diff for:
- Functions >50 lines without a clear single responsibility
- Variable names that require context to understand (a, tmp, data, obj)
- Missing error handling on operations that can fail (network, I/O, parsing)
- Tests missing for new public functions/endpoints
- Magic numbers or strings without named constants
- Commented-out code left in
- Boolean parameters that make call sites unreadable (`doThing(true, false, null)`)

Rate: **P1** (will cause maintenance incidents or confusion leading to bugs) / **P2** (code health).

Output format:
```
## Reviewer 3: Readability
Findings: P1:N P2:N

[For each P1:]
  FILE:LINE — <issue>
  Why it matters: <maintenance or bug risk>
  Fix: <specific change>

[If no P1: "No readability blockers found."]
```

## Angle 4 — SQL Safety Reviewer

**Focus**: injection, N+1 patterns, unbounded queries, missing transactions.

Review for:
- Raw string interpolation in SQL queries (not parameterized)
- ORM calls inside loops (N+1 anti-pattern)
- Missing `LIMIT` on queries that can return unbounded rows
- Mutations (INSERT/UPDATE/DELETE) outside a transaction block
- Missing indexes implied by new WHERE / ORDER BY clauses
- Soft-delete logic that could expose deleted records

Rate: **P0** (injection/data exposure) / **P1** (N+1, unbounded result) / **P2** (style/optimization).

Output format:
```
## Reviewer 4: SQL Safety
Findings: P0:N P1:N P2:N

[For each P0/P1:]
  FILE:LINE — <issue>
  Risk: <what breaks or leaks>
  Fix: <specific change>

[If no P0/P1: "No SQL safety blockers found."]
```

## Angle 5 — LLM Trust Boundaries (skip if archetype ≠ ai-system)

```bash
[ "$ARCHETYPE" = "ai-system" ] || echo "SKIP: not an AI system" && exit 0
```

**Focus**: prompt injection, output sanitization, tool-call trust, hallucination guards.

Review for:
- User input injected directly into system prompt without sanitization
- LLM output used in shell exec / DB query / file write without validation
- Missing output schema validation (relying on LLM to return valid JSON)
- Tool calls whose results are trusted without bounds checking
- PII passed to external LLM API without masking
- Missing retry/fallback when LLM returns malformed output

Rate: **P0** (prompt injection exploitable, PII leak) / **P1** (trust boundary missing) / **P2** (hardening).

Output format:
```
## Reviewer 5: LLM Trust Boundaries
Findings: P0:N P1:N P2:N

[For each P0/P1:]
  FILE:LINE — <issue>
  Attack path: <how it's exploited>
  Fix: <specific change>

[If no P0/P1: "No LLM trust issues found." OR "SKIPPED — not ai-system archetype."]
```

## Angle 6 — Conditional Side Effects Reviewer

**Focus**: operations that happen as unintended consequences of control flow.

Review for:
- Side effects (DB write, email send, payment charge) inside `if` branches where the condition is about something else
- Functions that mutate state AND return a value — hidden mutation
- Early `return` paths that skip required cleanup (file close, lock release, metric recording)
- Retry logic that could trigger the same side effect multiple times
- Event emission inside a loop (N events when 1 was intended)

Rate: **P1** (data corruption, duplicate charges) / **P2** (code smell).

Output format:
```
## Reviewer 6: Conditional Side Effects
Findings: P1:N P2:N

[For each P1:]
  FILE:LINE — <issue>
  Consequence: <what happens unexpectedly>
  Fix: <specific change>

[If no P1: "No conditional side effect issues found."]
```

## Angle 7 — Data Privacy Reviewer

**Focus**: PII logging, over-collection, retention policy gaps.

Review for:
- Logging statements that include email, phone, SSN, IP, or token values
- PII fields stored without encryption at rest
- Full request/response bodies logged (may contain auth tokens, PII)
- User-controlled data returned in error messages (information disclosure)
- Missing data classification on new DB columns containing PII
- Analytics events that include more user data than needed

Rate: **P0** (regulatory violation — GDPR/HIPAA breach) / **P1** (PII in logs/errors) / **P2** (over-collection).

Output format:
```
## Reviewer 7: Data Privacy
Findings: P0:N P1:N P2:N

[For each P0/P1:]
  FILE:LINE — <issue>
  Regulation: <GDPR / HIPAA / CCPA>
  Fix: <specific change>

[If no P0/P1: "No data privacy issues found."]
```

## Angle 8 — Error Handling Reviewer

**Focus**: swallowed exceptions, missing retries, unclear failure modes.

Review for:
- `catch` blocks that log and swallow the error without propagating or alerting
- Network/I/O calls with no timeout set
- External API calls with no retry on transient errors (429, 503)
- `Promise.all` without error handling (one rejection kills all)
- Error messages exposed to the user that include stack traces or internal paths
- Operations that silently succeed when they should have failed (no return value check)

Rate: **P0** (silent data loss) / **P1** (swallowed error hides real failure) / **P2** (robustness gap).

Output format:
```
## Reviewer 8: Error Handling
Findings: P0:N P1:N P2:N

[For each P0/P1:]
  FILE:LINE — <issue>
  Failure mode: <what breaks silently>
  Fix: <specific change>

[If no P0/P1: "No error handling blockers found."]
```

## Angle 9 — Concurrency Reviewer

**Focus**: race conditions, deadlocks, shared mutable state.

Review for:
- Shared mutable state accessed from multiple goroutines/threads without synchronization
- `async/await` patterns where parallel operations share state
- Read-modify-write on DB records without `SELECT FOR UPDATE` or optimistic locking
- Lock acquisition order inconsistency (deadlock risk)
- Unbounded goroutine/thread spawning inside a loop
- Cache stampede: multiple concurrent misses all hitting the source

Rate: **P0** (data corruption, deadlock in prod) / **P1** (race condition under load) / **P2** (potential issue under scale).

Output format:
```
## Reviewer 9: Concurrency
Findings: P0:N P1:N P2:N

[For each P0/P1:]
  FILE:LINE — <issue>
  Trigger: <what load/condition exposes it>
  Fix: <specific change>

[If no P0/P1: "No concurrency issues found."]
```

## Angle 10 — Dependency Freshness Reviewer

**Focus**: outdated, abandoned, or vulnerable direct dependencies added in this diff.

Review for:
- New `import`/`require`/`use` statements added in the diff — check if the package is recent and maintained
- `package.json` / `requirements.txt` / `go.mod` / `Cargo.toml` changes adding pinned old versions
- Dependencies pinned to a version >12 months old when a newer major is available
- Packages with known CVEs in the version range being added
- Packages with 0 downloads/stars or last commit >2 years ago (abandoned)

```bash
# Check npm packages added in diff
grep '^\+.*"version"' package.json 2>/dev/null | head -10
# Check Python packages
grep '^\+' requirements*.txt 2>/dev/null | grep -v "^+++" | head -10
```

Rate: **P1** (known CVE in added version) / **P2** (outdated / abandoned).

Output format:
```
## Reviewer 10: Dependency Freshness
Findings: P1:N P2:N

[For each P1:]
  PACKAGE@VERSION — <CVE or abandonment reason>
  Fix: upgrade to <version> or replace with <alternative>

[If no P1: "No dependency freshness issues found."]
```

## Angle 11 — API Contracts Reviewer

**Focus**: breaking changes to APIs consumed by external callers.

Review for:
- Removing or renaming a field from a response object (breaking consumers)
- Changing a field type (string → number, optional → required)
- Removing an endpoint or HTTP method
- Changing URL path parameters
- Changing error response format or HTTP status codes in error cases
- gRPC/Protobuf: removing fields, renumbering field IDs
- Event schema changes (Kafka/SQS message format)

Rate: **P0** (breaks existing callers with no migration path) / **P1** (deprecation without notice) / **P2** (additive, backwards-compatible change).

Output format:
```
## Reviewer 11: API Contracts
Findings: P0:N P1:N P2:N

[For each P0/P1:]
  FILE:LINE — <breaking change>
  Impact: <which callers break>
  Fix: version the endpoint OR provide migration path OR add deprecation header

[If no P0/P1: "No API contract violations found."]
```

## Angle 12 — Design System Reviewer (skip if archetype ≠ mobile-app and archetype ≠ web-service)

```bash
{ [ "$ARCHETYPE" = "mobile-app" ] || [ "$ARCHETYPE" = "web-service" ]; } || { echo "SKIPPED — not mobile-app or web-service archetype."; exit 0; }
```

**Focus**: design token usage, accessibility, component consistency, dark mode safety.

Detect which design system is in use (`$DESIGN_SYSTEM`) and apply the matching token vocabulary:

| System | Color tokens | Typography tokens | Spacing |
|--------|-------------|-------------------|---------|
| `material3` | `MaterialTheme.colorScheme.*` | `MaterialTheme.typography.*` | `dp` via `Dimens` |
| `tailwind` | `text-primary`, `bg-surface-*` | `text-sm`, `font-semibold` | `p-4`, `gap-2` |
| `swiftui` | `Color.accentColor`, `.background` | `.font(.title)` | `padding()`, `spacing:` |
| `rn-custom` / other | `theme.colors.*` | `theme.typography.*` | `theme.spacing.*` |

Review the diff for:
- **Hardcoded colors** — hex values (`#1A73E8`, `Color(0xFF...)`, `rgb(...)`) or raw named colors (`Color.Blue`, `UIColor.blue`) instead of design system tokens. These break dark mode and theming.
- **Hardcoded typography** — literal font sizes (`fontSize: 16`, `.font(.system(size: 14))`, `text-[14px]`) instead of type scale tokens.
- **Hardcoded spacing** — magic pixel/dp values (`padding: 12`, `Modifier.padding(16.dp)`) instead of spacing scale or named constants.
- **Wrong components** — raw primitives used when a design system component exists (e.g. `<div onClick>` instead of `<Button>`, `Box` instead of `Card`, raw `<input>` instead of `TextField`).
- **Accessibility violations**:
  - Images/icons without `contentDescription` / `aria-label` / `accessibilityLabel`
  - Touch targets smaller than 48dp (Android) or 44pt (iOS)
  - Interactive elements without focus indicator
  - Color-only information (error state shown only in red with no icon/text)
- **Elevation/shadow** — hardcoded shadow values instead of design system elevation (`elevation = 4` in Material without `CardDefaults.cardElevation`, raw `box-shadow` in CSS without token)
- **Dark mode safety** — colors that look fine in light mode but are unreadable in dark mode (e.g. `Color.Black` on a surface that inverts, or `#FFFFFF` text hardcoded in a dark-mode-capable component)
- **Motion/animation** — hardcoded animation durations (`animateDpAsState(durationMillis = 300)`, `transition: all 0.3s`) instead of design system motion tokens where available

Rate:
- **P0** — accessibility violation that blocks users (missing label on interactive element, touch target < 32dp, color contrast < 3:1 for large text / 4.5:1 for normal text)
- **P1** — hardcoded value that breaks theming or dark mode
- **P2** — wrong component choice, inconsistent spacing, missing motion token

Output format:
```
## Reviewer 12: Design System
Design system: <detected or "not detected — checking generic patterns">
Findings: P0:N P1:N P2:N

[For each P0/P1:]
  FILE:LINE — <issue: what was used vs. what should be used>
  Impact: <breaks dark mode / inaccessible / theme inconsistent>
  Fix: <specific token or component to use instead>

[If no P0/P1: "No design system violations found." OR "SKIPPED — not mobile-app or web-service archetype."]
```

## Skeptical Triage

Apply the **skeptical-triage skill** (`skills/skeptical-triage/SKILL.md`) to reduce false-positive gate:code blocks before counting findings.

**Scope** (depends on `--deep` flag):
- **Default:** P0/P1 findings from Angles 2 (Security), 4 (SQL Safety), 7 (Data Privacy), 9 (Concurrency)
- **`--deep`:** P0/P1 findings from **all** angles (Performance, Readability, Side Effects, Error Handling, Dependency Freshness, API Contracts, Design System included)

P2 findings bypass triage regardless of flag — cost > value.

For each in-scope finding, run the 4-step pattern from the skill:
1. **Round 1 — Reachability:** attacker path / premise check
2. **Round 2 — Verify defenses:** grep cited constants + implementations; resolve to numeric values
3. **Round 3 — Missed angles:** error paths, integer edges, races, different callers
4. **Arbiter:** final VALID/INVALID + one-sentence `crux`

Apply hard rules from the skill (absence of defense → VALID; code quality ≠ security; name the line or it does not exist).

**Confidence** = `valid_rounds / 3`. Severity action (per skill):
- `INVALID` → filtered from gate tally, recorded as `[FILTERED]` for audit
- `VALID` ≥ 50% conf → keep original severity
- `VALID` < 50% conf → demote P0→P1, P1→P2
- `UNCERTAIN` → keep severity, flag for manual review

**Output per triaged finding:**
```
[FINDING-ID] [ANGLE] FILE:LINE — <title>
  Rounds: [V V I → V]   Confidence: 67%
  Crux: <one-sentence key fact the verdict turns on>
  Verdict: VALID (arbiter)
  Fix: <specific change>
```

**Log every triage to** `.great_cto/triage-log.jsonl` (append-only, one JSON per line, schema in skill). This is how we measure whether triage earns its keep — review weekly.

```
## Triage Summary
Scope: [security/reliability only | --deep: all angles]
Triaged: N findings
  ✅ VALID:     M  (🔥≥90% ✅≥70% 🤔≥50%)
  ❌ INVALID:   K  (filtered from gate)
  ❓ UNCERTAIN: L  (kept at original severity, manual review)
```

## Verdict + Gate

Tally all findings. If `--deep`: use post-triage severities for all angles. Otherwise: post-triage for Angles 2/4/7/9; original for the rest.
```bash
# Total counts across all 12 angles
# For triaged angles (2,4,7,9): count only findings with verdict != INVALID,
# applying demotions from confidence < 0.5
echo "P0 (post-triage): [sum]"
echo "P1 (post-triage): [sum]"
echo "P2:              [sum]"
```

**Gate:code decision:**

If P0 > 0 OR (approval-level = strict AND P1 > 0) **after triage**:
```bash
GATE_ID=$(bd create "gate:code — review findings require resolution before QA" \
  --type task --priority 0 --label gate 2>/dev/null | grep -oE '[0-9]+' | head -1)
echo "gate:code CREATED (ID: $GATE_ID) — resolve P0/P1 findings, then re-run /review"
```
If bd unavailable: append to `.great_cto/tasks.md`: `[GATE:CODE] <feature> — P0:N P1:N findings — resolve before QA.`

If P0 = 0 AND (P1 = 0 OR approval-level = auto):
```bash
# Close existing gate:code if present
EXISTING=$(bd list --label gate --status open 2>/dev/null | grep "gate:code" | awk '{print $1}' | head -1)
[ -n "$EXISTING" ] && bd close "$EXISTING" "Review clean — P0:0 P1:[count]" 2>/dev/null
echo "Code review: CLEAN — no gate:code needed. Proceed to qa-engineer."
```

**Log verdict:**
```bash
mkdir -p .great_cto/verdicts
printf '%s code-review P0:%d P1:%d P2:%d mode=%s angles=12 archetype=%s triaged=%d valid=%d invalid=%d\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" <P0_post> <P1_post> <P2> "$REVIEW_MODE" "$ARCHETYPE" \
  <triaged_count> <valid_count> <invalid_count> \
  >> .great_cto/verdicts/code-review.log
```

## Summary

```
/review complete — [N] files reviewed — 12 angles + skeptical triage

Reviewer 1  (Performance):         P0:N P1:N P2:N
Reviewer 2  (Security):            P0:N P1:N P2:N   [triaged: V:N I:N U:N]
Reviewer 3  (Readability):         P0:N P1:N P2:N
Reviewer 4  (SQL Safety):          P0:N P1:N P2:N   [triaged: V:N I:N U:N]
Reviewer 5  (LLM Trust):           P0:N P1:N P2:N  [or SKIPPED]
Reviewer 6  (Side Effects):        P1:N P2:N
Reviewer 7  (Data Privacy):        P0:N P1:N P2:N   [triaged: V:N I:N U:N]
Reviewer 8  (Error Handling):      P0:N P1:N P2:N
Reviewer 9  (Concurrency):         P0:N P1:N P2:N   [triaged: V:N I:N U:N]
Reviewer 10 (Dependency Freshness):P1:N P2:N
Reviewer 11 (API Contracts):       P0:N P1:N P2:N
Reviewer 12 (Design System):       P0:N P1:N P2:N  [or SKIPPED — <archetype>]
──────────────────────────────────────────────────
Raw total:                         P0:N P1:N P2:N
Post-triage total:                 P0:N P1:N P2:N   [N filtered, N demoted]

Top validated findings (sorted by confidence):
  🔥 100% [VVV→V] FILE:LINE — <title>  CRUX: <key fact>
  ✅  67% [VIV→V] FILE:LINE — <title>  CRUX: <key fact>
  🤔  33% [IIV→I] FILE:LINE — <title>  [FILTERED — arbiter INVALID]

Verdict: [CLEAN — proceed to /qa-engineer] OR [BLOCKED — gate:code created (ID: N)]
[If blocked: list top 3 VALID findings to fix, highest confidence first]
```
