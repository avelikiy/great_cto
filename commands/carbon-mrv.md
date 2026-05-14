---
description: "Climate MRV review. Invokes climate-mrv-reviewer for GHG Protocol Scope 1/2/3, ISO 14064, Verra/Gold Standard/Puro methodology, SBTi, CDP, CSRD, CBAM, EPA GHGRP compliance + double-counting prevention + activity-data lineage."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/carbon-mrv** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED" && exit 1

C_HITS=$(grep -ciE "carbon|emission|ghg|mrv|scope.[123]|verra|gold standard|puro|sbti|cdp|csrd|cbam|ghgrp|offset|credit retir|removal" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$C_HITS" -eq 0 ] && echo "No climate signals — skipping." && exit 0
```

## Step 2 — Invoke climate-mrv-reviewer

`subagent_type: climate-mrv-reviewer` — write `docs/sec-threats/TM-climate-${SLUG}.md` using `skills/great_cto/templates/TM-climate.md`.

## Step 3 — Surface

Print: product role (calculator / project-dev / registry / verifier / disclosure), methodology + version, gates (`gate:mrv-methodology`).
