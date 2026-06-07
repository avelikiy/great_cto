---
description: "Tax preparation / advisory compliance review. Invokes tax-reviewer to assess autonomous return preparation, position-taking, and e-filing for IRS Circular 230, preparer penalties (§6694 / §6695 / §7216), position standards (substantial authority / Form 8275), e-file (PTIN/EFIN/Form 8879), multi-jurisdiction — and force a credentialed-preparer sign-off before filing."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/tax-review** command — the tax-preparation compliance entrypoint.

> **Not tax advice.** This surfaces the Circular 230 + preparer-penalty surface and forces a
> credentialed preparer (PTIN / EA / CPA / attorney) into the loop before any return is filed.

## Step 1 — Locate ARCH + detect tax surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

TAX_HITS=$(grep -ciE "tax return|tax preparation|tax advisory|\birs\b|circular 230|\bptin\b|\befin\b|e-file|form 1040|form 1120|form 1065|form 8879|form 8275|substantial authority|preparer penalty|6694|7216|fbar|fatca|sales tax|nexus" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "tax-surface signal hits: ${TAX_HITS}"
[ "${TAX_HITS:-0}" -eq 0 ] && echo "No tax signals found — is this a tax-preparation product? Proceeding to invoke tax-reviewer anyway (explicit /tax-review)."
```

## Step 2 — Invoke tax-reviewer

Invoke the **tax-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Classify every autonomously-taken position's authority (substantial authority / reasonable basis).
2. Require §6694 disclosure (Form 8275) or escalation below standard; §6695 credentialed-preparer signature + PTIN.
3. Check §7216 consent for non-preparation data use, e-file controls (PTIN/EFIN, Form 8879), and multi-jurisdiction scope.
4. Set `gate:preparer-signoff` — a credentialed preparer signs before filing; below-standard positions are reviewed.
5. Write `docs/sec-threats/TM-tax-${SLUG}.md` (from `skills/great_cto/templates/TM-tax.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # below-standard positions needing a
preparer, Critical/High findings, and whether `gate:preparer-signoff` was created. Point the CTO at
the TM doc. Do not restate the whole threat model.
