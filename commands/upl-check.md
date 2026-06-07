---
description: "Unauthorized-practice-of-law (UPL) + legaltech compliance check. Invokes legal-reviewer to classify outputs as legal information vs advice, map attorney-client privilege + waiver risks, validate e-signatures (ESIGN/UETA/eIDAS), conflicts, jurisdiction, and matter retention / legal hold — and force a licensed-attorney sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/upl-check** command — the legaltech compliance entrypoint.

> **Not legal advice.** This surfaces the UPL / privilege / e-signature risk surface and forces a
> licensed-attorney sign-off into the pipeline. A qualified attorney owns the actual legal call.

## Step 1 — Locate ARCH + detect legal surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

LEGAL_HITS=$(grep -ciE "contract|nda|redline|clause|legal advice|attorney|counsel|law firm|filing|e-?signature|esign|docusign|matter|conflict check|privilege|e-discovery|paralegal|legaltech" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "legal-surface signal hits: ${LEGAL_HITS}"
[ "${LEGAL_HITS:-0}" -eq 0 ] && echo "No legaltech signals found — is this a legal product? Proceeding to invoke legal-reviewer anyway (explicit /upl-check)."
```

## Step 2 — Invoke legal-reviewer

Invoke the **legal-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Classify every product output as legal **information** vs **advice** (the UPL boundary).
2. Map attorney-client privilege boundaries + waiver risks (vendors / sub-processors / training).
3. Validate e-signature controls (ESIGN/UETA/eIDAS) + the excluded-document blocklist.
4. Review conflicts, jurisdiction scope, and matter retention / legal hold.
5. Write `docs/sec-threats/TM-legal-${SLUG}.md` (from `skills/great_cto/templates/TM-legal.md`)
   with a `<!-- HANDOFF -->` verdict, and require `gate:attorney-signoff` for any advice path.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # advice paths needing an attorney,
Critical/High findings, and whether `gate:attorney-signoff` was created. Point the CTO at the TM
doc. Do not restate the whole threat model.
