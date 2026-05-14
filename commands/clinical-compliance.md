---
description: "Clinical-AI compliance check — invokes ai-clinical-reviewer (and fda-reviewer if SaMD signal) to produce TM-clinical / TM-samd with GMLP, PCCP, EU AI Act, citation grounding, subgroup fairness, and SaMD classification gaps."
argument-hint: "[slug] — optional ARCH slug (defaults to latest)"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/clinical-compliance** command.

## Step 1 — Locate ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
if [ -z "$SLUG" ]; then
  ARCH=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1)
  [ -z "$ARCH" ] && echo "BLOCKED: no ARCH; run /architect first" && exit 1
  SLUG=$(basename "$ARCH" .md | sed 's/^ARCH-//')
else
  ARCH="docs/architecture/ARCH-${SLUG}.md"
  [ ! -f "$ARCH" ] && echo "BLOCKED: $ARCH not found" && exit 1
fi
```

## Step 2 — Detect signals

```bash
CLIN_HITS=$(grep -ciE "clinical|patient|ehr|emr|phi|hipaa|diagnos|triage|radiolog|patholog|samd|scribe|telehealth|medical record" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$CLIN_HITS" -eq 0 ] && echo "No clinical signals — skipping." && exit 0
SAMD_HITS=$(grep -ciE "samd|software.as.medical.device|510\\(k\\)|de novo|pma|mdr|ivdr" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
```

## Step 3 — Invoke reviewers

1. `subagent_type: ai-clinical-reviewer` → review ARCH, write `docs/sec-threats/TM-clinical-${SLUG}.md` using template `skills/great_cto/templates/TM-clinical.md`.
2. If `$SAMD_HITS > 0` → also `subagent_type: fda-reviewer` → write `TM-samd-${SLUG}.md` using `TM-samd.md` template.

## Step 4 — Surface

Print verdicts (signed-off | blocked), critical/high counts, proposed SaMD class + path (if applicable), gates raised (`gate:clinical-validation`, `gate:samd-class`, `gate:ide-approval` if PMA).
