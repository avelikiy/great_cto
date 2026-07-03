---
description: "Procurement / source-to-pay compliance check — invokes procurement-reviewer to produce TM-procurement-{slug}.md with three-way match, segregation-of-duties, OFAC-screening, and SOX procurement-controls gaps."
argument-hint: "[slug] — optional ARCH slug to review (defaults to latest)"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/procurement-review** command. Run the procurement-reviewer
on the current project and report findings.

## Step 1 — Locate ARCH doc

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
if [ -z "$SLUG" ]; then
  ARCH=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1)
  [ -z "$ARCH" ] && echo "BLOCKED: no ARCH doc; run /architect first" && exit 1
  SLUG=$(basename "$ARCH" .md | sed 's/^ARCH-//')
else
  ARCH="docs/architecture/ARCH-${SLUG}.md"
  [ ! -f "$ARCH" ] && echo "BLOCKED: $ARCH not found" && exit 1
fi
echo "Reviewing: $ARCH"
```

## Step 2 — Detect procurement signals (skip if none)

```bash
PROC_HITS=$(grep -ciE "purchase order|three.?way match|procurement|requisition|\brfp\b|\brfq\b|vendor onboarding|\bofac\b|punchout|cxml|spend analytics|maverick spend" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
if [ "$PROC_HITS" -eq 0 ]; then
  echo "No procurement/source-to-pay signals in ARCH or PROJECT.md — skipping procurement review."
  exit 0
fi
```

## Step 3 — Invoke procurement-reviewer

Use the Agent tool with `subagent_type: procurement-reviewer` and prompt:

> Review `docs/architecture/ARCH-${SLUG}.md` and `.great_cto/PROJECT.md`.
> Produce `docs/sec-threats/TM-procurement-${SLUG}.md` using the template at
> `skills/great_cto/templates/TM-procurement.md`. Report critical/high findings
> and append the HANDOFF block. Verdict: signed-off or blocked.

## Step 4 — Surface verdict

After agent completes, print:

- TM file path
- Critical / High counts
- Verdict (signed-off | blocked)
- List of gates raised (`gate:procurement-controls`, …)
- Next action: if blocked → fix critical items, re-run; if signed-off → notify finance/controller to approve `gate:procurement-controls`.
