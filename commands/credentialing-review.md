---
description: "Provider-credentialing / payer-enrollment compliance review. Invokes credentialing-reviewer to assess autonomous primary-source verification of a clinician's licenses, education, training, and malpractice history (NPDB, DEA, state boards, ABMS, schools) and payer enrollment (CAQH ProView) for negligent-credentialing exposure, NCQA / Joint Commission / CMS CoP standards, FCRA adverse-action, OIG LEIE / SAM exclusion monitoring — and force a credentialing-committee / medical-staff-office sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/credentialing-review** command — the provider-credentialing / payer-enrollment entrypoint.

## Step 1 — Locate ARCH + detect credentialing surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

CRED_HITS=$(grep -ciE "credentialing|provider enrollment|payer enrollment|primary-?source verification|\bpsv\b|npdb|\bdea\b|state board|abms|caqh|proview|privileging|re-?credentialing|ncqa|joint commission|\btjc\b|conditions of participation|cms-?cop|oig leie|sam\.gov|exclusion list|negligent credentialing|medical staff office" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "credentialing-surface signal hits: ${CRED_HITS}"
[ "${CRED_HITS:-0}" -eq 0 ] && echo "No credentialing signals found — is this a provider-credentialing/enrollment product? Proceeding to invoke credentialing-reviewer anyway (explicit /credentialing-review)."
```

## Step 2 — Invoke credentialing-reviewer

Invoke the **credentialing-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require a per-element PSV trail (source identity + timestamp + raw response) — the negligent-credentialing defence.
2. Enforce primary-source-only verification (NPDB / DEA / state boards / ABMS / schools); reject secondary / aggregator / CAQH-self-report copies for PSV elements.
3. Check the NCQA recency window and the privilege-to-competence match (TJC / CMS CoP); reconcile CAQH as input only.
4. Verify the FCRA disclosure/authorization + pre-adverse → adverse-action workflow and re-credentialing + ongoing OIG LEIE / SAM.gov / license / sanction monitoring.
5. Set the adverse-finding paths that escalate to a credentialing committee / medical staff office (`gate:credentialing-committee-signoff`).
6. Write `docs/sec-threats/TM-credentialing-${SLUG}.md` (from `skills/great_cto/templates/TM-credentialing.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # adverse-finding paths needing committee sign-off,
Critical/High findings, and whether `gate:credentialing-committee-signoff` was created. Point the CTO at the TM
doc. Do not restate the whole threat model.
