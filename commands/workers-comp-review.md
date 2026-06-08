---
description: "Workers'-comp claims-handling audit. Invokes workers-comp-reviewer to assess autonomous AOE/COE compensability determination, AWW / TTD-PPD benefit computation, utilization review against treatment guidelines (MTUS/ODG), and EDI claim filing (IAIABC) for bad-faith / unfair-claims-practices exposure (auto-denial/benefit-termination/unsupported-medical-denial/AWW-understatement), the 50-state workers'-comp acts, statutory deadlines, anti-retaliation — and force a licensed-claims-adjuster (examiner) sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/workers-comp-review** command — the workers'-comp claims-handling entrypoint.

## Step 1 — Locate ARCH + detect workers-comp surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

WC_HITS=$(grep -ciE "workers comp|workers' compensation|claims adjuster|examiner|compensability|aoe/coe|first report of injury|\bfroi\b|\bsroi\b|iaiabc|edi claim|average weekly wage|\baww\b|\bttd\b|\btpd\b|\bppd\b|\bptd\b|utilization review|treatment guidelines|\bmtus\b|\bodg\b|independent medical exam|\bime\b|fee schedule|\bwcb\b|\bdwc\b|bad faith|unfair claims|anti-retaliation|statutory deadline|benefit termination" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "workers-comp-surface signal hits: ${WC_HITS}"
[ "${WC_HITS:-0}" -eq 0 ] && echo "No workers-comp signals found — is this an injured-worker claims product? Proceeding to invoke workers-comp-reviewer anyway (explicit /workers-comp-review)."
```

## Step 2 — Invoke workers-comp-reviewer

Invoke the **workers-comp-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require a document-evidence trace for every autonomously-decided field — compensability, AWW, benefit rate, medical necessity (the FROI / wage statement / medical record).
2. Check compensability (AOE/COE) against the correct state act, the AWW + benefit computation (statutory wage basis, type, maximum), and utilization review (MTUS/ODG) with a physician reviewer for medical denials.
3. Verify statutory-deadline tracking (FROI, IAIABC EDI reporting, benefit-payment timeliness) and anti-retaliation handling / adverse-determination notices.
4. Set the bad-faith-high patterns that escalate every compensability/denial/termination to a licensed claims adjuster (`gate:claims-adjuster-signoff`).
5. Write `docs/sec-threats/TM-workers-comp-${SLUG}.md` (from `skills/great_cto/templates/TM-workers-comp.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # bad-faith-high paths needing an adjuster,
Critical/High findings, and whether `gate:claims-adjuster-signoff` was created. Point the CTO at the TM
doc. Do not restate the whole threat model.
