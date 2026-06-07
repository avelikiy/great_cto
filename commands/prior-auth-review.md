---
description: "Prior-authorization / utilization-management compliance review. Invokes prior-auth-reviewer to assess autonomous medical-necessity adjudication (approve / pend / deny) for wrongful-denial liability — forcing the rule that an autopilot may approve/pend autonomously but may NEVER autonomously deny: every adverse determination requires a plan-side medical-director sign-off. Covers CMS-0057-F turnaround + FHIR PARDD/Da Vinci APIs, MCG / InterQual / CMS NCD-LCD criteria matching, gold-card laws, ERISA appeals, and HIPAA minimum-necessary."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/prior-auth-review** command — the prior-authorization / utilization-management entrypoint.

## Step 1 — Locate ARCH + detect adjudication surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

PA_HITS=$(grep -ciE "prior auth|prior-auth|utilization management|utilization review|medical necessity|mcg|interqual|ncd|lcd|adverse determination|concurrent review|step therapy|site of service|formulary|gold.?card|cms-?0057|pardd|da vinci|crd|dtr|pas|medical director|\biro\b|erisa" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "prior-auth-surface signal hits: ${PA_HITS}"
[ "${PA_HITS:-0}" -eq 0 ] && echo "No prior-auth signals found — is this a coverage-adjudication product? Proceeding to invoke prior-auth-reviewer anyway (explicit /prior-auth-review)."
```

## Step 2 — Invoke prior-auth-reviewer

Invoke the **prior-auth-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Classify each determination path: approve/pend may run autonomously; **deny may never run autonomously**.
2. Verify the deny path is unreachable without a recorded plan-side medical-director signoff (`gate:medical-director-signoff`).
3. Check the criteria→chart evidence trace (MCG / InterQual / CMS NCD-LCD set + version per criterion) — the appeal defence.
4. Check the CMS-0057-F turnaround clock (7-day standard / 72-hour expedited) + specific denial reason, and FHIR PARDD / Da Vinci (CRD/DTR/PAS) interfaces.
5. Verify gold-card exemptions, ERISA full-and-fair appeals (internal + external/IRO), and minimum-necessary PHI.
6. Write `docs/sec-threats/TM-prior-auth-${SLUG}.md` (from `skills/great_cto/templates/TM-prior-auth.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # adverse-determination paths needing a medical
director, Critical/High findings, and whether `gate:medical-director-signoff` was created. Point the CTO
at the TM doc. Do not restate the whole threat model.
