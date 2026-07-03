---
description: "Tax-filing compliance check — invokes tax-reviewer to produce TM-tax-{slug}.md with MeF e-file schema, Form 8879, PTIN/Circular 230, and IRC §7216 consent gaps."
argument-hint: "[slug] — optional ARCH slug to review (defaults to latest)"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/tax-review** command. Run the tax-reviewer
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

## Step 2 — Detect tax-prep signals (skip if none)

```bash
TAX_HITS=$(grep -ciE "\bptin\b|circular 230|form 8879|\bmef\b|pub(lication)? 4557|section 7216|tax prep|e-file|irs|1040|efin" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
if [ "$TAX_HITS" -eq 0 ]; then
  echo "No tax-prep/e-file signals in ARCH or PROJECT.md — skipping tax review."
  exit 0
fi
```

## Step 3 — Invoke tax-reviewer

Use the Agent tool with `subagent_type: tax-reviewer` and prompt:

> Review `docs/architecture/ARCH-${SLUG}.md` and `.great_cto/PROJECT.md`.
> Produce `docs/sec-threats/TM-tax-${SLUG}.md` using the template at
> `skills/great_cto/templates/TM-tax.md`. Report critical/high findings
> and append the HANDOFF block. Verdict: signed-off or blocked.

## Step 4 — Surface verdict

After agent completes, print:

- TM file path
- Critical / High counts
- Verdict (signed-off | blocked)
- List of gates raised (`gate:tax-filing-signoff`, …)
- Next action: if blocked → fix critical items, re-run; if signed-off → notify EA/CPA compliance lead to approve `gate:tax-filing-signoff`.
