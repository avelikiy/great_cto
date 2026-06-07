---
description: "KYC/AML / BSA compliance review. Invokes aml-bsa-reviewer to assess autonomous customer onboarding (IDV + KYB + beneficial-ownership), OFAC/sanctions + PEP/adverse-media screening, transaction monitoring + alert disposition, and SAR drafting for Bank Secrecy Act / USA PATRIOT Act / FinCEN CDD exposure — OFAC strict-liability hard block, no-tipping-off, state MTL — and force a BSA/AML Officer personal sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/aml-review** command — the KYC/AML / BSA compliance entrypoint.

## Step 1 — Locate ARCH + detect AML surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

AML_HITS=$(grep -ciE "\bkyc\b|\bkyb\b|\baml\b|\bbsa\b|patriot act|onboarding|identity verification|\bidv\b|beneficial owner|\bubo\b|\bcdd\b|\bedd\b|ofac|sanctions|\bsdn\b|\bpep\b|adverse media|transaction monitoring|disposition|\bsar\b|fincen|money transmitter|\bmtl\b|neobank|on-?ramp|off-?ramp" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "aml-surface signal hits: ${AML_HITS}"
[ "${AML_HITS:-0}" -eq 0 ] && echo "No AML signals found — is this a financial-onboarding / financial-crime product? Proceeding to invoke aml-bsa-reviewer anyway (explicit /aml-review)."
```

## Step 2 — Invoke aml-bsa-reviewer

Invoke the **aml-bsa-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require OFAC/sanctions screening at onboarding + ongoing; a true positive is a hard block routed to a human.
2. Check CDD + beneficial-ownership (25%/control) collection, verification, and screening; risk-rating → CDD/EDD.
3. Verify transaction-monitoring alerts get a documented, explainable disposition (no silent auto-close).
4. Enforce SAR filing discipline + confidentiality (no tipping-off) and SAR access controls + audit trail.
5. Set the high-risk patterns that escalate to the BSA/AML Officer (`gate:bsa-officer-signoff`).
6. Write `docs/sec-threats/TM-aml-${SLUG}.md` (from `skills/great_cto/templates/TM-aml.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # high-risk approval paths needing the BSA/AML
Officer, Critical/High findings, and whether `gate:bsa-officer-signoff` was created. Point the CTO at the
TM doc. Do not restate the whole threat model.
