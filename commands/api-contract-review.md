---
description: "API platform contract review. Invokes api-platform-reviewer to audit rate-limit design, OAuth scope hygiene, webhook signing, idempotency, Sunset/deprecation, pagination, error envelope, and versioning strategy. Critical before v1 GA."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/api-contract-review** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: $ARCH not found" && exit 1

API_HITS=$(grep -ciE "openapi|graphql|grpc|webhook|public api|partner api|developer portal|api key|oauth|sdk" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$API_HITS" -eq 0 ] && echo "No API platform signals — skipping." && exit 0
```

## Step 2 — Invoke api-platform-reviewer

`subagent_type: api-platform-reviewer` — write `docs/sec-threats/TM-api-${SLUG}.md` using `skills/great_cto/templates/TM-api.md`.

## Step 3 — Surface

Print: design checklist status, anti-patterns flagged, SLA targets, gates (`gate:api-contract`).
