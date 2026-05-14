---
description: "Emerging-markets fintech review. Invokes emerging-markets-fintech-reviewer for India DPDP/RBI, Nigeria CBN, Brazil BCB/LGPD, MAS, OJK, BSP applicability + local rails (UPI/PIX/M-Pesa/GCash) + data-localization + OFAC/PEP screening."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/em-fintech-review** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED" && exit 1

EM_HITS=$(grep -ciE "india|nigeria|brazil|indonesia|philippines|mexico|kenya|m.pesa|upi|pix|gcash|ovo|dana|rbi|cbn|bsp|ojk|mas|bcb|cross.border|remittance" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$EM_HITS" -eq 0 ] && echo "No EM-fintech signals — skipping." && exit 0
```

## Step 2 — Invoke emerging-markets-fintech-reviewer

`subagent_type: emerging-markets-fintech-reviewer` — write `docs/sec-threats/TM-emfin-${SLUG}.md` using `skills/great_cto/templates/TM-emfin.md`.

## Step 3 — Surface

Print: countries served, per-country license matrix, data-localization status, sanctions coverage, gates (`gate:license-strategy`).
