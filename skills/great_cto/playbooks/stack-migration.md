# Stack Migration Pipeline

> Triggered from § Intent Mapping in SKILL.md by "upgrade stack" / "migrate to X" / "EOL" / "upgrade PHP/Node/Python".

Use when: "upgrade PHP/Node/Python/Angular/etc.", "migrate away from EOL runtime", "strangler fig", "replace X with Y".

**Step 0 — Migration scope:**
```bash
# Detect current runtime version
node --version 2>/dev/null || php --version 2>/dev/null || python3 --version 2>/dev/null || ruby --version 2>/dev/null
# Count files affected by migration
find src/ \( -name "*.php" -o -name "*.js" -o -name "*.py" \) -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | wc -l
```
Ask architect to include in ARCH doc: (a) current version + EOL date, (b) target version, (c) breaking changes list, (d) strangler fig boundary.

**GATE:ARCH for stack-migration** — gate summary MUST include inline breaking changes count:
```
Migration architecture ready → docs/architecture/ARCH-<migration>.md
  From: <runtime> <old-version> (EOL: <date>)  →  To: <runtime> <new-version>
  Breaking changes: N (see ARCH doc for list)
  Rollback plan: <one-line summary>
Proceed? [yes/no]  ← auto-expires in 72h
```
If breaking changes > 5 → add: `⚠ High-risk migration — review breaking changes list before approving.`

**Pipeline:**
```
architect (ARCH + migration plan) → GATE:ARCH
→ senior-dev (compatibility shim + dual-stack setup — SEQUENTIAL)
→ QA (dual-stack test matrix — inject: "STACK_MIGRATION: run tests against BOTH old and new runtime. OLD suite must pass on old runtime. NEW suite must pass on new runtime. Report separately.")
→ security-officer (dependency vulnerability scan on new version)
→ GATE:SHIP
→ devops (staged cutover 10%→50%→100%, OLD stack kept live)
```

**Special rules for this pipeline:**
- Senior-dev tasks are SEQUENTIAL — no parallel implementation (dependency chain)
- When creating migration tasks in Beads, wire them immediately after creation:
  ```bash
  TASK1=$(bd create "migration: compatibility shim" --label migration --silent)
  TASK2=$(bd create "migration: dual-stack setup" --label migration --silent)
  bd dep add "$TASK2" "$TASK1"  # task2 blocked until task1 is closed
  ```
  This prevents any senior-dev from claiming task2 via `bd ready` while task1 is in-progress.
- OLD stack must remain deployable until 100% cutover confirmed stable for ≥48h
- Devops maintains instant rollback (traffic shift back) throughout cutover
- architect ARCH doc must include: compatibility matrix (what breaks), rollback plan per stage

**OLD stack retirement** — after 100% cutover and ≥48h stability confirmed, devops creates a retirement gate:
```bash
bd create "gate:retire-old-stack — <runtime> <version> decommission" --type task --priority 1 --label gate
```
Retirement checklist before shutdown:
1. Error rate on NEW stack <0.1% for ≥48h — confirm from perf-baseline.log
2. No open incidents referencing OLD stack — `bd list --label production --status open`
3. CTO explicitly approves: "retire old stack" or "decommission [version]"
4. Remove OLD stack infra, update PROJECT.md runtime version, archive OLD stack branch
Retirement appears in `/inbox` under NEEDS YOUR DECISION like any other gate.
