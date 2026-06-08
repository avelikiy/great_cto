---
description: "Payroll / payroll-tax audit. Invokes payroll-reviewer to assess autonomous gross-to-net, FLSA minimum-wage / overtime, withholdings, wage garnishments, and the irreversible run-end (ACH funding + federal tax deposit / Form 941) for trust-fund-tax exposure (IRC 6672 personal liability, EFTPS deposit schedule), FLSA classification, CCPA Title III garnishment caps, worker-classification risk — and force a payroll-manager (CPP) sign-off before funds move."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/payroll-review** command — the payroll / payroll-tax entrypoint.

## Step 1 — Locate ARCH + detect payroll surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

PAY_HITS=$(grep -ciE "payroll|gross-to-net|net pay|paycheck|withholding|\bfica\b|\bflsa\b|minimum wage|overtime|exempt|non-exempt|form 941|\b940\b|\bfuta\b|\bsuta\b|eftps|tax deposit|trust fund|6672|\bw-2\b|garnishment|\bccpa\b|child support|direct deposit|\bach\b|\b1099\b|worker classification|contractor|final pay|pay stub" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "payroll-surface signal hits: ${PAY_HITS}"
[ "${PAY_HITS:-0}" -eq 0 ] && echo "No payroll signals found — is this a payroll / payroll-tax product? Proceeding to invoke payroll-reviewer anyway (explicit /payroll-review)."
```

## Step 2 — Invoke payroll-reviewer

Invoke the **payroll-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require a record-evidence trace for every autonomously-computed field — hours/overtime, withholding, deposit, garnishment, classification (the FLSA / 6672 defence).
2. Check FLSA minimum wage (higher of federal/state) + overtime 1.5× over 40h, the full withholding stack (federal + state/local + FICA + SUTA/FUTA), and the EFTPS deposit schedule (monthly/semiweekly).
3. Verify garnishments are honoured + CCPA Title III capped (child-support priority, multi-order ordering) and that workers are not auto-reclassified employee→1099 to cut tax.
4. Set the high-risk patterns that escalate every payroll run to a payroll manager (CPP) (`gate:payroll-officer-signoff`).
5. Write `docs/sec-threats/TM-payroll-${SLUG}.md` (from `skills/great_cto/templates/TM-payroll.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # money-movement high-risk paths needing a payroll
manager, Critical/High findings, and whether `gate:payroll-officer-signoff` was created. Point the CTO at
the TM doc. Do not restate the whole threat model.
