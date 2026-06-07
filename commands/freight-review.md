---
description: "Freight-brokerage compliance audit. Invokes freight-broker-reviewer to assess autonomous load-matching, quoting, booking, and tendering for brokerage liability (a booked load is a binding contract; tendering to an unvetted carrier invites double-brokering, fraud, and cargo loss): FMCSA broker authority + BMC-84 bond, carrier vetting via SAFER before tender, Carmack cargo liability, DOT recordkeeping, no autonomous rebrokering — and force a licensed-broker sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/freight-review** command — the freight-brokerage entrypoint.

## Step 1 — Locate ARCH + detect brokerage surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

FRT_HITS=$(grep -ciE "freight broker|freight brokerage|load match|\bcarrier\b|tender|rate confirmation|dispatch|fmcsa|mc[- ]?number|bmc-?84|safer|double[- ]?broker|carmack|\bbol\b|\bpod\b|detention|accessorial|track[- ]?and[- ]?trace|cargo claim" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "freight-surface signal hits: ${FRT_HITS}"
[ "${FRT_HITS:-0}" -eq 0 ] && echo "No freight signals found — is this a freight-brokerage product? Proceeding to invoke freight-broker-reviewer anyway (explicit /freight-review)."
```

## Step 2 — Invoke freight-broker-reviewer

Invoke the **freight-broker-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require carrier vetting (active authority + insurance + safety + identity) to pass before tender, traceable to the SAFER pull (the fraud defence).
2. Check that binding rate confirmations issue only after vetting passes and that rate commitments above threshold are gated.
3. Verify there is no autonomous rebrokering / re-tender without explicit authorization, and check Carmack cargo-claim window + uninsured-carrier exposure.
4. Set the confidence floor + high-risk paths that escalate to a licensed broker (`gate:broker-signoff`); confirm active MC + intact BMC-84 bond and per-transaction DOT recordkeeping.
5. Write `docs/sec-threats/TM-freight-${SLUG}.md` (from `skills/great_cto/templates/TM-freight.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # high-risk paths needing a broker,
Critical/High findings, and whether `gate:broker-signoff` was created. Point the CTO at the TM
doc. Do not restate the whole threat model.
