---
description: "GLP / GMP / GxP data-integrity audit. Invokes glp-glab-reviewer for 21 CFR 58/211, ALCOA+, EU Annex 11, MHRA GxP DI, CSA (FDA 2024) validation lifecycle, audit-trail review SOP."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/glp-audit** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED" && exit 1

G_HITS=$(grep -ciE "glp|gmp|gxp|preclinical|non.clinical|toxicology|pharmacology|lims|eln|batch record|manufacturing|annex 11|alcoa|computer system validation|csa" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$G_HITS" -eq 0 ] && echo "No GxP signals — skipping." && exit 0
```

## Step 2 — Invoke glp-glab-reviewer

`subagent_type: glp-glab-reviewer` — write `docs/sec-threats/TM-glp-${SLUG}.md` using `skills/great_cto/templates/TM-glp.md`.

## Step 3 — Surface

Print: scope (GLP / GMP / GxP-adjacent), ALCOA+ self-audit status, validation lifecycle gaps, gates (`gate:csv-validation`).
