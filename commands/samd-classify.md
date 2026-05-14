---
description: "Classify product as SaMD (Software as Medical Device). Invokes fda-reviewer to map product to IMDRF Class I/II/III/IV, propose FDA path (510(k) / De Novo / PMA), search for predicates, and identify IEC 62304 / ISO 14971 gaps."
argument-hint: "[slug] — optional ARCH slug"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/samd-classify** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
[ -z "$SLUG" ] && echo "BLOCKED: no ARCH" && exit 1
ARCH="docs/architecture/ARCH-${SLUG}.md"
```

## Step 2 — Invoke fda-reviewer

`subagent_type: fda-reviewer` with prompt:

> Classify product in `$ARCH` as SaMD per IMDRF framework.
> Output: proposed Class (I–IV), proposed FDA path (510(k) / De Novo / PMA / exempt), predicate candidate (openFDA 510(k) search), IEC 62304 software safety class proposal, ISO 14971 risk-file scope.
> Write `docs/sec-threats/TM-samd-${SLUG}.md` using `skills/great_cto/templates/TM-samd.md`.

## Step 3 — Surface

Print: proposed class + path, predicate candidate(s), lifecycle gaps, gates raised (`gate:samd-class`, `gate:clinical-validation`, `gate:ide-approval` if PMA).
