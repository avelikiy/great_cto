---
description: "Mortgage underwriting fair-lending compliance audit. Invokes lending-credit-reviewer to assess autonomous home-loan credit decisions for ECOA / Reg B disparate impact (ZIP-as-race proxy), adverse-action notices (30-day, ≤4 reasons), TILA / RESPA / TRID disclosure timing, HMDA LAR + GMI handling, SAFE Act licensing, GSE/FHA/VA guidelines, CFPB UDAAP — and force a licensed-underwriter sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/mortgage-review** command — the mortgage-underwriting entrypoint.

## Step 1 — Locate ARCH + detect underwriting surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

MTG_HITS=$(grep -ciE "mortgage|home loan|underwrit|loan origination|\blos\b|trid|respa|loan estimate|closing disclosure|hmda|\blar\b|gse|fannie mae|freddie mac|\bfha\b|\bva\b|\bdti\b|\bltv\b|\baus\b|adverse action|fair lending|redlining" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "mortgage-surface signal hits: ${MTG_HITS}"
[ "${MTG_HITS:-0}" -eq 0 ] && echo "No mortgage signals found — is this a home-loan underwriting product? Proceeding to invoke lending-credit-reviewer anyway (explicit /mortgage-review)."
```

## Step 2 — Invoke lending-credit-reviewer

Invoke the **lending-credit-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require an adverse-action engine: 30-day notice, ≤4 specific principal reasons mapped from model features.
2. Run the fair-lending disparate-impact pipeline (4/5-rule, BISG, ZIP-as-race-proxy audit) on the LAR population.
3. Check TILA/RESPA/TRID disclosure-timing (Loan Estimate / Closing Disclosure clocks) and SAFE Act / GSE/FHA/VA guideline coverage.
4. Verify HMDA GMI capture at application (excluded from underwriting features) + validated LAR pipeline.
5. Set the confidence floor + fair-lending-high patterns that escalate to a licensed underwriter (`gate:underwriter-signoff`).
6. Write `docs/sec-threats/TM-mortgage-${SLUG}.md` (from `skills/great_cto/templates/TM-mortgage.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # fair-lending-high paths needing an underwriter,
Critical/High findings, and whether `gate:underwriter-signoff` was created. Point the CTO at the TM
doc. Do not restate the whole threat model.
