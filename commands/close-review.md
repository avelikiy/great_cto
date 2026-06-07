---
description: "Accounting / financial-close compliance review. Invokes accounting-reviewer to assess autonomous journal entries, reconciliations, revenue recognition, and period close for GAAP / IFRS, ASC 606 / IFRS 15, SOX ICFR + ITGC, segregation of duties, immutable balanced ledger — and force a controller close sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/close-review** command — the accounting / financial-close entrypoint.

## Step 1 — Locate ARCH + detect accounting surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

ACCT_HITS=$(grep -ciE "accounting|bookkeeping|journal entry|general ledger|\bgl\b|sub-ledger|reconciliation|revenue recognition|asc 606|ifrs 15|period close|month-end|accrual|\bsox\b|icfr|trial balance|controller|gaap" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "accounting-surface signal hits: ${ACCT_HITS}"
[ "${ACCT_HITS:-0}" -eq 0 ] && echo "No accounting signals found — is this a bookkeeping/close product? Proceeding to invoke accounting-reviewer anyway (explicit /close-review)."
```

## Step 2 — Invoke accounting-reviewer

Invoke the **accounting-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Map every autonomous accounting action (standard entry / non-standard / revenue / reconciliation / close).
2. Require segregation of duties (post ≠ approve, prepare ≠ review) and an append-only, always-balanced ledger.
3. Check ASC 606 / IFRS 15 five-step revenue, cutoff/accrual/reconciliation controls, and ICFR/ITGC if a SEC issuer.
4. Set the materiality auto-post ceiling + `gate:financial-close` for non-standard entries and the period-close lock.
5. Write `docs/sec-threats/TM-accounting-${SLUG}.md` (from `skills/great_cto/templates/TM-accounting.md`)
   with a `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), whether ICFR is in scope, the materiality
ceiling, Critical/High findings, and whether `gate:financial-close` was created. Point the CTO at
the TM doc. Do not restate the whole threat model.
