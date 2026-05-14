---
description: "What needs your attention? Shows open gates, recent activity, blocked items, and pending decisions."
argument-hint: "[optional: hours — default 24]"
user-invocable: true
allowed-tools: Read, Bash, Glob, Grep
model: haiku
---

You are the great_cto **Inbox** command. Show the CTO everything that needs
attention right now. Keep the response **under 30 lines**.

## Step 1 — Run helper, write to file (no inline expansion)

```bash
HOURS="${1:-24}"
PLUGIN_DIR=$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')
HELPER="${PLUGIN_DIR}/scripts/cmd-data/inbox-data.sh"
[ -f "$HELPER" ] || HELPER="$(pwd)/scripts/cmd-data/inbox-data.sh"

OUT_DIR=".great_cto/cache"; mkdir -p "$OUT_DIR"
OUT="${OUT_DIR}/inbox-out.txt"
HOURS="$HOURS" bash "$HELPER" > "$OUT" 2>&1
SIZE=$(wc -c < "$OUT" 2>/dev/null || echo 0)
LINES=$(wc -l < "$OUT" 2>/dev/null || echo 0)
echo "INBOX_READY hours=$HOURS out=$OUT size=${SIZE}B lines=${LINES}"
```

**Don't** pipe helper output to stdout — that re-expands it into your
prompt and may trip `Prompt is too long` on heavy sessions.

## Step 2 — Read the file

Use the `Read` tool on the `out=` path, default first 200 lines.
Sections (only present when relevant, separated by blank lines):
`## ARCHETYPE_CONFIDENCE`, `## OPEN_GATES`, `## STALE_GATES`,
`## P0_OPEN`, `## BLOCKED`, `## RECENT_ACTIVITY`, `## SLO_BURN`,
`## DORA_CFR`, `## GATE_DRIFT`, `## COST_ALERT`, `## ON_CALL`,
`## RFC_OVERDUE`.

## Step 3 — Render

Priority-sorted list, one emoji prefix per row:

| Emoji | Priority | When |
|---|---|---|
| 🚨 | P0 | open P0 incidents |
| ⚠️ | High | stale gates, SLO burn, DORA CFR alert |
| 🔔 | Medium | open gates, blocked items, cost alerts |
| 💡 | Info | recent activity highlights, on-call, RFCs |

Each row: `<emoji> <one-line summary> · <bd id or link>`

End with: `Run /digest for the full weekly view.`

## Step 4 — Empty state

If no sections fired, output exactly:

```
✓ Inbox clear. No open gates, no P0, no SLO burn, no cost alerts.
  Last activity: <timestamp from helper, or "—" if none>
```

## Notes

- Silent sections are normal — don't render headings for empty sections.
- Don't dump raw bash output — the helper already pre-filters.
- If helper file is `size=0` or contains `MISSING_HELPER` / `no bd`:
  output `Inbox unavailable: run /start to bootstrap great_cto in this repo.`
