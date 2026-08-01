# Large-Scale Refactor Pipeline

> Triggered from § Intent Mapping in SKILL.md by "refactor X" / "clean up" / "restructure" / "extract service".

Use when: >20 files touched, architectural boundary change, monolith decomposition, extract-service, mass rename/restructure.

**Step 0 — Scope gate (mandatory before architecture):**
```bash
# Estimate refactor surface
git diff --name-only HEAD 2>/dev/null | wc -l  # if already started
# OR estimate from description: how many files/modules does this touch?
```
If >50 files OR >3 components → tell CTO:
```
Refactor scope: ~[N] files, [M] components.
Risk: high merge conflict probability, regression surface large.
Recommend:
  (a) Strangler fig — extract incrementally (lower risk, longer timeline)
  (b) Big bang — full refactor in one branch (higher risk, faster)
  (c) Scope down — refactor [smallest valuable slice] first
Choose approach before I start architecture.
```
Wait for CTO decision. This IS a blocking question (unlike Decision Brief).

**Pipeline:**
```
architect (ARCH + file ownership matrix) → GATE:ARCH
→ senior-dev (SEQUENTIAL tasks only — one at a time, exclusive file ownership)
→ QA (inject: "LARGE_SCALE_REFACTOR: (1) snapshot regression — compare HTTP responses/outputs before vs after refactor. (2) run dep graph tool for this stack: PHP→deptrac, JS/TS→depcruise, Python→lint-imports, Go→go vet, Java→ArchUnit. Report to docs/qa-reports/DEP-GRAPH-<date>.txt. Block on circular deps.")
→ security-officer (dependency graph audit — no new attack surface)
→ GATE:SHIP
→ devops (standard deploy for project type)
```

**Sequential enforcement** — when creating refactor tasks in Beads, wire dependencies immediately after creation (one chain per task sequence):
```bash
T1=$(bd create "refactor: <domain-1>" --label refactor --silent)
T2=$(bd create "refactor: <domain-2>" --label refactor --silent)
T3=$(bd create "refactor: <domain-3>" --label refactor --silent)
bd dep add "$T2" "$T1" && bd dep add "$T3" "$T2"
```
This prevents `bd ready` from returning T2/T3 while T1 is in-progress. Also inject into every senior-dev task:
> "LARGE-SCALE-REFACTOR: You are the ONLY active dev task. Do NOT start until previous task is confirmed closed. Your owned files: [list from work-packet]. Do not touch any file not in your ownership list."

**File ownership matrix** — architect must produce this in ARCH doc:
```markdown
