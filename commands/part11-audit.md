---
description: "21 CFR Part 11 / clinical-trial audit. Invokes clinical-trials-reviewer to assess ICH-GCP E6(R3), Part 11 audit-trail + e-signature, CDISC submission readiness, IRB workflow, AE/SAE reporting."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/part11-audit** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED" && exit 1

CT_HITS=$(grep -ciE "clinical trial|ctms|edc|ecoa|epro|econsent|esource|randomization|ind submission|21 cfr 11|cdisc|irb" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$CT_HITS" -eq 0 ] && echo "No clinical-trial signals — skipping." && exit 0
```

## Step 2 — Invoke clinical-trials-reviewer

`subagent_type: clinical-trials-reviewer` — write `docs/sec-threats/TM-trial-${SLUG}.md` using `skills/great_cto/templates/TM-trial.md`.

## Step 3 — Surface

Print: scope (Part 11 / Annex 11 / GCP), audit-trail design status, CDISC readiness, gates (`gate:irb-ready`, `gate:part11-validation`).
