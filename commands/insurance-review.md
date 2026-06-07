---
description: "Insurance / InsurTech compliance audit. Invokes insurance-reviewer to assess autonomous claims adjudication, underwriting, and pricing for bad-faith exposure (unreasonable denial/delay/low-ball), state unfair-claims-practices timelines, disparate-impact / proxy-variable pricing, NAIC AI Model Bulletin (AIS Program), ERISA/ACA health-claim review, coverage verification before payment — and force a licensed-adjuster/underwriter sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/insurance-review** command — the claims / underwriting entrypoint.

## Step 1 — Locate ARCH + detect insurance surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

INS_HITS=$(grep -ciE "insurance|insurtech|\bclaims?\b|adjuster|underwrit|\bpolicy\b|premium|\bpricing\b|rating|\bbind\b|\bquote\b|p&c|carrier|broker|\bmga\b|\bmgu\b|\btpa\b|reinsurance|bordereau|naic|\bdoi\b|bad faith|unfair claims|disparate impact|acord|actuarial|asop|erisa|\baca\b" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "insurance-surface signal hits: ${INS_HITS}"
[ "${INS_HITS:-0}" -eq 0 ] && echo "No insurance signals found — is this an insurance product? Proceeding to invoke insurance-reviewer anyway (explicit /insurance-review)."
```

## Step 2 — Invoke insurance-reviewer

Invoke the **insurance-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require a coverage-verification trace before any autonomous payment or denial.
2. Enforce state unfair-claims-practices timelines (acknowledge/investigate/decide/pay) and the bad-faith guardrail.
3. Run disparate-impact / proxy-variable testing on any autonomous pricing/underwriting decision.
4. Check the NAIC AI Model Bulletin AIS Program + model inventory + DOI-exam-ready documentation, and ERISA/ACA review where health/disability claims are in scope.
5. Set the confidence floor + bad-faith-high patterns that escalate to a licensed adjuster/underwriter (`gate:adjuster-signoff`).
6. Write `docs/sec-threats/TM-insurance-${SLUG}.md` (from `skills/great_cto/templates/TM-insurance.md`) with a `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # bad-faith-high paths needing an adjuster,
Critical/High findings, and whether `gate:adjuster-signoff` was created. Point the CTO at the TM
doc. Do not restate the whole threat model.
