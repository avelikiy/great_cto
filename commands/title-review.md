---
description: "Title & escrow compliance audit. Invokes title-escrow-reviewer to assess autonomous title search/exam, escrow, and closing coordination for the insurable-title decision (ALTA standards + Best Practices), TILA/RESPA/TRID disclosures, CFPB oversight, state title-agent/escrow-officer licensing, wire-fraud/BEC out-of-band verification, good-funds rules, lien clearance, and per-state recording — and force a licensed title/escrow-officer sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/title-review** command — the title & escrow entrypoint.

## Step 1 — Locate ARCH + detect title/escrow surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

TITLE_HITS=$(grep -ciE "title search|title exam|title commitment|title policy|\bescrow\b|\bclosing\b|settlement|\balta\b|\btrid\b|loan estimate|closing disclosure|\brespa\b|wire instruction|\bpayoff\b|good funds|lien clearance|curative|recording|\bdeed\b|\bmortgage\b|underwriter" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "title-surface signal hits: ${TITLE_HITS}"
[ "${TITLE_HITS:-0}" -eq 0 ] && echo "No title/escrow signals found — is this a title & escrow product? Proceeding to invoke title-escrow-reviewer anyway (explicit /title-review)."
```

## Step 2 — Invoke title-escrow-reviewer

Invoke the **title-escrow-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require a title-evidence trace for every autonomously-produced commitment item (the underwriter defence).
2. Check out-of-band payoff + wire-instruction verification and that no autonomous path originates/alters a wire.
3. Verify good-funds (collected + cleared per state law) before disbursement eligibility.
4. Enforce TRID (CD content + 3-business-day waiting period + fee tolerances) and set the insurable-title decisions + disbursements that escalate to a licensed officer (`gate:title-officer-signoff`).
5. Write `docs/sec-threats/TM-title-${SLUG}.md` (from `skills/great_cto/templates/TM-title.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # officer-signoff paths,
Critical/High findings, and whether `gate:title-officer-signoff` was created. Point the CTO at the TM
doc. Do not restate the whole threat model.
