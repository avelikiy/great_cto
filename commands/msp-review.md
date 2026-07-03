---
description: "MSP / managed-services compliance check — invokes msp-reviewer to produce TM-msp-{slug}.md with client-isolation, credential-vaulting, SLA-tracking, and incident-escalation gaps."
argument-hint: "[slug] — optional ARCH slug to review (defaults to latest)"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/msp-review** command. Run the msp-reviewer
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

## Step 2 — Detect MSP signals (skip if none)

```bash
MSP_HITS=$(grep -ciE "\bmsa\b|\bsla\b|\brmm\b|\bpsa\b|multi.?tenant|managed service|credential vault|managed service provider" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
if [ "$MSP_HITS" -eq 0 ]; then
  echo "No MSP/managed-services signals in ARCH or PROJECT.md — skipping MSP review."
  exit 0
fi
```

## Step 3 — Invoke msp-reviewer

Use the Agent tool with `subagent_type: msp-reviewer` and prompt:

> Review `docs/architecture/ARCH-${SLUG}.md` and `.great_cto/PROJECT.md`.
> Produce `docs/sec-threats/TM-msp-${SLUG}.md` using the template at
> `skills/great_cto/templates/TM-msp.md`. Report critical/high findings
> and append the HANDOFF block. Verdict: signed-off or blocked.

## Step 4 — Surface verdict

After agent completes, print:

- TM file path
- Critical / High counts
- Verdict (signed-off | blocked)
- List of gates raised (`gate:msp-controls`, …)
- Next action: if blocked → fix critical items, re-run; if signed-off → notify security lead / MSP operations to approve `gate:msp-controls`.
