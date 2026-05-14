---
description: "Lab automation / instrument qualification review. Invokes lab-automation-reviewer for SiLA2 / OPC-UA integration, IQ/OQ/PQ status, chain-of-custody, protocol static analysis, scheduler safety."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/iq-oq-pq** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED" && exit 1

LA_HITS=$(grep -ciE "lab automation|cloud lab|robotic biology|liquid handler|hamilton|tecan|beckman|opentrons|plate reader|sequencer|hplc|mass spec|strateos|emerald cloud lab|sila|opc.ua|lims" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$LA_HITS" -eq 0 ] && echo "No lab-automation signals — skipping." && exit 0
```

## Step 2 — Invoke lab-automation-reviewer

`subagent_type: lab-automation-reviewer` — write `docs/sec-threats/TM-labauto-${SLUG}.md` using `skills/great_cto/templates/TM-labauto.md`.

## Step 3 — Surface

Print: hardware inventory + IQ/OQ/PQ status, scheduler safety, chain-of-custody, gates (`gate:iq-oq-pq`). Trigger GLP handoff if regulated.
