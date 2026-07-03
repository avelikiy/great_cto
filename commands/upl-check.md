---
description: "Unauthorized-practice-of-law (UPL) + legal-services compliance review. Invokes legal-reviewer to audit UPL gating, IOLTA/trust accounting, attorney-client privilege, conflict-of-interest screening, and e-filing redaction. Required before shipping any client-facing legal-SMB feature."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/upl-check** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: $ARCH not found" && exit 1

LEGAL_HITS=$(grep -ciE "matter|docket|litigation|retainer|iolta|clio|mycase|pacer|ecf|conflict.?check|engagement.?letter|paralegal|law.?firm|attorney" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$LEGAL_HITS" -eq 0 ] && echo "No legal-services signals — skipping." && exit 0
```

## Step 2 — Invoke legal-reviewer

`subagent_type: legal-reviewer` — write `docs/sec-threats/TM-legal-${SLUG}.md` using `skills/great_cto/templates/TM-legal.md`.

## Step 3 — Surface

Print: UPL-gated surfaces, trust-accounting findings, conflict-check status, critical/high findings, gate (`gate:upl-review`).
