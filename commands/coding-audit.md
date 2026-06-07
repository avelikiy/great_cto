---
description: "Medical-coding / revenue-cycle compliance audit. Invokes rcm-reviewer to assess autonomous ICD-10-CM / CPT / HCPCS coding for False Claims Act exposure (upcoding/unbundling), NCCI edits + MUEs, medical necessity (LCD/NCD), modifier discipline, HIPAA minimum-necessary — and force a certified-coder (CPC/CCS) sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/coding-audit** command — the revenue-cycle / medical-coding entrypoint.

## Step 1 — Locate ARCH + detect coding surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

RCM_HITS=$(grep -ciE "medical coding|icd-?10|cpt|hcpcs|drg|revenue cycle|\brcm\b|claim scrub|837|835|cms-?1500|ub-?04|e/m level|prior auth|charge capture|denial management|ncci|modifier|upcoding|payer" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "rcm-surface signal hits: ${RCM_HITS}"
[ "${RCM_HITS:-0}" -eq 0 ] && echo "No RCM signals found — is this a medical-billing product? Proceeding to invoke rcm-reviewer anyway (explicit /coding-audit)."
```

## Step 2 — Invoke rcm-reviewer

Invoke the **rcm-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require a documentation-evidence trace for every autonomously-assigned code (the FCA defence).
2. Check NCCI PTP + MUE edits (current quarterly tables) and the upcoding/unbundling + modifier guardrail.
3. Verify ICD↔CPT medical-necessity (LCD/NCD) linkage.
4. Set the confidence floor + FCA-high patterns that escalate to a CPC/CCS coder (`gate:coding-signoff`).
5. Write `docs/sec-threats/TM-rcm-${SLUG}.md` (from `skills/great_cto/templates/TM-rcm.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # FCA-high paths needing a coder,
Critical/High findings, and whether `gate:coding-signoff` was created. Point the CTO at the TM
doc. Do not restate the whole threat model.
