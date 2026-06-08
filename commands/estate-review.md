---
description: "Estate-planning / probate audit. Invokes estate-reviewer to assess autonomous will/trust drafting, capacity + execution-formality assessment, undue-influence / conflict screening, and instrument execution / probate filing for UPL exposure (drafting wills/trusts is law practice), defective-execution voidness (two witnesses, notarization, self-proving affidavit, beneficiary-witness purging), testamentary capacity + undue influence, estate/gift/GST tax (Form 706 nine-month deadline, Form 709, portability/DSUE) — and force a licensed-estate-planning-attorney sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/estate-review** command — the estate-planning / probate entrypoint.

## Step 1 — Locate ARCH + detect estate surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

EST_HITS=$(grep -ciE "estate|estate planning|\bwill\b|trust|testamentary|probate|executor|trustee|fiduciary|beneficiary|testamentary capacity|undue influence|execution formalities|attestation|witness|notariz|self-proving affidavit|form 706|form 709|gift tax|\bgst\b|generation-skipping|portability|dsue|unified credit|\bupl\b|unauthorized practice of law|attorney-client privilege" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "estate-surface signal hits: ${EST_HITS}"
[ "${EST_HITS:-0}" -eq 0 ] && echo "No estate signals found — is this an estate-planning/probate product? Proceeding to invoke estate-reviewer anyway (explicit /estate-review)."
```

## Step 2 — Invoke estate-reviewer

Invoke the **estate-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require attribution to a licensed attorney for every instrument and every advice output (the UPL defence).
2. Check state execution formalities (two witnesses, notarization, self-proving affidavit, beneficiary-witness purging), testamentary-capacity assessment, and the undue-influence / conflict screen.
3. Verify estate/gift/GST exposure is surfaced (Form 706 nine-month deadline, Form 709, portability/DSUE, unified credit) and that no legal/tax advice is emitted from a non-lawyer.
4. Set the UPL/voidness-high patterns that escalate every instrument to a licensed estate-planning attorney (`gate:estate-attorney-signoff`).
5. Write `docs/sec-threats/TM-estate-${SLUG}.md` (from `skills/great_cto/templates/TM-estate.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # UPL/voidness-high paths needing an attorney,
Critical/High findings, and whether `gate:estate-attorney-signoff` was created. Point the CTO at the TM
doc. Do not restate the whole threat model.
