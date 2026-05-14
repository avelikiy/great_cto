---
description: "HR-AI / AEDT bias audit. Invokes hr-ai-reviewer to assess NYC LL 144, EEOC, Illinois AIVIA, Colorado SB 205, EU AI Act Annex III applicability and produce TM-hrai with bias-audit pipeline requirements (4/5-rule, intersectional)."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/aedt-bias-audit** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: $ARCH not found" && exit 1

HR_HITS=$(grep -ciE "recruit|hiring|candidate|resume|interview|ats|talent|performance review|workforce scheduling" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$HR_HITS" -eq 0 ] && echo "No HR-AI signals — skipping." && exit 0
```

## Step 2 — Invoke hr-ai-reviewer

`subagent_type: hr-ai-reviewer` — write `docs/sec-threats/TM-hrai-${SLUG}.md` using `skills/great_cto/templates/TM-hrai.md`.

## Step 3 — Surface

Print: AEDT scope (in/out), states applicability, critical findings, gates (`gate:aedt-audit`).
