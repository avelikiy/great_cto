---
description: "SOX ITGC / IT general-controls audit compliance review. Invokes sox-itgc-reviewer to assess autonomous controls testing (pull evidence, execute control tests, flag exceptions, draft workpapers) for PCAOB AS 2201 (ICFR) + AICPA, Sarbanes-Oxley §302/§404, ITGC domains (logical access, change management, IT operations, backup/recovery), segregation of duties, evidence sufficiency & competence, exception severity (deficiency / significant deficiency / material weakness), materiality & scoping, auditor independence — and force a licensed CPA / engagement-partner sign-off on the opinion."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/audit-review** command — the SOX ITGC / controls-audit entrypoint.

## Step 1 — Locate ARCH + detect audit surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

AUDIT_HITS=$(grep -ciE "\bsox\b|itgc|icfr|audit opinion|controls testing|pcaob|as ?2201|aicpa|§ ?404|section 404|§ ?302|logical access|change management|segregation of duties|\bsod\b|material weakness|significant deficiency|workpaper|engagement partner|materiality|auditor independence|evidence sufficiency" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "audit-surface signal hits: ${AUDIT_HITS}"
[ "${AUDIT_HITS:-0}" -eq 0 ] && echo "No audit signals found — is this a SOX/ITGC audit product? Proceeding to invoke sox-itgc-reviewer anyway (explicit /audit-review)."
```

## Step 2 — Invoke sox-itgc-reviewer

Invoke the **sox-itgc-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require a control→evidence trace (population + sample + result; sufficient & competent) for every autonomously-tested control.
2. Check exception evaluation + severity (deficiency / significant deficiency / material weakness) and segregation-of-duties conflict detection.
3. Verify materiality & scoping are respected and auditor independence is intact (no self-testing).
4. Set the rule that the opinion is never auto-issued — every opinion, material weakness, and independence breach escalates to a CPA / engagement partner (`gate:engagement-partner-signoff`).
5. Write `docs/sec-threats/TM-audit-${SLUG}.md` (from `skills/great_cto/templates/TM-audit.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # paths needing engagement-partner sign-off,
Critical/High findings, and whether `gate:engagement-partner-signoff` was created. Point the CTO at
the TM doc. Do not restate the whole threat model.
