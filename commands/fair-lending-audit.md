---
description: "Fair-lending compliance audit. Invokes lending-credit-reviewer to assess ECOA / Reg B adverse-action, FCRA, NMLS state licensing, MLA scrub, fair-lending disparate-impact (4/5-rule via BISG)."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/fair-lending-audit** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED" && exit 1

CRED_HITS=$(grep -ciE "loan|lending|credit decision|underwrit|bnpl|payroll advance|ewa|line of credit|fico|credit score|fcra|ecoa|nmls|financing|apr" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$CRED_HITS" -eq 0 ] && echo "No lending signals — skipping." && exit 0
```

## Step 2 — Invoke lending-credit-reviewer

`subagent_type: lending-credit-reviewer` — write `docs/sec-threats/TM-lending-${SLUG}.md` using `skills/great_cto/templates/TM-lending.md`.

## Step 3 — Surface

Print: states served, licenses required, adverse-action design status, fair-lending 4/5-rule status, gates (`gate:fair-lending`).
