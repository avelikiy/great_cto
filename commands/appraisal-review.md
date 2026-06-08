---
description: "Real-estate appraisal / valuation audit. Invokes appraisal-reviewer to assess autonomous order intake, comparable-sales support, AVM cross-check, and report delivery (UCDP/EAD) for appraiser-independence exposure (Dodd-Frank Sec 1472 / TILA Reg Z 12 CFR 1026.42, FIRREA Title XI), USPAP compliance (scope of work, supportable opinion of value, no advocacy), the state-certified-appraiser signing requirement (AVM alone is NOT an appraisal), valuation-bias / fair-housing (ECOA + FHA), and the Reconsideration-of-Value process — and force a state-certified-appraiser (signer-of-record) sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/appraisal-review** command — the real-estate appraisal / valuation entrypoint.

## Step 1 — Locate ARCH + detect appraisal surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

APR_HITS=$(grep -ciE "appraisal|appraiser|valuation|opinion of value|uspap|scope of work|comparable sales|\bcomps\b|\bmls\b|\bavm\b|automated valuation model|\burar\b|form 1004|\buad\b|\bucdp\b|\bead\b|appraiser independence|dodd-frank|1026\.42|reg z|firrea|\bamc\b|appraisal management company|reconsideration of value|\brov\b|fair housing|\becoa\b|valuation bias|undervaluation|state-certified|hybrid appraisal|bifurcated|workfile|record keeping" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "appraisal-surface signal hits: ${APR_HITS}"
[ "${APR_HITS:-0}" -eq 0 ] && echo "No appraisal signals found — is this a real-estate valuation product? Proceeding to invoke appraisal-reviewer anyway (explicit /appraisal-review)."
```

## Step 2 — Invoke appraisal-reviewer

Invoke the **appraisal-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require a comp-support evidence trace for every autonomously-produced value — opinion of value, comparable sales, AVM cross-check, signer (the USPAP / appraiser-independence defence).
2. Check that the opinion of value is supportable from the comps (never anchored to the contract price / lender target), the AVM is a cross-check only, and prohibited-basis signals are kept out of the value.
3. Verify the valuation-bias / fair-housing screen (ECOA + FHA) + Reconsideration-of-Value (ROV) path, and the USPAP workfile + UAD / URAR validation before delivery.
4. Set the independence-high patterns that escalate every report to a state-certified appraiser (`gate:licensed-appraiser-signoff`).
5. Write `docs/sec-threats/TM-appraisal-${SLUG}.md` (from `skills/great_cto/templates/TM-appraisal.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # independence-high paths needing an appraiser,
Critical/High findings, and whether `gate:licensed-appraiser-signoff` was created. Point the CTO at the TM
doc. Do not restate the whole threat model.
