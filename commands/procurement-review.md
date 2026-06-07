---
description: "Procurement / source-to-pay compliance review. Invokes procurement-reviewer to assess autonomous supplier onboarding, PO, invoice, and payment release for sanctions / denied-party screening (OFAC/EU/UK), anti-bribery (FCPA / UK Bribery Act), invoice/PO fraud (three-way match, BEC, duplicates), segregation of duties — and force a human payment-release sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/procurement-review** command — the source-to-pay compliance entrypoint.

## Step 1 — Locate ARCH + detect procurement surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

PROC_HITS=$(grep -ciE "procurement|source-to-pay|supplier|vendor onboarding|purchase order|invoice|accounts payable|ap automation|three-way match|spend management|rfx|rfp|sanctions|ofac|kyb|vendor master|payment release" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "procurement-surface signal hits: ${PROC_HITS}"
[ "${PROC_HITS:-0}" -eq 0 ] && echo "No procurement signals found — is this a source-to-pay product? Proceeding to invoke procurement-reviewer anyway (explicit /procurement-review)."
```

## Step 2 — Invoke procurement-reviewer

Invoke the **procurement-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Map every money-moving action's autonomy (onboarding / PO / invoice / bank-change / payment).
2. Require sanctions / PEP / UBO screening (onboarding + continuous; hard block on hit).
3. Check ABAC due diligence, three-way match, duplicate + BEC bank-change verification, and SoD.
4. Set the spend autonomy floor + `gate:payment-release` for above-threshold / red-flagged payments.
5. Write `docs/sec-threats/TM-procurement-${SLUG}.md` (from `skills/great_cto/templates/TM-procurement.md`)
   with a `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), whether sanctions screening is continuous,
the spend autonomy ceiling, Critical/High findings, and whether `gate:payment-release` was created.
Point the CTO at the TM doc. Do not restate the whole threat model.
