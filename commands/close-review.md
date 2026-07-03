---
description: "Month-end close / GL compliance check — invokes accounting-reviewer to produce TM-accounting-{slug}.md with double-entry integrity, ASC 606 revenue-recognition, period-lock, and SOX ITGC gaps."
argument-hint: "[slug] — optional ARCH slug to review (defaults to latest)"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/close-review** command. Run the accounting-reviewer
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

## Step 2 — Detect accounting/GL signals (skip if none)

```bash
ACCT_HITS=$(grep -ciE "general ledger|\bgaap\b|asc.?606|journal entry|month.?end close|chart of accounts|1099|three.?way reconciliation|revenue recognition|sox.itgc" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
if [ "$ACCT_HITS" -eq 0 ]; then
  echo "No accounting/GL signals in ARCH or PROJECT.md — skipping close review."
  exit 0
fi
```

## Step 3 — Invoke accounting-reviewer

Use the Agent tool with `subagent_type: accounting-reviewer` and prompt:

> Review `docs/architecture/ARCH-${SLUG}.md` and `.great_cto/PROJECT.md`.
> Produce `docs/sec-threats/TM-accounting-${SLUG}.md` using the template at
> `skills/great_cto/templates/TM-accounting.md`. Report critical/high findings
> and append the HANDOFF block. Verdict: signed-off or blocked.

## Step 4 — Surface verdict

After agent completes, print:

- TM file path
- Critical / High counts
- Verdict (signed-off | blocked)
- List of gates raised (`gate:close-signoff`, …)
- Next action: if blocked → fix critical items, re-run; if signed-off → notify controller/finance lead to approve `gate:close-signoff`.
